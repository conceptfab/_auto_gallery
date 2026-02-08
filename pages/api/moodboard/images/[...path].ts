import type { NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { getMoodboardImagesDir } from '@/src/utils/moodboardStorage';
import { getMoodboardImagesDirByGroup } from '@/src/utils/moodboardStoragePath';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';

async function handler(
  req: GroupScopedRequest,
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

    // Sprawdź rozszerzenie
    const ext = path.extname(relativePath).toLowerCase();
    const allowedExtensions = ['.webp', '.jpg', '.jpeg', '.png', '.gif'];
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    // Admin może podać ?groupId=, user ma z middleware
    const queryGroupId = req.query.groupId as string | undefined;
    const groupId = req.isAdmin && queryGroupId ? queryGroupId : req.userGroupId;

    // Próbuj najpierw z folderu grupy, potem z globalnego
    const baseDirs: string[] = [];
    if (groupId) {
      baseDirs.push(await getMoodboardImagesDirByGroup(groupId));
    }
    baseDirs.push(await getMoodboardImagesDir());

    let buffer: Buffer | null = null;
    for (const baseDir of baseDirs) {
      const fullPath = path.join(baseDir, relativePath);

      // Sprawdź path traversal
      const realBaseDir = await fsp.realpath(baseDir).catch(() => baseDir);
      let realFullPath: string;
      try {
        realFullPath = await fsp.realpath(fullPath);
      } catch {
        continue;
      }

      if (!realFullPath.startsWith(realBaseDir)) {
        continue;
      }

      try {
        buffer = await fsp.readFile(realFullPath);
        break;
      } catch {
        continue;
      }
    }

    if (!buffer) {
      return res.status(404).json({ error: 'Image not found' });
    }

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

export default withGroupAccess(handler);

export const config = {
  api: {
    responseLimit: '15mb',
  },
};
