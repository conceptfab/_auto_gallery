import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import archiver from 'archiver';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getDataDir } from '@/src/utils/dataDir';
import { getData, updateSettings } from '@/src/utils/storage';

interface BackupFileInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

async function getBackupsDir(): Promise<string> {
  const dataDir = await getDataDir();
  return path.join(dataDir, 'backups');
}

async function listBackups(): Promise<BackupFileInfo[]> {
  const backupsDir = await getBackupsDir();
  let files: string[];
  try {
    files = await fsp.readdir(backupsDir);
  } catch {
    return [];
  }
  const zipFiles = files.filter((f) => f.endsWith('.zip')).sort().reverse();
  const result: BackupFileInfo[] = [];
  for (const name of zipFiles) {
    try {
      const stat = await fsp.stat(path.join(backupsDir, name));
      result.push({
        name,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      });
    } catch {
      // skip
    }
  }
  return result;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET: list backups + current settings
  if (req.method === 'GET') {
    const action = req.query.action;

    // Download a specific backup
    if (action === 'download') {
      const fileName = typeof req.query.file === 'string' ? req.query.file : '';
      if (!fileName || !fileName.endsWith('.zip') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku' });
      }
      const backupsDir = await getBackupsDir();
      const filePath = path.join(backupsDir, fileName);
      const normalizedBase = path.normalize(backupsDir);
      const normalizedFull = path.normalize(filePath);
      if (!normalizedFull.startsWith(normalizedBase)) {
        return res.status(400).json({ error: 'Nieprawidłowa ścieżka' });
      }
      try {
        await fsp.access(filePath);
        const stat = await fsp.stat(filePath);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Length', stat.size);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
        );
        const stream = createReadStream(filePath);
        stream.pipe(res);
        return;
      } catch {
        return res.status(404).json({ error: 'Plik nie istnieje' });
      }
    }

    // List backups + settings
    const data = await getData();
    const backups = await listBackups();
    return res.status(200).json({
      settings: {
        autoBackupEnabled: data.settings?.autoBackupEnabled ?? false,
        autoBackupIntervalHours: data.settings?.autoBackupIntervalHours ?? 24,
        autoBackupMaxFiles: data.settings?.autoBackupMaxFiles ?? 7,
      },
      backups,
    });
  }

  // POST: update settings or trigger manual auto-backup
  if (req.method === 'POST') {
    const { action } = req.body || {};

    // Trigger manual backup (same as cron but without secret)
    if (action === 'trigger') {
      const dataDir = await getDataDir();
      const backupsDir = path.join(dataDir, 'backups');
      await fsp.mkdir(backupsDir, { recursive: true });

      const data = await getData();
      const maxFiles = data.settings?.autoBackupMaxFiles ?? 7;

      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const zipName = `manual-backup-${ts}.zip`;
      const zipPath = path.join(backupsDir, zipName);
      const tmpPath = zipPath + '.tmp';

      try {
        const output = createWriteStream(tmpPath);
        const archive = archiver('zip', { zlib: { level: 6 } });

        await new Promise<void>((resolve, reject) => {
          output.on('close', resolve);
          archive.on('error', reject);
          archive.pipe(output);

          const moodboardDir = path.join(dataDir, 'moodboard');
          const projectsDir = path.join(dataDir, 'projects');

          const addMoodboard = fsp.access(moodboardDir).then(
            () => { archive.directory(moodboardDir, 'moodboard'); },
            () => { /* no moodboard dir */ }
          );
          const addProjects = fsp.access(projectsDir).then(
            () => { archive.directory(projectsDir, 'projects'); },
            () => { /* no projects dir */ }
          );

          Promise.all([addMoodboard, addProjects]).then(() => {
            archive.finalize();
          }).catch(reject);
        });

        await fsp.rename(tmpPath, zipPath);
        const zipStat = await fsp.stat(zipPath);

        // Cleanup old
        const existing = (await fsp.readdir(backupsDir))
          .filter((f) => f.endsWith('.zip'))
          .sort();
        const toDelete = existing.length > maxFiles ? existing.slice(0, existing.length - maxFiles) : [];
        for (const f of toDelete) {
          await fsp.unlink(path.join(backupsDir, f)).catch(() => {});
        }

        return res.status(200).json({
          message: 'Backup utworzony',
          file: zipName,
          sizeBytes: zipStat.size,
          deletedOld: toDelete.length,
        });
      } catch (err) {
        // Cleanup tmp
        await fsp.unlink(tmpPath).catch(() => {});
        throw err;
      }
    }

    // Update settings
    const { autoBackupEnabled, autoBackupIntervalHours, autoBackupMaxFiles } = req.body || {};
    await updateSettings((s) => {
      if (typeof autoBackupEnabled === 'boolean') s.autoBackupEnabled = autoBackupEnabled;
      if (typeof autoBackupIntervalHours === 'number' && autoBackupIntervalHours >= 1 && autoBackupIntervalHours <= 168) {
        s.autoBackupIntervalHours = autoBackupIntervalHours;
      }
      if (typeof autoBackupMaxFiles === 'number' && autoBackupMaxFiles >= 1 && autoBackupMaxFiles <= 30) {
        s.autoBackupMaxFiles = autoBackupMaxFiles;
      }
    });

    const updated = await getData();
    return res.status(200).json({
      settings: {
        autoBackupEnabled: updated.settings?.autoBackupEnabled ?? false,
        autoBackupIntervalHours: updated.settings?.autoBackupIntervalHours ?? 24,
        autoBackupMaxFiles: updated.settings?.autoBackupMaxFiles ?? 7,
      },
    });
  }

  // DELETE: remove a specific backup file
  if (req.method === 'DELETE') {
    const fileName = typeof req.query.file === 'string' ? req.query.file : '';
    if (!fileName || !fileName.endsWith('.zip') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku' });
    }
    const backupsDir = await getBackupsDir();
    const filePath = path.join(backupsDir, fileName);
    const normalizedBase = path.normalize(backupsDir);
    const normalizedFull = path.normalize(filePath);
    if (!normalizedFull.startsWith(normalizedBase)) {
      return res.status(400).json({ error: 'Nieprawidłowa ścieżka' });
    }
    try {
      await fsp.unlink(filePath);
      return res.status(200).json({ deleted: fileName });
    } catch {
      return res.status(404).json({ error: 'Plik nie istnieje' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAdminAuth(handler);
