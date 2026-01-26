import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { generateDeleteToken } from '../../../../src/utils/fileToken';
import { clearCachedGallery } from '../../../../src/utils/galleryCache';
import pathModule from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź czy to admin
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { path } = req.body;

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Path is required' });
  }

  try {
    const { token, expires, url } = generateDeleteToken(path);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, token, expires }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Wyczyść cache dla folderu zawierającego usunięty plik
    try {
      const folderPath = pathModule.dirname(path).replace(/^\//, '').replace(/\/$/, '');
      await clearCachedGallery(folderPath);
    } catch (e) {
      // Ignore cache clear errors
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
}
