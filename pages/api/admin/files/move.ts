import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { generateMoveToken } from '../../../../src/utils/fileToken';
import { clearCachedGallery } from '../../../../src/utils/galleryCache';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź czy to admin
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { sourcePath, targetFolder } = req.body;

  if (!sourcePath || typeof sourcePath !== 'string') {
    return res.status(400).json({ error: 'sourcePath is required' });
  }

  if (targetFolder === undefined || typeof targetFolder !== 'string') {
    return res.status(400).json({ error: 'targetFolder is required' });
  }

  try {
    const { token, expires, url } = generateMoveToken(sourcePath, targetFolder);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sourcePath, targetFolder, token, expires }),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'Invalid PHP response: ' + text.substring(0, 200) });
    }
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Wyczyść cache dla folderu źródłowego i docelowego
    try {
      const sourceFolder = path.dirname(sourcePath).replace(/^\//, '').replace(/\/$/, '');
      const targetFolderPath = targetFolder.replace(/^\//, '').replace(/\/$/, '');
      await Promise.all([
        clearCachedGallery(sourceFolder),
        clearCachedGallery(targetFolderPath)
      ]);
    } catch (e) {
      // Ignore cache clear errors
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error moving file:', error);
    res.status(500).json({ error: 'Failed to move file: ' + (error as Error).message });
  }
}
