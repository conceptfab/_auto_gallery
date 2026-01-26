import { NextApiRequest, NextApiResponse } from 'next';
import { createGroup } from '../../../../../src/utils/storage';
import { getEmailFromCookie } from '../../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../../src/config/constants';
import { logger } from '../../../../../src/utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź autoryzację admina
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL) {
    logger.warn('Unauthorized group creation attempt', { email });
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { name, clientName, galleryFolder } = req.body;

    // Walidacja danych wejściowych
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nazwa grupy jest wymagana' });
    }
    if (!clientName || typeof clientName !== 'string' || clientName.trim().length === 0) {
      return res.status(400).json({ error: 'Nazwa klienta jest wymagana' });
    }
    if (!galleryFolder || typeof galleryFolder !== 'string' || galleryFolder.trim().length === 0) {
      return res.status(400).json({ error: 'Folder galerii jest wymagany' });
    }

    // Sanityzacja
    const sanitizedName = name.trim().substring(0, 100);
    const sanitizedClient = clientName.trim().substring(0, 100);
    const sanitizedFolder = galleryFolder.trim()
      .replace(/\.\./g, '')
      .replace(/[^a-zA-Z0-9/_-]/g, '')
      .substring(0, 200);

    const group = createGroup(sanitizedName, sanitizedClient, sanitizedFolder);
    logger.info('Group created', { groupId: group.id, name: sanitizedName });
    
    res.status(200).json({ success: true, group });
  } catch (error) {
    logger.error('Error creating group', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
