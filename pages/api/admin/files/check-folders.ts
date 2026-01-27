import { NextApiRequest, NextApiResponse } from 'next';
import { generateListUrl } from '../../../../src/utils/fileToken';
import { withAdminAuth } from '../../../../src/utils/adminMiddleware';

interface FolderCheckResult {
  exists: boolean;
  folder?: string;
  foldersCount?: number;
  filesCount?: number;
  error?: string;
}

function cleanFolderPath(path: string): string {
  return path
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

async function checkOneFolder(cleanFolder: string): Promise<FolderCheckResult> {
  try {
    const listUrl = generateListUrl(cleanFolder);
    const response = await fetch(listUrl);

    if (!response.ok) {
      return {
        exists: false,
        folder: cleanFolder,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    if (data.error) {
      return { exists: false, folder: cleanFolder, error: data.error };
    }

    return {
      exists: true,
      folder: cleanFolder,
      foldersCount: data.folders?.length || 0,
      filesCount: data.files?.length || 0,
    };
  } catch {
    return {
      exists: false,
      folder: cleanFolder,
      error: 'Connection error',
    };
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as { items?: Array<{ id: string; path: string }> };
  const items = Array.isArray(body?.items) ? body.items : [];

  if (items.length === 0) {
    return res.status(200).json({ statuses: {} });
  }

  const results = await Promise.all(
    items.map(async ({ id, path }) => {
      const cleanPath =
        path && typeof path === 'string' ? cleanFolderPath(path) : '';
      const result = cleanPath
        ? await checkOneFolder(cleanPath)
        : ({ exists: false, error: 'Brak folderu' } as FolderCheckResult);
      return { id, result };
    }),
  );

  const statuses: Record<string, FolderCheckResult> = {};
  for (const { id, result } of results) {
    statuses[id] = result;
  }

  res.status(200).json({ statuses });
}

export default withAdminAuth(handler);
