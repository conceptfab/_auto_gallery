import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../src/utils/auth';
import { recordDownloadEvent } from '../../../src/utils/statsStorage';
import { getClientIp, createDeviceInfo } from '../../../src/utils/deviceInfo';

interface TrackDownloadBody {
  sessionId?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
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

  const {
    sessionId,
    filePath,
    fileName,
    fileSize,
    screenWidth,
    screenHeight,
    language,
  } = req.body as TrackDownloadBody;

  if (!sessionId || !filePath || !fileName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Zbierz informacje o IP, userAgent i urządzeniu
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || undefined;
  const deviceInfo = createDeviceInfo(req, {
    screenWidth,
    screenHeight,
    language,
  });

  await recordDownloadEvent(
    email,
    sessionId,
    filePath,
    fileName,
    fileSize,
    ip,
    userAgent,
    deviceInfo,
  );

  return res.status(200).json({ success: true });
}
