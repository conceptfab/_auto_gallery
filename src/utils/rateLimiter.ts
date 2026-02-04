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
  windowMs: number
): boolean {
  const clientId = getClientId(req);
  const now = Date.now();

  cleanupCounter++;
  if (requests.size > MAX_ENTRIES || cleanupCounter % 50 === 0) {
    cleanupExpired(now);
    if (cleanupCounter >= 50) cleanupCounter = 0;
  }

  const entry = requests.get(clientId);

  if (!entry || now > entry.reset) {
    requests.set(clientId, { count: 1, reset: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

function getRemaining(req: NextApiRequest, maxRequests: number): number {
  const clientId = getClientId(req);
  const entry = requests.get(clientId);
  if (!entry) return maxRequests;
  return Math.max(0, maxRequests - entry.count);
}

function getResetTime(req: NextApiRequest, windowMs: number): number {
  const clientId = getClientId(req);
  const entry = requests.get(clientId);
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
      const isAllowed = checkRateLimit(req, maxRequests, windowMs);

      if (!isAllowed) {
        const resetTime = getResetTime(req, windowMs);
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

      const remaining = getRemaining(req, maxRequests);
      const resetTime = getResetTime(req, windowMs);

      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(resetTime));

      return handler(req, res);
    };
  };
}
