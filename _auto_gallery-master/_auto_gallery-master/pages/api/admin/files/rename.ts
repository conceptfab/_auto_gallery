import { NextApiRequest, NextApiResponse } from 'next';
import { generateRenameToken } from '../../../../src/utils/fileToken';
import { withAdminAuth } from '../../../../src/utils/adminMiddleware';
import {
  validateFilePath,
  validateFileName,
} from '../../../../src/utils/pathValidation';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { oldPath, newName } = req.body;
  const pathResult = validateFilePath(oldPath);
  if (!pathResult.valid) {
    return res.status(400).json({ error: pathResult.error });
  }
  const nameResult = validateFileName(newName);
  if (!nameResult.valid) {
    return res.status(400).json({ error: nameResult.error });
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

export default withAdminAuth(handler);
