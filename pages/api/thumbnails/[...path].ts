// pages/api/thumbnails/[...path].ts

import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { validateFilePath } from '@/src/utils/pathValidation';
import { logger } from '@/src/utils/logger';
import { getThumbnailsBasePath } from '@/src/utils/thumbnailStoragePath';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pathSegments = req.query.path as string[];

    if (!pathSegments || pathSegments.length === 0) {
      return res.status(400).json({ error: 'Path required' });
    }

    const relativePath = pathSegments.join('/');

    const pathResult = validateFilePath(relativePath);
    if (!pathResult.valid) {
      return res
        .status(400)
        .json({ error: pathResult.error ?? 'Invalid path' });
    }

    // Sprawdź rozszerzenie
    const ext = path.extname(relativePath).toLowerCase();
    const allowedExtensions = ['.webp', '.avif', '.jpg', '.jpeg', '.png'];
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    const cachePath = await getThumbnailsBasePath();
    const fullPath = path.join(cachePath, relativePath);

    const realCachePath = await fsp.realpath(cachePath).catch(() => cachePath);
    let realFullPath: string;
    try {
      realFullPath = await fsp.realpath(fullPath);
    } catch {
      // Miniatura jeszcze nie wygenerowana – to nie błąd, frontend użyje proxy
      logger.debug('Thumbnail not on disk (not generated yet):', relativePath);
      return res.status(204).end();
    }
    if (!realFullPath.startsWith(realCachePath)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const buffer = await fsp.readFile(realFullPath);

    // Określ content-type na podstawie rozszerzenia
    const contentTypes: Record<string, string> = {
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    };

    res.setHeader(
      'Content-Type',
      contentTypes[ext] || 'application/octet-stream'
    );
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    logger.error('Thumbnail serve error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Zwiększ limit dla obrazów
export const config = {
  api: {
    responseLimit: '10mb',
  },
};
