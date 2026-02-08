import { NextApiRequest, NextApiResponse } from 'next';
import { copyProject } from '@/src/utils/projectsStorage';
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
    const copied = await copyProject(
      projectId,
      fromGroupId || undefined,
      toGroupId || undefined
    );
    if (!copied) {
      return res.status(404).json({ error: 'Projekt nie znaleziony' });
    }
    return res.status(200).json({ success: true, project: copied });
  } catch (error) {
    console.error('Error copying project:', error);
    return res.status(500).json({ error: 'Błąd kopiowania projektu' });
  }
}

export default withAdminAuth(handler);
