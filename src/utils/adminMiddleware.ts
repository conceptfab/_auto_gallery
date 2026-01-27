import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getEmailFromCookie } from './auth';
import { isAdminLoggedIn } from './storage';
import { ADMIN_EMAIL } from '../config/constants';

/**
 * HOF – owija handler API i wymaga zalogowanego admina.
 * Zwraca 403, jeśli brak ciasteczka lub email !== ADMIN_EMAIL lub użytkownik nie jest zalogowany jako admin.
 */
export function withAdminAuth(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const email = getEmailFromCookie(req);
    if (email !== ADMIN_EMAIL || !(await isAdminLoggedIn(email))) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return handler(req, res);
  };
}
