import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '@/src/utils/auth';
import { getUserGroup, getGroupById } from '@/src/utils/storage';
import { ADMIN_EMAIL, GALLERY_BASE_URL } from '@/src/config/constants';
import {
  isFileProtectionEnabled,
  generateSignedUrl,
} from '@/src/utils/fileToken';
import { generateListUrl } from '@/src/utils/fileToken';
import axios from 'axios';

interface FolderItem {
  name: string;
  path: string;
  thumbnailUrl: string | null;
}

interface PHPListResponse {
  folders: { name: string; path: string }[];
  files: { name: string; path: string; size: number; modified: string }[];
  error?: string;
}

/**
 * Sprawdza czy w folderze jest plik folder_thumb.png (dla HTTP)
 */
async function checkFolderThumbnailHTTP(
  folderUrl: string,
): Promise<string | null> {
  try {
    const response = await axios.get(folderUrl, {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
    });

    const html = response.data;
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1].trim();
      const fileName = href.toLowerCase();

      if (fileName === 'folder_thumb.png' || fileName === '/folder_thumb.png') {
        let fullUrl: string;
        if (href.startsWith('/')) {
          fullUrl = `https://conceptfab.com${href}`;
        } else {
          fullUrl = new URL(href, folderUrl).href;
        }
        return fullUrl;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Sprawdza czy w folderze jest plik folder_thumb.png (dla PHP)
 */
async function checkFolderThumbnailPHP(
  folderPath: string,
): Promise<string | null> {
  try {
    const listUrl = generateListUrl(folderPath);
    const response = await fetch(listUrl);

    if (!response.ok) {
      return null;
    }

    const data: PHPListResponse = await response.json();

    if (data.error || !data.files) {
      return null;
    }

    const thumbFile = data.files.find(
      (file) => file.name.toLowerCase() === 'folder_thumb.png',
    );

    if (thumbFile) {
      return isFileProtectionEnabled()
        ? generateSignedUrl(thumbFile.path)
        : thumbFile.path;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Pobiera listę podfolderów z folderu _folders (dla HTTP)
 */
async function getSubfoldersHTTP(baseUrl: string): Promise<FolderItem[]> {
  try {
    const response = await axios.get(baseUrl, {
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
    });

    const html = response.data;
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    const folders: FolderItem[] = [];
    const foundLinks = new Set<string>();

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1].trim();
      const fullContent = match[2];
      const text = fullContent.replace(/<[^>]*>/g, '').trim();

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
        if (href.startsWith('/')) {
          fullUrl = `https://conceptfab.com${href}`;
        } else {
          fullUrl = new URL(href, baseUrl).href;
        }
      } catch (error) {
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
        const folderUrl = href.endsWith('/') ? fullUrl : fullUrl + '/';
        const folderName =
          text || href.split('/').filter(Boolean).pop() || href;

        // Sprawdź czy w folderze jest folder_thumb.png
        const thumbnailUrl = await checkFolderThumbnailHTTP(folderUrl);

        folders.push({
          name: folderName,
          path: folderUrl,
          thumbnailUrl,
        });
      }
    }

    return folders;
  } catch (error) {
    console.error('Error getting subfolders HTTP:', error);
    return [];
  }
}

/**
 * Pobiera listę podfolderów z folderu _folders (dla PHP)
 */
async function getSubfoldersPHP(folderPath: string): Promise<FolderItem[]> {
  try {
    const listUrl = generateListUrl(folderPath);
    const response = await fetch(listUrl);

    if (!response.ok) {
      return [];
    }

    const data: PHPListResponse = await response.json();

    if (data.error || !data.folders) {
      return [];
    }

    const folders: FolderItem[] = [];

    for (const folder of data.folders) {
      // Sprawdź czy w folderze jest folder_thumb.png
      const thumbnailUrl = await checkFolderThumbnailPHP(folder.path);

      folders.push({
        name: folder.name,
        path: folder.path,
        thumbnailUrl,
      });
    }

    return folders;
  } catch (error) {
    console.error('Error getting subfolders PHP:', error);
    return [];
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = getEmailFromCookie(req);
    const isAdmin = email === ADMIN_EMAIL;
    const { groupId } = req.query;
    const usePrivateScanning = isFileProtectionEnabled();

    let targetFolder = '';
    let clientName = '';

    // Określ folder i nazwę klienta
    if (isAdmin && groupId && typeof groupId === 'string') {
      const group = getGroupById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Grupa nie została znaleziona' });
      }
      targetFolder = group.galleryFolder || '';
      clientName = group.clientName || '';
    } else if (isAdmin) {
      return res
        .status(400)
        .json({ error: 'groupId jest wymagany dla admina' });
    } else {
      const userGroup = email ? getUserGroup(email) : null;
      if (!userGroup) {
        return res.status(403).json({
          error:
            'Nie masz przypisanej grupy. Skontaktuj się z administratorem.',
        });
      }
      targetFolder = userGroup.galleryFolder || '';
      clientName = userGroup.clientName || '';
    }

    // Skanuj folder _folders
    const foldersPath = targetFolder ? `${targetFolder}/_folders` : '_folders';

    let folders: FolderItem[] = [];

    try {
      if (usePrivateScanning) {
        const cleanFolder = foldersPath.replace(/^\//, '').replace(/\/$/, '');
        folders = await getSubfoldersPHP(cleanFolder);
      } else {
        let galleryUrl: string;
        if (foldersPath === '_folders' || foldersPath === '/_folders') {
          galleryUrl = GALLERY_BASE_URL.endsWith('/')
            ? GALLERY_BASE_URL + '_folders'
            : GALLERY_BASE_URL + '/_folders';
        } else {
          const baseUrl = GALLERY_BASE_URL.endsWith('/')
            ? GALLERY_BASE_URL
            : GALLERY_BASE_URL + '/';
          const folderPath = foldersPath.startsWith('/')
            ? foldersPath.slice(1)
            : foldersPath;
          galleryUrl = baseUrl + folderPath;
        }
        folders = await getSubfoldersHTTP(galleryUrl);
      }
    } catch (error: any) {
      console.log(
        'Folder _folders nie istnieje lub jest pusty:',
        error.message,
      );
      folders = [];
    }

    return res.status(200).json({
      success: true,
      clientName,
      folders,
    });
  } catch (error: any) {
    console.error('Error fetching folders:', error);
    return res.status(500).json({
      success: false,
      error: 'Błąd podczas pobierania folderu _folders',
    });
  }
}
