// pages/api/admin/cache/folder-status.ts
// Zwraca status cache dla obrazów w folderze

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { getCacheData } from '@/src/utils/cacheStorage';
import { thumbnailExists, getThumbnailPath } from '@/src/services/thumbnailService';
import { generateListUrl } from '@/src/utils/fileToken';
import axios from 'axios';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { folder } = req.query;
  const folderPath = typeof folder === 'string' ? folder : '';

  try {
    const cacheData = await getCacheData();
    const config = cacheData.thumbnailConfig;
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;

    // Pobierz listę plików z folderu
    const listUrl = generateListUrl(folderPath);
    const response = await axios.get<PHPListResponse>(listUrl, { timeout: 15000 });

    if (response.data.error) {
      return res.status(400).json({ error: response.data.error });
    }

    const files = response.data.files || [];
    const imageFiles = files.filter((f) => imageExtensions.test(f.name));

    // Sprawdź status cache dla każdego obrazu
    const results: ImageCacheStatus[] = await Promise.all(
      imageFiles.map(async (file) => {
        const imagePath = file.path.startsWith('/') ? file.path : '/' + file.path;
        const cached = await thumbnailExists(
          imagePath,
          'thumb',
          config.format,
          config.storage
        );

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
        percentage: totalCount > 0 ? Math.round((cachedCount / totalCount) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Error getting folder cache status:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
