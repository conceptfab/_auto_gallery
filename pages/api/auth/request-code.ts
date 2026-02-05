import { NextApiRequest, NextApiResponse } from 'next';
import { sendAdminNotification, sendLoginCode } from '../../../src/utils/email';
import { EmailRequest, LoginCode } from '../../../src/types/auth';
import {
  addPendingEmail,
  getPendingEmails,
  getWhitelist,
  getBlacklist,
  addActiveCode,
  cleanupExpiredCodes,
} from '../../../src/utils/storage';
import { logger } from '../../../src/utils/logger';
import { generateCode } from '../../../src/utils/auth';
import { withRateLimit } from '../../../src/utils/rateLimiter';

async function requestCodeHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Oczyść wygasłe kody przed przetwarzaniem
    await cleanupExpiredCodes();

    const { email }: EmailRequest = req.body;

    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Dodatkowa walidacja długości
    if (email.length > 254) {
      return res.status(400).json({ error: 'Email too long' });
    }

    // Normalizuj email do lowercase dla spójnych porównań
    const normalizedEmail = email.trim().toLowerCase();

    // Sprawdź czy email jest na czarnej liście (case-insensitive)
    const blacklist = await getBlacklist();
    const blacklistLower = blacklist.map((e) => e.toLowerCase());
    if (blacklistLower.includes(normalizedEmail)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Sprawdź czy email jest na białej liście (case-insensitive)
    const whitelist = await getWhitelist();
    const whitelistLower = whitelist.map((e) => e.toLowerCase());
    if (whitelistLower.includes(normalizedEmail)) {
      // Email jest na białej liście - wygeneruj i wyślij kod od razu
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minut

      const loginCode: LoginCode = {
        email: normalizedEmail,
        code,
        expiresAt,
        createdAt: new Date(),
      };

      await addActiveCode(normalizedEmail, loginCode);

      // Wyślij kod na email (używamy oryginalnego emaila dla wysyłki)
      try {
        await sendLoginCode(normalizedEmail, code);
        logger.info(
          'Kod wysłany automatycznie do użytkownika z białej listy:',
          normalizedEmail
        );

        res.status(200).json({
          message: 'Code sent to your email',
          email: normalizedEmail,
        });
        return;
      } catch (emailError) {
        logger.error('Błąd wysyłania kodu do użytkownika', emailError);
        return res.status(500).json({ error: 'Failed to send code' });
      }
    }

    // Email nie jest na białej liście - standardowy proces (pending + powiadomienie do admina)
    // Sprawdź czy email nie został już wysłany w ostatnich 5 minutach (case-insensitive)
    const pendingEmails = await getPendingEmails();
    const existing = pendingEmails.find((pe) => pe.email.toLowerCase() === normalizedEmail);
    if (existing && Date.now() - existing.timestamp.getTime() < 5 * 60 * 1000) {
      return res
        .status(429)
        .json({ error: 'Please wait before requesting another code' });
    }

    // Zapisz email jako oczekujący (znormalizowany)
    const clientIp =
      req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ipString =
      typeof clientIp === 'string' ? clientIp : clientIp?.[0] || 'unknown';

    await addPendingEmail(normalizedEmail, ipString);

    const updatedPendingEmails = await getPendingEmails();
    logger.debug(
      'Dodano pending email:',
      normalizedEmail,
      'Total pending:',
      updatedPendingEmails.length
    );

    // Wyślij powiadomienie do admina
    try {
      await sendAdminNotification(normalizedEmail, ipString);
      logger.info('Email do admina wysłany pomyślnie');
    } catch (emailError) {
      logger.error('Błąd wysyłania emaila do admina', emailError);
      // Nie przerywaj procesu - pending email został już dodany
    }

    res.status(200).json({
      message: 'Request sent to admin for approval',
      email: normalizedEmail,
    });
  } catch (error) {
    logger.error('Error processing login request', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 5 żądań na 15 minut na IP (ograniczenie spamu i powiadomień)
export default withRateLimit(5, 15 * 60 * 1000)(requestCodeHandler);
