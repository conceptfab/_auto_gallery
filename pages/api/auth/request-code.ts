import { NextApiRequest, NextApiResponse } from 'next';
import { sendAdminNotification, sendLoginCode } from '../../../src/utils/email';
import { EmailRequest, LoginCode } from '../../../src/types/auth';
import { 
  addPendingEmail, 
  getPendingEmails, 
  getWhitelist, 
  getBlacklist,
  addActiveCode,
  cleanupExpiredCodes
} from '../../../src/utils/storage';

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

    const { email }: EmailRequest = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Sprawdź czy email jest na czarnej liście
    const blacklist = getBlacklist();
    if (blacklist.includes(email)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Sprawdź czy email jest na białej liście
    const whitelist = getWhitelist();
    if (whitelist.includes(email)) {
      // Email jest na białej liście - wygeneruj i wyślij kod od razu
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
      try {
        await sendLoginCode(email, code);
        console.log('✅ Kod wysłany automatycznie do użytkownika z białej listy:', email);
        
        res.status(200).json({ 
          message: 'Code sent to your email',
          email 
        });
        return;
      } catch (emailError) {
        console.error('❌ Błąd wysyłania kodu do użytkownika:', emailError);
        return res.status(500).json({ error: 'Failed to send code' });
      }
    }

    // Email nie jest na białej liście - standardowy proces (pending + powiadomienie do admina)
    // Sprawdź czy email nie został już wysłany w ostatnich 5 minutach
    const pendingEmails = getPendingEmails();
    const existing = pendingEmails.find(pe => pe.email === email);
    if (existing && Date.now() - existing.timestamp.getTime() < 5 * 60 * 1000) {
      return res.status(429).json({ error: 'Please wait before requesting another code' });
    }

    // Zapisz email jako oczekujący
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ipString = typeof clientIp === 'string' ? clientIp : clientIp?.[0] || 'unknown';
    
    addPendingEmail(email, ipString);
    
    const updatedPendingEmails = getPendingEmails();
    console.log('📧 Dodano pending email:', email, 'Total pending:', updatedPendingEmails.length);

    // Wyślij powiadomienie do admina
    try {
      await sendAdminNotification(email, ipString);
      console.log('✅ Email do admina wysłany pomyślnie');
    } catch (emailError) {
      console.error('❌ Błąd wysyłania emaila do admina:', emailError);
      // Nie przerywaj procesu - pending email został już dodany
    }

    res.status(200).json({ 
      message: 'Request sent to admin for approval',
      email 
    });

  } catch (error) {
    console.error('Error processing login request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}