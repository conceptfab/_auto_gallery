import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getProjects } from '@/src/utils/projectsStorage';
import {
  getDesignRevisionThumbnailsDir,
  getDesignGalleryDir,
} from '@/src/utils/thumbnailStoragePath';
import { getMoodboardImagesDir } from '@/src/utils/moodboardStorage';

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

async function scanDirectory(dir: string): Promise<{ relativePath: string; size: number }[]> {
  const results: { relativePath: string; size: number }[] = [];
  const now = Date.now();

  async function walk(currentDir: string, prefix: string = '') {
    try {
      const entries = await fsp.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

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

  await walk(dir);
  return results;
}

async function getMoodboardImagePaths(): Promise<Set<string>> {
  const paths = new Set<string>();

  try {
    let dataDir: string;
    try {
      await fsp.access('/data-storage');
      dataDir = '/data-storage';
    } catch {
      dataDir = path.join(process.cwd(), 'data');
    }

    const moodboardDir = path.join(dataDir, 'moodboard');
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
  const projects = await getProjects();
  const orphanedFiles: OrphanedFile[] = [];

  // Zbierz wszystkie używane ścieżki z projects
  const usedThumbnailPaths = new Set<string>();
  const usedGalleryPaths = new Set<string>();

  for (const project of projects) {
    for (const rev of project.revisions || []) {
      if (rev.thumbnailPath) {
        usedThumbnailPaths.add(rev.thumbnailPath);
      }
      for (const gp of rev.galleryPaths || []) {
        usedGalleryPaths.add(gp);
      }
    }
  }

  // Zbierz używane ścieżki moodboardu
  const usedMoodboardPaths = await getMoodboardImagePaths();

  // Skanuj design-revision
  const revisionDir = await getDesignRevisionThumbnailsDir();
  const revisionFiles = await scanDirectory(revisionDir);
  let scannedRevisionThumbnails = 0;

  for (const file of revisionFiles) {
    scannedRevisionThumbnails++;
    if (!usedThumbnailPaths.has(file.relativePath)) {
      orphanedFiles.push({
        path: file.relativePath,
        type: 'revision-thumbnail',
        size: file.size,
      });
    }
  }

  // Skanuj design-gallery
  const galleryDir = await getDesignGalleryDir();
  const galleryFiles = await scanDirectory(galleryDir);
  let scannedGalleryFiles = 0;

  for (const file of galleryFiles) {
    scannedGalleryFiles++;
    if (!usedGalleryPaths.has(file.relativePath)) {
      orphanedFiles.push({
        path: file.relativePath,
        type: 'gallery',
        size: file.size,
      });
    }
  }

  // Skanuj moodboard images
  const moodboardDir = await getMoodboardImagesDir();
  const moodboardFiles = await scanDirectory(moodboardDir);
  let scannedMoodboardFiles = 0;

  for (const file of moodboardFiles) {
    scannedMoodboardFiles++;
    if (!usedMoodboardPaths.has(file.relativePath)) {
      orphanedFiles.push({
        path: file.relativePath,
        type: 'moodboard',
        size: file.size,
      });
    }
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
    let dataDir: string;
    try {
      await fsp.access('/data-storage');
      dataDir = '/data-storage';
    } catch {
      dataDir = path.join(process.cwd(), 'data');
    }
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
    console.error('[CLEANUP] Błąd zapisu logu:', err);
  }
}

async function deleteOrphanedFiles(files: OrphanedFile[]): Promise<number> {
  const revisionDir = await getDesignRevisionThumbnailsDir();
  const galleryDir = await getDesignGalleryDir();
  const moodboardDir = await getMoodboardImagesDir();

  let deleted = 0;
  const logEntries: CleanupLogEntry[] = [];

  for (const file of files) {
    let baseDir: string;
    switch (file.type) {
      case 'revision-thumbnail':
        baseDir = revisionDir;
        break;
      case 'gallery':
        baseDir = galleryDir;
        break;
      case 'moodboard':
        baseDir = moodboardDir;
        break;
    }

    const fullPath = path.join(baseDir, file.path);

    // Sprawdź path traversal
    const normalizedBase = path.normalize(baseDir);
    const normalizedFull = path.normalize(fullPath);
    if (!normalizedFull.startsWith(normalizedBase)) {
      continue;
    }

    try {
      await fsp.unlink(fullPath);
      deleted++;
      console.log(`[CLEANUP] Usunięto ${file.type}: ${file.path} (${file.size} B)`);
      logEntries.push({ path: file.path, type: file.type, size: file.size, action: 'deleted' });

      // Usuń pusty folder rodzica
      const parentDir = path.dirname(fullPath);
      try {
        const entries = await fsp.readdir(parentDir);
        if (entries.length === 0) {
          await fsp.rmdir(parentDir);
          const relParent = path.relative(baseDir, parentDir);
          console.log(`[CLEANUP] Usunięto pusty katalog: ${relParent}`);
          logEntries.push({ path: relParent, type: 'directory', size: 0, action: 'dir_removed' });
        }
      } catch {
        // Ignoruj błędy rmdir
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[CLEANUP] Błąd usuwania ${file.path}: ${msg}`);
      logEntries.push({ path: file.path, type: file.type, size: file.size, action: 'error', error: msg });
    }
  }

  await saveCleanupLog(logEntries);
  return deleted;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Skanuj osierocone pliki
    try {
      const result = await scanOrphanedFiles();
      return res.status(200).json(result);
    } catch (error) {
      console.error('Scan orphaned files error:', error);
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
      console.error('Delete orphaned files error:', error);
      return res.status(500).json({ error: 'Błąd usuwania plików' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAdminAuth(handler);
