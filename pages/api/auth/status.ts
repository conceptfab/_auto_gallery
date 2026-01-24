import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie, isUserLoggedIn } from '../../../src/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = getEmailFromCookie(req);
    
    if (!email) {
      return res.status(200).json({ 
        isLoggedIn: false,
        email: null
      });
    }

    const isLoggedIn = isUserLoggedIn(email);
    
    res.status(200).json({ 
      isLoggedIn,
      email: isLoggedIn ? email : null
    });

  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}