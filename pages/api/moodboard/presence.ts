import type { NextApiRequest, NextApiResponse } from 'next';
import { sseBroker } from '@/src/lib/sse-broker';
import { getEmailFromCookie } from '@/src/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const email = getEmailFromCookie(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const { boardId, action, sketchId, tool } = req.body;
  if (!boardId || !action) return res.status(400).json({ error: 'boardId and action required' });

  if (action === 'drawing') {
    sseBroker.broadcast(boardId, 'user:drawing', {
      email,
      color: sseBroker.getUserColor(email),
      sketchId,
      tool,
    });
  } else if (action === 'idle') {
    sseBroker.broadcast(boardId, 'user:idle', { email });
  }

  res.json({ ok: true });
}
