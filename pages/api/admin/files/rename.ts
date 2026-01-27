import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { generateRenameToken } from '../../../../src/utils/fileToken';

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

  const { oldPath, newName } = req.body;

  if (!oldPath || typeof oldPath !== 'string') {
    return res.status(400).json({ error: 'oldPath is required' });
  }

  if (!newName || typeof newName !== 'string') {
    return res.status(400).json({ error: 'newName is required' });
  }

  // Walidacja ścieżki - zapobieganie Path Traversal
  if (
    oldPath.includes('..') ||
    oldPath.includes('./') ||
    oldPath.startsWith('/')
  ) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // Dozwolone tylko znaki alfanumeryczne, myślniki, podkreślenia i slashe
  if (!/^[a-zA-Z0-9\/_\-\.]+$/.test(oldPath)) {
    return res.status(400).json({ error: 'Invalid characters in path' });
  }

  // Walidacja nazwy pliku
  if (
    newName.includes('..') ||
    newName.includes('/') ||
    newName.includes('\\')
  ) {
    return res.status(400).json({ error: 'Invalid file name' });
  }

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(newName)) {
    return res.status(400).json({ error: 'Invalid characters in file name' });
  }

  try {
    const { token, expires, url } = generateRenameToken(oldPath, newName);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ oldPath, newName, token, expires }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).json({ error: 'Failed to rename file' });
  }
}
