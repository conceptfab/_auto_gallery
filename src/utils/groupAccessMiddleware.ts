import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getEmailFromCookie, getAdminEmailFromCookie } from './auth';
import { getUserGroup, isAdminLoggedIn, isUserLoggedIn } from './storage';
import { ADMIN_EMAIL } from '../config/constants';

/** Rozszerzenie NextApiRequest o informacje o grupie użytkownika. */
export interface GroupScopedRequest extends NextApiRequest {
  /** ID grupy zalogowanego użytkownika (null jeśli admin bez grupy). */
  userGroupId?: string;
  /** Czy żądanie pochodzi od admina. */
  isAdmin?: boolean;
  /** Email zalogowanego użytkownika. */
  userEmail?: string;
}

/**
 * HOF – owija handler API i wymaga zalogowanego użytkownika z grupą.
 * Admin ma bypass (widzi wszystko).
 * User bez grupy dostaje 403.
 */
export function withGroupAccess(handler: NextApiHandler): NextApiHandler {
  return async (req: GroupScopedRequest, res: NextApiResponse) => {
    const adminEmail = getAdminEmailFromCookie(req);
    const userEmail = getEmailFromCookie(req);
    const normalizedAdmin = ADMIN_EMAIL.trim().toLowerCase();

    // Sprawdź czy to admin
    const isAdminByAdminCookie = adminEmail && (await isAdminLoggedIn(adminEmail));
    const isAdminByUserCookie =
      userEmail &&
      userEmail.trim().toLowerCase() === normalizedAdmin &&
      (await isUserLoggedIn(userEmail));
    const isAdmin = !!(isAdminByAdminCookie || isAdminByUserCookie);

    const email = adminEmail ?? userEmail;
    if (!email) {
      return res.status(401).json({ error: 'Wymagane logowanie' });
    }

    // Sprawdź czy zalogowany
    const loggedIn =
      isAdmin ||
      (await isUserLoggedIn(email));
    if (!loggedIn) {
      return res.status(401).json({ error: 'Wymagane logowanie' });
    }

    req.userEmail = email;
    req.isAdmin = isAdmin;

    if (isAdmin) {
      // Admin: nie wymaga grupy, ale spróbuj pobrać
      const group = await getUserGroup(email);
      req.userGroupId = group?.id;
      return handler(req, res);
    }

    // Zwykły user: musi mieć grupę
    const group = await getUserGroup(email);
    if (!group) {
      return res.status(403).json({ error: 'Nie masz przypisanej grupy' });
    }

    req.userGroupId = group.id;
    return handler(req, res);
  };
}
