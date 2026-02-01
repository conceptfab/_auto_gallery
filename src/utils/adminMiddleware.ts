import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getAdminEmailFromCookie, getEmailFromCookie } from './auth';
import { isAdminLoggedIn, isUserLoggedIn } from './storage';
import { ADMIN_EMAIL } from '../config/constants';

/**
 * HOF – owija handler API i wymaga zalogowanego admina.
 * Dostęp ma ktoś, kto:
 * - zalogował się przez panel admina (admin_email + jest w loggedInAdmins), LUB
 * - zalogował się zwykłym flow (auth_email) i ma email === ADMIN_EMAIL (jest w loggedInUsers).
 */
export function withAdminAuth(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const adminEmail = getAdminEmailFromCookie(req);
    const anyEmail = getEmailFromCookie(req);
    const isAdminByEmail =
      anyEmail &&
      anyEmail.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
    const email = adminEmail ?? (isAdminByEmail ? anyEmail : null);

    if (!email) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const hasAdminSession = await isAdminLoggedIn(email);
    const hasUserSessionAsAdmin =
      isAdminByEmail && (await isUserLoggedIn(email));

    if (!hasAdminSession && !hasUserSessionAsAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    return handler(req, res);
  };
}
