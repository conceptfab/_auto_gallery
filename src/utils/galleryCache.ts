import { GalleryFolder } from '@/src/types/gallery';
import crypto from 'crypto';

const CACHE_TTL = 300_000; // 5 minut w ms

interface CacheEntry {
  data: GalleryFolder[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(folder: string, groupId?: string): string {
  const baseKey = `gallery:${folder || 'root'}`;
  return groupId ? `${baseKey}:group:${groupId}` : baseKey;
}

/**
 * Generuje ETag na podstawie struktury galerii
 */
export function generateETag(folders: GalleryFolder[]): string {
  const folderData = folders.map((folder) => ({
    name: folder.name,
    imageCount: folder.images.length,
    path: folder.path,
  }));

  const sortedFolders = [...folderData].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  const hashString = sortedFolders
    .map((folder) => `${folder.path}:${folder.imageCount}`)
    .join('|');

  return crypto
    .createHash('sha256')
    .update(hashString)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Pobiera cache'owaną strukturę galerii
 */
export async function getCachedGallery(
  folder: string,
  groupId?: string
): Promise<GalleryFolder[] | null> {
  const key = getCacheKey(folder, groupId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Zapisuje strukturę galerii do cache
 */
export async function setCachedGallery(
  folder: string,
  data: GalleryFolder[],
  groupId?: string
): Promise<void> {
  const key = getCacheKey(folder, groupId);
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}
