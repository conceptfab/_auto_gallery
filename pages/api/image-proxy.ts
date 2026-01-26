import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url, size = 'full' } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  try {
    // Dekoduj URL
    const imageUrl = decodeURIComponent(url);
    
    // Sprawdź czy to już jest URL do conceptfab.com (bezpośredni)
    if (imageUrl.includes('conceptfab.com/__metro/gallery/')) {
      // Wyciągnij folder i nazwę pliku z URL galerii
      const galleryMatch = imageUrl.match(/gallery\/(.+)$/);
      if (!galleryMatch) {
        res.redirect(302, imageUrl);
        return;
      }
      
      const fullPath = galleryMatch[1];
      const pathParts = fullPath.split('/');
      const fileName = pathParts.pop() || '';
      const folderName = pathParts.join('/') || '';
      
      const baseName = path.parse(fileName).name;
      
      // Określ ścieżkę do cache'a
      const cacheDir = path.join(process.cwd(), 'public', 'cache', folderName);
      
      // Sprawdź dostępne formaty w kolejności preferencji: AVIF -> WebP -> oryginalny
      const formats = ['avif', 'webp'];
      let cachedPath: string | null = null;
      let contentType = 'image/jpeg';
      
      for (const fmt of formats) {
        const formatPath = path.join(cacheDir, `${baseName}_${size}.${fmt}`);
        if (fs.existsSync(formatPath)) {
          cachedPath = formatPath;
          contentType = fmt === 'avif' ? 'image/avif' : 'image/webp';
          break;
        }
      }
      
      // Jeśli nie ma cache'a, zwróć oryginalny URL
      if (!cachedPath) {
        res.redirect(302, imageUrl);
        return;
      }
      
      // Sprawdź typ akceptowany przez klienta
      const acceptHeader = req.headers.accept || '';
      
      // Jeśli klient nie obsługuje AVIF/WebP, zwróć oryginalny
      if (cachedPath.endsWith('.avif') && !acceptHeader.includes('image/avif')) {
        // Spróbuj WebP fallback
        const webpPath = path.join(cacheDir, `${baseName}_${size}.webp`);
        if (fs.existsSync(webpPath) && acceptHeader.includes('image/webp')) {
          cachedPath = webpPath;
          contentType = 'image/webp';
        } else {
          res.redirect(302, imageUrl);
          return;
        }
      }
      
      if (cachedPath.endsWith('.webp') && !acceptHeader.includes('image/webp')) {
        res.redirect(302, imageUrl);
        return;
      }
      
      // Odczytaj i zwróć cache'owany plik
      const imageBuffer = fs.readFileSync(cachedPath);
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 rok
      res.setHeader('ETag', `"${baseName}_${size}_${path.extname(cachedPath)}"`);
      res.send(imageBuffer);
    } else {
      // Dla innych URL (np. file-proxy.php), przekieruj bezpośrednio
      res.redirect(302, imageUrl);
    }
    
  } catch (error) {
    res.redirect(302, url as string);
  }
}