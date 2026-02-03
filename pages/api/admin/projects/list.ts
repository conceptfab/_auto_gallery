import { NextApiRequest, NextApiResponse } from 'next';
import { getProjects } from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const projects = await getProjects();
    return res.status(200).json({ success: true, projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return res.status(500).json({ error: 'Błąd ładowania projektów' });
  }
}

export default withAdminAuth(handler);
