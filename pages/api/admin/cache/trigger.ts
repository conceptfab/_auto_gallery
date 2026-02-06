// pages/api/admin/cache/trigger.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import {
  forceScan,
  isScanRunning,
  regenerateAllThumbnails,
} from '@/src/services/schedulerService';
import { clearAllThumbnails } from '@/src/services/thumbnailService';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body as {
    action?: 'scan' | 'regenerate' | 'clear' | 'build';
  };

  if (isScanRunning() && action !== 'clear') {
    return res.status(409).json({
      error: 'Operacja już w toku',
      inProgress: true,
    });
  }

  try {
    switch (action) {
      case 'build': {
        // Pełne budowanie cache: skan + regeneracja miniaturek
        (async () => {
          try {
            console.log('Build cache: starting scan...');
            const scanResult = await forceScan();
            console.log('Build cache: scan completed:', scanResult);

            console.log('Build cache: starting thumbnail regeneration...');
            const regenResult = await regenerateAllThumbnails();
            console.log('Build cache: regeneration completed:', regenResult);
          } catch (err) {
            console.error('Build cache error:', err);
          }
        })();

        return res.status(200).json({
          success: true,
          message: 'Budowanie cache uruchomione (skan + miniaturki)',
        });
      }

      case 'scan':
      default: {
        // Uruchom skan asynchronicznie dla szybkiej odpowiedzi
        forceScan()
          .then((result) => {
            console.log('Scan completed:', result);
          })
          .catch((err) => {
            console.error('Background scan error:', err);
          });

        return res.status(200).json({
          success: true,
          message: 'Skan uruchomiony',
        });
      }

      case 'regenerate': {
        // Regeneracja w tle
        regenerateAllThumbnails()
          .then((result) => {
            console.log('Regeneration completed:', result);
          })
          .catch((err) => {
            console.error('Background regeneration error:', err);
          });

        return res.status(200).json({
          success: true,
          message: 'Regeneracja miniaturek uruchomiona',
        });
      }

      case 'clear': {
        const deleted = await clearAllThumbnails();
        return res.status(200).json({
          success: true,
          message: `Usunięto ${deleted} miniaturek`,
          deleted,
        });
      }
    }
  } catch (error) {
    console.error('Error triggering action:', error);
    return res.status(500).json({ error: 'Błąd wykonywania operacji' });
  }
}

export default withAdminAuth(handler);
