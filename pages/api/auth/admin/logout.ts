import { NextApiRequest, NextApiResponse } from 'next';
import { logoutAdmin } from '../../../../src/utils/storage';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = getAdminEmailFromCookie(req);
    
    if (email) {
      logoutAdmin(email);
      console.log('👑 Administrator wylogowany:', email);
    }
    
    // Wyczyść admin cookies
    res.setHeader('Set-Cookie', [
      'admin_email=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
      'admin_logged=; Path=/; Max-Age=0; SameSite=Strict'
    ]);

    res.status(200).json({ 
      message: 'Admin logged out successfully',
      success: true
    });

  } catch (error) {
    console.error('Error during admin logout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}