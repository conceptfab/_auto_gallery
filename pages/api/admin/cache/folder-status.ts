// pages/api/admin/cache/folder-status.ts
// Zwraca status cache dla obrazów w folderze

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getFolderCacheStatus } from '@/src/services/cacheStatusService';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { folder } = req.query;
  const folderPath = typeof folder === 'string' ? folder : '';

  const result = await getFolderCacheStatus(folderPath);
  return res.status(200).json(result);
}

export default withAdminAuth(handler);
