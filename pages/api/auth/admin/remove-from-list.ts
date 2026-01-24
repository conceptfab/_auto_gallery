import { NextApiRequest, NextApiResponse } from 'next';
import { removeFromWhitelist, removeFromBlacklist, getWhitelist, getBlacklist } from '../../../../src/utils/storage';

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
    // Sprawdź autoryzację admina
    const adminEmail = getAdminEmailFromCookie(req);
    if (!adminEmail) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { email, listType }: { email: string; listType: 'whitelist' | 'blacklist' } = req.body;

    if (!email || !listType) {
      return res.status(400).json({ error: 'Email and listType required' });
    }

    if (listType === 'whitelist') {
      const whitelist = getWhitelist();
      if (!whitelist.includes(email)) {
        return res.status(404).json({ error: 'Email not found in whitelist' });
      }
      removeFromWhitelist(email);
      console.log('🗑️ Usunięto email z białej listy:', email);
    } else if (listType === 'blacklist') {
      const blacklist = getBlacklist();
      if (!blacklist.includes(email)) {
        return res.status(404).json({ error: 'Email not found in blacklist' });
      }
      removeFromBlacklist(email);
      console.log('🗑️ Usunięto email z czarnej listy:', email);
    } else {
      return res.status(400).json({ error: 'Invalid listType. Use "whitelist" or "blacklist"' });
    }

    res.status(200).json({ 
      message: `Email removed from ${listType}`,
      email 
    });

  } catch (error) {
    console.error('Error removing email from list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
