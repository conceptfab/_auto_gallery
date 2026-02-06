// pages/api/admin/cache/folder-hashes.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getCacheData } from '@/src/utils/cacheStorage';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await getCacheData();
    const records = data.folderHashRecords || [];

    // Oblicz statystyki
    const matching = records.filter(
      (r) => r.previousHash && r.currentHash === r.previousHash
    ).length;
    const changed = records.filter(
      (r) => r.previousHash && r.currentHash !== r.previousHash
    ).length;
    const newFolders = records.filter((r) => !r.previousHash).length;

    return res.status(200).json({
      success: true,
      records,
      stats: {
        total: records.length,
        matching,
        changed,
        newFolders,
      },
    });
  } catch (error) {
    console.error('Error getting folder hashes:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAdminAuth(handler);
