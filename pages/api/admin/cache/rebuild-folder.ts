// pages/api/admin/cache/rebuild-folder.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { rebuildFolderThumbnails } from '@/src/services/schedulerService';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { folderPath } = req.body;
  if (!folderPath && folderPath !== '') {
    return res.status(400).json({ error: 'folderPath is required' });
  }

  try {
    const result = await rebuildFolderThumbnails(folderPath);
    return res.status(200).json({
      ...result,
      message: `Przebudowano ${result.thumbnailsGenerated} miniaturek dla folderu ${folderPath || '/'}`,
    });
  } catch (error) {
    console.error('Error rebuilding folder:', error);
    return res.status(500).json({ error: 'Rebuild failed' });
  }
}

export default withAdminAuth(handler);
