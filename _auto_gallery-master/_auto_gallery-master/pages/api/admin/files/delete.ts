import { NextApiRequest, NextApiResponse } from 'next';
import { generateDeleteToken } from '../../../../src/utils/fileToken';
import { withAdminAuth } from '../../../../src/utils/adminMiddleware';
import { validateFilePath } from '../../../../src/utils/pathValidation';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { path } = req.body;
  const pathResult = validateFilePath(path);
  if (!pathResult.valid) {
    return res.status(400).json({ error: pathResult.error });
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

    res.status(200).json(data);
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
}

export default withAdminAuth(handler);
