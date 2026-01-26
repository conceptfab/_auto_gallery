import { NextApiRequest, NextApiResponse } from 'next';
import { updateGroup } from '../../../../../src/utils/storage';
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
    logger.warn('Unauthorized group update attempt', { email });
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { id, name, clientName, galleryFolder } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID grupy jest wymagane' });
    }

    // Sanityzacja danych
    const sanitizedId = id.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
    
    const updates: { name?: string; clientName?: string; galleryFolder?: string } = {};
    
    if (name && typeof name === 'string') {
      updates.name = name.trim().substring(0, 100);
    }
    if (clientName && typeof clientName === 'string') {
      updates.clientName = clientName.trim().substring(0, 100);
    }
    if (galleryFolder && typeof galleryFolder === 'string') {
      updates.galleryFolder = galleryFolder.trim()
        .replace(/\.\./g, '')
        .replace(/[^a-zA-Z0-9/_-]/g, '')
        .substring(0, 200);
    }

    const group = updateGroup(sanitizedId, updates);
    
    if (!group) {
      return res.status(404).json({ error: 'Grupa nie została znaleziona' });
    }

    logger.info('Group updated', { groupId: sanitizedId });
    res.status(200).json({ success: true, group });
  } catch (error) {
    logger.error('Error updating group', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
