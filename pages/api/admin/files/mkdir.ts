import { NextApiRequest, NextApiResponse } from 'next';
import { generateMkdirToken } from '../../../../src/utils/fileToken';
import { logger } from '../../../../src/utils/logger';
import { withAdminAuth } from '../../../../src/utils/adminMiddleware';
import {
  validateFilePath,
  validateFileName,
} from '../../../../src/utils/pathValidation';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { parentFolder = '', folderName } = req.body;
  if (parentFolder) {
    const parentResult = validateFilePath(parentFolder);
    if (!parentResult.valid) {
      return res.status(400).json({ error: parentResult.error });
    }
  }
  const nameResult = validateFileName(folderName);
  if (!nameResult.valid) {
    return res.status(400).json({ error: nameResult.error });
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

export default withAdminAuth(handler);
