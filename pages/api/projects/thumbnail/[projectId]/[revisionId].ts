import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '@/src/utils/auth';
import { isUserLoggedIn, isAdminLoggedIn } from '@/src/utils/storage';
import { findProjectById, getThumbnailFilePath } from '@/src/utils/projectsStorage';
import { ADMIN_EMAIL } from '@/src/config/constants';
import { logger } from '@/src/utils/logger';
import fsp from 'fs/promises';

/**
 * GET – serwuje plik miniaturki rewizji (image/webp).
 * Dostęp dla zalogowanego użytkownika; rewizja musi należeć do istniejącego projektu.
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
  const allowed = userLoggedIn || (isAdminEmail && adminLoggedIn);
  if (!allowed) {
    return res.status(401).json({ error: 'Wymagane logowanie' });
  }

  const projectId = req.query.projectId as string;
  const revisionId = req.query.revisionId as string;
  if (!projectId || !revisionId) {
    return res.status(400).json({ error: 'Brak projectId lub revisionId' });
  }

  const [project, projectGroupId] = await findProjectById(projectId);
  const revision = project?.revisions?.find((r) => r.id === revisionId);
  if (!project || !revision) {
    return res.status(404).json({ error: 'Projekt lub rewizja nie znaleziona' });
  }

  const filePath = await getThumbnailFilePath(projectId, revisionId, projectGroupId);
  if (!filePath) {
    logger.warn('[thumbnail API] getThumbnailFilePath zwrócił null', { projectId, revisionId });
    return res.status(404).json({ error: 'Plik miniaturki nie istnieje' });
  }

  try {
    const buffer = await fsp.readFile(filePath);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ error: 'Błąd odczytu miniaturki' });
  }
}
