// pages/api/admin/cache/status.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { getCacheStatus, getCacheData, DEFAULT_EMAIL_NOTIFICATION_CONFIG } from '@/src/utils/cacheStorage';
import {
  isScanRunning,
  getSchedulerStatus,
} from '@/src/services/schedulerService';
import { getThumbnailStats } from '@/src/services/thumbnailService';

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
    const [status, data, schedulerStatus, thumbnailStats] = await Promise.all([
      getCacheStatus(),
      getCacheData(),
      Promise.resolve(getSchedulerStatus()),
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
        email: data.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG,
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
