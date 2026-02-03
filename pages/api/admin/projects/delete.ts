import { NextApiRequest, NextApiResponse } from 'next';
import { deleteProject } from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { id } = req.body;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Id projektu jest wymagane' });
    }
    const deleted = await deleteProject(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Projekt nie znaleziony' });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(500).json({ error: 'Błąd usuwania projektu' });
  }
}

export default withAdminAuth(handler);
