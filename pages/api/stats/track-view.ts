import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../src/utils/auth';
import { recordViewEvent } from '../../../src/utils/statsStorage';
import { getClientIp, createDeviceInfo } from '../../../src/utils/deviceInfo';
import type { ViewEventType } from '../../../src/utils/statsStorage';

interface TrackViewBody {
  sessionId?: string;
  type?: ViewEventType;
  path?: string;
  name?: string;
  projectId?: string;
  revisionId?: string;
  projectName?: string;
  revisionLabel?: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
    type,
    path,
    name,
    projectId,
    revisionId,
    projectName,
    revisionLabel,
    screenWidth,
    screenHeight,
    language,
  } = req.body as TrackViewBody;

  if (!sessionId || !type || !path || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || undefined;
  const deviceInfo = createDeviceInfo(req, {
    screenWidth,
    screenHeight,
    language,
  });

  const designMeta =
    type === 'design_list' ||
    type === 'design_project' ||
    type === 'design_revision'
      ? { projectId, revisionId, projectName, revisionLabel }
      : undefined;

  await recordViewEvent(
    email,
    sessionId,
    type,
    path,
    name,
    ip,
    userAgent,
    deviceInfo,
    designMeta
  );

  return res.status(200).json({ success: true });
}
