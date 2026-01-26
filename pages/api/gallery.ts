import { NextApiRequest, NextApiResponse } from 'next';
import { GalleryResponse, GalleryFolder, ImageFile } from '@/src/types/gallery';
import { scanRemoteDirectory } from './gallery-utils';
import { withRateLimit } from '@/src/utils/rateLimiter';
import { GALLERY_BASE_URL, ADMIN_EMAIL } from '@/src/config/constants';
import { getEmailFromCookie } from '@/src/utils/auth';
import { getUserGroup, getGroupById } from '@/src/utils/storage';
import { generateSignedUrl, isFileProtectionEnabled } from '@/src/utils/fileToken';
import { scanPrivateDirectory } from '@/src/utils/privateGallery';
import { getCachedGallery, setCachedGallery, generateETag } from '@/src/utils/galleryCache';

/**
 * Konwertuje URL-e obrazków na podpisane URL-e (jeśli ochrona jest włączona)
 */
function convertFolderUrls(folders: GalleryFolder[], baseUrl: string): GalleryFolder[] {
  if (!isFileProtectionEnabled()) {
    return folders; // Bez zmian jeśli ochrona wyłączona
  }
  
  const processFolder = (folder: GalleryFolder): GalleryFolder => {
    return {
      ...folder,
      images: folder.images.map((image: ImageFile) => {
        // Wyciągnij ścieżkę pliku z URL
        const filePath = image.url.replace(baseUrl, '').replace(/^\//, '');
        return {
          ...image,
          url: generateSignedUrl(filePath)
        };
      }),
      subfolders: folder.subfolders?.map(processFolder)
    };
  };
  
  return folders.map(processFolder);
}

async function galleryHandler(
  req: NextApiRequest,
  res: NextApiResponse<GalleryResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Metoda nie obsługiwana' 
    });
  }

  try {
    const email = getEmailFromCookie(req);
    const isAdmin = email === ADMIN_EMAIL;
    const { groupId } = req.query;
    const usePrivateScanning = isFileProtectionEnabled();
    
    // Funkcja pomocnicza do skanowania (wybiera metodę)
    const scanFolder = async (folder: string, useCache: boolean = true): Promise<GalleryFolder[]> => {
      // Sprawdź cache ZAWSZE (dla obu trybów - publicznych i prywatnych)
      if (useCache) {
        const cached = await getCachedGallery(folder, groupId as string | undefined);
        if (cached) {
          return cached;
        }
      }

      let folders: GalleryFolder[];
      
      if (usePrivateScanning) {
        // Skanuj przez PHP (prywatne pliki)
        const cleanFolder = folder.replace(/^\//, '').replace(/\/$/, '');
        folders = await scanPrivateDirectory(cleanFolder);
      } else {
        // Skanuj przez HTTP (publiczne pliki)
        let galleryUrl: string;
        if (folder.startsWith('http://') || folder.startsWith('https://')) {
          galleryUrl = folder;
        } else if (folder === '' || folder === '/') {
          galleryUrl = GALLERY_BASE_URL;
        } else {
          const baseUrl = GALLERY_BASE_URL.endsWith('/') ? GALLERY_BASE_URL : GALLERY_BASE_URL + '/';
          const folderPath = folder.startsWith('/') ? folder.slice(1) : folder;
          galleryUrl = baseUrl + folderPath;
        }
        folders = await scanRemoteDirectory(galleryUrl);
        folders = convertFolderUrls(folders, galleryUrl);
      }

      // Zapisz do cache ZAWSZE (dla obu trybów)
      await setCachedGallery(folder, folders, groupId as string | undefined);

      return folders;
    };
    
    let folders: GalleryFolder[];
    let targetFolder = '';

    // Admin może podglądać galerię konkretnej grupy
    if (isAdmin && groupId && typeof groupId === 'string') {
      const group = getGroupById(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          error: 'Grupa nie została znaleziona'
        });
      }
      
      targetFolder = group.galleryFolder || '';
      folders = await scanFolder(targetFolder);
      
      if (folders.length === 0) {
        return res.status(200).json({
          success: false,
          error: `Brak danych w folderze: ${targetFolder || '/'}`
        });
      }
    } else if (isAdmin) {
      // Admin bez groupId widzi całą galerię
      targetFolder = '';
      folders = await scanFolder(targetFolder);
    } else {
      // Sprawdź grupę użytkownika
      const userGroup = email ? getUserGroup(email) : null;
      
      if (!userGroup) {
        return res.status(200).json({
          success: false,
          error: 'Nie masz przypisanej grupy. Skontaktuj się z administratorem.'
        });
      }
      
      // Użyj folderu z grupy użytkownika
      targetFolder = userGroup.galleryFolder || '';
      folders = await scanFolder(targetFolder);
      
      if (folders.length === 0) {
        return res.status(200).json({
          success: false,
          error: `Brak danych w folderze: ${targetFolder || '/'}`
        });
      }
    }

    // Generuj ETag dla cache validation
    const etag = generateETag(folders);
    
    // Sprawdź If-None-Match header (304 Not Modified)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag || ifNoneMatch === `"${etag}"`) {
      res.status(304).end();
      return;
    }

    // Ustaw HTTP cache headers
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('ETag', etag);
    res.setHeader('Vary', 'Cookie'); // Cache różni się w zależności od użytkownika/grupy
    
    res.status(200).json({
      success: true,
      data: folders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Błąd podczas skanowania galerii'
    });
  }
}

// Apply rate limiting: 30 requests per minute
export default withRateLimit(30, 60000)(galleryHandler);