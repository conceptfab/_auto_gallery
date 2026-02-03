import { NextApiRequest, NextApiResponse } from 'next';
import { addProject } from '@/src/utils/projectsStorage';
import { withAdminAuth } from '@/src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nazwa projektu jest wymagana' });
    }
    const project = await addProject(name.trim(), description);
    return res.status(200).json({ success: true, project });
  } catch (error) {
    console.error('Error adding project:', error);
    return res.status(500).json({ error: 'Błąd dodawania projektu' });
  }
}

export default withAdminAuth(handler);
