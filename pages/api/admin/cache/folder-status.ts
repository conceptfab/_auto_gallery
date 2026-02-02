// pages/api/admin/cache/folder-status.ts
// Zwraca status cache dla obrazów w folderze

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import {
  getCacheData,
  DEFAULT_THUMBNAIL_CONFIG,
} from '@/src/utils/cacheStorage';
import {
  thumbnailExists,
  getThumbnailPath,
} from '@/src/services/thumbnailService';
import { generateListUrl } from '@/src/utils/fileToken';
import axios from 'axios';
import { logger } from '@/src/utils/logger';

interface ImageCacheStatus {
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

function emptyResponse(folderPath: string) {
  return {
    success: true,
    folder: folderPath || '/',
    images: [] as ImageCacheStatus[],
    summary: { total: 0, cached: 0, uncached: 0, percentage: 0 },
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { folder } = req.query;
  const folderPath = typeof folder === 'string' ? folder : '';

  let cacheData;
  try {
    cacheData = await getCacheData();
  } catch (err) {
    logger.error('Error loading cache data in folder-status', err);
    return res.status(200).json(emptyResponse(folderPath));
  }

  const config = cacheData?.thumbnailConfig || DEFAULT_THUMBNAIL_CONFIG;
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;

  let listResponse: PHPListResponse;
  try {
    const listUrl = generateListUrl(folderPath);
    const response = await axios.get<PHPListResponse>(listUrl, {
      timeout: 15000,
    });
    listResponse = response.data;
  } catch (err) {
    logger.error('Error fetching file list in folder-status', err);
    return res.status(200).json(emptyResponse(folderPath));
  }

  if (listResponse.error) {
    return res.status(200).json({
      ...emptyResponse(folderPath),
      error: listResponse.error,
    });
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

  return res.status(200).json({
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
  });
}

export default withAdminAuth(handler);
