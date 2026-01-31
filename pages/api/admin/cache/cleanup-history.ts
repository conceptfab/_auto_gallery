// pages/api/admin/cache/cleanup-history.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { cleanupHistory, clearAllHistory } from '@/src/utils/cacheStorage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
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
