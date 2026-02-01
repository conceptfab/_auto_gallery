// pages/api/cron/cleanup-stats.ts
// Endpoint dla Railway Cron / zewnętrznego crona – automatyczne czyszczenie statystyk użytkowników.
// W Railway: ustaw CRON_SECRET, dodaj Cron job (np. codziennie): POST do tego URL z nagłówkiem x-cron-secret: <CRON_SECRET>.

import { NextApiRequest, NextApiResponse } from 'next';
import { getData } from '@/src/utils/storage';
import { cleanupOldStats } from '@/src/utils/statsStorage';

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
      '[Cron/cleanup-stats] CRON_SECRET not set – configure in Railway Variables'
    );
    return res.status(503).json({ error: 'Cron not configured' });
  }

  const secret = getSecretFromRequest(req);
  if (secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const data = await getData();
    const autoCleanupEnabled = data.settings?.autoCleanupEnabled ?? false;
    const autoCleanupDays = data.settings?.autoCleanupDays ?? 7;

    if (!autoCleanupEnabled) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'auto_cleanup_disabled',
      });
    }

    const result = await cleanupOldStats(autoCleanupDays);
    console.log(
      `[Cron/cleanup-stats] Usunięto: ${result.deletedLogins} logowań, ${result.deletedSessions} sesji, ${result.deletedViews} wyświetleń, ${result.deletedDownloads} pobrań (starsze niż ${autoCleanupDays} dni)`
    );
    return res.status(200).json({
      ok: true,
      deleted: result,
      daysToKeep: autoCleanupDays,
    });
  } catch (error) {
    console.error('[Cron/cleanup-stats] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
