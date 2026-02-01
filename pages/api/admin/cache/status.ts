// pages/api/admin/cache/status.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import {
  getCacheStatus,
  getCacheData,
  DEFAULT_EMAIL_NOTIFICATION_CONFIG,
} from '@/src/utils/cacheStorage';
import {
  isScanRunning,
  getSchedulerStatus,
} from '@/src/services/schedulerService';
import { getThumbnailStats } from '@/src/services/thumbnailService';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // getSchedulerStatus() automatycznie uruchamia scheduler przy pierwszym wywołaniu (po deployu)
    const schedulerStatus = getSchedulerStatus();

    const [status, data, thumbnailStats] = await Promise.all([
      getCacheStatus(),
      getCacheData(),
      getThumbnailStats(),
    ]);

    // Uzupełnij status miniaturek
    status.thumbnails.totalGenerated = thumbnailStats.totalFiles;
    status.thumbnails.storageUsed = thumbnailStats.totalSize;

    return res.status(200).json({
      success: true,
      status: {
        ...status,
        scanInProgress: isScanRunning(),
        schedulerActive: schedulerStatus.intervalActive,
      },
      config: {
        scheduler: data.schedulerConfig,
        thumbnails: data.thumbnailConfig,
        email:
          data.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG,
      },
      stats: {
        thumbnailsBySize: thumbnailStats.bySize,
        totalFiles: data.fileHashes.length,
        lastChanges: data.lastScanChanges,
      },
    });
  } catch (error) {
    console.error('Error getting cache status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAdminAuth(handler);
