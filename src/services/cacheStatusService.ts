import {
  getCacheData,
  DEFAULT_THUMBNAIL_CONFIG,
} from '@/src/utils/cacheStorage';
import {
  thumbnailExists,
  getThumbnailPath,
} from '@/src/services/thumbnailService';
import { generateListUrl } from '@/src/utils/fileToken';
import { API_TIMEOUT } from '@/src/config/constants';
import { logger } from '@/src/utils/logger';

export interface ImageCacheStatus {
  path: string;
  name: string;
  cached: boolean;
  thumbnailPath?: string;
}

interface PHPListResponse {
  folders: Array<{ name: string; path: string }>;
  files: Array<{ name: string; path: string; size: number; modified: string }>;
  error?: string;
}

export interface FolderCacheStatusResult {
  success: boolean;
  folder: string;
  images: ImageCacheStatus[];
  summary: {
    total: number;
    cached: number;
    uncached: number;
    percentage: number;
  };
  error?: string;
}

function emptyResponse(folderPath: string): FolderCacheStatusResult {
  return {
    success: true,
    folder: folderPath || '/',
    images: [],
    summary: { total: 0, cached: 0, uncached: 0, percentage: 0 },
  };
}

/**
 * Zwraca status cache dla jednego folderu (używane przez folder-status i folder-status-batch).
 */
export async function getFolderCacheStatus(
  folderPath: string
): Promise<FolderCacheStatusResult> {
  let cacheData;
  try {
    cacheData = await getCacheData();
  } catch (err) {
    logger.error('Error loading cache data in folder-status', err);
    return emptyResponse(folderPath);
  }

  const config = cacheData?.thumbnailConfig || DEFAULT_THUMBNAIL_CONFIG;
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;

  let listResponse: PHPListResponse;
  try {
    const listUrl = generateListUrl(folderPath);
    const response = await fetch(listUrl, { signal: AbortSignal.timeout(API_TIMEOUT) });
    if (response.status === 404) {
      logger.debug(`Folder not found (404): ${folderPath || '/'}`);
      return { ...emptyResponse(folderPath), error: 'Folder not found' };
    }
    listResponse = await response.json();
  } catch (err) {
    logger.error('Error fetching file list in folder-status', err);
    return { ...emptyResponse(folderPath), error: 'Failed to fetch file list' };
  }

  if (listResponse.error) {
    return {
      ...emptyResponse(folderPath),
      error: listResponse.error,
    };
  }

  const files = listResponse.files || [];
  const imageFiles = files.filter((f) => imageExtensions.test(f.name));

  const results: ImageCacheStatus[] = await Promise.all(
    imageFiles.map(async (file) => {
      const imagePath = file.path.startsWith('/') ? file.path : '/' + file.path;
      let cached = false;
      try {
        cached = await thumbnailExists(
          imagePath,
          'thumb',
          config.format,
          config.storage
        );
      } catch {
        // pojedynczy błąd = traktuj jako brak cache
      }
      return {
        path: file.path,
        name: file.name,
        cached,
        thumbnailPath: cached
          ? getThumbnailPath(imagePath, 'thumb', config.format)
          : undefined,
      };
    })
  );

  const cachedCount = results.filter((r) => r.cached).length;
  const totalCount = results.length;

  return {
    success: true,
    folder: folderPath || '/',
    images: results,
    summary: {
      total: totalCount,
      cached: cachedCount,
      uncached: totalCount - cachedCount,
      percentage:
        totalCount > 0 ? Math.round((cachedCount / totalCount) * 100) : 0,
    },
  };
}
