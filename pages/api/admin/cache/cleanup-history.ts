// pages/api/admin/cache/cleanup-history.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { cleanupHistory, clearAllHistory } from '@/src/utils/cacheStorage';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, retentionHours } = req.body;

  try {
    if (action === 'clear') {
      await clearAllHistory();
      return res.status(200).json({
        success: true,
        message: 'Historia wyczyszczona',
      });
    } else {
      const result = await cleanupHistory(retentionHours);
      return res.status(200).json({
        success: true,
        ...result,
        message: `Usunięto ${result.historyRemoved} wpisów historii i ${result.changesRemoved} zmian`,
      });
    }
  } catch (error) {
    console.error('Error cleaning up history:', error);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
}

export default withAdminAuth(handler);
