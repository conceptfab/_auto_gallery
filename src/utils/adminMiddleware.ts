import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getAdminEmailFromCookie, getEmailFromCookie } from './auth';
import { isAdminLoggedIn } from './storage';
import { ADMIN_EMAIL } from '../config/constants';

/**
 * HOF – owija handler API i wymaga zalogowanego admina.
 * Akceptuje logowanie zarówno przez panel admina (admin_email) jak i zwykły login (auth_email),
 * jeśli email === ADMIN_EMAIL. Zwraca 403, jeśli brak uprawnień.
 */
export function withAdminAuth(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const adminEmail = getAdminEmailFromCookie(req);
    const anyEmail = getEmailFromCookie(req);
    const isAdminByEmail =
      anyEmail &&
      anyEmail.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
    const email = adminEmail ?? (isAdminByEmail ? anyEmail : null);
    if (!email || !(await isAdminLoggedIn(email))) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return handler(req, res);
  };
}
