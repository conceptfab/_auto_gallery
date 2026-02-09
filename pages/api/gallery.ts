import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { GalleryResponse, GalleryFolder, ImageFile } from '@/src/types/gallery';
import { scanRemoteDirectory } from '@/src/utils/galleryUtils';
import { withRateLimit } from '@/src/utils/rateLimiter';
import { GALLERY_BASE_URL, ADMIN_EMAIL } from '@/src/config/constants';
import { getEmailFromCookie } from '@/src/utils/auth';
import { getUserGroup, getGroupById } from '@/src/utils/storage';
import {
  generateSignedUrl,
  isFileProtectionEnabled,
} from '@/src/utils/fileToken';
import { scanPrivateDirectory } from '@/src/utils/privateGallery';
import {
  getCachedGallery,
  setCachedGallery,
  generateETag,
} from '@/src/utils/galleryCache';

/**
 * Konwertuje URL-e obrazków na podpisane URL-e (jeśli ochrona jest włączona)
 */
function convertFolderUrls(
  folders: GalleryFolder[],
  baseUrl: string
): GalleryFolder[] {
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
          url: generateSignedUrl(filePath),
        };
      }),
      subfolders: folder.subfolders?.map(processFolder),
    };
  };

  return folders.map(processFolder);
}

/**
 * Folder _folders NIE MOŻE być wyświetlany w galerii pod żadnym pozorem.
 * Usuwa rekurencyjnie z drzewa każdy folder o nazwie _folders lub ścieżce zawierającej _folders.
 */
function removeFoldersHiddenFromGallery(
  folders: GalleryFolder[]
): GalleryFolder[] {
  return folders
    .filter(
      (f) =>
        f.name.toLowerCase() !== '_folders' &&
        !String(f.path).toLowerCase().includes('_folders')
    )
    .map((folder) => ({
      ...folder,
      subfolders: folder.subfolders
        ? removeFoldersHiddenFromGallery(folder.subfolders)
        : undefined,
    }));
}

/** Nazwy folderów traktowanych jako „specjalne” – wyświetlane na końcu listy w danej grupie. */
const SPECIAL_FOLDER_NAMES = ['kolorystyka'];

/**
 * Sortuje drzewo folderów tak, aby foldery specjalne (np. Kolorystyka) były na końcu listy w każdej grupie.
 */
function sortSpecialFoldersLast(folders: GalleryFolder[]): GalleryFolder[] {
  return [...folders]
    .sort((a, b) => {
      const aSpecial = SPECIAL_FOLDER_NAMES.includes(a.name.toLowerCase());
      const bSpecial = SPECIAL_FOLDER_NAMES.includes(b.name.toLowerCase());
      if (aSpecial && !bSpecial) return 1;
      if (!aSpecial && bSpecial) return -1;
      return 0;
    })
    .map((folder) => ({
      ...folder,
      subfolders: folder.subfolders?.length
        ? sortSpecialFoldersLast(folder.subfolders)
        : undefined,
    }));
}

async function galleryHandler(
  req: NextApiRequest,
  res: NextApiResponse<GalleryResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Metoda nie obsługiwana',
    });
  }

  const querySchema = z.object({
    groupId: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((v) => (Array.isArray(v) ? v[0] : v)),
  });
  const parseResult = querySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Nieprawidłowe parametry',
    });
  }
  const { groupId } = parseResult.data;

  try {
    const email = getEmailFromCookie(req);
    const isAdmin = email === ADMIN_EMAIL;
    const usePrivateScanning = isFileProtectionEnabled();

    const scanFolder = async (
      folder: string,
      useCache: boolean = true
    ): Promise<GalleryFolder[]> => {
      if (useCache && !usePrivateScanning) {
        const cached = await getCachedGallery(
          folder,
          groupId as string | undefined
        );
        if (cached) {
          return sortSpecialFoldersLast(
            removeFoldersHiddenFromGallery(cached)
          );
        }
      }

      let folders: GalleryFolder[];

      if (usePrivateScanning) {
        const cleanFolder = folder.replace(/^\//, '').replace(/\/$/, '');
        folders = await scanPrivateDirectory(cleanFolder);
      } else {
        let galleryUrl: string;
        if (folder.startsWith('http://') || folder.startsWith('https://')) {
          galleryUrl = folder;
        } else if (folder === '' || folder === '/') {
          galleryUrl = GALLERY_BASE_URL;
        } else {
          const baseUrl = GALLERY_BASE_URL.endsWith('/')
            ? GALLERY_BASE_URL
            : GALLERY_BASE_URL + '/';
          const folderPath = folder.startsWith('/') ? folder.slice(1) : folder;
          galleryUrl = baseUrl + folderPath;
        }
        folders = await scanRemoteDirectory(galleryUrl);
        folders = convertFolderUrls(folders, galleryUrl);
      }

      folders = removeFoldersHiddenFromGallery(folders);
      folders = sortSpecialFoldersLast(folders);

      if (!usePrivateScanning) {
        await setCachedGallery(folder, folders, groupId as string | undefined);
      }

      return folders;
    };

    let folders: GalleryFolder[];
    let targetFolder = '';

    // Admin może podglądać galerię konkretnej grupy
    if (isAdmin && groupId && typeof groupId === 'string') {
      const group = await getGroupById(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          error: 'Grupa nie została znaleziona',
        });
      }

      targetFolder = group.galleryFolder || '';
      folders = await scanFolder(targetFolder);

      if (folders.length === 0) {
        return res.status(200).json({
          success: false,
          error: 'W tym folderze nie ma jeszcze obrazów.',
        });
      }
    } else if (isAdmin) {
      // Admin bez groupId widzi całą galerię
      targetFolder = '';
      folders = await scanFolder(targetFolder);
    } else {
      // Niezalogowany – inny komunikat niż „brak grupy”
      if (!email) {
        return res.status(200).json({
          success: false,
          error: 'Zaloguj się, aby zobaczyć galerię.',
        });
      }

      const userGroup = await getUserGroup(email);
      if (!userGroup) {
        return res.status(200).json({
          success: false,
          error:
            'Nie masz przypisanej grupy. Skontaktuj się z administratorem.',
        });
      }

      // Użyj folderu z grupy użytkownika
      targetFolder = userGroup.galleryFolder || '';
      folders = await scanFolder(targetFolder);

      if (folders.length === 0) {
        return res.status(200).json({
          success: false,
          error: 'W tym folderze nie ma jeszcze obrazów.',
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
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600'
    );
    res.setHeader('ETag', etag);
    res.setHeader('Vary', 'Cookie'); // Cache różni się w zależności od użytkownika/grupy

    res.status(200).json({
      success: true,
      data: folders,
    });
  } catch (_error) {
    res.status(500).json({
      success: false,
      error: 'Błąd podczas skanowania galerii',
    });
  }
}

// Apply rate limiting: 30 requests per minute
export default withRateLimit(30, 60000)(galleryHandler);
