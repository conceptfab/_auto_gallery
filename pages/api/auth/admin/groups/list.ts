import { NextApiRequest, NextApiResponse } from 'next';
import { getGroups } from '../../../../../src/utils/storage';
import { getEmailFromCookie } from '../../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../../src/config/constants';
import { isAdminLoggedIn } from '../../../../../src/utils/storage';

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
    const groups = getGroups();
    res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
