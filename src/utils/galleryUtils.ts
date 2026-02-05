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

// Helper to get folder content (both subfolders and images) in a single pass
async function getDirectoryContent(url: string): Promise<{
  subfolders: Array<{ name: string; url: string }>;
  images: ImageFile[];
}> {
  try {
    const response = await galleryAxios.get<string>(url);
    const html = response.data;
    const links = parseLinksFromHtml(html);
    
    const subfolders: Array<{ name: string; url: string }> = [];
    const images: ImageFile[] = [];
    const foundLinks = new Set<string>();

    for (const { href, text } of links) {
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

      if (foundLinks.has(href)) continue;
      foundLinks.add(href);

      let fullUrl: string;
      try {
        if (href.startsWith('/')) {
          fullUrl = new URL(href, GALLERY_BASE_URL).href;
        } else {
          fullUrl = new URL(href, url).href;
        }
      } catch {
        continue;
      }

      // Check if it's an image
      const isImage = IMAGE_EXTENSIONS.some((ext) =>
        href.toLowerCase().endsWith(ext)
      );

      if (isImage) {
        images.push({
          name: text || href.split('/').pop() || href,
          path: href,
          url: fullUrl,
        });
        continue;
      }

      // Check if it's a folder
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
        if (lastSegment === '_folders') continue;
        const folderUrl = href.endsWith('/') ? fullUrl : fullUrl + '/';
        subfolders.push({
          name: text || href.split('/').filter(Boolean).pop() || href,
          url: folderUrl,
        });
      }
    }

    return { subfolders, images };
  } catch (error) {
    logger.error('Error getting directory content', { url, error });
    return { subfolders: [], images: [] };
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
    const { subfolders } = await getDirectoryContent(url);

    if (subfolders.length === 0) {
      return [];
    }

    // Process all subfolders in parallel
    const folderResults = await Promise.all(
      subfolders.map(async (folder) => {
        // Pomiń specjalny folder _folders
        const urlNorm = (folder.url || '').replace(/\/$/, '').toLowerCase();
        const nameNorm = (folder.name || '').toLowerCase();
        if (
          nameNorm === '_folders' ||
          urlNorm.endsWith('_folders') ||
          urlNorm.includes('/_folders/')
        ) {
          return null;
        }

        // Get this folder's content (images and sub-subfolders)
        const { subfolders: subSubFoldersRaw, images } = await getDirectoryContent(folder.url);

        // Recursively scan sub-subfolders if depth allows
        let nestedFolders: GalleryFolder[] = [];
        if (currentDepth < maxDepth - 1 && subSubFoldersRaw.length > 0) {
          // We already have subSubFoldersRaw, but we need the full recursive results
          // Actually, we should call scanDirectoryRecursive for deeper levels
          nestedFolders = await scanDirectoryRecursive(
            folder.url,
            currentDepth + 1,
            maxDepth
          );
        }

        const hasImages = images.length > 0;
        const hasSubfolders = nestedFolders.length > 0;

        if (hasImages || hasSubfolders) {
          const currentFolder: GalleryFolder = {
            name: folder.name,
            path: folder.url,
            images,
            subfolders: nestedFolders.length > 0 ? nestedFolders : undefined,
            isCategory: !hasImages && hasSubfolders,
            level: currentDepth,
          };
          return currentFolder;
        }

        return null;
      })
    );

    const folders = folderResults.filter((f): f is GalleryFolder => f !== null);

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
