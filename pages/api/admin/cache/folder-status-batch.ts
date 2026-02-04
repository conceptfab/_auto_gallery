import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getFolderCacheStatus } from '@/src/services/cacheStatusService';

const MAX_FOLDERS = 100;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as { folders?: string[] };
  const folders = Array.isArray(body.folders)
    ? body.folders.filter((f) => typeof f === 'string').slice(0, MAX_FOLDERS)
    : [];

  const entries = await Promise.all(
    folders.map(async (folderPath) => {
      const result = await getFolderCacheStatus(folderPath);
      return [folderPath, result] as const;
    })
  );

  const byFolder = Object.fromEntries(entries);

  return res.status(200).json({
    success: true,
    byFolder,
  });
}

export default withAdminAuth(handler);
