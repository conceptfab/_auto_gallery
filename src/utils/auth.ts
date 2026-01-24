import { NextApiRequest, NextApiResponse } from 'next';
import { loginUser as storageLogin, logoutUser as storageLogout, isUserLoggedIn as storageIsLoggedIn } from './storage';

export function loginUser(email: string): void {
  storageLogin(email);
}

export function logoutUser(email: string): void {
  storageLogout(email);
}

export function isUserLoggedIn(email: string): boolean {
  return storageIsLoggedIn(email);
}

export function setAuthCookie(res: NextApiResponse, email: string): void {
  res.setHeader('Set-Cookie', [
    `auth_email=${email}; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict`,
    `auth_logged=true; Path=/; Max-Age=43200; SameSite=Strict`
  ]);
}

export function clearAuthCookie(res: NextApiResponse): void {
  res.setHeader('Set-Cookie', [
    'auth_email=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
    'auth_logged=; Path=/; Max-Age=0; SameSite=Strict'
  ]);
}

export function getEmailFromCookie(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  
  const emailMatch = cookies.match(/auth_email=([^;]*)/);
  const loggedMatch = cookies.match(/auth_logged=([^;]*)/);
  
  if (emailMatch && loggedMatch && loggedMatch[1] === 'true') {
    return emailMatch[1];
  }
  
  return null;
}