// pages/api/admin/cache/test-error-notification.ts
// Wysyła testowe powiadomienie email o błędzie (do weryfikacji, że maile przy awarii działają).

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import {
  getCacheData,
  DEFAULT_EMAIL_NOTIFICATION_CONFIG,
} from '@/src/utils/cacheStorage';
import { sendRebuildNotification } from '@/src/utils/email';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await getCacheData();
    const emailConfig =
      data.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG;
    await sendRebuildNotification(
      {
        success: false,
        duration: 0,
        filesProcessed: 0,
        thumbnailsGenerated: 0,
        failed: 0,
        error:
          'Test powiadomienia o błędzie – weryfikacja wysyłki maili przy awarii.',
      },
      emailConfig.email?.trim() || undefined
    );

    return res.status(200).json({
      success: true,
      message: 'Testowe powiadomienie o błędzie wysłane. Sprawdź skrzynkę.',
    });
  } catch (error) {
    console.error('Test error notification failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default withAdminAuth(handler);
