// pages/api/thumbnails/[...path].ts

import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';

async function getCachePath(): Promise<string> {
  try {
    await fsp.access('/data-storage');
    return '/data-storage/thumbnails';
  } catch {
    return path.join(process.cwd(), 'data', 'thumbnails');
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
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

    // Zabezpieczenie przed path traversal
    if (relativePath.includes('..') || relativePath.includes('~')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // Sprawdź rozszerzenie
    const ext = path.extname(relativePath).toLowerCase();
    const allowedExtensions = ['.webp', '.avif', '.jpg', '.jpeg', '.png'];
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    const cachePath = await getCachePath();
    const fullPath = path.join(cachePath, relativePath);

    // Sprawdź czy plik istnieje
    try {
      await fsp.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    const buffer = await fsp.readFile(fullPath);

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
      contentTypes[ext] || 'application/octet-stream',
    );
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Thumbnail serve error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Zwiększ limit dla obrazów
export const config = {
  api: {
    responseLimit: '10mb',
  },
};
