import { NextApiRequest, NextApiResponse } from 'next';
import { sendLoginCode } from '../../../../src/utils/email';
import { addAdminCode, cleanupExpiredAdminCodes } from '../../../../src/utils/storage';
import { LoginCode } from '../../../../src/types/auth';

const ADMIN_EMAIL = 'michal@conceptfab.com';

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

    const { email } = req.body;

    // Sprawdź czy to jest email administratora
    if (email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Unauthorized admin email' });
    }

    // Wygeneruj kod dla administratora
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minut
    
    const adminCode: LoginCode = {
      email,
      code,
      expiresAt,
      createdAt: new Date()
    };

    addAdminCode(email, adminCode);

    // Wyślij kod na email administratora
    await sendAdminAccessCode(email, code);

    console.log('🔑 Wygenerowano kod admina dla:', email);

    res.status(200).json({ 
      message: 'Admin access code sent',
      email,
      expiresAt 
    });

  } catch (error) {
    console.error('Error generating admin code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendAdminAccessCode(email: string, code: string): Promise<void> {
  // Używamy istniejącej funkcji sendLoginCode
  await sendLoginCode(email, code);
}