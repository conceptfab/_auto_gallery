// pages/api/admin/cache/config.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { getCacheData, updateCacheData } from '@/src/utils/cacheStorage';
import { SchedulerConfig, ThumbnailConfig } from '@/src/types/cache';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const data = await getCacheData();
      return res.status(200).json({
        success: true,
        schedulerConfig: data.schedulerConfig,
        thumbnailConfig: data.thumbnailConfig,
      });
    } catch (error) {
      console.error('Error getting cache config:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { schedulerConfig, thumbnailConfig } = req.body as {
        schedulerConfig?: Partial<SchedulerConfig>;
        thumbnailConfig?: Partial<ThumbnailConfig>;
      };

      await updateCacheData((data) => {
        if (schedulerConfig) {
          // Merge z zachowaniem istniejących zagnieżdżonych obiektów
          if (schedulerConfig.workHours) {
            data.schedulerConfig.workHours = {
              ...data.schedulerConfig.workHours,
              ...schedulerConfig.workHours,
            };
          }
          if (schedulerConfig.offHours) {
            data.schedulerConfig.offHours = {
              ...data.schedulerConfig.offHours,
              ...schedulerConfig.offHours,
            };
          }
          if (schedulerConfig.enabled !== undefined) {
            data.schedulerConfig.enabled = schedulerConfig.enabled;
          }
          if (schedulerConfig.timezone) {
            data.schedulerConfig.timezone = schedulerConfig.timezone;
          }
        }

        if (thumbnailConfig) {
          data.thumbnailConfig = {
            ...data.thumbnailConfig,
            ...thumbnailConfig,
          };
        }
      });

      const updatedData = await getCacheData();

      return res.status(200).json({
        success: true,
        schedulerConfig: updatedData.schedulerConfig,
        thumbnailConfig: updatedData.thumbnailConfig,
      });
    } catch (error) {
      console.error('Error updating cache config:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
