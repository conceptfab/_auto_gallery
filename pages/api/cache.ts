import { NextApiRequest, NextApiResponse } from 'next';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { GALLERY_BASE_URL } from '@/src/config/constants';

interface CacheRequest {
  action: 'start' | 'progress';
}

interface CacheProgress {
  current: number;
  total: number;
  currentFile: string;
  stage: 'fetching' | 'converting' | 'complete';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action }: CacheRequest = req.body;

    if (action === 'start') {
      // Uruchom proces cache'owania w tle
      processCacheGeneration(res);
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Cache API error:', error);
    res.status(500).json({ error: 'Cache processing failed' });
  }
}

async function processCacheGeneration(res: NextApiResponse) {
  try {
    // Import funkcji skanowania galerii
    const { scanRemoteDirectory } = await import('./gallery-utils');
    
    console.log('Starting gallery scan...');
    const folders = await scanRemoteDirectory(GALLERY_BASE_URL);
    
    if (!folders || folders.length === 0) {
      throw new Error('No gallery folders found');
    }

    const allImages: Array<{url: string, name: string, folder: string}> = [];
    folders.forEach((folder) => {
      folder.images.forEach((image) => {
        allImages.push({
          url: image.url,
          name: image.name,
          folder: folder.name
        });
      });
    });

    const total = allImages.length;
    const cacheDir = path.join(process.cwd(), 'public', 'cache');
    
    // Utwórz strukturę folderów
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Wyślij początkowy progress
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendProgress = (progress: CacheProgress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    };

    // Przetwarzaj każdy obraz
    for (let i = 0; i < allImages.length; i++) {
      const image = allImages[i];
      
      sendProgress({
        current: i + 1,
        total,
        currentFile: image.name,
        stage: 'fetching'
      });

      try {
        // Pobierz oryginalny obraz
        const imageResponse = await axios.get(image.url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        // Utwórz folder dla cache'a tego folderu
        const folderCacheDir = path.join(cacheDir, image.folder);
        if (!fs.existsSync(folderCacheDir)) {
          fs.mkdirSync(folderCacheDir, { recursive: true });
        }

        const baseName = path.parse(image.name).name;

        sendProgress({
          current: i + 1,
          total,
          currentFile: image.name,
          stage: 'converting'
        });

        // Generuj miniaturkę AVIF (300px width) - najwyższa kompresja
        const thumbnailAvifPath = path.join(folderCacheDir, `${baseName}_thumb.avif`);
        await sharp(imageBuffer)
          .resize(300, null, { withoutEnlargement: true })
          .avif({ quality: 80 })
          .toFile(thumbnailAvifPath);

        // Generuj miniaturkę WebP (300px width) - fallback
        const thumbnailWebpPath = path.join(folderCacheDir, `${baseName}_thumb.webp`);
        await sharp(imageBuffer)
          .resize(300, null, { withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(thumbnailWebpPath);

        // Generuj pełny rozmiar AVIF - najwyższa kompresja
        const fullAvifPath = path.join(folderCacheDir, `${baseName}_full.avif`);
        await sharp(imageBuffer)
          .avif({ quality: 85 })
          .toFile(fullAvifPath);

        // Generuj pełny rozmiar WebP - fallback
        const fullWebpPath = path.join(folderCacheDir, `${baseName}_full.webp`);
        await sharp(imageBuffer)
          .webp({ quality: 90 })
          .toFile(fullWebpPath);

      } catch (error) {
        console.error(`Error processing ${image.name}:`, error);
      }
    }

    // Utwórz cache manifest
    const manifestPath = path.join(cacheDir, 'cache-manifest.json');
    const folderData = folders.map(folder => ({
      name: folder.name,
      imageCount: folder.images.length
    }));
    
    const hash = generateGalleryHash(folderData);
    
    const manifest = {
      generated: new Date().toISOString(),
      version: '1.0',
      folders: folderData,
      totalImages: total,
      hash
    };
    
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    // Backward compatibility - keep cache-ready.json
    const readyFilePath = path.join(cacheDir, 'cache-ready.json');
    fs.writeFileSync(readyFilePath, JSON.stringify({
      generated: new Date().toISOString(),
      totalFiles: total
    }));

    // Wyślij finalne potwierdzenie
    sendProgress({
      current: total,
      total,
      currentFile: 'Complete',
      stage: 'complete'
    });

    res.end();

  } catch (error) {
    console.error('Cache generation error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Cache generation failed' })}\n\n`);
    res.end();
  }
}

function generateGalleryHash(folders: Array<{name: string, imageCount: number}>): string {
  // Sortuj foldery dla konsystentnego hash
  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));
  
  // Twórz string do hashowania
  const hashString = sortedFolders
    .map(folder => `${folder.name}:${folder.imageCount}`)
    .join('|');
    
  // Generuj SHA-256 hash
  return crypto.createHash('sha256').update(hashString).digest('hex').substring(0, 16);
}