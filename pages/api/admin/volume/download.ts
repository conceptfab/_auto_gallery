import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import archiver from 'archiver';


import { VOLUME_ROOT } from '../../../../src/config/constants';

/**
 * Pobiera plik lub folder (ZIP) z volume'u.
 * GET /api/admin/volume/download?path=... (path = względna ścieżka w volume)
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!rawPath.trim()) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    await fsp.access(VOLUME_ROOT);
  } catch {
    return res.status(503).json({
      error: 'Volume not available',
      message: '/data-storage is not mounted',
    });
  }

  const safeRelative = path
    .normalize(rawPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]+$/, '');
  const absolutePath = path.join(VOLUME_ROOT, safeRelative);

  const realBase = await fsp.realpath(VOLUME_ROOT).catch(() => VOLUME_ROOT);
  let resolvedPath: string;
  try {
    resolvedPath = await fsp.realpath(absolutePath);
  } catch {
    return res.status(404).json({ error: 'Not found', path: rawPath });
  }
  if (!resolvedPath.startsWith(realBase)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const stat = await fsp.stat(resolvedPath).catch(() => null);
  if (!stat) {
    return res.status(404).json({ error: 'Not found', path: rawPath });
  }

  const baseName = path.basename(resolvedPath) || 'download';

  if (stat.isFile()) {
    const filename = encodeURIComponent(baseName);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${filename}`
    );
    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', (err) => {
      console.error('Volume download stream error:', err);
      if (!res.writableEnded) res.status(500).end();
    });
    stream.pipe(res);
    return;
  }

  if (stat.isDirectory()) {
    const zipName = `${baseName}.zip`;
    const filename = encodeURIComponent(zipName);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${filename}`
    );
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('Volume zip error:', err);
      if (!res.writableEnded) res.status(500).end();
    });
    archive.pipe(res);
    archive.directory(resolvedPath, false);
    await archive.finalize();
    return;
  }

  return res.status(400).json({ error: 'Unsupported entry type' });
}

export default handler;
