import { NextApiRequest, NextApiResponse } from 'next';
import {
  clearAuthCookie,
  getEmailFromCookie,
} from '../../../src/utils/auth';
import { logoutUser } from '../../../src/utils/storage';
import { endSession } from '../../../src/utils/statsStorage';
import { logger } from '../../../src/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = getEmailFromCookie(req);

    if (email) {
      await logoutUser(email);
    }

    // Zakończ aktywną sesję statystyk, jeśli istnieje
    const sessionId = req.cookies?.session_id;
    if (sessionId) {
      await endSession(sessionId);
    }

    clearAuthCookie(res);

    res.status(200).json({
      message: 'Logged out successfully',
      success: true,
    });
  } catch (error) {
    logger.error('Error during logout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
