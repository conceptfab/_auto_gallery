import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../src/utils/auth';
import { recordViewEvent } from '../../../src/utils/statsStorage';

interface TrackViewBody {
  sessionId?: string;
  type?: 'folder' | 'image';
  path?: string;
  name?: string;
}

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

  const { sessionId, type, path, name } = req.body as TrackViewBody;

  if (!sessionId || !type || !path || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  await recordViewEvent(email, sessionId, type, path, name);

  return res.status(200).json({ success: true });
}
