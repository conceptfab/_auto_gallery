import type { NextApiRequest, NextApiResponse } from 'next';

import { getOverviewStats } from '../../../../src/utils/statsStorage';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { range } = req.query;

  let dateRange: { start: Date; end: Date } | undefined;

  const now = new Date();

  if (range === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    dateRange = { start, end };
  } else if (range === 'week') {
    const end = new Date(now);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateRange = { start, end };
  } else if (range === 'month') {
    const end = new Date(now);
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateRange = { start, end };
  }

  const stats = await getOverviewStats(dateRange);

  return res.status(200).json({
    success: true,
    data: stats,
  });
}

export default handler;
