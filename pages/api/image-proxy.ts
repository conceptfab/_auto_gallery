import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const imageUrl = decodeURIComponent(url);
    
    // Ustaw cache headers - CDN (Cloudflare/Vercel) zrobi resztę
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    // Redirect do oryginalnego URL
    res.redirect(301, imageUrl);
  } catch (error) {
    // Fallback redirect w przypadku błędu
    res.redirect(301, url as string);
  }
}