import crypto from 'crypto';
import { NextApiRequest, NextApiResponse } from 'next';
import { ADMIN_EMAIL } from '../config/constants';

const isProduction = process.env.NODE_ENV === 'production';
const cookieSecure = isProduction ? '; Secure' : '';

function getCookieSecret(): string {
  const secret = process.env.COOKIE_SECRET || process.env.FILE_PROXY_SECRET;
  if (isProduction && (!secret || secret.length < 16)) {
    throw new Error(
      'COOKIE_SECRET lub FILE_PROXY_SECRET musi być ustawiony (min. 16 znaków) w produkcji. Ustaw zmienną środowiskową.'
    );
  }
  return secret || 'dev-cookie-secret';
}
const COOKIE_SECRET = getCookieSecret();

/** Podpisuje wartość HMAC-SHA256 i zwraca wartość w formacie `value.signature`. */
function signCookieValue(value: string): string {
  const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(value).digest('hex');
  return `${value}.${sig}`;
}

/** Weryfikuje podpis cookie. Zwraca oryginalną wartość lub null jeśli nieprawidłowy. */
function verifyCookieValue(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(value).digest('hex');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return value;
}

export function setAuthCookie(res: NextApiResponse, email: string, maxAgeSeconds = 43200): void {
  const signedEmail = signCookieValue(email);
  res.setHeader('Set-Cookie', [
    `auth_email=${signedEmail}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${cookieSecure}`,
    `auth_logged=true; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Strict${cookieSecure}`,
  ]);
}

export function setAdminCookie(res: NextApiResponse, email: string, maxAgeSeconds: number): void {
  const signedEmail = signCookieValue(email);
  res.setHeader('Set-Cookie', [
    `admin_email=${signedEmail}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${cookieSecure}`,
    `admin_logged=true; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Strict; HttpOnly${cookieSecure}`,
  ]);
}

export function clearAuthCookie(res: NextApiResponse): void {
  res.setHeader('Set-Cookie', [
    `auth_email=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${cookieSecure}`,
    `auth_logged=; Path=/; Max-Age=0; SameSite=Strict${cookieSecure}`,
    `session_id=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${cookieSecure}`,
    `stats_session_id=; Path=/; Max-Age=0; SameSite=Strict${cookieSecure}`,
  ]);
}

/** Odczytuje i weryfikuje podpisane cookie email. */
function extractVerifiedEmail(rawValue: string): string | null {
  return verifyCookieValue(rawValue);
}

export function getEmailFromCookie(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;

  // Sprawdź najpierw ciasteczka admina
  const adminEmailMatch = cookies.match(/admin_email=([^;]*)/);
  const adminLoggedMatch = cookies.match(/admin_logged=([^;]*)/);

  if (adminEmailMatch && adminLoggedMatch && adminLoggedMatch[1] === 'true') {
    const email = extractVerifiedEmail(adminEmailMatch[1]);
    if (email) return email;
  }

  // Potem sprawdź zwykłe ciasteczka użytkownika
  const emailMatch = cookies.match(/auth_email=([^;]*)/);
  const loggedMatch = cookies.match(/auth_logged=([^;]*)/);

  if (emailMatch && loggedMatch && loggedMatch[1] === 'true') {
    const email = extractVerifiedEmail(emailMatch[1]);
    if (email) return email;
  }

  return null;
}

export function getAdminEmailFromCookie(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;

  const emailMatch = cookies.match(/admin_email=([^;]*)/);
  const loggedMatch = cookies.match(/admin_logged=([^;]*)/);

  if (emailMatch && loggedMatch && loggedMatch[1] === 'true') {
    const email = extractVerifiedEmail(emailMatch[1]);
    if (
      email &&
      email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase()
    ) {
      return email;
    }
  }

  return null;
}

/** Generuje 6-znakowy kod do logowania (kryptograficznie bezpieczny). */
export function generateCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}
