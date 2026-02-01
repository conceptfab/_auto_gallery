// pages/api/cron/wake.ts
// GET – tylko uruchamia scheduler (np. po deployu). Dla Railway Cron: wywołuj co 5 min.
// Bez logowania; opcjonalnie nagłówek x-cron-secret jeśli ustawisz CRON_SECRET.

import { NextApiRequest, NextApiResponse } from 'next';
import { getSchedulerStatus } from '@/src/services/schedulerService';

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (CRON_SECRET) {
    const secret = getSecretFromRequest(req);
    if (secret !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // getSchedulerStatus() sam uruchamia scheduler przy pierwszym wywołaniu
  const status = getSchedulerStatus();

  return res.status(200).json({
    ok: true,
    schedulerActive: status.intervalActive,
  });
}
