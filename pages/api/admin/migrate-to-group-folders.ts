import { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { migrateToGroupFolders } from '@/src/utils/migrateToGroupFolders';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const report = await migrateToGroupFolders();
    return res.status(200).json({ success: true, report });
  } catch (error) {
    console.error('Error during migration:', error);
    return res.status(500).json({ error: 'Błąd migracji danych do folderów grup' });
  }
}

export default withAdminAuth(handler);
