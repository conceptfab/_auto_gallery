import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '@/src/utils/auth';
import { isUserLoggedIn, isAdminLoggedIn } from '@/src/utils/storage';
import { getProjects, getGalleryFilePath } from '@/src/utils/projectsStorage';
import { ADMIN_EMAIL } from '@/src/config/constants';
import { logger } from '@/src/utils/logger';
import fsp from 'fs/promises';

/**
 * GET – serwuje obraz z galerii rewizji.
 * path = [projectId, revisionId, filename]
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

  const pathSegments = req.query.path as string[];
  if (!Array.isArray(pathSegments) || pathSegments.length !== 3) {
    return res.status(400).json({ error: 'Nieprawidłowa ścieżka' });
  }

  const [projectId, revisionId, filename] = pathSegments;
  if (!projectId || !revisionId || !filename) {
    return res
      .status(400)
      .json({ error: 'Brak projectId, revisionId lub filename' });
  }

  const projects = await getProjects();
  const project = projects.find((p) => p.id === projectId);
  const revision = project?.revisions?.find((r) => r.id === revisionId);
  const galleryPaths = revision?.galleryPaths ?? [];
  const imageAllowed =
    galleryPaths.includes(filename) ||
    galleryPaths.some((p) => p === `${projectId}/${revisionId}/${filename}` || p.endsWith(`/${filename}`));
  if (!imageAllowed) {
    logger.warn('[gallery API] Obraz nie w galleryPaths', { projectId, revisionId, filename, galleryPaths });
    return res.status(404).json({ error: 'Obraz nie znaleziony' });
  }

  const filePath = await getGalleryFilePath(projectId, revisionId, filename);
  if (!filePath) {
    logger.warn('[gallery API] getGalleryFilePath zwrócił null', { projectId, revisionId, filename });
    // Plik nie na dysku (np. po migracji danych) – zwróć 1×1 transparent, żeby <img> nie psuło layoutu
    const transparentGif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('X-Image-Status', 'placeholder');
    return res.send(transparentGif);
  }

  try {
    const buffer = await fsp.readFile(filePath);
    const ext = filename.includes('.png')
      ? 'image/png'
      : filename.includes('.jpg') || filename.includes('.jpeg')
      ? 'image/jpeg'
      : 'image/webp';
    res.setHeader('Content-Type', ext);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error) {
    console.error('Error serving gallery image:', error);
    res.status(500).json({ error: 'Błąd odczytu obrazu' });
  }
}
