// pages/api/admin/cache/config.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getCacheData, updateCacheData } from '@/src/utils/cacheStorage';
import { SchedulerConfig, ThumbnailConfig, EmailNotificationConfig } from '@/src/types/cache';
import { DEFAULT_EMAIL_NOTIFICATION_CONFIG } from '@/src/utils/cacheStorage';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      const data = await getCacheData();
      return res.status(200).json({
        success: true,
        schedulerConfig: data.schedulerConfig,
        thumbnailConfig: data.thumbnailConfig,
        emailNotificationConfig: data.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG,
      });
    } catch (error) {
      console.error('Error getting cache config:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { schedulerConfig, thumbnailConfig, emailNotificationConfig } = req.body as {
        schedulerConfig?: Partial<SchedulerConfig>;
        thumbnailConfig?: Partial<ThumbnailConfig>;
        emailNotificationConfig?: Partial<EmailNotificationConfig>;
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

        if (emailNotificationConfig) {
          data.emailNotificationConfig = {
            ...(data.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG),
            ...emailNotificationConfig,
          };
        }
      });

      const updatedData = await getCacheData();

      return res.status(200).json({
        success: true,
        schedulerConfig: updatedData.schedulerConfig,
        thumbnailConfig: updatedData.thumbnailConfig,
        emailNotificationConfig: updatedData.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG,
      });
    } catch (error) {
      console.error('Error updating cache config:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAdminAuth(handler);
