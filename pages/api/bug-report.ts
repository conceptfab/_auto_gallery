// pages/api/bug-report.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { sendBugReport } from '@/src/utils/email';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subject, message, userEmail, page } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  try {
    await sendBugReport({
      subject,
      message,
      userEmail: userEmail || 'anonymous',
      page: page || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending bug report:', error);
    return res.status(500).json({ error: 'Failed to send bug report' });
  }
}
