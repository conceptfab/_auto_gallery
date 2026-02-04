import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { NextApiRequest, NextApiResponse } from 'next';
import { GalleryFolder, ImageFile } from '@/src/types/gallery';
import {
  GALLERY_BASE_URL,
  DEFAULT_USER_AGENT,
  API_TIMEOUT,
} from '@/src/config/constants';
import { logger } from '@/src/utils/logger';

/** Wspólna instancja axios (PERF-008). */
const galleryAxios: AxiosInstance = axios.create({
  timeout: API_TIMEOUT,
  headers: { 'User-Agent': DEFAULT_USER_AGENT },
});

/** Parsowanie linków HTML przez cheerio (SEC-007) zamiast regex. */
function parseLinksFromHtml(
  html: string
): Array<{ href: string; text: string }> {
  const $ = cheerio.load(html);
  const links: Array<{ href: string; text: string }> = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href')?.trim() ?? '';
    const text = $(el).text().trim();
    links.push({ href, text });
  });
  return links;
}

const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
];

// Funkcja do liczenia plików graficznych w folderze
async function countImagesInDirectory(url: string): Promise<number> {
  try {
    const response = await galleryAxios.get<string>(url);
    const html = response.data;
    const links = parseLinksFromHtml(html);
    let imageCount = 0;
    for (const { href } of links) {
      const isImage = IMAGE_EXTENSIONS.some((ext) =>
        href.toLowerCase().endsWith(ext)
      );
      if (isImage) imageCount++;
    }
    return imageCount;
  } catch {
    logger.error('Błąd liczenia obrazów', { url });
    return 0;
  }
}

// Funkcja do znajdowania wszystkich podfolderów
async function findSubfolders(
  url: string
): Promise<Array<{ name: string; url: string }>> {
  logger.debug('ETAP 1: Szukanie podfolderów', { url });

  try {
    const response = await galleryAxios.get<string>(url);
    const html = response.data;
    logger.debug('Pobrano HTML', { length: html.length });

    const links = parseLinksFromHtml(html);
    const subfolders: Array<{ name: string; url: string }> = [];
    const foundLinks = new Set<string>();

    for (const { href, text } of links) {
      // Pomiń linki nadrzędne, puste i specjalne
      if (
        !href ||
        href === '../' ||
        href === './' ||
        href.startsWith('?') ||
        href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        text.toLowerCase().includes('parent directory')
      ) {
        continue;
      }

      // Unikaj duplikatów
      if (foundLinks.has(href)) {
        continue;
      }
      foundLinks.add(href);

      let fullUrl: string;
      try {
        // Obsługa absolutnych ścieżek jak /__metro/gallery/CUBE/
        if (href.startsWith('/')) {
          fullUrl = new URL(href, GALLERY_BASE_URL).href;
        } else {
          fullUrl = new URL(href, url).href;
        }
      } catch {
        continue;
      }

      // Sprawdź czy to jest folder
      const isFolder =
        href.endsWith('/') ||
        (!href.includes('.') && text && !text.includes('.')) ||
        (text && text.toUpperCase() === text && !text.includes('.')) ||
        /^[A-Z_]+$/i.test(href.replace('/', '')) ||
        (href.includes('/gallery/') && href.endsWith('/'));

      if (isFolder) {
        const lastSegment = (
          href.split('/').filter(Boolean).pop() || ''
        ).toLowerCase();
        if (lastSegment === '_folders') continue; // _folders nigdy w galerii
        const folderUrl = href.endsWith('/') ? fullUrl : fullUrl + '/';
        subfolders.push({
          name: text || href.split('/').filter(Boolean).pop() || href,
          url: folderUrl,
        });
      }
    }

    logger.debug('ZNALEZIONE PODFOLDERY', {
      count: subfolders.length,
      folders: subfolders.map((f) => f.name),
    });

    return subfolders;
  } catch (error) {
    logger.error('Błąd wyszukiwania podfolderów', { url, error });
    return [];
  }
}

export async function scanRemoteDirectory(
  url: string,
  maxDepth: number = 5
): Promise<GalleryFolder[]> {
  logger.galleryStart(url);
  logger.debug('ROZPOCZĘCIE SKANOWANIA GALERII', { url, maxDepth });

  return await scanDirectoryRecursive(url, 0, maxDepth);
}

async function scanDirectoryRecursive(
  url: string,
  currentDepth: number,
  maxDepth: number
): Promise<GalleryFolder[]> {
  if (currentDepth >= maxDepth) {
    logger.warn('Osiągnięto maksymalną głębokość', { maxDepth, url });
    return [];
  }

  logger.debug('POZIOM skanowania', { level: currentDepth + 1, url });

  try {
    // ETAP 1: Znajdź wszystkie podfoldery
    const subfolders = await findSubfolders(url);

    if (subfolders.length === 0) {
      logger.debug('Nie znaleziono podfolderów', { url, depth: currentDepth });
      return [];
    }

    // ETAP 2: Dla każdego podfolderu sprawdź czy ma obrazy i/lub podfoldery
    logger.debug('Analiza podfolderów', {
      count: subfolders.length,
      depth: currentDepth,
    });

    const folders: GalleryFolder[] = [];

    for (const folder of subfolders) {
      logger.debug('Analizuję folder', {
        name: folder.name,
        depth: currentDepth,
      });

      // Pomiń specjalny folder _folders – po nazwie i po URL/ścieżce
      const urlNorm = (folder.url || '').replace(/\/$/, '').toLowerCase();
      const nameNorm = (folder.name || '').toLowerCase();
      if (
        nameNorm === '_folders' ||
        urlNorm.endsWith('_folders') ||
        urlNorm.includes('/_folders/')
      ) {
        logger.debug('Pomijam specjalny folder _folders', {
          name: folder.name,
          url: folder.url,
        });
        continue;
      }

      // Sprawdź liczbę obrazów w bieżącym folderze
      const imageCount = await countImagesInDirectory(folder.url);

      // Sprawdź czy ma podfoldery (tylko jeśli nie osiągnęliśmy max głębokości)
      let subFolders: GalleryFolder[] = [];
      if (currentDepth < maxDepth - 1) {
        subFolders = await scanDirectoryRecursive(
          folder.url,
          currentDepth + 1,
          maxDepth
        );
      }

      const hasImages = imageCount > 0;
      const hasSubfolders = subFolders.length > 0;

      if (hasImages || hasSubfolders) {
        logger.debug('Folder details', {
          name: folder.name,
          imageCount,
          subfoldersCount: subFolders.length,
          depth: currentDepth,
        });

        const currentFolder: GalleryFolder = {
          name: folder.name,
          path: folder.url,
          images: [],
          subfolders: subFolders.length > 0 ? subFolders : undefined,
          isCategory: !hasImages && hasSubfolders, // Kategoria jeśli ma tylko podfoldery, bez obrazów
          level: currentDepth,
        };

        // Jeśli folder ma obrazy, pobierz ich szczegóły
        if (hasImages) {
          logger.debug('Pobieranie szczegółów obrazów', {
            imageCount,
            depth: currentDepth,
          });

          const response = await galleryAxios.get<string>(folder.url);
          const html = response.data;
          const imageLinks = parseLinksFromHtml(html);

          for (const { href, text } of imageLinks) {
            const isImage = IMAGE_EXTENSIONS.some((ext) =>
              href.toLowerCase().endsWith(ext)
            );

            if (isImage) {
              let fullUrl: string;
              if (href.startsWith('/')) {
                fullUrl = new URL(href, GALLERY_BASE_URL).href;
              } else {
                fullUrl = new URL(href, folder.url).href;
              }

              // Usunięto HEAD requests - metadane nie są krytyczne i spowalniały skanowanie
              const imageFile: ImageFile = {
                name: text || href.split('/').pop() || href,
                path: href,
                url: fullUrl,
                // fileSize i lastModified - pominięte dla optymalizacji
              };
              currentFolder.images.push(imageFile);
            }
          }
        }

        folders.push(currentFolder);
      }
    }

    logger.debug('POZIOM zakończony', {
      level: currentDepth + 1,
      foldersCount: folders.length,
    });

    return folders;
  } catch (error) {
    logger.error('Błąd skanowania', { url, depth: currentDepth, error });
    return [];
  }
}

// URL validation function
function validateGalleryUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const baseUrl = new URL(GALLERY_BASE_URL);
    return (
      parsedUrl.protocol === 'https:' &&
      parsedUrl.hostname === baseUrl.hostname &&
      parsedUrl.pathname.startsWith(baseUrl.pathname)
    );
  } catch {
    return false;
  }
}

// Default handler for Next.js API route (gallery-utils)
export default async function galleryUtilsHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    // Validate required URL
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    // Validate URL security
    if (!validateGalleryUrl(url)) {
      return res.status(400).json({
        error:
          'Invalid URL. Only HTTPS URLs from conceptfab.com/__metro/gallery/ are allowed',
      });
    }

    const folders = await scanRemoteDirectory(url);
    res.status(200).json({ folders });
  } catch (error) {
    logger.error('Gallery scan error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
