import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import archiver from 'archiver';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getDataDir } from '@/src/utils/dataDir';

type Scope = 'all' | 'moodboard' | 'projects';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const scope = (typeof req.query.scope === 'string' ? req.query.scope : 'all') as Scope;
  if (!['all', 'moodboard', 'projects'].includes(scope)) {
    return res.status(400).json({ error: 'Nieprawidłowy scope (all|moodboard|projects)' });
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
  const zipName = `conceptview-data-${scope}-${date}.zip`;

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
    await archive.finalize();
  } catch (err) {
    console.error('Backup error:', err);
    if (!res.writableEnded) res.status(500).end();
  }
}

export default withAdminAuth(handler);
