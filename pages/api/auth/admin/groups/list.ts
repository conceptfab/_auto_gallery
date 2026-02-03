import { NextApiRequest, NextApiResponse } from 'next';
import { getGroups } from '../../../../../src/utils/storage';


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const groups = await getGroups();
    res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default handler;
