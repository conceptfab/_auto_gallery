import { NextApiRequest, NextApiResponse } from 'next';
import { sendAdminLoginCode } from '../../../../src/utils/email';
import { addAdminCode, cleanupExpiredAdminCodes } from '../../../../src/utils/storage';
import { LoginCode } from '../../../../src/types/auth';
import { logger } from '../../../../src/utils/logger';
import { ADMIN_EMAIL, LOGIN_CODE_EXPIRY_MINUTES } from '../../../../src/config/constants';

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Oczyść wygasłe kody
    cleanupExpiredAdminCodes();

    // Zawsze używaj skonfigurowanego emaila administratora
    const email = ADMIN_EMAIL;
    
    if (!email) {
      return res.status(500).json({ error: 'Admin email not configured' });
    }

    // Wygeneruj kod dla administratora
    const code = generateCode();
    const expiresAt = new Date(Date.now() + LOGIN_CODE_EXPIRY_MINUTES * 60 * 1000);
    
    const adminCode: LoginCode = {
      email,
      code,
      expiresAt,
      createdAt: new Date()
    };

    addAdminCode(email, adminCode);

    // Próbuj wysłać kod na email administratora
    try {
      await sendAdminAccessCode(email, code);
      logger.info('Kod administratora wysłany na email', { email });
      
      res.status(200).json({ 
        message: 'Admin access code sent to email',
        email,
        expiresAt 
      });
    } catch (emailError) {
      logger.error('Błąd wysyłania kodu administratora', { error: emailError });
      // Nie loguj kodu awaryjnego - zapisz go tylko w bezpiecznym miejscu
      logger.warn('Email server unavailable - emergency mode activated');
      
      res.status(200).json({ 
        message: 'Email server unavailable. Contact system administrator.',
        email,
        expiresAt,
        emergencyMode: true
      });
    }

  } catch (error) {
    logger.error('Error generating admin code', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendAdminAccessCode(email: string, code: string): Promise<void> {
  // Używamy funkcji sendAdminLoginCode z oznaczeniem [ADMIN]
  await sendAdminLoginCode(email, code);
}