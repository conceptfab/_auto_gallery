import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

import { VOLUME_ROOT } from '../../../../src/config/constants';

/**
 * Listuje pliki i katalogi z volume'u /data-storage.
 * GET /api/admin/volume/files?path=   - root
 * GET /api/admin/volume/files?path=thumbnails  - podfolder
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await fsp.access(VOLUME_ROOT);
  } catch {
    return res.status(503).json({
      error: 'Volume not available',
      message: '/data-storage is not mounted (e.g. local dev)',
    });
  }

  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  // Normalizacja: bez leading/trailing slash, bez ..
  const safeRelative = path
    .normalize(rawPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]+$/, '');
  const absolutePath = path.join(VOLUME_ROOT, safeRelative);

  // Path traversal: musi być w granicach VOLUME_ROOT
  const realBase = await fsp.realpath(VOLUME_ROOT).catch(() => VOLUME_ROOT);
  let resolvedPath: string;
  try {
    resolvedPath = await fsp.realpath(absolutePath);
  } catch {
    return res.status(404).json({ error: 'Folder not found', path: rawPath });
  }
  if (!resolvedPath.startsWith(realBase)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const entries = await fsp.readdir(resolvedPath, { withFileTypes: true });
    const folders: { name: string; path: string }[] = [];
    const files: {
      name: string;
      path: string;
      size: number;
      modified?: string;
    }[] = [];

    for (const ent of entries) {
      const relPath = path.join(safeRelative, ent.name).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        folders.push({ name: ent.name, path: relPath });
      } else {
        let size = 0;
        let modified: string | undefined;
        try {
          const stat = await fsp.stat(path.join(resolvedPath, ent.name));
          size = stat.size;
          modified = stat.mtime?.toISOString?.();
        } catch {
          // ignore
        }
        files.push({ name: ent.name, path: relPath, size, modified });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({
      path: safeRelative,
      folders,
      files,
    });
  } catch (err) {
    console.error('Volume list error:', err);
    return res.status(500).json({ error: 'Failed to list volume' });
  }
}

export default withAdminAuth(handler);
