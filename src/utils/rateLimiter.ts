import { NextApiRequest, NextApiResponse } from 'next';

const requests = new Map<string, { count: number; reset: number }>();
const MAX_ENTRIES = 10_000;
let cleanupCounter = 0;

function getClientId(req: NextApiRequest): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string') return realIp;
  }
  return req.socket?.remoteAddress || 'unknown';
}

/** Klucz per endpoint – żeby galeria/status nie zjadały limitu logowania. */
function getRateLimitKey(req: NextApiRequest, suffix: string): string {
  const client = getClientId(req);
  const path = typeof req.url === 'string' ? req.url.split('?')[0] : suffix;
  return `${client}|${path || suffix}`;
}

function cleanupExpired(now: number): void {
  for (const [key, entry] of requests.entries()) {
    if (now > entry.reset) requests.delete(key);
  }
}

/**
 * Sprawdza limit żądań. Zwraca true jeśli dozwolone, false jeśli przekroczono.
 * Czyści wygasłe wpisy co ~50 żądań lub gdy mapa przekracza MAX_ENTRIES.
 */
export function checkRateLimit(
  req: NextApiRequest,
  maxRequests: number,
  windowMs: number,
  keySuffix: string = ''
): boolean {
  const key = getRateLimitKey(req, keySuffix);
  const now = Date.now();

  cleanupCounter++;
  if (requests.size > MAX_ENTRIES || cleanupCounter % 50 === 0) {
    cleanupExpired(now);
    if (cleanupCounter >= 50) cleanupCounter = 0;
  }

  const entry = requests.get(key);

  if (!entry || now > entry.reset) {
    requests.set(key, { count: 1, reset: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

function getRemaining(req: NextApiRequest, maxRequests: number, keySuffix: string): number {
  const key = getRateLimitKey(req, keySuffix);
  const entry = requests.get(key);
  if (!entry) return maxRequests;
  return Math.max(0, maxRequests - entry.count);
}

function getResetTime(req: NextApiRequest, windowMs: number, keySuffix: string): number {
  const key = getRateLimitKey(req, keySuffix);
  const entry = requests.get(key);
  return entry ? entry.reset : Date.now() + windowMs;
}

export function withRateLimit(
  maxRequests: number = 10,
  windowMs: number = 60000
) {
  return function rateLimitMiddleware(
    handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
  ) {
    return async function (req: NextApiRequest, res: NextApiResponse) {
      const keySuffix = typeof req.url === 'string' ? req.url.split('?')[0] : '';
      const isAllowed = checkRateLimit(req, maxRequests, windowMs, keySuffix);

      if (!isAllowed) {
        const resetTime = getResetTime(req, windowMs, keySuffix);
        const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

        res.setHeader('X-RateLimit-Limit', String(maxRequests));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', String(resetTime));
        res.setHeader('Retry-After', String(retryAfter));

        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter,
        });
      }

      const remaining = getRemaining(req, maxRequests, keySuffix);
      const resetTime = getResetTime(req, windowMs, keySuffix);

      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(resetTime));

      return handler(req, res);
    };
  };
}
