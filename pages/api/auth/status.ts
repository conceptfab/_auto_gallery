import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie, isUserLoggedIn } from '../../../src/utils/auth';
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
        isAdmin: false
      });
    }

    const isLoggedIn = isUserLoggedIn(email);
    const isAdmin = email === ADMIN_EMAIL;
    
    res.status(200).json({ 
      isLoggedIn,
      email: isLoggedIn ? email : null,
      isAdmin: isLoggedIn ? isAdmin : false
    });

  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}