import { NextApiRequest, NextApiResponse } from 'next';
import { LoginRequest } from '../../../src/types/auth';
import {
  getActiveCode,
  removeActiveCode,
  cleanupExpiredCodes,
  getSessionDurationSeconds,
  loginUser,
} from '../../../src/utils/storage';
import { setAuthCookie } from '../../../src/utils/auth';
import { withRateLimit } from '../../../src/utils/rateLimiter';
import { recordLogin, startSession } from '../../../src/utils/statsStorage';

async function verifyCodeHandler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Oczyść wygasłe kody przed weryfikacją
    await cleanupExpiredCodes();

    const { email, code }: LoginRequest = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code required' });
    }

    // Normalizuj email do lowercase dla spójnych porównań
    const normalizedEmail = email.trim().toLowerCase();

    const loginCode = await getActiveCode(normalizedEmail);

    if (!loginCode) {
      return res.status(404).json({ error: 'No active code for this email' });
    }

    // Sprawdź czy kod nie wygasł
    if (new Date() > loginCode.expiresAt) {
      await removeActiveCode(normalizedEmail);
      return res.status(410).json({ error: 'Code has expired' });
    }

    // Sprawdź czy kod się zgadza
    if (loginCode.code !== code.toUpperCase()) {
      return res.status(401).json({ error: 'Invalid code' });
    }

    // Kod poprawny - usuń z aktywnych
    await removeActiveCode(normalizedEmail);

    // Zaloguj użytkownika (ze znormalizowanym emailem)
    await loginUser(normalizedEmail);

    // Pobierz czas trwania sesji z ustawień
    const maxAge = await getSessionDurationSeconds();

    // Ustaw ciasteczka autoryzacyjne (ze znormalizowanym emailem)
    setAuthCookie(res, normalizedEmail, maxAge);

    // Dane o środowisku klienta
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Zarejestruj logowanie i rozpocznij sesję statystyk
    await recordLogin(normalizedEmail, ip, userAgent);
    const session = await startSession(normalizedEmail, ip, userAgent);

    // Dodaj cookie z session_id (HttpOnly) oraz stats_session_id (widoczne dla frontu),
    // nie nadpisując istniejących
    const existingCookies = res.getHeader('Set-Cookie');
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const sessionCookie = `session_id=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
    const statsSessionCookie = `stats_session_id=${session.id}; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;

    if (Array.isArray(existingCookies)) {
      res.setHeader('Set-Cookie', [
        ...existingCookies,
        sessionCookie,
        statsSessionCookie,
      ]);
    } else if (typeof existingCookies === 'string') {
      res.setHeader('Set-Cookie', [
        existingCookies,
        sessionCookie,
        statsSessionCookie,
      ]);
    } else {
      res.setHeader('Set-Cookie', [sessionCookie, statsSessionCookie]);
    }

    res.status(200).json({
      message: 'Login successful',
      email: normalizedEmail,
      success: true,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Limit 15 prób na minutę (wpisywanie kodu, ewentualne literówki)
export default withRateLimit(15, 60000)(verifyCodeHandler);
