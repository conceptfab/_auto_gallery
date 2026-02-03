import { NextApiRequest, NextApiResponse } from 'next';
import { generateListUrl } from '../../../../src/utils/fileToken';


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { folder = '' } = req.query;
  const folderPath = typeof folder === 'string' ? folder : '';

  try {
    const listUrl = generateListUrl(folderPath);
    const response = await fetch(listUrl);

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
}


export default handler;
