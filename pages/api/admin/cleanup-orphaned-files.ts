import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getAllProjects } from '@/src/utils/projectsStorage';
import { getMoodboardImagesDir } from '@/src/utils/moodboardStorage';
import { getDataDir } from '@/src/utils/dataDir';
import { getMoodboardImagesDirByGroup } from '@/src/utils/moodboardStorage';
import { logger } from '@/src/utils/logger';

interface OrphanedFile {
  path: string;
  type: 'revision-thumbnail' | 'gallery' | 'moodboard';
  size: number;
}

interface ScanResult {
  orphanedFiles: OrphanedFile[];
  totalSize: number;
  scannedRevisionThumbnails: number;
  scannedGalleryFiles: number;
  scannedMoodboardFiles: number;
}

const GRACE_PERIOD_MINUTES = 60;

async function scanDirectory(
  dir: string,
  prefix: string = ''
): Promise<{ relativePath: string; size: number }[]> {
  const results: { relativePath: string; size: number }[] = [];
  const now = Date.now();

  async function walk(currentDir: string, relPrefix: string) {
    try {
      const entries = await fsp.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await walk(fullPath, relativePath);
        } else if (entry.isFile()) {
          const stat = await fsp.stat(fullPath);
          const ageMinutes = (now - stat.mtimeMs) / 1000 / 60;
          if (ageMinutes < GRACE_PERIOD_MINUTES) continue;
          results.push({ relativePath, size: stat.size });
        }
      }
    } catch {
      // Ignoruj błędy dostępu
    }
  }

  await walk(dir, prefix);
  return results;
}

async function getMoodboardImagePathsFromDir(moodboardDir: string): Promise<Set<string>> {
  const paths = new Set<string>();
  try {
    const indexPath = path.join(moodboardDir, 'index.json');
    const indexRaw = await fsp.readFile(indexPath, 'utf8');
    const index = JSON.parse(indexRaw) as { boardIds: string[] };
    for (const boardId of index.boardIds) {
      const boardPath = path.join(moodboardDir, `${boardId}.json`);
      try {
        const boardRaw = await fsp.readFile(boardPath, 'utf8');
        const board = JSON.parse(boardRaw) as { images: { imagePath?: string }[] };
        for (const img of board.images || []) {
          if (img.imagePath) {
            paths.add(img.imagePath);
          }
        }
      } catch {
        // Ignoruj błędy
      }
    }
  } catch {
    // Ignoruj błędy
  }
  return paths;
}

async function scanOrphanedFiles(): Promise<ScanResult> {
  const projects = await getAllProjects();
  const dataDir = await getDataDir();
  const orphanedFiles: OrphanedFile[] = [];

  const usedRevisions = new Set<string>();
  const usedGalleryFiles = new Set<string>();

  for (const project of projects) {
    const prefix = project.groupId ? `groups/${project.groupId}/projects` : 'projects';
    for (const rev of project.revisions || []) {
      usedRevisions.add(`${prefix}/${project.id}/${rev.id}`);
      for (const fn of rev.galleryPaths || []) {
        usedGalleryFiles.add(`${prefix}/${project.id}/${rev.id}/${fn}`);
      }
    }
  }

  let scannedRevisionThumbnails = 0;
  let scannedGalleryFiles = 0;

  async function scanProjectsDir(projectsDir: string, pathPrefix: string) {
    const projectIds = await fsp.readdir(projectsDir).catch(() => []);
    for (const projectId of projectIds) {
      const projectPath = path.join(projectsDir, projectId);
      const stat = await fsp.stat(projectPath).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const rewizjeDir = path.join(projectPath, 'rewizje');
      let revisionIds: string[] = [];
      try {
        revisionIds = await fsp.readdir(rewizjeDir);
      } catch {
        continue;
      }

      for (const revisionId of revisionIds) {
        const revDir = path.join(rewizjeDir, revisionId);
        const revStat = await fsp.stat(revDir).catch(() => null);
        if (!revStat?.isDirectory()) continue;

        const revKey = `${pathPrefix}/${projectId}/${revisionId}`;
        const thumbPath = path.join(revDir, 'thumbnail.webp');
        try {
          const thumbStat = await fsp.stat(thumbPath);
          scannedRevisionThumbnails++;
          if (!usedRevisions.has(revKey)) {
            orphanedFiles.push({
              path: `${pathPrefix}/${projectId}/rewizje/${revisionId}/thumbnail.webp`,
              type: 'revision-thumbnail',
              size: thumbStat.size,
            });
          }
        } catch {
          // brak pliku
        }

        const galleryDir = path.join(revDir, 'gallery');
        try {
          const files = await fsp.readdir(galleryDir);
          for (const fn of files) {
            const fullPath = path.join(galleryDir, fn);
            const fileStat = await fsp.stat(fullPath).catch(() => null);
            if (!fileStat?.isFile()) continue;
            scannedGalleryFiles++;
            if (!usedGalleryFiles.has(`${revKey}/${fn}`)) {
              orphanedFiles.push({
                path: `${pathPrefix}/${projectId}/rewizje/${revisionId}/gallery/${fn}`,
                type: 'gallery',
                size: fileStat.size,
              });
            }
          }
        } catch {
          // brak gallery
        }
      }
    }
  }

  try {
    await scanProjectsDir(path.join(dataDir, 'projects'), 'projects');
  } catch {
    // brak katalogu projects
  }

  // Global moodboard images
  const moodboardDir = await getMoodboardImagesDir();
  const moodboardFiles = await scanDirectory(moodboardDir);
  const usedMoodboardPaths = await getMoodboardImagePathsFromDir(path.join(dataDir, 'moodboard'));
  let scannedMoodboardFiles = 0;

  for (const file of moodboardFiles) {
    scannedMoodboardFiles++;
    if (!usedMoodboardPaths.has(file.relativePath)) {
      orphanedFiles.push({
        path: `moodboard/images/${file.relativePath}`,
        type: 'moodboard',
        size: file.size,
      });
    }
  }

  // Group projects + group moodboard images
  const groupsDir = path.join(dataDir, 'groups');
  try {
    const groupDirs = await fsp.readdir(groupsDir);
    for (const gid of groupDirs) {
      if (gid === 'groups.json') continue;
      const groupProjectsDir = path.join(groupsDir, gid, 'projects');
      const gstat = await fsp.stat(groupProjectsDir).catch(() => null);
      if (gstat?.isDirectory()) {
        try {
          await scanProjectsDir(groupProjectsDir, `groups/${gid}/projects`);
        } catch {
          // ignoruj
        }
      }
      const groupMoodboardDir = path.join(groupsDir, gid, 'moodboard');
      try {
        const gImagesDir = await getMoodboardImagesDirByGroup(gid);
        const gFiles = await scanDirectory(gImagesDir);
        const gUsedPaths = await getMoodboardImagePathsFromDir(groupMoodboardDir);
        for (const file of gFiles) {
          scannedMoodboardFiles++;
          if (!gUsedPaths.has(file.relativePath)) {
            orphanedFiles.push({
              path: `groups/${gid}/moodboard/images/${file.relativePath}`,
              type: 'moodboard',
              size: file.size,
            });
          }
        }
      } catch {
        // brak katalogu
      }
    }
  } catch {
    // brak groups
  }

  const totalSize = orphanedFiles.reduce((sum, f) => sum + f.size, 0);

  return {
    orphanedFiles,
    totalSize,
    scannedRevisionThumbnails,
    scannedGalleryFiles,
    scannedMoodboardFiles,
  };
}

interface CleanupLogEntry {
  path: string;
  type: string;
  size: number;
  action: 'deleted' | 'dir_removed' | 'error';
  error?: string;
}

async function saveCleanupLog(entries: CleanupLogEntry[]): Promise<void> {
  try {
    const dataDir = await getDataDir();
    const logDir = path.join(dataDir, 'cleanup-logs');
    await fsp.mkdir(logDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const logPath = path.join(logDir, `cleanup-${date}.json`);

    let existing: CleanupLogEntry[] = [];
    try {
      const raw = await fsp.readFile(logPath, 'utf8');
      existing = JSON.parse(raw);
    } catch {
      // nowy plik
    }

    const all = [...existing, ...entries];
    const tmpPath = logPath + '.tmp';
    await fsp.writeFile(tmpPath, JSON.stringify(all, null, 2));
    await fsp.rename(tmpPath, logPath);
  } catch (err) {
    logger.error('[CLEANUP] Błąd zapisu logu:', err);
  }
}

async function deleteOrphanedFiles(files: OrphanedFile[]): Promise<number> {
  const dataDir = await getDataDir();
  const moodboardImagesDir = await getMoodboardImagesDir();
  let deleted = 0;
  const logEntries: CleanupLogEntry[] = [];

  for (const file of files) {
    let fullPath: string;
    if (file.type === 'moodboard') {
      if (file.path.startsWith('groups/')) {
        fullPath = path.join(dataDir, file.path);
      } else {
        fullPath = path.join(moodboardImagesDir, file.path.replace(/^moodboard\/images\//, ''));
      }
    } else {
      fullPath = path.join(dataDir, file.path);
    }

    const normalizedBase = path.normalize(dataDir);
    const normalizedFull = path.normalize(fullPath);
    if (file.type === 'moodboard') {
      const moodBase = path.normalize(moodboardImagesDir);
      const dataBase = path.normalize(dataDir);
      if (!normalizedFull.startsWith(moodBase) && !normalizedFull.startsWith(dataBase)) continue;
    } else if (!normalizedFull.startsWith(normalizedBase)) {
      continue;
    }

    try {
      await fsp.unlink(fullPath);
      deleted++;
      logger.info(`[CLEANUP] Usunięto ${file.type}: ${file.path} (${file.size} B)`);
      logEntries.push({ path: file.path, type: file.type, size: file.size, action: 'deleted' });

      const parentDir = path.dirname(fullPath);
      try {
        const entries = await fsp.readdir(parentDir);
        if (entries.length === 0) {
          await fsp.rmdir(parentDir);
          logger.info(`[CLEANUP] Usunięto pusty katalog: ${parentDir}`);
          logEntries.push({ path: parentDir, type: 'directory', size: 0, action: 'dir_removed' });
        }
      } catch {
        // ignoruj
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[CLEANUP] Błąd usuwania ${file.path}: ${msg}`);
      logEntries.push({ path: file.path, type: file.type, size: file.size, action: 'error', error: msg });
    }
  }

  await saveCleanupLog(logEntries);
  return deleted;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const result = await scanOrphanedFiles();
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Scan orphaned files error:', error);
      return res.status(500).json({ error: 'Błąd skanowania plików' });
    }
  }

  if (req.method === 'DELETE') {
    const dryRun = req.query.dryRun === 'true';

    try {
      const scanResult = await scanOrphanedFiles();

      if (dryRun) {
        return res.status(200).json({
          success: true,
          dryRun: true,
          wouldDelete: scanResult.orphanedFiles.length,
          wouldFreeBytes: scanResult.totalSize,
          files: scanResult.orphanedFiles,
        });
      }

      const deleted = await deleteOrphanedFiles(scanResult.orphanedFiles);
      return res.status(200).json({
        success: true,
        deleted,
        freedBytes: scanResult.totalSize,
      });
    } catch (error) {
      logger.error('Delete orphaned files error:', error);
      return res.status(500).json({ error: 'Błąd usuwania plików' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAdminAuth(handler);
