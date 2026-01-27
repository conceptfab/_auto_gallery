import { NextApiRequest, NextApiResponse } from 'next';
import { updateGroup } from '../../../../../src/utils/storage';
import { getEmailFromCookie } from '../../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../../src/config/constants';
import { isAdminLoggedIn } from '../../../../../src/utils/storage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź autoryzację admina
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL || !isAdminLoggedIn(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { id, name, clientName, galleryFolder } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID grupy jest wymagane' });
    }

    const group = updateGroup(id, { name, clientName, galleryFolder });

    if (!group) {
      return res.status(404).json({ error: 'Grupa nie została znaleziona' });
    }

    res.status(200).json({ success: true, group });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
