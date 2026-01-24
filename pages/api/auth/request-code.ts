import { NextApiRequest, NextApiResponse } from 'next';
import { sendAdminNotification } from '../../../src/utils/email';
import { EmailRequest } from '../../../src/types/auth';
import { addPendingEmail, storage } from '../../../src/utils/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email }: EmailRequest = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Sprawdź czy email nie został już wysłany w ostatnich 5 minutach
    const existing = storage.pendingEmails.get(email);
    if (existing && Date.now() - existing.timestamp.getTime() < 5 * 60 * 1000) {
      return res.status(429).json({ error: 'Please wait before requesting another code' });
    }

    // Zapisz email jako oczekujący
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ipString = typeof clientIp === 'string' ? clientIp : clientIp?.[0] || 'unknown';
    
    addPendingEmail(email, ipString);
    
    console.log('📧 Dodano pending email:', email, 'Total pending:', storage.pendingEmails.size);

    // Wyślij powiadomienie do admina
    await sendAdminNotification(email, ipString);

    res.status(200).json({ 
      message: 'Request sent to admin for approval',
      email 
    });

  } catch (error) {
    console.error('Error processing login request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Export jest już niepotrzebny - używamy globalnego storage