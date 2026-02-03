import { NextApiRequest, NextApiResponse } from 'next';
import { addProjectRevision } from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { projectId, label, embedUrl } = req.body;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'Id projektu jest wymagane' });
    }
    const revision = await addProjectRevision(
      projectId,
      typeof label === 'string' ? label : undefined,
      typeof embedUrl === 'string' ? embedUrl : undefined
    );
    if (!revision) {
      return res.status(404).json({ error: 'Projekt nie znaleziony' });
    }
    return res.status(200).json({ success: true, revision });
  } catch (error) {
    console.error('Error adding revision:', error);
    return res.status(500).json({ error: 'Błąd dodawania rewizji' });
  }
}

export default withAdminAuth(handler);
