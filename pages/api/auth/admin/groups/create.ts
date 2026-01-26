import { NextApiRequest, NextApiResponse } from 'next';
import { createGroup } from '../../../../../src/utils/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, clientName, galleryFolder } = req.body;

    if (!name || !clientName || !galleryFolder) {
      return res.status(400).json({ error: 'Nazwa grupy, nazwa klienta i folder galerii są wymagane' });
    }

    const group = createGroup(name, clientName, galleryFolder);
    res.status(200).json({ success: true, group });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
