import { NextApiRequest, NextApiResponse } from 'next';
import { cleanupExpiredCodes, cleanupOldRequests, storage } from '../../../src/utils/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const expiredCodes = cleanupExpiredCodes();
    const oldRequests = cleanupOldRequests();

    res.status(200).json({
      message: 'Cleanup completed',
      expiredCodes,
      oldRequests,
      activeCodesCount: storage.activeCodes.size,
      pendingRequestsCount: storage.pendingEmails.size
    });

  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}