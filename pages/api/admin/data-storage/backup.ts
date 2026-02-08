import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import crypto from 'crypto';
import archiver from 'archiver';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getDataDir } from '@/src/utils/dataDir';
import { findProjectById } from '@/src/utils/projectsStorage';

type Scope = 'all' | 'moodboard' | 'projects' | 'selected';

const MAX_NAME_PART_LENGTH = 80;

function parseIdList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Czyści string do bezpiecznej części nazwy pliku (bez \\ / : * ? " < > |). */
function sanitizeFilenamePart(str: string, maxLen = 60): string {
  const cleaned = str
    .replace(/[\s]+/g, ' ')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '');
  return cleaned.slice(0, maxLen) || 'backup';
}

function getMoodboardDir(dataDir: string, groupId?: string): string {
  return groupId ? path.join(dataDir, 'groups', groupId, 'moodboard') : path.join(dataDir, 'moodboard');
}
function getProjectsDir(dataDir: string, groupId?: string): string {
  return groupId ? path.join(dataDir, 'groups', groupId, 'projects') : path.join(dataDir, 'projects');
}

/** Szuka boardId w globalnym i we wszystkich grupach. Zwraca groupId (undefined = global). */
async function resolveBoardGroupId(dataDir: string, boardId: string): Promise<string | undefined> {
  try {
    await fsp.access(path.join(getMoodboardDir(dataDir), `${boardId}.json`));
    return undefined;
  } catch {
    // nie w globalnym
  }
  const groupsDir = path.join(dataDir, 'groups');
  try {
    const gids = await fsp.readdir(groupsDir);
    for (const gid of gids) {
      if (gid === 'groups.json') continue;
      try {
        await fsp.access(path.join(groupsDir, gid, 'moodboard', `${boardId}.json`));
        return gid;
      } catch {
        // dalej
      }
    }
  } catch {
    // brak groups
  }
  return undefined;
}

async function getSelectedDisplayNames(
  dataDir: string,
  boardIds: string[],
  projectIds: string[],
  boardGroupIds: (string | undefined)[],
  projectGroupIds: (string | undefined)[]
): Promise<string[]> {
  const names: string[] = [];
  for (let i = 0; i < boardIds.length; i++) {
    const moodboardDir = getMoodboardDir(dataDir, boardGroupIds[i] || undefined);
    try {
      const raw = await fsp.readFile(path.join(moodboardDir, `${boardIds[i]}.json`), 'utf8');
      const board = JSON.parse(raw) as { name?: string };
      const n = (board.name || '').trim() || `Moodboard-${boardIds[i].slice(0, 8)}`;
      names.push(n);
    } catch {
      names.push(`Board-${boardIds[i].slice(0, 8)}`);
    }
  }
  for (let i = 0; i < projectIds.length; i++) {
    const projectsDir = getProjectsDir(dataDir, projectGroupIds[i] || undefined);
    try {
      const raw = await fsp.readFile(path.join(projectsDir, projectIds[i], 'project.json'), 'utf8');
      const meta = JSON.parse(raw) as { name?: string };
      const n = (meta.name || '').trim() || projectIds[i];
      names.push(n);
    } catch {
      names.push(projectIds[i]);
    }
  }
  return names;
}

function buildZipNamePart(names: string[]): string {
  const sanitized = names.map((n) => sanitizeFilenamePart(n, 40));
  const joined = sanitized.join('_');
  if (joined.length <= MAX_NAME_PART_LENGTH) return joined;
  return sanitized[0] + '-i-inne';
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const scope = (typeof req.query.scope === 'string' ? req.query.scope : 'all') as Scope;
  if (!['all', 'moodboard', 'projects', 'selected'].includes(scope)) {
    return res.status(400).json({ error: 'Nieprawidłowy scope (all|moodboard|projects|selected)' });
  }

  const selectedBoardIds = scope === 'selected' ? parseIdList(req.query.boardIds) : [];
  const selectedProjectIds = scope === 'selected' ? parseIdList(req.query.projectIds) : [];
  let selectedBoardGroupIds: (string | undefined)[] = scope === 'selected' ? parseIdList(req.query.boardGroupIds) : [];
  let selectedProjectGroupIds: (string | undefined)[] = scope === 'selected' ? parseIdList(req.query.projectGroupIds) : [];
  if (scope === 'selected' && selectedBoardIds.length === 0 && selectedProjectIds.length === 0) {
    return res.status(400).json({ error: 'Wybierz co najmniej jeden moodboard lub projekt' });
  }

  let dataDir: string;
  try {
    dataDir = await getDataDir();
    await fsp.access(dataDir);
  } catch {
    return res.status(503).json({
      error: 'Data storage not available',
      message: 'Katalog danych niedostępny',
    });
  }

  // Dla "selected": jeśli nie podano groupIds, rozwiąż (global vs grupy)
  if (scope === 'selected') {
    if (selectedBoardGroupIds.length !== selectedBoardIds.length) {
      selectedBoardGroupIds = await Promise.all(selectedBoardIds.map((id) => resolveBoardGroupId(dataDir, id)));
    }
    if (selectedProjectGroupIds.length !== selectedProjectIds.length) {
      selectedProjectGroupIds = await Promise.all(
        selectedProjectIds.map(async (id) => (await findProjectById(id))[1])
      );
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  let zipName: string;
  if (scope === 'selected') {
    const displayNames = await getSelectedDisplayNames(
      dataDir, selectedBoardIds, selectedProjectIds, selectedBoardGroupIds, selectedProjectGroupIds
    );
    const namePart = displayNames.length > 0 ? buildZipNamePart(displayNames) : 'wybrane';
    const onlyMoodboard = selectedBoardIds.length > 0 && selectedProjectIds.length === 0;
    const onlyProject = selectedProjectIds.length > 0 && selectedBoardIds.length === 0;
    if (onlyMoodboard) zipName = `moodboard-${namePart}-${date}.zip`;
    else if (onlyProject) zipName = selectedProjectIds.length === 1 ? `projekt-${namePart}-${date}.zip` : `projekty-${namePart}-${date}.zip`;
    else zipName = `wybrane-${namePart}-${date}.zip`;
  } else if (scope === 'all') {
    zipName = `conceptview-wszystko-${date}.zip`;
  } else if (scope === 'moodboard') {
    zipName = `moodboard-${date}.zip`;
  } else {
    zipName = `projekty-${date}.zip`;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`
  );

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('Backup zip error:', err);
    if (!res.writableEnded) res.status(500).end();
  });
  archive.pipe(res);

  try {
    if (scope === 'selected') {
      // Moodboardy: w ZIP folder/plik pod UUID – czytamy z dysku, zapisujemy pod crypto.randomUUID()
      const moodboardZipIds: string[] = [];
      let activeZipId: string | null = null;
      const gidFirst = selectedBoardGroupIds[0];
      const moodboardDirFirst = getMoodboardDir(dataDir, gidFirst || undefined);
      try {
        const indexRaw = await fsp.readFile(path.join(moodboardDirFirst, 'index.json'), 'utf8');
        const index = JSON.parse(indexRaw) as { boardIds?: string[]; activeId?: string };
        activeZipId = index.activeId && selectedBoardIds.includes(index.activeId) ? index.activeId : selectedBoardIds[0];
      } catch {
        // brak index
      }
      for (let i = 0; i < selectedBoardIds.length; i++) {
        const boardId = selectedBoardIds[i];
        const gid = selectedBoardGroupIds[i];
        const moodboardDir = getMoodboardDir(dataDir, gid || undefined);
        const zipId = crypto.randomUUID();
        moodboardZipIds.push(zipId);
        try {
          const boardJsonPath = path.join(moodboardDir, `${boardId}.json`);
          const raw = await fsp.readFile(boardJsonPath, 'utf8');
          const board = JSON.parse(raw) as { id: string; name?: string; images?: { imagePath?: string }[]; [key: string]: unknown };
          board.id = zipId;
          if (Array.isArray(board.images)) {
            for (const img of board.images) {
              if (typeof img.imagePath === 'string' && img.imagePath.startsWith(boardId + '/')) {
                img.imagePath = zipId + img.imagePath.slice(boardId.length);
              }
            }
          }
          archive.append(JSON.stringify(board, null, 2), { name: `${zipId}.json` });
          const boardImagesDir = path.join(moodboardDir, 'images', boardId);
          try {
            await fsp.access(boardImagesDir);
            archive.directory(boardImagesDir, `images/${zipId}`);
          } catch {
            // brak obrazów
          }
        } catch {
          // pomiń brakujący plik
        }
      }
      if (moodboardZipIds.length > 0) {
        const activeIdInZip = activeZipId && selectedBoardIds.includes(activeZipId)
          ? moodboardZipIds[selectedBoardIds.indexOf(activeZipId)]
          : moodboardZipIds[0];
        archive.append(
          JSON.stringify({ boardIds: moodboardZipIds, activeId: activeIdInZip }, null, 2),
          { name: 'index.json' }
        );
      }

      // Projekty: w ZIP folder projects/{UUID}/ – typ w nazwie ZIP (projekt-xxx.zip)
      if (selectedProjectIds.length > 0) {
        for (let i = 0; i < selectedProjectIds.length; i++) {
          const projectId = selectedProjectIds[i];
          const gid = selectedProjectGroupIds[i];
          const projectsDir = getProjectsDir(dataDir, gid || undefined);
          try {
            const projectPath = path.join(projectsDir, projectId);
            const stat = await fsp.stat(projectPath);
            if (stat.isDirectory()) {
              archive.directory(projectPath, `projects/${projectId}`);
            }
          } catch {
            // pomiń
          }
        }
      }
    } else {
      if (scope === 'all' || scope === 'moodboard') {
        const moodboardDir = getMoodboardDir(dataDir);
        try {
          await fsp.access(moodboardDir);
          archive.directory(moodboardDir, 'moodboard');
        } catch {
          // brak katalogu
        }
      }
      if (scope === 'all' || scope === 'projects') {
        const projectsDir = getProjectsDir(dataDir);
        try {
          await fsp.access(projectsDir);
          archive.directory(projectsDir, 'projects');
        } catch {
          // brak katalogu
        }
      }
      // Grupy: przy "all" cały folder groups/; przy "moodboard"/"projects" tylko moodboard/projects w każdej grupie
      const groupsDir = path.join(dataDir, 'groups');
      try {
        const groupDirs = await fsp.readdir(groupsDir);
        for (const gid of groupDirs) {
          if (gid === 'groups.json') continue;
          const groupPath = path.join(groupsDir, gid);
          const gstat = await fsp.stat(groupPath).catch(() => null);
          if (!gstat?.isDirectory()) continue;
          if (scope === 'all') {
            archive.directory(groupPath, `groups/${gid}`);
          } else if (scope === 'moodboard') {
            const gMoodboard = path.join(groupPath, 'moodboard');
            try {
              await fsp.access(gMoodboard);
              archive.directory(gMoodboard, `groups/${gid}/moodboard`);
            } catch {
              // brak
            }
          } else if (scope === 'projects') {
            const gProjects = path.join(groupPath, 'projects');
            try {
              await fsp.access(gProjects);
              archive.directory(gProjects, `groups/${gid}/projects`);
            } catch {
              // brak
            }
          }
        }
      } catch {
        // brak katalogu groups
      }
    }
    await archive.finalize();
  } catch (err) {
    console.error('Backup error:', err);
    if (!res.writableEnded) res.status(500).end();
  }
}

export default withAdminAuth(handler);
