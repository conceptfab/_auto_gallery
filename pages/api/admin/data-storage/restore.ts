import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import os from 'os';
import fsp from 'fs/promises';
import crypto from 'crypto';
import formidable from 'formidable';
import AdmZip from 'adm-zip';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getDataDir } from '@/src/utils/dataDir';
import { getAllProjects } from '@/src/utils/projectsStorage';

export const config = {
  api: {
    bodyParser: false,
  },
};

function generateMoodboardId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function generateSlug(name: string, existingSlugs: string[] = []): string {
  const polishMap: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'a', 'Ć': 'c', 'Ę': 'e', 'Ł': 'l', 'Ń': 'n',
    'Ó': 'o', 'Ś': 's', 'Ź': 'z', 'Ż': 'z',
  };
  let slug = name
    .trim()
    .split('')
    .map((c) => polishMap[c] || c)
    .join('')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'projekt';
  let final = slug;
  let i = 2;
  while (existingSlugs.includes(final)) {
    final = `${slug}-${i}`;
    i++;
  }
  return final;
}

function norm(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: 100 * 1024 * 1024,
    maxFiles: 1,
    uploadDir: os.tmpdir(),
    keepExtensions: false,
  });

  const contentLength = req.headers['content-length'];
  const contentType = req.headers['content-type'] || '';
  console.log('[Restore] Request: Content-Length=', contentLength, 'Content-Type=', contentType?.slice(0, 50));

  const [err, fields, files] = await new Promise<
    [Error | null, formidable.Fields, formidable.Files]
  >((resolve) => {
    form.parse(req, (e, flds, fls) => resolve([e, flds, fls]));
  });

  console.log('[Restore] Po parsowaniu: err=', err?.message, 'files keys=', Object.keys(files as object), 'fields=', Object.keys(fields as object));

  if (err) {
    console.error('Restore parse error:', err);
    const msg = err.message || 'Błąd odczytu pliku';
    return res.status(400).json({ error: msg.includes('maxFileSize') ? 'Plik za duży (max 100 MB).' : msg });
  }

  const newNameRaw = Array.isArray(fields.newName) ? fields.newName[0] : fields.newName;
  const newName = typeof newNameRaw === 'string' ? newNameRaw.trim() || undefined : undefined;
  const restoreToGroupIdRaw = Array.isArray(fields.restoreToGroupId) ? fields.restoreToGroupId[0] : fields.restoreToGroupId;
  const restoreToGroupId = typeof restoreToGroupIdRaw === 'string' ? restoreToGroupIdRaw.trim() || undefined : undefined;

  // Formidable może zwracać plik pod różnymi kluczami (file, zip, upload itd.) – bierzemy pierwszy przesłany plik
  const f = files as formidable.Files;
  let file: formidable.File | undefined;
  for (const key of Object.keys(f)) {
    const val = f[key];
    const one = Array.isArray(val) ? val[0] : val;
    if (one?.filepath) {
      file = one;
      break;
    }
  }
  if (!file?.filepath) {
    const keys = Object.keys(f).join(', ') || 'brak';
    const hint = keys === 'brak'
      ? 'Serwer nie otrzymał żadnego pliku. Sprawdź konsolę (F12) i terminal serwera – czy Content-Length przyszedł? Na części hostów (np. Vercel) jest limit ok. 4,5 MB.'
      : `Otrzymane pola plików: ${keys}.`;
    console.error('[Restore] Brak pliku. files=', JSON.stringify(Object.keys(f)));
    return res.status(400).json({
      error: 'Serwer nie dostał pliku.',
      hint,
      debug: { contentLength: contentLength ?? 'brak', contentType: contentType?.slice(0, 80), receivedFileKeys: keys },
    });
  }

  try {
  let dataDir: string;
  try {
    dataDir = await getDataDir();
    await fsp.access(dataDir);
  } catch {
    return res.status(503).json({ error: 'Katalog danych niedostępny' });
  }

  let zip: AdmZip;
  try {
    const buffer = await fsp.readFile(file.filepath);
    zip = new AdmZip(buffer);
  } catch (zipErr) {
    const msg = zipErr instanceof Error ? zipErr.message : 'Uszkodzony plik ZIP';
    return res.status(400).json({ error: `Nie można odczytać ZIP: ${msg}` });
  } finally {
    await fsp.unlink(file.filepath).catch(() => {});
  }

  const entries = zip.getEntries();
  const normalizedNames = entries.filter((e) => !e.isDirectory).map((e) => norm(e.entryName));
  const hasGroups = normalizedNames.some((n) => n.startsWith('groups/'));
  // Moodboard: stary format moodboard/index.json LUB nowy – index.json w root z boardIds
  const hasMoodboardIndexOld = normalizedNames.includes('moodboard/index.json');
  const indexJsonRoot = entries.find((e) => norm(e.entryName) === 'index.json');
  let hasMoodboardIndexRoot = false;
  if (indexJsonRoot) {
    try {
      const parsed = JSON.parse(indexJsonRoot.getData().toString('utf8')) as { boardIds?: unknown };
      hasMoodboardIndexRoot = Array.isArray(parsed?.boardIds);
    } catch {
      // nie moodboard
    }
  }
  const hasMoodboardIndex = hasMoodboardIndexOld || hasMoodboardIndexRoot;
  // Projekt: stary projects/ID/project.json LUB nowy root project.json LUB nowy ID/project.json
  const rootProjectEntriesOld = entries.filter((e) => !e.isDirectory && norm(e.entryName).startsWith('projects/'));
  const projectTopDirsOld = new Set(rootProjectEntriesOld.map((e) => norm(e.entryName).split('/')[1]).filter(Boolean));
  const hasProjectJsonOld = rootProjectEntriesOld.some((e) => {
    const n = norm(e.entryName);
    return n.endsWith('project.json') && n.split('/').length >= 3;
  });
  const hasProjectJsonRoot = normalizedNames.includes('project.json');
  const projectDirEntries = entries.filter((e) => !e.isDirectory && (() => {
    const n = norm(e.entryName);
    const parts = n.split('/');
    return parts.length === 2 && parts[1] === 'project.json';
  })());
  const hasProjectJsonInDir = projectDirEntries.length > 0;
  const hasAnyProject = hasProjectJsonOld || hasProjectJsonRoot || hasProjectJsonInDir;
  const isMoodboard = hasMoodboardIndex && !hasAnyProject;
  const isProject = hasAnyProject;

  // 1. Jeśli ZIP zawiera groups/ (backup „wszystko” lub z grup) – wypakuj do dataDir/groups/
  if (hasGroups) {
    const groupsDir = path.join(dataDir, 'groups');
    await fsp.mkdir(groupsDir, { recursive: true });
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = norm(entry.entryName);
      if (!name.startsWith('groups/')) continue;
      const rel = name.slice('groups/'.length);
      if (!rel || rel.startsWith('../')) continue;
      const targetPath = path.join(groupsDir, rel);
      await fsp.mkdir(path.dirname(targetPath), { recursive: true });
      await fsp.writeFile(targetPath, entry.getData());
    }
  }

  if (!isMoodboard && !isProject && !hasGroups) {
    const sample = normalizedNames.slice(0, 8).join(', ') + (normalizedNames.length > 8 ? '…' : '');
    return res.status(400).json({
      error: 'Nieprawidłowy backup. ZIP musi zawierać moodboard (index.json + pliki .json), projekt (project.json lub ID/project.json) lub groups/.',
      hint: normalizedNames.length ? `W ZIP: ${sample}` : 'ZIP jest pusty lub uszkodzony.',
    });
  }

  // Jeśli był tylko groups/ – przywrócono grupy, koniec
  if (hasGroups && !isMoodboard && !isProject) {
    return res.status(200).json({
      message: 'Przywrócono dane grup (moodboardy i projekty w grupach).',
      type: 'groups',
    });
  }

  if (isMoodboard) {
    const indexEntry = entries.find((e) => norm(e.entryName) === 'moodboard/index.json')
      || entries.find((e) => norm(e.entryName) === 'index.json');
    if (!indexEntry) return res.status(400).json({ error: 'Brak index.json moodboardu w ZIP' });
    const indexData = JSON.parse(indexEntry.getData().toString('utf8')) as { boardIds?: string[] };
    const boardIds = indexData.boardIds || [];
    if (boardIds.length === 0) return res.status(400).json({ error: 'Brak boardów w backupie moodboardu' });

    const moodboardPrefix = hasMoodboardIndexOld ? 'moodboard/' : '';
    const moodboardDir = restoreToGroupId
      ? path.join(dataDir, 'groups', restoreToGroupId, 'moodboard')
      : path.join(dataDir, 'moodboard');
    await fsp.mkdir(moodboardDir, { recursive: true });
    await fsp.mkdir(path.join(moodboardDir, 'images'), { recursive: true });

    let currentIndex: { boardIds: string[]; activeId?: string } = { boardIds: [] };
    try {
      const raw = await fsp.readFile(path.join(moodboardDir, 'index.json'), 'utf8');
      currentIndex = JSON.parse(raw) as typeof currentIndex;
      currentIndex.boardIds = currentIndex.boardIds || [];
    } catch {
      // brak index – pusty moodboard
    }

    const existingIds = new Set(currentIndex.boardIds);
    const zipBoardIds = boardIds.filter((id) => {
      const entry = entries.find((e) => norm(e.entryName) === `${moodboardPrefix}${id}.json`);
      return !!entry;
    });
    const hasConflict = zipBoardIds.some((id) => existingIds.has(id));
    if (hasConflict && !newName) {
      return res.status(409).json({
        error: 'Moodboard o tym ID już istnieje. Podaj nową nazwę, aby zaimportować z nowym ID.',
        conflict: true,
        type: 'moodboard',
        existingId: zipBoardIds.find((id) => existingIds.has(id)),
      });
    }

    const idMap = new Map<string, string>();
    if (hasConflict) for (const id of zipBoardIds) idMap.set(id, generateMoodboardId());
    const targetIdForFirst = zipBoardIds[0];
    const newId = idMap.get(targetIdForFirst) ?? targetIdForFirst;

    for (const oldId of zipBoardIds) {
      const targetId = idMap.get(oldId) ?? oldId;
      const boardEntry = entries.find((e) => norm(e.entryName) === `${moodboardPrefix}${oldId}.json`);
      if (!boardEntry) continue;
      let board = JSON.parse(boardEntry.getData().toString('utf8')) as { id: string; name?: string; images?: unknown[] };
      board = { ...board, id: targetId, name: (newName && newName.trim()) ? newName.trim() : (board.name ?? 'Moodboard') };
      if (Array.isArray(board.images)) {
        for (const img of board.images as { imagePath?: string }[]) {
          if (typeof img.imagePath === 'string' && img.imagePath.startsWith(oldId + '/')) {
            img.imagePath = targetId + img.imagePath.slice(oldId.length);
          }
        }
      }
      await fsp.writeFile(
        path.join(moodboardDir, `${targetId}.json`),
        JSON.stringify(board, null, 2),
        'utf8'
      );
      const imgPrefix = `${moodboardPrefix}images/${oldId}/`;
      const imageEntries = entries.filter((e) => !e.isDirectory && norm(e.entryName).startsWith(imgPrefix));
      const targetImagesDir = path.join(moodboardDir, 'images', targetId);
      if (imageEntries.length > 0) await fsp.mkdir(targetImagesDir, { recursive: true });
      for (const imgEntry of imageEntries) {
        const rel = norm(imgEntry.entryName).slice(imgPrefix.length);
        if (!rel || rel.includes('/')) continue;
        const targetPath = path.join(targetImagesDir, rel);
        await fsp.writeFile(targetPath, imgEntry.getData());
      }
    }

    const addedIds = idMap.size > 0 ? Array.from(idMap.values()) : zipBoardIds;
    const newBoardIds = [...currentIndex.boardIds];
    for (const id of addedIds) {
      if (!newBoardIds.includes(id)) newBoardIds.push(id);
    }
    const newIndex = {
      boardIds: newBoardIds,
      activeId: currentIndex.activeId && newBoardIds.includes(currentIndex.activeId) ? currentIndex.activeId : addedIds[0],
    };
    await fsp.writeFile(
      path.join(moodboardDir, 'index.json'),
      JSON.stringify(newIndex, null, 2),
      'utf8'
    );
    return res.status(200).json({
      message: 'Moodboard przywrócony',
      type: 'moodboard',
      id: newId,
      name: hasConflict && newName ? newName : undefined,
    });
  }

  if (isProject) {
    let projectJsonEntry: typeof entries[0] | undefined;
    let projectIdFromZip: string;
    let entryPrefix: string;
    if (hasProjectJsonRoot) {
      projectJsonEntry = entries.find((e) => norm(e.entryName) === 'project.json');
      const meta = JSON.parse(projectJsonEntry!.getData().toString('utf8')) as { id: string };
      projectIdFromZip = meta.id;
      entryPrefix = '';
    } else if (hasProjectJsonInDir) {
      const firstDir = norm(projectDirEntries[0].entryName).split('/')[0];
      projectIdFromZip = firstDir;
      projectJsonEntry = entries.find((e) => norm(e.entryName) === `${firstDir}/project.json`);
      entryPrefix = `${firstDir}/`;
    } else {
      projectIdFromZip = Array.from(projectTopDirsOld)[0];
      projectJsonEntry = entries.find((e) => norm(e.entryName) === `projects/${projectIdFromZip}/project.json`);
      entryPrefix = `projects/${projectIdFromZip}/`;
    }
    if (!projectJsonEntry) return res.status(400).json({ error: 'Brak project.json w backupie projektu' });
    const projectMeta = JSON.parse(projectJsonEntry.getData().toString('utf8')) as {
      id: string;
      name: string;
      slug?: string;
      revisionIds?: string[];
    };

    const projects = await getAllProjects();
    const existingIds = new Set(projects.map((p) => p.id));
    const hasConflict = existingIds.has(projectMeta.id);
    if (hasConflict && !newName) {
      return res.status(409).json({
        error: 'Projekt o tym ID już istnieje. Podaj nową nazwę, aby zaimportować z nowym ID.',
        conflict: true,
        type: 'project',
        existingId: projectMeta.id,
      });
    }

    const newId = hasConflict ? crypto.randomUUID() : projectMeta.id;
    const newNameFinal = (newName && newName.trim()) ? newName.trim() : (projectMeta.name?.trim() || 'Projekt');
    const existingSlugs = projects.filter((p) => p.id !== newId).map((p) => p.slug).filter(Boolean) as string[];
    const newSlug = generateSlug(newNameFinal, existingSlugs);

    const projectsDir = restoreToGroupId
      ? path.join(dataDir, 'groups', restoreToGroupId, 'projects')
      : path.join(dataDir, 'projects');
    const targetProjectDir = path.join(projectsDir, newId);
    await fsp.mkdir(targetProjectDir, { recursive: true });

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = norm(entry.entryName);
      if (!name.startsWith(entryPrefix) || name === entryPrefix.slice(0, -1)) continue;
      const rel = name.slice(entryPrefix.length);
      const targetPath = path.join(targetProjectDir, rel);
      await fsp.mkdir(path.dirname(targetPath), { recursive: true });
      let data = entry.getData();
      if (rel === 'project.json') {
        const meta = JSON.parse(data.toString('utf8')) as typeof projectMeta & { groupId?: string };
        meta.id = newId;
        meta.name = newNameFinal;
        meta.slug = newSlug;
        meta.groupId = restoreToGroupId ?? undefined;
        data = Buffer.from(JSON.stringify(meta, null, 2), 'utf8');
      }
      await fsp.writeFile(targetPath, data);
    }
    return res.status(200).json({
      message: 'Projekt przywrócony',
      type: 'project',
      id: newId,
      name: newNameFinal,
      slug: newSlug,
    });
  }

  return res.status(400).json({ error: 'Nie rozpoznano typu backupu' });
  } catch (err) {
    console.error('Restore error', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Błąd przywracania: ${msg}` });
  }
}

export default withAdminAuth(handler);
