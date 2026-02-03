import type { NextApiRequest, NextApiResponse } from 'next';

import {
  getUserStats,
  getLoginHistory,
  getViewEvents,
  getDownloadEvents,
} from '../../../../src/utils/statsStorage';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.query;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required' });
  }

  const [summary, logins, views, downloads] = await Promise.all([
    getUserStats(email),
    getLoginHistory(email, 50),
    getViewEvents(email, undefined, 100),
    getDownloadEvents(email, 100),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      summary,
      logins,
      views,
      downloads,
    },
  });
}

export default handler;
