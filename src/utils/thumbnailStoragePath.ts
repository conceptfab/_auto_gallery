/**
 * Wspólna baza ścieżki dla miniaturek (cache galerii + miniatury i galerie Design).
 * Lokalna atrapa: data/thumbnails, w produkcji (volume): /data-storage/thumbnails.
 */
import path from 'path';
import fsp from 'fs/promises';
import { getDataDir } from './dataDir';

let cachedBase: string | null = null;

export async function getThumbnailsBasePath(): Promise<string> {
  if (cachedBase !== null) return cachedBase;
  const dataDir = await getDataDir();
  cachedBase = path.join(dataDir, 'thumbnails');
  return cachedBase;
}

/** Ścieżka do katalogu miniaturek rewizji Design (projectId/revisionId.webp). */
export async function getDesignRevisionThumbnailsDir(): Promise<string> {
  const base = await getThumbnailsBasePath();
  const designDir = path.join(base, 'design-revision');
  await fsp.mkdir(designDir, { recursive: true });
  return designDir;
}

/** Ścieżka do katalogu galerii Design (projectId/revisionId/uuid.webp). */
export async function getDesignGalleryDir(): Promise<string> {
  const base = await getThumbnailsBasePath();
  const galleryDir = path.join(base, 'design-gallery');
  await fsp.mkdir(galleryDir, { recursive: true });
  return galleryDir;
}
