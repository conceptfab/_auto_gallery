// pages/api/cron/scan.ts
// Endpoint dla Railway Cron / zewnętrznego crona – uruchamia skan bez logowania admina.
// W Railway: ustaw CRON_SECRET w Variables, dodaj Cron job: POST do tego URL z nagłówkiem x-cron-secret: <CRON_SECRET>.

import { NextApiRequest, NextApiResponse } from 'next';
import { forceScan, isScanRunning } from '@/src/services/schedulerService';

const CRON_SECRET = process.env.CRON_SECRET || '';

function getSecretFromRequest(req: NextApiRequest): string {
  const header = req.headers['x-cron-secret'];
  if (typeof header === 'string') return header;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!CRON_SECRET) {
    console.error(
      '[Cron/scan] CRON_SECRET not set – configure in Railway Variables'
    );
    return res.status(503).json({ error: 'Cron not configured' });
  }

  const secret = getSecretFromRequest(req);
  if (secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (isScanRunning()) {
    console.log('[Cron/scan] Scan already in progress, skipping');
    return res
      .status(200)
      .json({ ok: true, skipped: true, reason: 'scan_in_progress' });
  }

  try {
    console.log('[Cron/scan] Starting scheduled scan...');
    const result = await forceScan();
    console.log('[Cron/scan] Scan finished:', result);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[Cron/scan] Scan error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
