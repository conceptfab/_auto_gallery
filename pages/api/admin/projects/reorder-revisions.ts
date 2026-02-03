import { NextApiRequest, NextApiResponse } from 'next';
import { reorderProjectRevisions } from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { projectId, revisionIds } = req.body;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'Id projektu jest wymagane' });
    }
    if (
      !Array.isArray(revisionIds) ||
      revisionIds.some((id: unknown) => typeof id !== 'string')
    ) {
      return res
        .status(400)
        .json({ error: 'revisionIds musi być tablicą id (string)' });
    }
    const project = await reorderProjectRevisions(projectId, revisionIds);
    if (!project) {
      return res.status(404).json({ error: 'Projekt nie znaleziony' });
    }
    return res.status(200).json({ success: true, project });
  } catch (error) {
    console.error('Error reordering revisions:', error);
    return res.status(500).json({ error: 'Błąd zmiany kolejności rewizji' });
  }
}

export default withAdminAuth(handler);
