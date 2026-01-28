import type { NextApiRequest } from 'next';
import type { DeviceInfo } from '../types/stats';

/**
 * Wyciąga IP adres z requestu Next.js
 * Obsługuje proxy headers (x-forwarded-for, x-real-ip)
 */
export function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];

  if (typeof forwarded === 'string') {
    // x-forwarded-for może zawierać wiele IP oddzielonych przecinkami
    return forwarded.split(',')[0].trim();
  }

  if (typeof realIp === 'string') {
    return realIp;
  }

  return req.socket.remoteAddress || 'unknown';
}

/**
 * Parsuje userAgent string i wyciąga informacje o przeglądarce i systemie operacyjnym
 */
export function parseUserAgent(userAgent?: string): {
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
} {
  if (!userAgent || userAgent === 'unknown') {
    return {};
  }

  const ua = userAgent.toLowerCase();
  const result: {
    browser?: string;
    browserVersion?: string;
    os?: string;
    osVersion?: string;
    deviceType?: 'desktop' | 'mobile' | 'tablet';
  } = {};

  // Wykrywanie przeglądarki
  if (ua.includes('edg/')) {
    result.browser = 'Edge';
    const match = userAgent.match(/edg\/([\d.]+)/i);
    if (match) result.browserVersion = match[1];
  } else if (ua.includes('chrome/') && !ua.includes('edg/')) {
    result.browser = 'Chrome';
    const match = userAgent.match(/chrome\/([\d.]+)/i);
    if (match) result.browserVersion = match[1];
  } else if (ua.includes('firefox/')) {
    result.browser = 'Firefox';
    const match = userAgent.match(/firefox\/([\d.]+)/i);
    if (match) result.browserVersion = match[1];
  } else if (ua.includes('safari/') && !ua.includes('chrome/')) {
    result.browser = 'Safari';
    const match = userAgent.match(/version\/([\d.]+).*safari/i);
    if (match) result.browserVersion = match[1];
  } else if (ua.includes('opera/') || ua.includes('opr/')) {
    result.browser = 'Opera';
    const match = userAgent.match(/(?:opera|opr)\/([\d.]+)/i);
    if (match) result.browserVersion = match[1];
  }

  // Wykrywanie systemu operacyjnego
  if (ua.includes('windows nt')) {
    result.os = 'Windows';
    const match = userAgent.match(/windows nt ([\d.]+)/i);
    if (match) {
      const version = match[1];
      // Mapowanie wersji Windows
      if (version === '10.0') result.osVersion = '10';
      else if (version === '6.3') result.osVersion = '8.1';
      else if (version === '6.2') result.osVersion = '8';
      else if (version === '6.1') result.osVersion = '7';
      else result.osVersion = version;
    }
  } else if (ua.includes('mac os x') || ua.includes('macintosh')) {
    result.os = 'macOS';
    const match = userAgent.match(/mac os x ([\d_]+)/i);
    if (match) {
      result.osVersion = match[1].replace(/_/g, '.');
    }
  } else if (ua.includes('linux')) {
    result.os = 'Linux';
    // Linux nie ma standardowej wersji w userAgent
  } else if (ua.includes('android')) {
    result.os = 'Android';
    const match = userAgent.match(/android ([\d.]+)/i);
    if (match) result.osVersion = match[1];
    result.deviceType = 'mobile';
  } else if (
    ua.includes('iphone') ||
    ua.includes('ipad') ||
    ua.includes('ipod')
  ) {
    result.os = 'iOS';
    const match = userAgent.match(/os ([\d_]+)/i);
    if (match) {
      result.osVersion = match[1].replace(/_/g, '.');
    }
    if (ua.includes('ipad')) {
      result.deviceType = 'tablet';
    } else {
      result.deviceType = 'mobile';
    }
  }

  // Jeśli nie wykryto typu urządzenia, domyślnie desktop
  if (
    !result.deviceType &&
    result.os &&
    result.os !== 'Android' &&
    result.os !== 'iOS'
  ) {
    result.deviceType = 'desktop';
  }

  return result;
}

/**
 * Tworzy obiekt DeviceInfo z requestu i opcjonalnych danych z klienta
 */
export function createDeviceInfo(
  req: NextApiRequest,
  clientData?: {
    screenWidth?: number;
    screenHeight?: number;
    language?: string;
  },
): DeviceInfo {
  const userAgent = req.headers['user-agent'] || undefined;
  const parsed = parseUserAgent(userAgent);

  return {
    ...parsed,
    screenWidth: clientData?.screenWidth,
    screenHeight: clientData?.screenHeight,
    language:
      clientData?.language ||
      req.headers['accept-language']?.split(',')[0]?.split(';')[0]?.trim(),
  };
}
