import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { generateMoveToken } from '../../../../src/utils/fileToken';

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

  const { sourcePath, targetFolder } = req.body;

  if (!sourcePath || typeof sourcePath !== 'string') {
    return res.status(400).json({ error: 'sourcePath is required' });
  }

  if (targetFolder === undefined || typeof targetFolder !== 'string') {
    return res.status(400).json({ error: 'targetFolder is required' });
  }

  // Walidacja ścieżki źródłowej - zapobieganie Path Traversal
  if (
    sourcePath.includes('..') ||
    sourcePath.includes('./') ||
    sourcePath.startsWith('/')
  ) {
    return res.status(400).json({ error: 'Invalid source path' });
  }

  if (!/^[a-zA-Z0-9\/_\-\.]+$/.test(sourcePath)) {
    return res.status(400).json({ error: 'Invalid characters in source path' });
  }

  // Walidacja folderu docelowego
  if (
    targetFolder.includes('..') ||
    targetFolder.includes('./') ||
    targetFolder.startsWith('/')
  ) {
    return res.status(400).json({ error: 'Invalid target folder' });
  }

  if (!/^[a-zA-Z0-9\/_\-\.]+$/.test(targetFolder)) {
    return res
      .status(400)
      .json({ error: 'Invalid characters in target folder' });
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
      return res
        .status(500)
        .json({ error: 'Invalid PHP response: ' + text.substring(0, 200) });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error moving file:', error);
    res
      .status(500)
      .json({ error: 'Failed to move file: ' + (error as Error).message });
  }
}
