import { NextApiRequest, NextApiResponse } from 'next';
import {
  addToWhitelist,
  addToBlacklist,
  getWhitelist,
  getBlacklist,
} from '../../../../src/utils/storage';
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
    // Sprawdź autoryzację admina
    const adminEmail = getAdminEmailFromCookie(req);
    if (!adminEmail) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      email,
      listType,
    }: { email: string; listType: 'whitelist' | 'blacklist' } = req.body;

    if (!email || !listType) {
      return res.status(400).json({ error: 'Email and listType required' });
    }

    // Walidacja emaila
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (listType === 'whitelist') {
      const whitelist = await getWhitelist();
      if (whitelist.includes(email)) {
        return res.status(400).json({ error: 'Email already in whitelist' });
      }
      await addToWhitelist(email);
      logger.debug('Dodano email do białej listy:', email);
    } else if (listType === 'blacklist') {
      const blacklist = await getBlacklist();
      if (blacklist.includes(email)) {
        return res.status(400).json({ error: 'Email already in blacklist' });
      }
      await addToBlacklist(email);
      logger.debug('Dodano email do czarnej listy:', email);
    } else {
      return res
        .status(400)
        .json({ error: 'Invalid listType. Use "whitelist" or "blacklist"' });
    }

    res.status(200).json({
      message: `Email added to ${listType}`,
      email,
    });
  } catch (error) {
    logger.error('Error adding email to list', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
