import { NextApiRequest, NextApiResponse } from 'next';
import { updateGroup } from '../../../../../src/utils/storage';
import { withAdminAuth } from '../../../../../src/utils/adminMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { id, name, clientName, galleryFolder } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID grupy jest wymagane' });
    }

    const group = await updateGroup(id, { name, clientName, galleryFolder });

    if (!group) {
      return res.status(404).json({ error: 'Grupa nie została znaleziona' });
    }

    res.status(200).json({ success: true, group });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAdminAuth(handler);
