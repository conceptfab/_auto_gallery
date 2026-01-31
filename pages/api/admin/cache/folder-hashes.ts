// pages/api/admin/cache/folder-hashes.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { getCacheData } from '@/src/utils/cacheStorage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
