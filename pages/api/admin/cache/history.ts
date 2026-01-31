// pages/api/admin/cache/history.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { getCacheData } from '@/src/utils/cacheStorage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const data = await getCacheData();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    // Historia operacji
    const history = (data.history || []).slice(offset, offset + limit);

    // Ostatnie zmiany w plikach
    const changesLimit = parseInt(req.query.changesLimit as string) || 100;
    const changes = (data.changeHistory || []).slice(0, changesLimit);

    // Grupuj zmiany według typu
    const changesByType = {
      added: changes.filter((c) => c.type === 'file_added').length,
      modified: changes.filter((c) => c.type === 'file_modified').length,
      deleted: changes.filter((c) => c.type === 'file_deleted').length,
    };

    return res.status(200).json({
      success: true,
      history,
      recentChanges: changes.slice(0, 50), // Ostatnie 50 zmian
      changesByType,
      totals: {
        historyCount: data.history?.length || 0,
        changesCount: data.changeHistory?.length || 0,
        filesTracked: data.fileHashes?.length || 0,
      },
      pagination: {
        offset,
        limit,
        hasMore: (data.history?.length || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('Error getting cache history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
