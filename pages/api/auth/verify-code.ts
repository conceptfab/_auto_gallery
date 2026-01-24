import { NextApiRequest, NextApiResponse } from 'next';
import { LoginRequest } from '../../../src/types/auth';
import { getActiveCode, removeActiveCode, cleanupExpiredCodes } from '../../../src/utils/storage';
import { loginUser, setAuthCookie } from '../../../src/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Oczyść wygasłe kody przed weryfikacją
    cleanupExpiredCodes();

    const { email, code }: LoginRequest = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code required' });
    }

    const loginCode = getActiveCode(email);

    if (!loginCode) {
      return res.status(404).json({ error: 'No active code for this email' });
    }

    // Sprawdź czy kod nie wygasł
    if (new Date() > loginCode.expiresAt) {
      removeActiveCode(email);
      return res.status(410).json({ error: 'Code has expired' });
    }

    // Sprawdź czy kod się zgadza
    if (loginCode.code !== code.toUpperCase()) {
      return res.status(401).json({ error: 'Invalid code' });
    }

    // Kod poprawny - usuń z aktywnych
    removeActiveCode(email);

    // Zaloguj użytkownika i ustaw ciasteczka
    loginUser(email);
    setAuthCookie(res, email);

    res.status(200).json({ 
      message: 'Login successful',
      email,
      success: true
    });

  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}