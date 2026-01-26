import { Redis } from '@upstash/redis';
import { GalleryFolder } from '@/src/types/gallery';
import crypto from 'crypto';

// Inicjalizacja Redis z fallback do null jeśli brak zmiennych środowiskowych
let redis: Redis | null = null;

try {
  if (process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN,
    });
  }
} catch (error) {
  console.warn('Redis initialization failed, using fallback mode:', error);
}

const CACHE_TTL = 300; // 5 minut

/**
 * Generuje klucz cache dla folderu galerii
 */
function getCacheKey(folder: string, groupId?: string): string {
  const baseKey = `gallery:${folder || 'root'}`;
  return groupId ? `${baseKey}:group:${groupId}` : baseKey;
}

/**
 * Generuje ETag na podstawie struktury galerii
 */
export function generateETag(folders: GalleryFolder[]): string {
  const folderData = folders.map(folder => ({
    name: folder.name,
    imageCount: folder.images.length,
    path: folder.path
  }));
  
  const sortedFolders = [...folderData].sort((a, b) => a.path.localeCompare(b.path));
  const hashString = sortedFolders
    .map(folder => `${folder.path}:${folder.imageCount}`)
    .join('|');
    
  return crypto.createHash('sha256').update(hashString).digest('hex').substring(0, 16);
}

/**
 * Pobiera cache'owaną strukturę galerii
 */
export async function getCachedGallery(
  folder: string, 
  groupId?: string
): Promise<GalleryFolder[] | null> {
  if (!redis) {
    return null; // Fallback - brak cache
  }

  try {
    const key = getCacheKey(folder, groupId);
    const cached = await redis.get<GalleryFolder[]>(key);
    return cached;
  } catch (error) {
    console.error('Redis get error:', error);
    return null; // Graceful degradation
  }
}

/**
 * Zapisuje strukturę galerii do cache
 */
export async function setCachedGallery(
  folder: string, 
  data: GalleryFolder[],
  groupId?: string
): Promise<void> {
  if (!redis) {
    return; // Fallback - brak cache
  }

  try {
    const key = getCacheKey(folder, groupId);
    await redis.set(key, data, { ex: CACHE_TTL });
  } catch (error) {
    console.error('Redis set error:', error);
    // Graceful degradation - nie przerywamy działania
  }
}

/**
 * Czyści cache dla konkretnego folderu
 */
export async function clearCachedGallery(
  folder: string,
  groupId?: string
): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const key = getCacheKey(folder, groupId);
    await redis.del(key);
  } catch (error) {
    console.error('Redis del error:', error);
  }
}

/**
 * Sprawdza czy Redis jest dostępny
 */
export function isCacheAvailable(): boolean {
  return redis !== null;
}
