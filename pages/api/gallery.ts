import { NextApiRequest, NextApiResponse } from 'next';
import { GalleryResponse, GalleryFolder, ImageFile } from '@/src/types/gallery';
import { scanRemoteDirectory } from './gallery-utils';
import { withRateLimit } from '@/src/utils/rateLimiter';
import { GALLERY_BASE_URL, ADMIN_EMAIL } from '@/src/config/constants';
import { getEmailFromCookie } from '@/src/utils/auth';
import { getUserGroup, getGroupById } from '@/src/utils/storage';
import { generateSignedUrl, isFileProtectionEnabled } from '@/src/utils/fileToken';
import { scanPrivateDirectory } from '@/src/utils/privateGallery';

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
    
    console.log(`📁 File protection enabled: ${usePrivateScanning}`);
    
    // Funkcja pomocnicza do skanowania (wybiera metodę)
    const scanFolder = async (folder: string): Promise<GalleryFolder[]> => {
      if (usePrivateScanning) {
        // Skanuj przez PHP (prywatne pliki)
        const cleanFolder = folder.replace(/^\//, '').replace(/\/$/, '');
        return scanPrivateDirectory(cleanFolder);
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
        const folders = await scanRemoteDirectory(galleryUrl);
        return convertFolderUrls(folders, galleryUrl);
      }
    };
    
    // Admin może podglądać galerię konkretnej grupy
    if (isAdmin && groupId && typeof groupId === 'string') {
      const group = getGroupById(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          error: 'Grupa nie została znaleziona'
        });
      }
      
      const folder = group.galleryFolder || '';
      console.log(`📁 Admin preview for group "${group.name}", folder: "${folder}"`);
      
      const folders = await scanFolder(folder);
      
      console.log(`📁 Found ${folders.length} folders`);
      
      if (folders.length === 0) {
        return res.status(200).json({
          success: false,
          error: `Brak danych w folderze: ${folder || '/'}`
        });
      }
      
      return res.status(200).json({
        success: true,
        data: folders
      });
    }
    
    // Admin bez groupId widzi całą galerię
    if (isAdmin) {
      const folders = await scanFolder('');
      return res.status(200).json({
        success: true,
        data: folders
      });
    }
    
    // Sprawdź grupę użytkownika
    const userGroup = email ? getUserGroup(email) : null;
    
    if (!userGroup) {
      return res.status(200).json({
        success: false,
        error: 'Nie masz przypisanej grupy. Skontaktuj się z administratorem.'
      });
    }
    
    // Użyj folderu z grupy użytkownika
    const folder = userGroup.galleryFolder || '';
    
    console.log(`📁 User ${email} (group: ${userGroup.name}) loading gallery from folder: "${folder}"`);
    
    const folders = await scanFolder(folder);
    
    if (folders.length === 0) {
      return res.status(200).json({
        success: false,
        error: `Brak danych w folderze: ${folder || '/'}`
      });
    }
    
    res.status(200).json({
      success: true,
      data: folders
    });
  } catch (error) {
    console.error('Błąd API:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas skanowania galerii'
    });
  }
}

// Apply rate limiting: 5 requests per minute
export default withRateLimit(5, 60000)(galleryHandler);