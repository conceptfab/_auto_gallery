// pages/api/admin/cache/generate-single.ts
// Generuje miniaturkę dla pojedynczego obrazu w tle

import { NextApiRequest, NextApiResponse } from 'next';
import { generateThumbnails } from '@/src/services/thumbnailService';
import { getCacheData } from '@/src/utils/cacheStorage';
import { logger } from '@/src/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imagePath } = req.body;

  if (!imagePath || typeof imagePath !== 'string') {
    return res.status(400).json({ error: 'imagePath required' });
  }

  // Sprawdź czy to plik obrazu
  if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(imagePath)) {
    return res.status(400).json({ error: 'Not an image file' });
  }

  // Odpowiedz od razu - generowanie odbywa się w tle
  res.status(202).json({ status: 'queued', path: imagePath });

  // Generuj miniaturkę w tle (po wysłaniu odpowiedzi)
  setImmediate(async () => {
    try {
      const cacheData = await getCacheData();
      const config = cacheData.thumbnailConfig;

      // Wyciągnij ścieżkę z URL jeśli to pełny URL
      let cleanPath = imagePath;
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        try {
          const url = new URL(imagePath);
          const galleryPrefix = '/__metro/gallery/';
          if (url.pathname.includes(galleryPrefix)) {
            cleanPath = url.pathname.substring(
              url.pathname.indexOf(galleryPrefix) + galleryPrefix.length
            );
          } else {
            cleanPath = url.pathname;
          }
        } catch {
          cleanPath = imagePath;
        }
      }

      // Normalizuj ścieżkę
      cleanPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;

      await generateThumbnails(imagePath, cleanPath, config);
      logger.info(`Background thumbnail generated for: ${cleanPath}`);
    } catch (error) {
      logger.error(`Failed to generate background thumbnail for ${imagePath}:`, error);
    }
  });
}
