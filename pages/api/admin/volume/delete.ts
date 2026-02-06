import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

import { VOLUME_ROOT } from '../../../../src/config/constants';

/**
 * Usuwa plik lub folder z volume'u.
 * POST body: { path: string, type: 'file' | 'folder' }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { path: rawPath, type } = req.body as { path?: string; type?: string };
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return res.status(400).json({ error: 'path is required' });
  }
  if (type !== 'file' && type !== 'folder') {
    return res.status(400).json({ error: 'type must be "file" or "folder"' });
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
  if (stat.isDirectory() && type !== 'folder') {
    return res
      .status(400)
      .json({ error: 'Path is a folder, use type: "folder"' });
  }
  if (stat.isFile() && type !== 'file') {
    return res.status(400).json({ error: 'Path is a file, use type: "file"' });
  }

  try {
    if (type === 'file') {
      await fsp.unlink(resolvedPath);
    } else {
      await fsp.rm(resolvedPath, { recursive: true });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Volume delete error:', err);
    return res.status(500).json({ error: 'Failed to delete' });
  }
}

export default withAdminAuth(handler);
