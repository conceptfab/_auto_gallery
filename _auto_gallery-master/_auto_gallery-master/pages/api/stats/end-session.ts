import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../src/utils/auth';
import { endSession } from '../../../src/utils/statsStorage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = getEmailFromCookie(req);
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  await endSession(sessionId);

  return res.status(200).json({ success: true });
}
