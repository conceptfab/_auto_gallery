// pages/api/admin/cache/diagnostics.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { generateListUrl } from '@/src/utils/fileToken';
import axios from 'axios';

interface FolderInfo {
  path: string;
  name: string;
  fileCount: number;
  imageCount: number;
  subfolders: string[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const folders: FolderInfo[] = [];
  const errors: string[] = [];
  let totalImages = 0;
  let totalFolders = 0;

  // Sprawdź zmienne środowiskowe
  const envCheck = {
    FILE_LIST_URL: process.env.FILE_LIST_URL ? 'SET' : 'MISSING',
    FILE_PROXY_SECRET: process.env.FILE_PROXY_SECRET ? 'SET' : 'MISSING',
    GALLERY_BASE_URL: process.env.GALLERY_BASE_URL || 'NOT SET',
  };

  try {
    // Skanuj główny folder
    await scanFolderInfo('', folders, errors);

    // Zlicz totale
    for (const folder of folders) {
      totalImages += folder.imageCount;
      totalFolders++;
    }
  } catch (error) {
    errors.push(`Root scan error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return res.status(200).json({
    success: true,
    envCheck,
    folders,
    summary: {
      totalFolders,
      totalImages,
      foldersWithImages: folders.filter(f => f.imageCount > 0).length,
    },
    errors,
  });
}

interface PHPListResponse {
  folders: Array<{ name: string; path: string }>;
  files: Array<{ name: string; path: string; size: number; modified: string }>;
  error?: string;
}

async function scanFolderInfo(
  folderPath: string,
  allFolders: FolderInfo[],
  errors: string[],
  depth: number = 0,
): Promise<void> {
  if (depth > 5) return; // Max depth

  try {
    const listUrl = generateListUrl(folderPath);
    const response = await axios.get<PHPListResponse>(listUrl, { timeout: 15000 });

    // PHP zwraca { folders: [], files: [] } lub { error: "..." }
    if (response.data.error) {
      errors.push(`Folder ${folderPath || 'root'}: ${response.data.error}`);
      allFolders.push({
        path: folderPath || '/',
        name: folderPath.split('/').pop() || 'root',
        fileCount: 0,
        imageCount: 0,
        subfolders: [],
        error: response.data.error,
      });
      return;
    }

    const folders = response.data.folders || [];
    const files = response.data.files || [];
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|avif)$/i;

    const imageCount = files.filter((f) => imageExtensions.test(f.name)).length;
    const subfolderNames = folders.map((f) => f.name);

    allFolders.push({
      path: folderPath || '/',
      name: folderPath.split('/').pop() || 'root',
      fileCount: files.length,
      imageCount,
      subfolders: subfolderNames,
    });

    // Rekurencja do podfolderów
    for (const subfolder of folders) {
      await scanFolderInfo(subfolder.path, allFolders, errors, depth + 1);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Folder ${folderPath || 'root'}: ${errMsg}`);
    allFolders.push({
      path: folderPath || '/',
      name: folderPath.split('/').pop() || 'root',
      fileCount: 0,
      imageCount: 0,
      subfolders: [],
      error: errMsg,
    });
  }
}
