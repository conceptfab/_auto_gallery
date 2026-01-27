import { NextApiRequest, NextApiResponse } from 'next';
import {
  logoutUser,
  clearAuthCookie,
  getEmailFromCookie,
} from '../../../src/utils/auth';

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

    clearAuthCookie(res);

    res.status(200).json({
      message: 'Logged out successfully',
      success: true,
    });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
