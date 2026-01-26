import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { generateMkdirToken } from '../../../../src/utils/fileToken';
import { clearCachedGallery } from '../../../../src/utils/galleryCache';
import { logger } from '../../../../src/utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź czy to admin
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { parentFolder = '', folderName } = req.body;

  if (!folderName || typeof folderName !== 'string') {
    return res.status(400).json({ error: 'folderName is required' });
  }

  try {
    const { token, expires, url } = generateMkdirToken(parentFolder, folderName);
    
    logger.debug('Mkdir request', { url: url.substring(0, 100), parentFolder, folderName });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parentFolder, folderName, token, expires }),
    });

    const text = await response.text();
    logger.debug('Mkdir PHP response', { status: response.status, responseLength: text.length });
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'Invalid PHP response: ' + text.substring(0, 200) });
    }
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Wyczyść cache dla folderu rodzica po utworzeniu nowego folderu
    try {
      const parentFolderPath = parentFolder.replace(/^\//, '').replace(/\/$/, '');
      await clearCachedGallery(parentFolderPath);
    } catch (e) {
      // Ignore cache clear errors
    }

    res.status(200).json(data);
  } catch (error) {
    logger.error('Error creating folder', error);
    res.status(500).json({ error: 'Failed to create folder: ' + (error as Error).message });
  }
}
