import { NextApiRequest, NextApiResponse } from 'next';
import { scanRemoteDirectory } from './gallery-utils';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GALLERY_BASE_URL } from '@/src/config/constants';

interface CacheManifest {
  generated: string;
  version: string;
  folders: Array<{
    name: string;
    imageCount: number;
  }>;
  totalImages: number;
  hash: string;
}

interface CacheStatusResponse {
  needsRefresh: boolean;
  reason: string;
  currentCache?: CacheManifest;
  currentGallery?: {
    folders: number;
    totalImages: number;
    hash: string;
  };
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<CacheStatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      needsRefresh: false, 
      reason: 'Method not allowed' 
    });
  }

  try {
    console.log('🔍 Checking cache status...');
    
    // Sprawdź czy cache manifest istnieje
    const cacheDir = path.join(process.cwd(), 'public', 'cache');
    const manifestPath = path.join(cacheDir, 'cache-manifest.json');
    
    let currentCache: CacheManifest | null = null;
    
    if (fs.existsSync(manifestPath)) {
      try {
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        currentCache = JSON.parse(manifestContent);
        console.log('📄 Found existing cache manifest:', currentCache);
      } catch (error) {
        console.error('❌ Error reading cache manifest:', error);
        return res.status(200).json({
          needsRefresh: true,
          reason: 'Cache manifest corrupted'
        });
      }
    } else {
      console.log('❌ No cache manifest found');
      return res.status(200).json({
        needsRefresh: true,
        reason: 'No cache exists'
      });
    }

    // Skanuj aktualną galerię
    console.log('🔍 Scanning current gallery structure...');
    const currentFolders = await scanRemoteDirectory(GALLERY_BASE_URL);
    
    // Oblicz statystyki aktualnej galerii
    const currentStats = {
      folders: currentFolders.length,
      totalImages: currentFolders.reduce((sum, folder) => sum + folder.images.length, 0),
      folderData: currentFolders.map(folder => ({
        name: folder.name,
        imageCount: folder.images.length
      }))
    };
    
    // Generuj hash dla porównania
    const currentHash = generateGalleryHash(currentStats.folderData);
    
    console.log('📊 Current gallery stats:', {
      folders: currentStats.folders,
      totalImages: currentStats.totalImages,
      hash: currentHash
    });

    // Porównaj z cache
    if (currentCache) {
      console.log('🔍 Comparing with cache...');
      
      // Sprawdź hash
      if (currentCache.hash !== currentHash) {
        return res.status(200).json({
          needsRefresh: true,
          reason: 'Gallery structure changed',
          currentCache,
          currentGallery: {
            folders: currentStats.folders,
            totalImages: currentStats.totalImages,
            hash: currentHash
          }
        });
      }
      
      // Sprawdź wiek cache (opcjonalnie - 7 dni)
      const cacheAge = Date.now() - new Date(currentCache.generated).getTime();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 dni
      
      if (cacheAge > maxAge) {
        return res.status(200).json({
          needsRefresh: true,
          reason: `Cache older than 7 days (${Math.round(cacheAge / (24 * 60 * 60 * 1000))} days)`,
          currentCache,
          currentGallery: {
            folders: currentStats.folders,
            totalImages: currentStats.totalImages,
            hash: currentHash
          }
        });
      }
      
      console.log('✅ Cache is up to date');
      return res.status(200).json({
        needsRefresh: false,
        reason: 'Cache is up to date',
        currentCache,
        currentGallery: {
          folders: currentStats.folders,
          totalImages: currentStats.totalImages,
          hash: currentHash
        }
      });
    }

    // Fallback - nie powinno się zdarzyć
    return res.status(200).json({
      needsRefresh: true,
      reason: 'Unknown cache state'
    });

  } catch (error) {
    console.error('❌ Cache status check error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      needsRefresh: true,
      reason: `Error checking cache: ${errorMessage}`
    });
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