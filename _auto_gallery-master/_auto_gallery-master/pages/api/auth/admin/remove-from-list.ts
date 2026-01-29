import { NextApiRequest, NextApiResponse } from 'next';
import {
  removeFromWhitelist,
  removeFromBlacklist,
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

    if (listType === 'whitelist') {
      const whitelist = await getWhitelist();
      if (!whitelist.includes(email)) {
        return res.status(404).json({ error: 'Email not found in whitelist' });
      }
      await removeFromWhitelist(email);
      logger.debug('Usunięto email z białej listy:', email);
    } else if (listType === 'blacklist') {
      const blacklist = await getBlacklist();
      if (!blacklist.includes(email)) {
        return res.status(404).json({ error: 'Email not found in blacklist' });
      }
      await removeFromBlacklist(email);
      logger.debug('Usunięto email z czarnej listy:', email);
    } else {
      return res
        .status(400)
        .json({ error: 'Invalid listType. Use "whitelist" or "blacklist"' });
    }

    res.status(200).json({
      message: `Email removed from ${listType}`,
      email,
    });
  } catch (error) {
    logger.error('Error removing email from list', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
