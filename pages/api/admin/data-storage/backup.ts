import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import archiver from 'archiver';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getDataDir } from '@/src/utils/dataDir';

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

async function getSelectedDisplayNames(
  dataDir: string,
  boardIds: string[],
  projectIds: string[]
): Promise<string[]> {
  const names: string[] = [];
  const moodboardDir = path.join(dataDir, 'moodboard');
  const projectsDir = path.join(dataDir, 'projects');
  for (const boardId of boardIds) {
    try {
      const raw = await fsp.readFile(path.join(moodboardDir, `${boardId}.json`), 'utf8');
      const board = JSON.parse(raw) as { name?: string };
      const n = (board.name || '').trim() || `Moodboard-${boardId.slice(0, 8)}`;
      names.push(n);
    } catch {
      names.push(`Board-${boardId.slice(0, 8)}`);
    }
  }
  for (const projectId of projectIds) {
    try {
      const raw = await fsp.readFile(path.join(projectsDir, projectId, 'project.json'), 'utf8');
      const meta = JSON.parse(raw) as { name?: string };
      const n = (meta.name || '').trim() || projectId;
      names.push(n);
    } catch {
      names.push(projectId);
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
  const date = new Date().toISOString().slice(0, 10);
  let zipName: string;
  if (scope === 'selected') {
    const displayNames = await getSelectedDisplayNames(dataDir, selectedBoardIds, selectedProjectIds);
    const namePart = displayNames.length > 0 ? buildZipNamePart(displayNames) : 'wybrane';
    zipName = `${namePart}-${date}.zip`;
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
      const moodboardDir = path.join(dataDir, 'moodboard');
      const projectsDir = path.join(dataDir, 'projects');

      if (selectedBoardIds.length > 0) {
        try {
          await fsp.access(moodboardDir);
          const indexPath = path.join(moodboardDir, 'index.json');
          const indexRaw = await fsp.readFile(indexPath, 'utf8');
          const index = JSON.parse(indexRaw) as { boardIds?: string[]; activeId?: string };
          const newIndex = {
            boardIds: selectedBoardIds,
            activeId: index.activeId && selectedBoardIds.includes(index.activeId) ? index.activeId : selectedBoardIds[0],
          };
          archive.append(JSON.stringify(newIndex, null, 2), { name: 'moodboard/index.json' });
          for (const boardId of selectedBoardIds) {
            const boardJson = path.join(moodboardDir, `${boardId}.json`);
            try {
              await fsp.access(boardJson);
              const content = await fsp.readFile(boardJson);
              archive.append(content, { name: `moodboard/${boardId}.json` });
            } catch {
              // pomiń brakujący plik
            }
            const boardImagesDir = path.join(moodboardDir, 'images', boardId);
            try {
              await fsp.access(boardImagesDir);
              archive.directory(boardImagesDir, `moodboard/images/${boardId}`);
            } catch {
              // brak obrazów
            }
          }
        } catch {
          // brak katalogu moodboard
        }
      }

      if (selectedProjectIds.length > 0) {
        try {
          await fsp.access(projectsDir);
          for (const projectId of selectedProjectIds) {
            const projectPath = path.join(projectsDir, projectId);
            try {
              const stat = await fsp.stat(projectPath);
              if (stat.isDirectory()) {
                archive.directory(projectPath, `projects/${projectId}`);
              }
            } catch {
              // pomiń
            }
          }
        } catch {
          // brak katalogu projects
        }
      }
    } else {
      if (scope === 'all' || scope === 'moodboard') {
        const moodboardDir = path.join(dataDir, 'moodboard');
        try {
          await fsp.access(moodboardDir);
          archive.directory(moodboardDir, 'moodboard');
        } catch {
          // brak katalogu
        }
      }
      if (scope === 'all' || scope === 'projects') {
        const projectsDir = path.join(dataDir, 'projects');
        try {
          await fsp.access(projectsDir);
          archive.directory(projectsDir, 'projects');
        } catch {
          // brak katalogu
        }
      }
      // Backup group folders
      if (scope === 'all') {
        const groupsDir = path.join(dataDir, 'groups');
        try {
          const groupDirs = await fsp.readdir(groupsDir);
          for (const gid of groupDirs) {
            if (gid === 'groups.json') continue;
            const groupPath = path.join(groupsDir, gid);
            const gstat = await fsp.stat(groupPath).catch(() => null);
            if (!gstat?.isDirectory()) continue;
            archive.directory(groupPath, `groups/${gid}`);
          }
        } catch {
          // brak katalogu groups
        }
      }
    }
    await archive.finalize();
  } catch (err) {
    console.error('Backup error:', err);
    if (!res.writableEnded) res.status(500).end();
  }
}

export default withAdminAuth(handler);
