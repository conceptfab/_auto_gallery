import { NextApiRequest, NextApiResponse } from 'next';
import {
  getPendingEmails,
  getWhitelist,
  getBlacklist,
} from '../../../../src/utils/storage';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { isAdminLoggedIn } from '../../../../src/utils/storage';
import { logger } from '../../../../src/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź autoryzację admina
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL || !isAdminLoggedIn(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const pending = getPendingEmails();
    const whitelist = getWhitelist();
    const blacklist = getBlacklist();

    logger.debug('Pobieranie pending emails:', pending.length, 'wniosków');

    res.status(200).json({
      pending,
      whitelist,
      blacklist,
    });
  } catch (error) {
    logger.error('Error fetching pending emails', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
