import { NextApiRequest, NextApiResponse } from 'next';
import { moveProject } from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { projectId, fromGroupId, toGroupId } = req.body;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId jest wymagane' });
    }
    if (fromGroupId === toGroupId) {
      return res.status(400).json({ error: 'Źródłowa i docelowa grupa są takie same' });
    }
    const moved = await moveProject(
      projectId,
      fromGroupId || undefined,
      toGroupId || undefined
    );
    if (!moved) {
      return res.status(404).json({ error: 'Projekt nie znaleziony' });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error moving project:', error);
    return res.status(500).json({ error: 'Błąd przenoszenia projektu' });
  }
}

export default withAdminAuth(handler);
