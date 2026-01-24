import { NextApiRequest, NextApiResponse } from 'next';
import { sendLoginCode } from '../../../../src/utils/email';
import { AdminAction, LoginCode } from '../../../../src/types/auth';
import { 
  storage, 
  removePendingEmail, 
  addToWhitelist, 
  addToBlacklist, 
  addActiveCode,
  cleanupExpiredCodes 
} from '../../../../src/utils/storage';

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Oczyść wygasłe kody przed przetwarzaniem
    cleanupExpiredCodes();

    const { email, action }: AdminAction = req.body;

    if (!email || !action) {
      return res.status(400).json({ error: 'Email and action required' });
    }

    if (!storage.pendingEmails.has(email)) {
      return res.status(404).json({ error: 'Email not found in pending requests' });
    }

    if (action === 'approve') {
      // Dodaj do whitelist
      addToWhitelist(email);
      
      // Wygeneruj kod
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minut
      
      const loginCode: LoginCode = {
        email,
        code,
        expiresAt,
        createdAt: new Date()
      };

      addActiveCode(email, loginCode);

      // Wyślij kod na email
      await sendLoginCode(email, code);

      // Usuń z pending
      removePendingEmail(email);

      res.status(200).json({ 
        message: 'Email approved and code sent',
        email,
        expiresAt 
      });

    } else if (action === 'reject') {
      // Dodaj do blacklist
      addToBlacklist(email);
      
      // Usuń z pending
      removePendingEmail(email);

      res.status(200).json({ 
        message: 'Email rejected and added to blacklist',
        email 
      });

    } else {
      res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Error managing email:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Export już niepotrzebny - używamy globalnego storage