import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { getEmailFromCookie } from '@/src/utils/auth';
import { getMoodboardImagesDir } from '@/src/utils/moodboardStorage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const email = getEmailFromCookie(req);
  if (!email) {
    return res.status(401).json({ error: 'Wymagane logowanie' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pathSegments = req.query.path as string[];

    if (!pathSegments || pathSegments.length === 0) {
      return res.status(400).json({ error: 'Path required' });
    }

    const relativePath = pathSegments.join('/');

    // Sprawdź rozszerzenie
    const ext = path.extname(relativePath).toLowerCase();
    const allowedExtensions = ['.webp', '.jpg', '.jpeg', '.png', '.gif'];
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    const baseDir = await getMoodboardImagesDir();
    const fullPath = path.join(baseDir, relativePath);

    // Sprawdź path traversal
    const realBaseDir = await fsp.realpath(baseDir).catch(() => baseDir);
    let realFullPath: string;
    try {
      realFullPath = await fsp.realpath(fullPath);
    } catch {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (!realFullPath.startsWith(realBaseDir)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const buffer = await fsp.readFile(realFullPath);

    const contentTypes: Record<string, string> = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
    };

    res.setHeader(
      'Content-Type',
      contentTypes[ext] || 'application/octet-stream'
    );
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Moodboard image serve error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
};
