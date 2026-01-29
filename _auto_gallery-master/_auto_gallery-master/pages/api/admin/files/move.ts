import { NextApiRequest, NextApiResponse } from 'next';
import { generateMoveToken } from '../../../../src/utils/fileToken';
import { withAdminAuth } from '../../../../src/utils/adminMiddleware';
import { validateFilePath } from '../../../../src/utils/pathValidation';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sourcePath, targetFolder } = req.body;
  const sourceResult = validateFilePath(sourcePath);
  if (!sourceResult.valid) {
    return res.status(400).json({ error: sourceResult.error });
  }
  const targetResult = validateFilePath(targetFolder);
  if (!targetResult.valid) {
    return res.status(400).json({ error: targetResult.error });
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

export default withAdminAuth(handler);
