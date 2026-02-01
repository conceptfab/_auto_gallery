import { NextApiRequest, NextApiResponse } from 'next';
import {
  getAdminCode,
  removeAdminCode,
  cleanupExpiredAdminCodes,
  loginAdmin,
} from '../../../../src/utils/storage';

import { ADMIN_EMAIL } from '../../../../src/config/constants';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Oczyść wygasłe kody
    await cleanupExpiredAdminCodes();

    const { code }: { code: string } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code required' });
    }

    // Zawsze używaj skonfigurowanego emaila administratora
    const email = ADMIN_EMAIL;

    if (!email) {
      return res.status(500).json({ error: 'Admin email not configured' });
    }

    // Sprawdź czy używa kodu awaryjnego
    const emergencyCode = process.env.ADMIN_EMERGENCY_CODE;
    const isEmergencyCode =
      emergencyCode && code.toUpperCase() === emergencyCode.toUpperCase();

    if (isEmergencyCode) {
      console.log('🆘 Używa kodu awaryjnego do logowania administratora');
      await loginAdmin(email);
    } else {
      // Standardowa weryfikacja kodu
      const adminCode = await getAdminCode(email);

      if (!adminCode) {
        return res
          .status(404)
          .json({ error: 'No active admin code for this email' });
      }

      // Sprawdź czy kod nie wygasł
      if (new Date() > adminCode.expiresAt) {
        await removeAdminCode(email);
        return res.status(410).json({ error: 'Admin code has expired' });
      }

      // Sprawdź czy kod się zgadza
      if (adminCode.code !== code.toUpperCase()) {
        return res.status(401).json({ error: 'Invalid admin code' });
      }

      // Kod poprawny - usuń z aktywnych i zaloguj admina
      await removeAdminCode(email);
      await loginAdmin(email);
    }

    // Ustaw admin cookie
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
      `admin_email=${email}; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict${secure}`,
      `admin_logged=true; Path=/; Max-Age=43200; SameSite=Strict${secure}`,
    ]);

    console.log('👑 Administrator zalogowany:', email);

    res.status(200).json({
      message: 'Admin login successful',
      email,
      success: true,
    });
  } catch (error) {
    console.error('Error verifying admin code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
