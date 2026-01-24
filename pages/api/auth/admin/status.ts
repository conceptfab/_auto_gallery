import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '../../../../src/utils/storage';

const ADMIN_EMAIL = 'michal@conceptfab.com';

function getAdminEmailFromCookie(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  
  const emailMatch = cookies.match(/admin_email=([^;]*)/);
  const loggedMatch = cookies.match(/admin_logged=([^;]*)/);
  
  if (emailMatch && loggedMatch && loggedMatch[1] === 'true' && emailMatch[1] === ADMIN_EMAIL) {
    return emailMatch[1];
  }
  
  return null;
}

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