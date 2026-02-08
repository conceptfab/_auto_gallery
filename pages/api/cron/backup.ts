// pages/api/cron/backup.ts
// Endpoint dla Railway Cron – automatyczny backup moodboardów i projektów do data/backups/.
// Wywołuj cyklicznie z nagłówkiem x-cron-secret: CRON_SECRET.

import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { getData } from '@/src/utils/storage';
import { getDataDir } from '@/src/utils/dataDir';

const CRON_SECRET = process.env.CRON_SECRET || '';

function getSecretFromRequest(req: NextApiRequest): string {
  const header = req.headers['x-cron-secret'];
  if (typeof header === 'string') return header;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

async function cleanupOldBackups(backupsDir: string, maxFiles: number): Promise<number> {
  let files: string[];
  try {
    files = await fsp.readdir(backupsDir);
  } catch {
    return 0;
  }
  const zipFiles = files.filter((f) => f.endsWith('.zip')).sort();
  const toDelete = zipFiles.length > maxFiles ? zipFiles.slice(0, zipFiles.length - maxFiles) : [];
  let deleted = 0;
  for (const file of toDelete) {
    try {
      await fsp.unlink(path.join(backupsDir, file));
      deleted++;
    } catch {
      // ignore
    }
  }
  return deleted;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!CRON_SECRET) {
    console.error('[Cron/backup] CRON_SECRET not set');
    return res.status(503).json({ error: 'Cron not configured' });
  }

  const secret = getSecretFromRequest(req);
  if (secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const data = await getData();
    const autoBackupEnabled = data.settings?.autoBackupEnabled ?? false;
    const autoBackupMaxFiles = data.settings?.autoBackupMaxFiles ?? 7;
    const autoBackupIntervalHours = data.settings?.autoBackupIntervalHours ?? 24;

    if (!autoBackupEnabled) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'auto_backup_disabled',
      });
    }

    const dataDir = await getDataDir();
    const backupsDir = path.join(dataDir, 'backups');
    await fsp.mkdir(backupsDir, { recursive: true });

    // Check if we should skip based on interval (last backup age)
    try {
      const existing = (await fsp.readdir(backupsDir))
        .filter((f) => f.endsWith('.zip'))
        .sort();
      if (existing.length > 0) {
        const lastFile = existing[existing.length - 1];
        const stat = await fsp.stat(path.join(backupsDir, lastFile));
        const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
        if (ageHours < autoBackupIntervalHours * 0.9) {
          return res.status(200).json({
            ok: true,
            skipped: true,
            reason: 'too_recent',
            lastBackupAge: `${ageHours.toFixed(1)}h`,
            intervalHours: autoBackupIntervalHours,
          });
        }
      }
    } catch {
      // first backup
    }

    // Create backup ZIP
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipName = `auto-backup-${ts}.zip`;
    const zipPath = path.join(backupsDir, zipName);
    const tmpPath = zipPath + '.tmp';

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

    // Atomic rename
    await fsp.rename(tmpPath, zipPath);

    const zipStat = await fsp.stat(zipPath);
    const sizeKB = (zipStat.size / 1024).toFixed(1);

    // Cleanup old backups
    const deletedCount = await cleanupOldBackups(backupsDir, autoBackupMaxFiles);

    console.log(
      `[Cron/backup] Backup: ${zipName} (${sizeKB} KB), usunięto ${deletedCount} starych`
    );

    return res.status(200).json({
      ok: true,
      file: zipName,
      sizeKB: parseFloat(sizeKB),
      deletedOld: deletedCount,
    });
  } catch (error) {
    console.error('[Cron/backup] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
