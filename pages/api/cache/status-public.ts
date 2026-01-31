// pages/api/cache/status-public.ts
// Publiczny endpoint bez autoryzacji - zwraca minimalny status cache

import { NextApiRequest, NextApiResponse } from 'next';
import { getCacheData } from '@/src/utils/cacheStorage';
import { getThumbnailStats } from '@/src/services/thumbnailService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [data, thumbnailStats] = await Promise.all([
      getCacheData(),
      getThumbnailStats(),
    ]);

    return res.status(200).json({
      success: true,
      cacheWorking: thumbnailStats.totalFiles > 0,
      thumbnailsCount: thumbnailStats.totalFiles,
      filesMonitored: data.fileHashes?.length || 0,
    });
  } catch {
    // W przypadku błędu zwróć że cache nie działa, ale nie zwracaj błędu
    return res.status(200).json({
      success: true,
      cacheWorking: false,
      thumbnailsCount: 0,
      filesMonitored: 0,
    });
  }
}
