import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../src/utils/auth';
import { getUserGroup } from '../../../src/utils/storage';
import { ADMIN_EMAIL } from '../../../src/config/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = getEmailFromCookie(req);
    
    if (!email) {
      return res.status(200).json({ 
        isLoggedIn: false,
        email: null,
        isAdmin: false,
        group: null
      });
    }

    const isAdmin = email === ADMIN_EMAIL;
    // Jeśli mamy email z cookie (getEmailFromCookie sprawdza auth_logged=true), 
    // to użytkownik jest zalogowany - nie polegamy tylko na liście w storage
    // bo może być utracona po restarcie serwera
    const isLoggedIn = true; // email z cookie = zalogowany
    const userGroup = getUserGroup(email);
    
    res.status(200).json({ 
      isLoggedIn,
      email: email,
      isAdmin: isAdmin,
      group: userGroup ? {
        id: userGroup.id,
        name: userGroup.name,
        clientName: userGroup.clientName,
        galleryFolder: userGroup.galleryFolder
      } : null
    });

  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}