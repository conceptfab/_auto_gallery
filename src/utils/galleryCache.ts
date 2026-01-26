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
 * Generuje klucz cache dla folderu galerii z sanityzacją
 */
function getCacheKey(folder: string, groupId?: string): string {
  // Sanityzacja folderu - usuń niebezpieczne znaki
  const sanitizedFolder = (folder || 'root')
    .replace(/\.\./g, '') // Usuń .. (path traversal)
    .replace(/[^a-zA-Z0-9/_-]/g, '_') // Tylko bezpieczne znaki
    .substring(0, 200); // Max długość klucza
  
  const baseKey = `gallery:${sanitizedFolder}`;
  
  if (groupId) {
    const sanitizedGroupId = groupId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `${baseKey}:group:${sanitizedGroupId}`;
  }
  
  return baseKey;
}

/**
 * Wrapper z timeout dla operacji Redis
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]);
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
 * Pobiera cache'owaną strukturę galerii z timeout
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
    // Timeout 500ms - lepiej zwrócić null niż blokować request
    const cached = await withTimeout(redis.get<GalleryFolder[]>(key), 500);
    return cached;
  } catch (error) {
    console.error('Redis get error:', error);
    return null; // Graceful degradation
  }
}

/**
 * Zapisuje strukturę galerii do cache z timeout
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
    // Timeout 500ms - nie blokujemy jeśli Redis jest wolny
    await withTimeout(redis.set(key, data, { ex: CACHE_TTL }), 500);
  } catch (error) {
    console.error('Redis set error:', error);
    // Graceful degradation - nie przerywamy działania
  }
}

/**
 * Czyści cache dla konkretnego folderu z timeout
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
    // Timeout 500ms
    await withTimeout(redis.del(key), 500);
  } catch (error) {
    console.error('Redis del error:', error);
    // Ignore errors - cache clear nie jest krytyczne
  }
}

/**
 * Sprawdza czy Redis jest dostępny
 */
export function isCacheAvailable(): boolean {
  return redis !== null;
}
