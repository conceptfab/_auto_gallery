// pages/api/bug-report.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { sendBugReport } from '@/src/utils/email';

const MAX_ATTACHMENTS = 5;
const MAX_SIZE_BYTES = 1024 * 1024; // 1 MB

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    subject,
    message,
    userEmail,
    page,
    version,
    attachments: rawAttachments,
  } = req.body as {
    subject?: string;
    message?: string;
    userEmail?: string;
    page?: string;
    version?: string;
    attachments?: { filename: string; content: string }[];
  };

  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  const attachments: { filename: string; content: Buffer }[] = [];
  if (
    Array.isArray(rawAttachments) &&
    rawAttachments.length > MAX_ATTACHMENTS
  ) {
    return res
      .status(400)
      .json({ error: `Maksymalnie ${MAX_ATTACHMENTS} załączników` });
  }
  if (Array.isArray(rawAttachments)) {
    for (const a of rawAttachments) {
      if (!a?.filename || typeof a.content !== 'string') continue;
      try {
        const buf = Buffer.from(a.content, 'base64');
        if (buf.length > MAX_SIZE_BYTES) {
          return res
            .status(400)
            .json({ error: `Załącznik "${a.filename}" przekracza 1 MB` });
        }
        attachments.push({ filename: a.filename, content: buf });
      } catch {
        return res
          .status(400)
          .json({ error: 'Nieprawidłowy format załącznika' });
      }
    }
  }

  try {
    await sendBugReport({
      subject,
      message,
      userEmail: userEmail || 'anonymous',
      page: page || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      appVersion: version ?? '',
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending bug report:', error);
    return res.status(500).json({ error: 'Failed to send bug report' });
  }
}
