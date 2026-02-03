/**
 * Wspólna baza ścieżki dla miniaturek (cache galerii + miniatury i galerie Design).
 * Lokalna atrapa: data/thumbnails, w produkcji (volume): /data-storage/thumbnails.
 */
import path from 'path';
import fsp from 'fs/promises';

let cachedBase: string | null = null;

export async function getThumbnailsBasePath(): Promise<string> {
  if (cachedBase !== null) return cachedBase;
  try {
    await fsp.access('/data-storage');
    cachedBase = '/data-storage/thumbnails';
  } catch {
    cachedBase = path.join(process.cwd(), 'data', 'thumbnails');
  }
  return cachedBase;
}

/** Ścieżka do katalogu miniaturek rewizji Design (projectId/revisionId.webp). */
export async function getDesignRevisionThumbnailsDir(): Promise<string> {
  const base = await getThumbnailsBasePath();
  return path.join(base, 'design-revision');
}

/** Ścieżka do katalogu galerii Design (projectId/revisionId/uuid.webp). */
export async function getDesignGalleryDir(): Promise<string> {
  const base = await getThumbnailsBasePath();
  return path.join(base, 'design-gallery');
}
