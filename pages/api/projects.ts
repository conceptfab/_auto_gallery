import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '@/src/utils/auth';
import { isUserLoggedIn, isAdminLoggedIn } from '@/src/utils/storage';
import { getProjects } from '@/src/utils/projectsStorage';
import { ADMIN_EMAIL } from '@/src/config/constants';

/**
 * GET – lista projektów dla zalogowanego użytkownika (zwykły user lub admin).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = getEmailFromCookie(req);
  if (!email) {
    return res.status(401).json({ error: 'Wymagane logowanie' });
  }

  const userLoggedIn = await isUserLoggedIn(email);
  const adminLoggedIn = await isAdminLoggedIn(email);
  const isAdminEmail =
    email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
  const allowedAsUser = userLoggedIn || (isAdminEmail && adminLoggedIn);
  if (!allowedAsUser) {
    return res.status(401).json({ error: 'Wymagane logowanie' });
  }

  try {
    const projects = await getProjects();
    return res.status(200).json({ success: true, projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return res.status(500).json({ error: 'Błąd ładowania projektów' });
  }
}
