import { NextApiRequest, NextApiResponse } from 'next';
import {
  cleanupExpiredCodes,
  cleanupOldRequests,
  getPendingEmails,
} from '../../../src/utils/storage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const expiredCodes = await cleanupExpiredCodes();
    const oldRequests = await cleanupOldRequests();
    const pendingEmails = await getPendingEmails();

    res.status(200).json({
      message: 'Cleanup completed',
      expiredCodes,
      oldRequests,
      activeCodesCount: 0, // We don't have direct access to active codes count in new system
      pendingRequestsCount: pendingEmails.length,
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
