import { NextApiRequest, NextApiResponse } from 'next';
import {
  addUserToGroup,
  removeUserFromGroup,
} from '../../../../../src/utils/storage';
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
    const { groupId, email: userEmail, action } = req.body;

    if (!userEmail) {
      return res.status(400).json({ error: 'Email użytkownika jest wymagany' });
    }

    if (action === 'remove') {
      if (!groupId) {
        return res
          .status(400)
          .json({ error: 'ID grupy jest wymagane do usunięcia' });
      }
      const removed = removeUserFromGroup(groupId, userEmail);
      if (!removed) {
        return res
          .status(404)
          .json({ error: 'Użytkownik nie należy do tej grupy' });
      }
      return res
        .status(200)
        .json({ success: true, message: 'Użytkownik usunięty z grupy' });
    }

    // Domyślnie: dodaj do grupy
    if (!groupId) {
      return res.status(400).json({ error: 'ID grupy jest wymagane' });
    }

    const added = addUserToGroup(groupId, userEmail);
    if (!added) {
      return res.status(404).json({ error: 'Grupa nie została znaleziona' });
    }

    res
      .status(200)
      .json({ success: true, message: 'Użytkownik przypisany do grupy' });
  } catch (error) {
    console.error('Error assigning user to group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
