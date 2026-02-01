// pages/api/cache/status-public.ts
// Publiczny endpoint bez autoryzacji – używany m.in. przez galerię (initThumbnailCache) dla zwykłych użytkowników

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getCacheData,
  DEFAULT_THUMBNAIL_CONFIG,
} from '@/src/utils/cacheStorage';
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

    const cacheWorking = thumbnailStats.totalFiles > 0;
    const config = data.thumbnailConfig || DEFAULT_THUMBNAIL_CONFIG;

    return res.status(200).json({
      success: true,
      cacheWorking,
      thumbnailsCount: thumbnailStats.totalFiles,
      filesMonitored: data.fileHashes?.length || 0,
      status: {
        thumbnails: { totalGenerated: thumbnailStats.totalFiles },
      },
      config: {
        thumbnails: {
          format: config.format,
          storage: config.storage,
          sizes: config.sizes,
        },
      },
    });
  } catch {
    return res.status(200).json({
      success: true,
      cacheWorking: false,
      thumbnailsCount: 0,
      filesMonitored: 0,
      status: { thumbnails: { totalGenerated: 0 } },
      config: {
        thumbnails: {
          format: DEFAULT_THUMBNAIL_CONFIG.format,
          storage: DEFAULT_THUMBNAIL_CONFIG.storage,
          sizes: DEFAULT_THUMBNAIL_CONFIG.sizes,
        },
      },
    });
  }
}
