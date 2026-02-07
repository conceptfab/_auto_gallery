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

const MIN_RESPONSE_MS = 800;

async function requestCodeHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  /** Wyślij odpowiedź z normalizowanym opóźnieniem (anti-timing attack). */
  async function sendNormalized(statusCode: number, body: object) {
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, MIN_RESPONSE_MS - elapsed);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    return res.status(statusCode).json(body);
  }

  try {
    // Oczyść wygasłe kody przed przetwarzaniem
    await cleanupExpiredCodes();

    const { email }: EmailRequest = req.body;

    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!email || !EMAIL_REGEX.test(email)) {
      return sendNormalized(400, { error: 'Invalid email address' });
    }

    // Dodatkowa walidacja długości
    if (email.length > 254) {
      return sendNormalized(400, { error: 'Email too long' });
    }

    // Normalizuj email do lowercase dla spójnych porównań
    const normalizedEmail = email.trim().toLowerCase();

    // Sprawdź czy email jest na czarnej liście (case-insensitive)
    const blacklist = await getBlacklist();
    const blacklistLower = blacklist.map((e) => e.toLowerCase());
    if (blacklistLower.includes(normalizedEmail)) {
      // Zwracamy generyczny komunikat — nie zdradzamy statusu emaila
      return sendNormalized(200, { message: 'Request processed', email: normalizedEmail });
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

        return sendNormalized(200, {
          message: 'Request processed',
          email: normalizedEmail,
        });
      } catch (emailError) {
        logger.error('Błąd wysyłania kodu do użytkownika', emailError);
        return sendNormalized(500, { error: 'Failed to send code' });
      }
    }

    // Email nie jest na białej liście - standardowy proces (pending + powiadomienie do admina)
    // Sprawdź czy email nie został już wysłany w ostatnich 5 minutach (case-insensitive)
    const pendingEmails = await getPendingEmails();
    const existing = pendingEmails.find((pe) => pe.email.toLowerCase() === normalizedEmail);
    if (existing && Date.now() - existing.timestamp.getTime() < 5 * 60 * 1000) {
      return sendNormalized(200, { message: 'Request processed', email: normalizedEmail });
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

    return sendNormalized(200, {
      message: 'Request processed',
      email: normalizedEmail,
    });
  } catch (error) {
    logger.error('Error processing login request', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 10 żądań na 15 minut na IP (ograniczenie spamu, bez blokowania przy podwójnym kliku)
export default withRateLimit(10, 15 * 60 * 1000)(requestCodeHandler);
