import { NextApiRequest, NextApiResponse } from 'next';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup() {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.requests.forEach((entry, key) => {
      if (now > entry.resetTime) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.requests.delete(key);
    });
  }

  private getClientId(req: NextApiRequest): string {
    // Try to get real IP from headers (for proxied requests)
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    
    if (typeof realIp === 'string') {
      return realIp;
    }
    
    return req.socket.remoteAddress || 'unknown';
  }

  checkLimit(req: NextApiRequest, maxRequests: number, windowMs: number): boolean {
    const clientId = this.getClientId(req);
    const now = Date.now();
    const resetTime = now + windowMs;
    
    const existing = this.requests.get(clientId);
    
    if (!existing || now > existing.resetTime) {
      // First request in window or window expired
      this.requests.set(clientId, {
        count: 1,
        resetTime
      });
      return true;
    }
    
    if (existing.count >= maxRequests) {
      return false;
    }
    
    // Increment counter
    existing.count++;
    return true;
  }

  getRemainingRequests(req: NextApiRequest, maxRequests: number): number {
    const clientId = this.getClientId(req);
    const existing = this.requests.get(clientId);
    
    if (!existing) {
      return maxRequests;
    }
    
    return Math.max(0, maxRequests - existing.count);
  }

  getResetTime(req: NextApiRequest): number | null {
    const clientId = this.getClientId(req);
    const existing = this.requests.get(clientId);
    
    return existing ? existing.resetTime : null;
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global instance z ochroną przed memory leak w development
declare global {
  var rateLimiterInstance: RateLimiter | undefined;
}

// W development używaj globalnej instancji, w production nową
const globalRateLimiter = 
  process.env.NODE_ENV !== 'production' && global.rateLimiterInstance
    ? global.rateLimiterInstance
    : new RateLimiter();

if (process.env.NODE_ENV !== 'production') {
  global.rateLimiterInstance = globalRateLimiter;
}

export function withRateLimit(
  maxRequests: number = 10,
  windowMs: number = 60000 // 1 minute
) {
  return function rateLimitMiddleware(
    handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
  ) {
    return async function (req: NextApiRequest, res: NextApiResponse) {
      const isAllowed = globalRateLimiter.checkLimit(req, maxRequests, windowMs);
      
      if (!isAllowed) {
        const resetTime = globalRateLimiter.getResetTime(req);
        const retryAfter = resetTime ? Math.ceil((resetTime - Date.now()) / 1000) : 60;
        
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', resetTime || Date.now() + windowMs);
        res.setHeader('Retry-After', retryAfter);
        
        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter
        });
      }
      
      const remaining = globalRateLimiter.getRemainingRequests(req, maxRequests);
      const resetTime = globalRateLimiter.getResetTime(req);
      
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      if (resetTime) {
        res.setHeader('X-RateLimit-Reset', resetTime);
      }
      
      return handler(req, res);
    };
  };
}

export default globalRateLimiter;