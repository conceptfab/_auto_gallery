import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getAdminEmailFromCookie } from './auth';
import { isAdminLoggedIn } from './storage';

/**
 * HOF – owija handler API i wymaga zalogowanego admina.
 * Zwraca 403, jeśli brak ciasteczka admina lub użytkownik nie jest zalogowany jako admin.
 */
export function withAdminAuth(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const email = getAdminEmailFromCookie(req);
    if (!email || !(await isAdminLoggedIn(email))) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return handler(req, res);
  };
}
