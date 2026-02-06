import { NextApiRequest, NextApiResponse } from 'next';
import { createGroup } from '../../../../../src/utils/storage';
import { withAdminAuth } from '../../../../../src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { name, clientName, galleryFolder } = req.body;

    if (!name || !clientName || !galleryFolder) {
      return res.status(400).json({
        error: 'Nazwa grupy, nazwa klienta i folder galerii są wymagane',
      });
    }

    const group = await createGroup(name, clientName, galleryFolder);
    res.status(200).json({ success: true, group });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('jest już używana')) {
      return res.status(409).json({ error: msg });
    }
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAdminAuth(handler);
