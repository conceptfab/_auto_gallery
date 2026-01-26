import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '../../../../src/utils/storage';
import { getAdminEmailFromCookie } from '../../../../src/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = getAdminEmailFromCookie(req);
    
    if (!email) {
      return res.status(200).json({ 
        isAdminLoggedIn: false,
        email: null
      });
    }

    const isLoggedIn = isAdminLoggedIn(email);
    
    res.status(200).json({ 
      isAdminLoggedIn: isLoggedIn,
      email: isLoggedIn ? email : null
    });

  } catch (error) {
    console.error('Error checking admin auth status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}