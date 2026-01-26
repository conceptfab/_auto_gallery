import { NextApiRequest, NextApiResponse } from 'next';
import sharp from 'sharp';
import axios from 'axios';
import { logger } from '@/src/utils/logger';
import { generateUploadToken, generateDeleteToken } from '@/src/utils/fileToken';
import { getEmailFromCookie } from '@/src/utils/auth';
import { ADMIN_EMAIL } from '@/src/config/constants';

interface ConvertRequest {
  folderUrl: string;
  deleteOriginals: boolean;
}

interface ConvertProgress {
  current: number;
  total: number;
  currentFile: string;
  stage: 'scanning' | 'converting' | 'deleting' | 'complete' | 'error';
  converted: string[];
  errors: string[];
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź czy to admin
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { folderUrl, deleteOriginals = false }: ConvertRequest = req.body;

    if (!folderUrl || typeof folderUrl !== 'string') {
      return res.status(400).json({ error: 'Folder URL is required' });
    }

    // Walidacja URL - tylko conceptfab.com
    if (!validateFolderUrl(folderUrl)) {
      return res.status(400).json({ 
        error: 'Invalid URL. Only HTTPS URLs from conceptfab.com are allowed' 
      });
    }

    // Uruchom proces konwersji w tle z SSE
    await processFolderConversion(res, folderUrl, deleteOriginals);

  } catch (error) {
    logger.error('Folder conversion API error', error);
    res.status(500).json({ error: 'Folder conversion failed' });
  }
}

async function processFolderConversion(res: NextApiResponse, folderUrl: string, deleteOriginals: boolean) {
  try {
    // Ustaw headers dla SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendProgress = (progress: ConvertProgress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    };

    // Etap 1: Skanuj folder w poszukiwaniu obrazów
    sendProgress({
      current: 0,
      total: 0,
      currentFile: 'Scanning folder...',
      stage: 'scanning',
      converted: [],
      errors: []
    });

    const images = await scanFolderForImages(folderUrl);
    
    if (images.length === 0) {
      sendProgress({
        current: 0,
        total: 0,
        currentFile: 'No convertible images found',
        stage: 'complete',
        converted: [],
        errors: ['No images to convert found in folder']
      });
      res.end();
      return;
    }

    logger.info(`Found ${images.length} images to convert in ${folderUrl}`);

    const converted: string[] = [];
    const errors: string[] = [];

    // Etap 2: Konwertuj każdy obraz
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      sendProgress({
        current: i + 1,
        total: images.length,
        currentFile: image.name,
        stage: 'converting',
        converted: [...converted],
        errors: [...errors]
      });

      try {
        const convertedUrl = await convertImageToWebP(image, folderUrl);
        converted.push(image.name);
        
        // Jeśli konwersja się udała i mamy usuwać oryginały
        if (deleteOriginals && convertedUrl) {
          sendProgress({
            current: i + 1,
            total: images.length,
            currentFile: `Deleting original: ${image.name}`,
            stage: 'deleting',
            converted: [...converted],
            errors: [...errors]
          });

          try {
            await deleteOriginalImage(image.url);
            logger.info(`Deleted original: ${image.name}`);
          } catch (deleteError) {
            logger.error(`Failed to delete original: ${image.name}`, deleteError);
            errors.push(`Failed to delete original: ${image.name}`);
          }
        }

      } catch (error) {
        logger.error(`Failed to convert ${image.name}`, error);
        errors.push(`Failed to convert: ${image.name}`);
      }
    }

    // Etap 3: Zakończenie
    sendProgress({
      current: images.length,
      total: images.length,
      currentFile: 'Conversion complete',
      stage: 'complete',
      converted,
      errors
    });

    logger.info(`Folder conversion complete. Converted: ${converted.length}, Errors: ${errors.length}`);
    res.end();

  } catch (error) {
    logger.error('Folder conversion process error', error);
    res.write(`data: ${JSON.stringify({
      current: 0,
      total: 0,
      currentFile: 'Conversion failed',
      stage: 'error',
      converted: [],
      errors: [`Process error: ${error}`]
    })}\n\n`);
    res.end();
  }
}

async function scanFolderForImages(folderUrl: string): Promise<Array<{name: string, url: string}>> {
  try {
    const response = await axios.get(folderUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    const images: Array<{name: string, url: string}> = [];

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1].trim();
      const text = match[2].replace(/<[^>]*>/g, '').trim();
      
      // Sprawdź czy to jest obraz do konwersji (nie WebP/AVIF)
      const isConvertibleImage = IMAGE_EXTENSIONS.some(ext => 
        href.toLowerCase().endsWith(ext)
      ) && !href.toLowerCase().endsWith('.webp') && !href.toLowerCase().endsWith('.avif');
      
      if (isConvertibleImage) {
        let fullUrl: string;
        if (href.startsWith('/')) {
          fullUrl = `https://conceptfab.com${href}`;
        } else {
          fullUrl = new URL(href, folderUrl).href;
        }

        images.push({
          name: text || href.split('/').pop() || href,
          url: fullUrl
        });
      }
    }

    return images;
  } catch (error) {
    logger.error('Error scanning folder for images', { folderUrl, error });
    return [];
  }
}

async function convertImageToWebP(image: {name: string, url: string}, folderUrl: string): Promise<string | null> {
  try {
    // Pobierz oryginalny obraz
    const response = await axios.get(image.url, { 
      responseType: 'arraybuffer',
      timeout: 30000 
    });
    const imageBuffer = Buffer.from(response.data);

    // Konwertuj do WebP
    const webpBuffer = await sharp(imageBuffer)
      .webp({ quality: 90 })
      .toBuffer();

    // Utwórz nową nazwę pliku z rozszerzeniem .webp
    const originalName = image.name;
    const baseName = originalName.replace(/\.[^.]+$/, '');
    const webpFileName = `${baseName}.webp`;

    // Upload converted file (tutaj trzeba będzie dostosować do systemu uploadowania)
    const uploadedUrl = await uploadConvertedFile(webpBuffer, webpFileName, folderUrl);
    
    logger.info(`Converted ${originalName} to ${webpFileName}`);
    return uploadedUrl;

  } catch (error) {
    logger.error(`Error converting image ${image.name}`, error);
    throw error;
  }
}

async function uploadConvertedFile(buffer: Buffer, fileName: string, folderUrl: string): Promise<string> {
  try {
    // Wyciągnij folder z URL (np. "CUBE" z "https://conceptfab.com/__metro/gallery/CUBE/")
    const folderMatch = folderUrl.match(/gallery\/([^\/]+)\/?$/);
    const folder = folderMatch ? folderMatch[1] : '';
    
    // Generuj token dla uploadu
    const { token, expires, url } = generateUploadToken(folder);
    
    // Przygotuj FormData
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    formData.append('token', token);
    formData.append('expires', expires.toString());
    formData.append('folder', folder);
    formData.append('file', buffer, {
      filename: fileName,
      contentType: 'image/webp'
    });
    
    // Wyślij do conceptfab.com
    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000
    });
    
    if (response.data.success) {
      const uploadedUrl = `https://conceptfab.com/__metro/gallery/${folder}/${fileName}`;
      logger.info(`Uploaded: ${fileName} to ${uploadedUrl}`);
      return uploadedUrl;
    } else {
      throw new Error(response.data.error || 'Upload failed');
    }
    
  } catch (error) {
    logger.error(`Upload error for ${fileName}`, error);
    throw error;
  }
}

async function deleteOriginalImage(imageUrl: string): Promise<void> {
  try {
    // Wyciągnij ścieżkę pliku z URL
    // np. "https://conceptfab.com/__metro/gallery/CUBE/image.jpg" -> "CUBE/image.jpg"
    const pathMatch = imageUrl.match(/gallery\/(.+)$/);
    if (!pathMatch) {
      throw new Error('Invalid image URL format');
    }
    
    const filePath = pathMatch[1];
    
    // Generuj token dla usuwania
    const { token, expires, url } = generateDeleteToken(filePath);
    
    // Wyślij żądanie usunięcia
    const response = await axios.post(url, {
      path: filePath,
      token: token,
      expires: expires
    }, {
      timeout: 15000
    });
    
    if (response.data.success) {
      logger.info(`Deleted: ${filePath}`);
    } else {
      throw new Error(response.data.error || 'Delete failed');
    }
    
  } catch (error) {
    logger.error(`Delete error for ${imageUrl}`, error);
    throw error;
  }
}

function validateFolderUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' && 
           parsedUrl.hostname === 'conceptfab.com' &&
           parsedUrl.pathname.startsWith('/__metro/gallery/');
  } catch {
    return false;
  }
}