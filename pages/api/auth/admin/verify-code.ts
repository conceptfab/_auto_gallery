import { NextApiRequest, NextApiResponse } from 'next';
import {
  getAdminCode,
  removeAdminCode,
  cleanupExpiredAdminCodes,
  loginAdmin,
  getSessionDurationSeconds,
} from '../../../../src/utils/storage';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { logger } from '../../../../src/utils/logger';
import { setAdminCookie } from '../../../../src/utils/auth';
import { withRateLimit } from '../../../../src/utils/rateLimiter';
import { sendEmergencyCodeAlert } from '../../../../src/utils/email';

// Globalny rate limit na próby emergency code: max 3/godz
const emergencyAttempts: { count: number; resetAt: number } = { count: 0, resetAt: 0 };
const EMERGENCY_MAX_ATTEMPTS = 3;
const EMERGENCY_WINDOW_MS = 60 * 60 * 1000; // 1 godzina

async function handler(
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
      // Rate limit na emergency code: max 3 próby/godz globalnie
      const now = Date.now();
      if (now > emergencyAttempts.resetAt) {
        emergencyAttempts.count = 0;
        emergencyAttempts.resetAt = now + EMERGENCY_WINDOW_MS;
      }
      emergencyAttempts.count++;
      if (emergencyAttempts.count > EMERGENCY_MAX_ATTEMPTS) {
        logger.warn('Emergency code rate limit exceeded');
        return res.status(429).json({ error: 'Too many attempts. Try again later.' });
      }

      // Walidacja siły kodu
      if (emergencyCode.length < 12) {
        logger.warn('ADMIN_EMERGENCY_CODE is too short (min 12 chars). Login blocked.');
        return res.status(500).json({ error: 'Emergency code configuration error' });
      }

      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
      logger.warn('Admin login via emergency code', { email, ip });
      await loginAdmin(email);

      // Fire-and-forget email alert
      sendEmergencyCodeAlert(ip).catch(() => {});
    } else {
      // Standardowa weryfikacja kodu
      const adminCode = await getAdminCode(email);

      if (!adminCode) {
        logger.warn('Admin verify-code: no active code', { email });
        return res
          .status(404)
          .json({ error: 'No active admin code for this email' });
      }

      if (new Date() > adminCode.expiresAt) {
        await removeAdminCode(email);
        return res.status(410).json({ error: 'Admin code has expired' });
      }

      if (adminCode.code !== code.toUpperCase()) {
        logger.warn('Admin verify-code: invalid code attempt', { email });
        return res.status(401).json({ error: 'Invalid admin code' });
      }

      // Kod poprawny - usuń z aktywnych i zaloguj admina
      await removeAdminCode(email);
      await loginAdmin(email);
    }

    // Pobierz czas trwania sesji z ustawień
    const maxAge = await getSessionDurationSeconds();

    // Ustaw podpisane admin cookie
    setAdminCookie(res, email, maxAge);

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

// 5 prób weryfikacji na minutę na IP
export default withRateLimit(5, 60 * 1000)(handler);
