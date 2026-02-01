// pages/api/cron/retention.ts
// Endpoint dla Railway Cron – jednolita retencja: users/stats-*.json i history/cache-*.json.
// Wywołuj codziennie (np. 03:00) z nagłówkiem x-cron-secret: CRON_SECRET.

import { NextApiRequest, NextApiResponse } from 'next';
import { getData } from '@/src/utils/storage';
import { cleanupOldStats } from '@/src/utils/statsStorage';
import { cleanupHistory } from '@/src/utils/cacheStorage';

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
      '[Cron/retention] CRON_SECRET not set – configure in Railway Variables'
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
    const historyRetentionDays = data.settings?.historyRetentionDays ?? 7;
    const historyRetentionHours = historyRetentionDays * 24;

    let statsResult: {
      deletedLogins: number;
      deletedSessions: number;
      deletedViews: number;
      deletedDownloads: number;
    } | null = null;

    if (autoCleanupEnabled) {
      statsResult = await cleanupOldStats(autoCleanupDays);
      console.log(
        `[Cron/retention] Stats: usunięto ${statsResult.deletedLogins} logowań, ${statsResult.deletedSessions} sesji, ${statsResult.deletedViews} wyświetleń, ${statsResult.deletedDownloads} pobrań (starsze niż ${autoCleanupDays} dni)`
      );
    }

    const historyResult = await cleanupHistory(historyRetentionHours);
    console.log(
      `[Cron/retention] History: usunięto ${historyResult.historyRemoved} wpisów historii, ${historyResult.changesRemoved} zmian (starsze niż ${historyRetentionDays} dni)`
    );

    return res.status(200).json({
      ok: true,
      stats: autoCleanupEnabled
        ? { deleted: statsResult, daysToKeep: autoCleanupDays }
        : { skipped: true, reason: 'auto_cleanup_disabled' },
      history: {
        historyRemoved: historyResult.historyRemoved,
        changesRemoved: historyResult.changesRemoved,
        daysToKeep: historyRetentionDays,
      },
    });
  } catch (error) {
    console.error('[Cron/retention] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
