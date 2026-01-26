import { NextApiRequest, NextApiResponse } from 'next';
import { addUserToGroup, removeUserFromGroup } from '../../../../../src/utils/storage';
import { getEmailFromCookie } from '../../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../../src/config/constants';
import { logger } from '../../../../../src/utils/logger';

// Walidacja email
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź autoryzację admina
  const adminEmail = getEmailFromCookie(req);
  if (adminEmail !== ADMIN_EMAIL) {
    logger.warn('Unauthorized user assignment attempt', { email: adminEmail });
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { groupId, email, action } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email użytkownika jest wymagany' });
    }

    // Sanityzacja i walidacja
    const sanitizedEmail = email.toLowerCase().trim().substring(0, 254);
    if (!isValidEmail(sanitizedEmail)) {
      return res.status(400).json({ error: 'Nieprawidłowy format email' });
    }

    if (action === 'remove') {
      if (!groupId || typeof groupId !== 'string') {
        return res.status(400).json({ error: 'ID grupy jest wymagane do usunięcia' });
      }
      
      const sanitizedGroupId = groupId.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
      const removed = removeUserFromGroup(sanitizedGroupId, sanitizedEmail);
      
      if (!removed) {
        return res.status(404).json({ error: 'Użytkownik nie należy do tej grupy' });
      }
      
      logger.info('User removed from group', { groupId: sanitizedGroupId, userEmail: sanitizedEmail });
      return res.status(200).json({ success: true, message: 'Użytkownik usunięty z grupy' });
    }

    // Domyślnie: dodaj do grupy
    if (!groupId || typeof groupId !== 'string') {
      return res.status(400).json({ error: 'ID grupy jest wymagane' });
    }

    const sanitizedGroupId = groupId.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
    const added = addUserToGroup(sanitizedGroupId, sanitizedEmail);
    
    if (!added) {
      return res.status(404).json({ error: 'Grupa nie została znaleziona' });
    }

    logger.info('User assigned to group', { groupId: sanitizedGroupId, userEmail: sanitizedEmail });
    res.status(200).json({ success: true, message: 'Użytkownik przypisany do grupy' });
  } catch (error) {
    logger.error('Error assigning user to group', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
