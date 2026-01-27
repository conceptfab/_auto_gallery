import { NextApiRequest, NextApiResponse } from 'next';

const ALLOWED_DOMAINS = ['conceptfab.com', 'cdn.conceptfab.com'];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const imageUrl = decodeURIComponent(url);

    // Walidacja URL
    const parsedUrl = new URL(imageUrl);

    // Sprawdź protokół
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid protocol' });
    }

    // Sprawdź domenę
    if (
      !ALLOWED_DOMAINS.some((domain) => parsedUrl.hostname.endsWith(domain))
    ) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    // Ustaw cache headers - CDN (Cloudflare/Vercel) zrobi resztę
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Redirect do oryginalnego URL
    res.redirect(301, imageUrl);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL' });
  }
}
