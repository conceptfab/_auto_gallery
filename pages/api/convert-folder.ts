import { NextApiRequest, NextApiResponse } from 'next';
import sharp from 'sharp';
import axios from 'axios';
import { logger } from '@/src/utils/logger';
import { generateUploadToken, generateDeleteToken, generateListUrl } from '@/src/utils/fileToken';
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
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_HOSTS = ['conceptfab.com'];

// Rate limiting map (in production use Redis/database)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // max 5 requests per minute

function validateFolderPath(path: string): boolean {
  // Block path traversal attempts
  if (path.includes('..') || path.includes('./') || path.includes('~')) {
    return false;
  }
  
  // Only allow alphanumeric, dash, underscore, forward slash
  if (!/^[a-zA-Z0-9\/_-]+$/.test(path)) {
    return false;
  }
  
  // No double slashes or leading/trailing slashes after cleaning
  const normalized = path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  if (normalized !== path.replace(/^\/|\/$/g, '')) {
    return false;
  }
  
  // Max depth of 5 levels
  if (normalized.split('/').length > 5) {
    return false;
  }
  
  return true;
}

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(identifier);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

function validateImageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_HOSTS.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp as string)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
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
    
    // Clean and validate folder path
    const folderPath = folderUrl.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
    
    if (!validateFolderPath(folderPath)) {
      logger.warn(`Invalid folder path attempted: ${folderPath}`);
      return res.status(400).json({ error: 'Invalid folder path' });
    }

    await processFolderConversion(res, folderPath, deleteOriginals);

  } catch (error) {
    logger.error('Folder conversion API error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function processFolderConversion(res: NextApiResponse, folderPath: string, deleteOriginals: boolean) {
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

    const images = await scanFolderForImages(folderPath);
    
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

    logger.info(`Found ${images.length} images to convert in ${folderPath}`);

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
        const convertedUrl = await convertImageToWebP(image, folderPath);
        if (convertedUrl) {
          converted.push(image.name);
        } else {
          logger.error(`Conversion returned null for: ${image.name}`);
          errors.push(`Conversion failed: ${image.name}`);
        }
        
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
          } catch (deleteError) {
            logger.error(`Failed to delete original: ${image.name}`, deleteError);
            errors.push(`Delete error: ${image.name}`);
          }
        }

      } catch (error) {
        logger.error(`Failed to convert ${image.name}`, error);
        errors.push(`Conversion error: ${image.name}`);
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
      errors: ['Processing failed']
    })}\n\n`);
    res.end();
  }
}

async function scanFolderForImages(folderPath: string): Promise<Array<{name: string, url: string}>> {
  try {
    const cleanPath = folderPath.replace(/\/$/, '');
    
    const listUrl = generateListUrl(cleanPath);
    
    const response = await axios.get(listUrl, {
      timeout: 15000
    });
    
    if (!response.data || response.data.error) {
      logger.error(`PHP returned error:`, response.data?.error || 'Unknown error');
      return [];
    }
    
    const data = response.data;
    
    const images: Array<{name: string, url: string}> = [];
    
    // Przetwórz pliki z odpowiedzi PHP
    if (data.files && Array.isArray(data.files)) {
      for (const file of data.files) {
        // Validate file object
        if (!file || typeof file !== 'object') continue;
        
        const fileName = (file.name && typeof file.name === 'string') 
          ? file.name.replace(/[^a-zA-Z0-9._-]/g, '') // Sanitize filename
          : '';
        
        if (!fileName) continue;
        
        const filePath = (file.path && typeof file.path === 'string')
          ? file.path
          : `${folderPath}/${fileName}`;
          
        // Validate file path
        if (!validateFolderPath(filePath.replace(/\/[^/]*$/, ''))) continue;
        
        // Sprawdź czy to jest obraz do konwersji (nie WebP/AVIF)
        const isConvertibleImage = IMAGE_EXTENSIONS.some(ext => 
          fileName.toLowerCase().endsWith(ext)
        ) && !fileName.toLowerCase().endsWith('.webp') && !fileName.toLowerCase().endsWith('.avif');
        
        if (isConvertibleImage) {
          // Użyj file-proxy.php do dostępu do pliku
          const { generateSignedUrl } = await import('@/src/utils/fileToken');
          const fullUrl = generateSignedUrl(filePath);
          
          images.push({
            name: fileName,
            url: fullUrl
          });
        }
      }
    }

    return images;
  } catch (error) {
    logger.error('Error scanning folder for images', { folderPath, error });
    if (axios.isAxiosError(error)) {
      logger.error(`Axios scan error: ${error.response?.status} ${error.response?.statusText}`, error.response?.data);
    }
    return [];
  }
}

async function convertImageToWebP(image: {name: string, url: string}, folderPath: string): Promise<string | null> {
  try {
    // Validate image URL
    if (!validateImageUrl(image.url)) {
      throw new Error('Invalid image URL');
    }
    
    const response = await axios.get(image.url, { 
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE
    });
    const imageBuffer = Buffer.from(response.data);
    
    // Validate file size
    if (imageBuffer.length > MAX_FILE_SIZE) {
      throw new Error('File too large');
    }

    const webpBuffer = await sharp(imageBuffer)
      .webp({ quality: 90 })
      .toBuffer();

    const originalName = image.name;
    const baseName = originalName.replace(/\.[^.]+$/, '');
    const webpFileName = `${baseName}.webp`;

    const uploadedPath = await uploadConvertedFile(webpBuffer, webpFileName, folderPath);
    
    return uploadedPath;

  } catch (error) {
    logger.error(`Error converting image ${image.name}`, error);
    throw new Error('Image conversion failed');
  }
}

async function uploadConvertedFile(buffer: Buffer, fileName: string, folderPath: string): Promise<string> {
  try {
    const { token, expires, url } = generateUploadToken(folderPath);
    
    // Przygotuj FormData
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    formData.append('token', token);
    formData.append('expires', expires.toString());
    formData.append('folder', folderPath);
    formData.append('file', buffer, {
      filename: fileName,
      contentType: 'image/webp'
    });
    
    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000
    });
    
    if (response.data.success) {
      const filePath = `${folderPath}/${fileName}`;
      return filePath;
    } else {
      const errorMsg = 'Upload failed';
      logger.error(`Upload failed`, response.data);
      throw new Error(errorMsg);
    }
    
  } catch (error) {
    logger.error(`Upload error for ${fileName}`, error);
    if (axios.isAxiosError(error)) {
      logger.error(`Axios upload error: ${error.response?.status}`);
    }
    throw new Error('Upload failed');
  }
}

async function deleteOriginalImage(imageUrl: string): Promise<void> {
  try {
    // Validate URL first
    if (!validateImageUrl(imageUrl)) {
      throw new Error('Invalid image URL');
    }
    
    let filePath: string;
    
    // Use safer regex patterns
    if (imageUrl.includes('/gallery/')) {
      const urlParts = imageUrl.split('/gallery/');
      if (urlParts.length === 2) {
        filePath = urlParts[1];
      } else {
        throw new Error('Invalid gallery URL format');
      }
    } else if (imageUrl.includes('file-proxy.php')) {
      const url = new URL(imageUrl);
      const fileParam = url.searchParams.get('file');
      if (!fileParam) {
        throw new Error('Invalid proxy URL format');
      }
      filePath = decodeURIComponent(fileParam);
    } else {
      throw new Error('Unsupported URL format');
    }
    
    // Validate extracted path
    if (!validateFolderPath(filePath.replace(/\/[^/]*$/, ''))) {
      throw new Error('Invalid file path');
    }
    
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
    
    if (!response.data.success) {
      throw new Error('Delete failed');
    }
    
  } catch (error) {
    logger.error(`Delete error for image`, error);
    throw new Error('Delete failed');
  }
}

