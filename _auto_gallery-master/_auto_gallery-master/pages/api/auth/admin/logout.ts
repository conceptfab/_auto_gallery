import { NextApiRequest, NextApiResponse } from 'next';
import { logoutAdmin } from '../../../../src/utils/storage';
import { getAdminEmailFromCookie } from '../../../../src/utils/auth';
import { logger } from '../../../../src/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = getAdminEmailFromCookie(req);

    if (email) {
      await logoutAdmin(email);
      logger.debug('Administrator wylogowany:', email);
    }

    // Wyczyść admin cookies
    res.setHeader('Set-Cookie', [
      'admin_email=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
      'admin_logged=; Path=/; Max-Age=0; SameSite=Strict',
    ]);

    res.status(200).json({
      message: 'Admin logged out successfully',
      success: true,
    });
  } catch (error) {
    logger.error('Error during admin logout', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
