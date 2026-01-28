import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../src/utils/auth';
import { recordDownloadEvent } from '../../../src/utils/statsStorage';

interface TrackDownloadBody {
  sessionId?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
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

  const { sessionId, filePath, fileName, fileSize } =
    req.body as TrackDownloadBody;

  if (!sessionId || !filePath || !fileName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  await recordDownloadEvent(email, sessionId, filePath, fileName, fileSize);

  return res.status(200).json({ success: true });
}
