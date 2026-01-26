import { NextApiRequest, NextApiResponse } from 'next';
import { LoginRequest } from '../../../../src/types/auth';
import { getAdminCode, removeAdminCode, cleanupExpiredAdminCodes, loginAdmin } from '../../../../src/utils/storage';
import { logger } from '../../../../src/utils/logger';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { withRateLimit } from '../../../../src/utils/rateLimiter';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Oczyść wygasłe kody
    cleanupExpiredAdminCodes();

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
    const isEmergencyCode = emergencyCode && code.toUpperCase() === emergencyCode.toUpperCase();

    if (isEmergencyCode) {
      logger.warn('Emergency code used for admin login');
      loginAdmin(email);
    } else {
      // Standardowa weryfikacja kodu
      const adminCode = getAdminCode(email);

      if (!adminCode) {
        return res.status(404).json({ error: 'No active admin code for this email' });
      }

      // Sprawdź czy kod nie wygasł
      if (new Date() > adminCode.expiresAt) {
        removeAdminCode(email);
        return res.status(410).json({ error: 'Admin code has expired' });
      }

      // Sprawdź czy kod się zgadza
      if (adminCode.code !== code.toUpperCase()) {
        return res.status(401).json({ error: 'Invalid admin code' });
      }

      // Kod poprawny - usuń z aktywnych i zaloguj admina
      removeAdminCode(email);
      loginAdmin(email);
    }

    // Ustaw admin cookie
    res.setHeader('Set-Cookie', [
      `admin_email=${email}; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict`,
      `admin_logged=true; Path=/; Max-Age=43200; SameSite=Strict`
    ]);

    logger.info('Administrator zalogowany', { email });

    res.status(200).json({ 
      message: 'Admin login successful',
      email,
      success: true
    });

  } catch (error) {
    logger.error('Error verifying admin code', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 5 prób na minutę na weryfikację kodu admina
export default withRateLimit(5, 60000)(handler);