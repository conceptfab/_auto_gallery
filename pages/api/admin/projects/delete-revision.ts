import { NextApiRequest, NextApiResponse } from 'next';
import { deleteProjectRevision } from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { projectId, revisionId } = req.body;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'Id projektu jest wymagane' });
    }
    if (!revisionId || typeof revisionId !== 'string') {
      return res.status(400).json({ error: 'Id rewizji jest wymagane' });
    }
    const deleted = await deleteProjectRevision(projectId, revisionId);
    if (!deleted) {
      return res
        .status(404)
        .json({ error: 'Projekt lub rewizja nie znaleziona' });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting revision:', error);
    return res.status(500).json({ error: 'Błąd usuwania rewizji' });
  }
}

export default withAdminAuth(handler);
