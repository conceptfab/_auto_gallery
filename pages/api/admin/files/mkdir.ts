import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { generateMkdirToken } from '../../../../src/utils/fileToken';
import { logger } from '../../../../src/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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

  // Walidacja folderu nadrzędnego - zapobieganie Path Traversal
  if (
    parentFolder &&
    (parentFolder.includes('..') ||
      parentFolder.includes('./') ||
      parentFolder.startsWith('/'))
  ) {
    return res.status(400).json({ error: 'Invalid parent folder path' });
  }

  if (parentFolder && !/^[a-zA-Z0-9\/_\-\.]+$/.test(parentFolder)) {
    return res
      .status(400)
      .json({ error: 'Invalid characters in parent folder' });
  }

  // Walidacja nazwy folderu
  if (
    folderName.includes('..') ||
    folderName.includes('/') ||
    folderName.includes('\\')
  ) {
    return res.status(400).json({ error: 'Invalid folder name' });
  }

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(folderName)) {
    return res.status(400).json({ error: 'Invalid characters in folder name' });
  }

  try {
    const { token, expires, url } = generateMkdirToken(
      parentFolder,
      folderName,
    );

    logger.debug('Mkdir request:', { url, parentFolder, folderName });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parentFolder, folderName, token, expires }),
    });

    const text = await response.text();
    logger.debug('Mkdir PHP response:', response.status, text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res
        .status(500)
        .json({ error: 'Invalid PHP response: ' + text.substring(0, 200) });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    logger.error('Error creating folder', error);
    res
      .status(500)
      .json({ error: 'Failed to create folder: ' + (error as Error).message });
  }
}
