import { GalleryFolder, ImageFile } from '@/src/types/gallery';
import {
  generateListUrl,
  generateSignedUrl,
  isFileProtectionEnabled,
} from './fileToken';
import { logger } from './logger';

interface PHPListResponse {
  folders: { name: string; path: string }[];
  files: { name: string; path: string; size: number; modified: string }[];
  error?: string;
}

/**
 * Pobiera listę plików i folderów z PHP
 */
async function fetchFolderContents(
  folder: string,
): Promise<PHPListResponse | null> {
  try {
    const listUrl = generateListUrl(folder);
    logger.debug('PHP list request', {
      folder,
      url: listUrl.substring(0, 100),
    });

    const response = await fetch(listUrl);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('PHP error', { status: response.status, error: errorText });
      return null;
    }

    const data: PHPListResponse = await response.json();
    logger.debug('PHP response', {
      folder,
      foldersCount: data.folders?.length || 0,
      filesCount: data.files?.length || 0,
    });

    if (data.error) {
      logger.error('PHP returned error', { folder, error: data.error });
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Fetch error', { folder, error });
    return null;
  }
}

/**
 * Skanuje prywatny folder galerii przez PHP endpoint
 */
export async function scanPrivateDirectory(
  folder: string = '',
  depth: number = 0,
): Promise<GalleryFolder[]> {
  logger.debug('scanPrivateDirectory', { folder, depth });

  if (depth > 10) {
    logger.warn('Max depth reached', { folder });
    return [];
  }

  const data = await fetchFolderContents(folder);
  if (!data) return [];

  const results: GalleryFolder[] = [];

  // Jeśli są pliki w tym folderze, utwórz GalleryFolder z obrazkami
  if (data.files && data.files.length > 0) {
    const images: ImageFile[] = data.files.map((file) => ({
      name: file.name,
      path: file.path,
      url: isFileProtectionEnabled() ? generateSignedUrl(file.path) : file.path,
      fileSize: file.size,
      lastModified: file.modified,
    }));

    const folderName = folder ? folder.split('/').pop() || folder : 'Galeria';
    logger.debug('Found images in folder', {
      folderName,
      imagesCount: images.length,
    });

    results.push({
      name: folderName,
      path: folder,
      images: images,
      isCategory: false,
      level: depth,
    });
  }

  // Rekurencyjnie skanuj podfoldery
  if (data.folders && data.folders.length > 0) {
    for (const subfolder of data.folders) {
      // Pomiń specjalny folder _folders – po nazwie i po ścieżce (nigdy w galerii)
      const nameNorm = (subfolder.name || '').toLowerCase();
      const pathNorm = (subfolder.path || '').toLowerCase();
      if (
        nameNorm === '_folders' ||
        pathNorm.includes('_folders') ||
        pathNorm.endsWith('/_folders') ||
        pathNorm === '_folders'
      ) {
        logger.debug('Pomijam specjalny folder _folders', {
          name: subfolder.name,
          path: subfolder.path,
        });
        continue;
      }

      logger.debug('Scanning subfolder', {
        path: subfolder.path,
        name: subfolder.name,
      });

      const subResults = await scanPrivateDirectory(subfolder.path, depth + 1);

      if (subResults.length > 0) {
        // Sprawdź czy podfolder ma bezpośrednio obrazki czy tylko dalsze podfoldery
        const hasDirectImages = subResults.some(
          (r) => r.path === subfolder.path && r.images.length > 0,
        );

        if (hasDirectImages && subResults.length === 1) {
          // Tylko obrazki w tym folderze - dodaj bezpośrednio
          results.push(...subResults);
        } else {
          // Ma podfoldery - utwórz kategorię
          results.push({
            name: subfolder.name,
            path: subfolder.path,
            images: [],
            subfolders: subResults,
            isCategory: true,
            level: depth,
          });
        }
      }
    }
  }

  logger.debug('scanPrivateDirectory returning results', {
    folder,
    resultsCount: results.length,
  });
  results.forEach((result, idx) => {
    logger.debug(
      idx + 1,
      result.name,
      result.path,
      'isCategory:',
      result.isCategory,
      'images:',
      result.images.length,
      'subfolders:',
      result.subfolders?.length || 0,
    );
  });
  return results;
}
