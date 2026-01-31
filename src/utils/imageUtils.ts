import { ImageFile } from '@/src/types/gallery';
import { ThumbnailConfig } from '@/src/types/cache';

// Konfiguracja cache (będzie pobierana z API)
let thumbnailCacheEnabled = false;
let thumbnailConfig: ThumbnailConfig | null = null;
let cacheInitialized = false;

/**
 * Inicjalizuje konfigurację cache przy starcie (tylko client-side)
 */
export async function initThumbnailCache(): Promise<void> {
  if (typeof window === 'undefined' || cacheInitialized) {
    return;
  }

  try {
    const response = await fetch('/api/admin/cache/status');
    const data = await response.json();

    if (data.success && data.config) {
      thumbnailCacheEnabled = data.status.thumbnails.totalGenerated > 0;
      thumbnailConfig = data.config.thumbnails;
      cacheInitialized = true;
    }
  } catch {
    thumbnailCacheEnabled = false;
    cacheInitialized = true;
  }
}

/**
 * Generuje ścieżkę miniaturki
 */
function getThumbnailPath(
  originalPath: string,
  sizeName: string,
  format: string,
): string {
  const pathParts = originalPath.split('/');
  const filename = pathParts.pop() || 'image';
  const baseName = filename.replace(/\.[^.]+$/, '');
  const thumbFilename = `${baseName}_${sizeName}.${format}`;
  return [...pathParts, thumbFilename].join('/');
}

/**
 * Wyodrębnia ścieżkę z URL obrazu
 */
function extractPathFromUrl(url: string): string {
  try {
    // Usuń protokół i domenę
    const urlObj = new URL(url);
    let path = urlObj.pathname;

    // Usuń prefiks /gallery/ jeśli istnieje
    const galleryPrefix = '/__metro/gallery/';
    if (path.includes(galleryPrefix)) {
      path = path.substring(path.indexOf(galleryPrefix) + galleryPrefix.length);
    }

    return path;
  } catch {
    // Jeśli to nie pełny URL, zwróć jak jest
    return url;
  }
}

/**
 * Zwraca URL obrazka - z cache lub przez proxy
 * @param image - obiekt ImageFile
 * @param size - 'thumb' | 'medium' | 'large' | 'full'
 */
export function getOptimizedImageUrl(
  image: ImageFile,
  size: 'thumb' | 'medium' | 'large' | 'full' = 'full',
): string {
  // Jeśli chcemy pełny rozmiar, zawsze użyj proxy
  if (size === 'full') {
    return `/api/image-proxy?url=${encodeURIComponent(image.url)}&size=full`;
  }

  // Jeśli cache jest włączony i mamy konfigurację
  if (thumbnailCacheEnabled && thumbnailConfig) {
    const imagePath = image.path || extractPathFromUrl(image.url);
    const relativePath = getThumbnailPath(
      imagePath,
      size,
      thumbnailConfig.format,
    );

    if (thumbnailConfig.storage === 'local') {
      return `/api/thumbnails/${relativePath}`;
    } else {
      // Remote storage - zakładamy GALLERY_BASE_URL
      const baseUrl =
        typeof window !== 'undefined'
          ? (window as Window & { ENV_GALLERY_BASE_URL?: string })
              .ENV_GALLERY_BASE_URL || ''
          : '';
      return `${baseUrl}thumbnails/${relativePath}`;
    }
  }

  // Fallback do proxy
  return `/api/image-proxy?url=${encodeURIComponent(image.url)}&size=${size}`;
}

/**
 * Sprawdza czy cache miniaturek jest aktywny
 */
export function isThumbnailCacheEnabled(): boolean {
  return thumbnailCacheEnabled;
}

/**
 * Pobiera aktualną konfigurację cache
 */
export function getThumbnailConfig(): ThumbnailConfig | null {
  return thumbnailConfig;
}

/**
 * Wymusza ponowne załadowanie konfiguracji cache
 */
export async function refreshThumbnailCache(): Promise<void> {
  cacheInitialized = false;
  await initThumbnailCache();
}
