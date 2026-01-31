// src/services/thumbnailService.ts

import sharp from 'sharp';
import path from 'path';
import fsp from 'fs/promises';
import axios from 'axios';
import FormData from 'form-data';
import { ThumbnailConfig, ThumbnailSize } from '@/src/types/cache';
import { logger } from '@/src/utils/logger';
import { DEFAULT_THUMBNAIL_SIZES } from '@/src/utils/cacheStorage';
import { GALLERY_BASE_URL } from '@/src/config/constants';
import {
  isFileProtectionEnabled,
  generateSignedUrl,
} from '@/src/utils/fileToken';

// Ścieżka do lokalnego cache (Railway volume)
const LOCAL_CACHE_PATH = '/data-storage/thumbnails';
const FALLBACK_CACHE_PATH = './data/thumbnails';

// Ograniczenie współbieżności Sharp dla niskich zasobów
sharp.concurrency(2);

async function getCachePath(): Promise<string> {
  try {
    await fsp.access('/data-storage');
    return LOCAL_CACHE_PATH;
  } catch {
    return FALLBACK_CACHE_PATH;
  }
}

/**
 * Generuje ścieżkę miniaturki na podstawie oryginalnej ścieżki
 */
export function getThumbnailPath(
  originalPath: string,
  sizeName: string,
  format: string
): string {
  const pathParts = originalPath.split('/');
  const filename = pathParts.pop() || 'image';
  const baseName = filename.replace(/\.[^.]+$/, '');
  const thumbFilename = `${baseName}_${sizeName}.${format}`;
  return [...pathParts, thumbFilename].join('/');
}

/**
 * Generuje miniaturki dla pojedynczego obrazu
 */
export async function generateThumbnails(
  sourceUrl: string,
  originalPath: string,
  config: ThumbnailConfig = {
    sizes: DEFAULT_THUMBNAIL_SIZES,
    format: 'webp',
    storage: 'local',
  }
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  try {
    // Gdy ochrona plików jest włączona, serwer zwraca pliki tylko przez file-proxy.php (podpisany URL).
    // Pobieramy tym samym URL-em co frontend – inaczej dostajemy 404 na GALLERY_BASE_URL.
    const fetchUrl = isFileProtectionEnabled()
      ? generateSignedUrl(originalPath)
      : (() => {
          const base = GALLERY_BASE_URL.endsWith('/')
            ? GALLERY_BASE_URL
            : GALLERY_BASE_URL + '/';
          return sourceUrl.startsWith('http://') ||
            sourceUrl.startsWith('https://')
            ? sourceUrl
            : new URL(sourceUrl.replace(/^\//, ''), base).href;
        })();

    // Pobierz oryginalny obraz
    const response = await axios.get(fetchUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'ContentBrowser/1.0',
      },
    });
    const imageBuffer = Buffer.from(response.data);

    // Sprawdź czy to prawidłowy obraz
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image metadata');
    }

    // Generuj każdy rozmiar
    for (const size of config.sizes) {
      try {
        const outputBuffer = await processImage(
          imageBuffer,
          size,
          config.format
        );

        // Zapisz do wybranego storage
        const thumbnailPath = await saveThumbnail(
          outputBuffer,
          originalPath,
          size.name,
          config.format,
          config.storage
        );

        results.set(size.name, thumbnailPath);
      } catch (sizeError) {
        logger.error(
          `Error generating ${size.name} for ${originalPath}:`,
          sizeError
        );
      }
    }

    if (results.size > 0) {
      logger.info(`Generated ${results.size} thumbnails for ${originalPath}`);
    }

    return results;
  } catch (error) {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    if (status === 404) {
      logger.warn(`File not found on server (404), skipping: ${originalPath}`);
      return results;
    }
    logger.error(`Error generating thumbnails for ${originalPath}:`, error);
    throw error;
  }
}

/**
 * Przetwarza obraz do określonego rozmiaru i formatu
 */
async function processImage(
  buffer: Buffer,
  size: ThumbnailSize,
  format: 'webp' | 'avif' | 'jpeg'
): Promise<Buffer> {
  let pipeline = sharp(buffer).resize(size.width, size.height, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  switch (format) {
    case 'webp':
      pipeline = pipeline.webp({ quality: size.quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality: size.quality });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: size.quality });
      break;
  }

  return pipeline.toBuffer();
}

/**
 * Zapisuje miniaturkę do storage
 */
async function saveThumbnail(
  buffer: Buffer,
  originalPath: string,
  sizeName: string,
  format: string,
  storage: 'local' | 'remote'
): Promise<string> {
  const relativePath = getThumbnailPath(originalPath, sizeName, format);

  if (storage === 'local') {
    // Zapisz lokalnie (Railway volume)
    const cachePath = await getCachePath();
    const fullPath = path.join(cachePath, relativePath);

    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, buffer);

    return `/api/thumbnails/${relativePath}`;
  } else {
    // Wyślij do zdalnego serwera przez PHP
    const uploadUrl = process.env.FILE_UPLOAD_URL;
    if (!uploadUrl) {
      throw new Error('FILE_UPLOAD_URL not configured');
    }

    const form = new FormData();
    const pathParts = relativePath.split('/');
    const filename = pathParts.pop() || 'thumb.webp';

    form.append('file', buffer, {
      filename,
      contentType: `image/${format}`,
    });
    form.append('path', `thumbnails/${pathParts.join('/')}`);
    form.append('secret', process.env.FILE_PROXY_SECRET || '');

    await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });

    const base = GALLERY_BASE_URL.endsWith('/')
      ? GALLERY_BASE_URL
      : GALLERY_BASE_URL + '/';
    return `${base}thumbnails/${relativePath}`;
  }
}

/**
 * Sprawdza czy miniaturka istnieje
 */
export async function thumbnailExists(
  originalPath: string,
  sizeName: string,
  format: string,
  storage: 'local' | 'remote'
): Promise<boolean> {
  const relativePath = getThumbnailPath(originalPath, sizeName, format);

  if (storage === 'local') {
    const cachePath = await getCachePath();
    const fullPath = path.join(cachePath, relativePath);
    try {
      await fsp.access(fullPath);
      return true;
    } catch {
      return false;
    }
  } else {
    // Sprawdź zdalnie przez HEAD request
    const base = GALLERY_BASE_URL.endsWith('/')
      ? GALLERY_BASE_URL
      : GALLERY_BASE_URL + '/';
    const url = `${base}thumbnails/${relativePath}`;
    try {
      await axios.head(url, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Pobiera URL miniaturki (lub fallback do oryginału)
 */
export async function getThumbnailUrl(
  originalUrl: string,
  originalPath: string,
  sizeName: 'thumb' | 'medium' | 'large',
  config: ThumbnailConfig
): Promise<string> {
  const exists = await thumbnailExists(
    originalPath,
    sizeName,
    config.format,
    config.storage
  );

  if (exists) {
    const relativePath = getThumbnailPath(
      originalPath,
      sizeName,
      config.format
    );

    if (config.storage === 'local') {
      return `/api/thumbnails/${relativePath}`;
    } else {
      const base = GALLERY_BASE_URL.endsWith('/')
        ? GALLERY_BASE_URL
        : GALLERY_BASE_URL + '/';
      return `${base}thumbnails/${relativePath}`;
    }
  }

  // Fallback do oryginału
  return originalUrl;
}

/**
 * Pobiera statystyki cache miniaturek
 */
export async function getThumbnailStats(): Promise<{
  totalFiles: number;
  totalSize: number;
  bySize: Record<string, number>;
}> {
  const cachePath = await getCachePath();
  const stats = {
    totalFiles: 0,
    totalSize: 0,
    bySize: {} as Record<string, number>,
  };

  try {
    await countFilesRecursive(cachePath, stats);
  } catch {
    // Cache directory may not exist yet
  }

  return stats;
}

async function countFilesRecursive(
  dir: string,
  stats: {
    totalFiles: number;
    totalSize: number;
    bySize: Record<string, number>;
  }
): Promise<void> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await countFilesRecursive(fullPath, stats);
      } else if (entry.isFile()) {
        const fileStat = await fsp.stat(fullPath);
        stats.totalFiles++;
        stats.totalSize += fileStat.size;

        // Kategoryzuj po rozmiarze
        const sizeName = entry.name.match(/_(\w+)\.\w+$/)?.[1] || 'unknown';
        stats.bySize[sizeName] = (stats.bySize[sizeName] || 0) + 1;
      }
    }
  } catch {
    // Directory may not exist
  }
}

/**
 * Usuwa miniaturki dla danej ścieżki
 */
export async function deleteThumbnails(
  originalPath: string,
  config: ThumbnailConfig
): Promise<void> {
  if (config.storage !== 'local') {
    logger.warn('Remote thumbnail deletion not implemented');
    return;
  }

  const cachePath = await getCachePath();

  for (const size of config.sizes) {
    const relativePath = getThumbnailPath(
      originalPath,
      size.name,
      config.format
    );
    const fullPath = path.join(cachePath, relativePath);

    try {
      await fsp.unlink(fullPath);
      logger.debug(`Deleted thumbnail: ${fullPath}`);
    } catch {
      // File doesn't exist, that's fine
    }
  }
}

/**
 * Czyści cały cache miniaturek
 */
export async function clearAllThumbnails(): Promise<number> {
  const cachePath = await getCachePath();
  let deleted = 0;

  async function deleteRecursive(dir: string): Promise<void> {
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await deleteRecursive(fullPath);
          await fsp.rmdir(fullPath);
        } else {
          await fsp.unlink(fullPath);
          deleted++;
        }
      }
    } catch {
      // Directory may not exist
    }
  }

  await deleteRecursive(cachePath);
  logger.info(`Cleared ${deleted} thumbnail files`);

  return deleted;
}
