import axios from 'axios';
import { GalleryFolder, ImageFile } from '@/src/types/gallery';
import { GALLERY_BASE_URL } from '@/src/config/constants';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];

// Funkcja do liczenia plików graficznych w folderze
async function countImagesInDirectory(url: string): Promise<number> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      }
    });

    const html = response.data;
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    let imageCount = 0;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1].trim();
      
      // Sprawdź czy to jest plik graficzny
      const isImage = IMAGE_EXTENSIONS.some(ext => 
        href.toLowerCase().endsWith(ext)
      );
      
      if (isImage) {
        imageCount++;
      }
    }

    return imageCount;
  } catch (error) {
    console.log(`❌ Błąd liczenia obrazów w ${url}`);
    return 0;
  }
}

// Funkcja do znajdowania wszystkich podfolderów
async function findSubfolders(url: string): Promise<Array<{name: string, url: string}>> {
  console.log(`🔍 ETAP 1: Szukanie podfolderów w: ${url}`);
  
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      }
    });

    const html = response.data;
    console.log(`📄 Pobrano HTML (${html.length} znaków)`);
    
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    const subfolders: Array<{name: string, url: string}> = [];
    const foundLinks = new Set<string>();

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1].trim();
      const fullContent = match[2];
      const text = fullContent.replace(/<[^>]*>/g, '').trim();
      
      // Pomiń linki nadrzędne, puste i specjalne
      if (!href || href === '../' || href === './' || href.startsWith('?') || 
          href.startsWith('#') || href.startsWith('javascript:') || 
          href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }

      // Unikaj duplikatów
      if (foundLinks.has(href)) {
        continue;
      }
      foundLinks.add(href);

      let fullUrl: string;
      try {
        // Obsługa absolutnych ścieżek jak /__metro/gallery/CUBE/
        if (href.startsWith('/')) {
          fullUrl = `https://conceptfab.com${href}`;
        } else {
          fullUrl = new URL(href, url).href;
        }
      } catch (error) {
        continue;
      }
      
      // Sprawdź czy to jest folder
      const isFolder = href.endsWith('/') || 
                      (!href.includes('.') && text && !text.includes('.')) ||
                      (text && text.toUpperCase() === text && !text.includes('.')) ||
                      /^[A-Z_]+$/i.test(href.replace('/', '')) ||
                      (href.includes('/gallery/') && href.endsWith('/'));
      
      if (isFolder) {
        const folderUrl = href.endsWith('/') ? fullUrl : fullUrl + '/';
        subfolders.push({
          name: text || href.split('/').filter(Boolean).pop() || href,
          url: folderUrl
        });
      }
    }

    console.log(`📂 ZNALEZIONE PODFOLDERY (${subfolders.length}):`);
    subfolders.forEach((folder, index) => {
      console.log(`   ${index + 1}. ${folder.name} -> ${folder.url}`);
    });

    return subfolders;
  } catch (error) {
    console.error(`❌ Błąd wyszukiwania podfolderów w ${url}:`, error);
    return [];
  }
}

import { NextApiRequest, NextApiResponse } from 'next';

export async function scanRemoteDirectory(url: string): Promise<GalleryFolder[]> {
  console.log(`\n🚀 ROZPOCZĘCIE SKANOWANIA GALERII: ${url}\n`);
  
  try {
    // ETAP 1: Znajdź wszystkie podfoldery
    const subfolders = await findSubfolders(url);
    
    if (subfolders.length === 0) {
      console.log(`❌ Nie znaleziono podfolderów w ${url}`);
      return [];
    }

    // ETAP 2: Policz pliki graficzne w każdym podfolderze
    console.log(`\n📊 ETAP 2: Liczenie plików graficznych w podfolderach:\n`);
    
    const foldersWithCounts = [];
    for (const folder of subfolders) {
      console.log(`🔢 Liczenie obrazów w: ${folder.name}...`);
      const imageCount = await countImagesInDirectory(folder.url);
      console.log(`   ✅ ${folder.name}: ${imageCount} plików graficznych`);
      
      foldersWithCounts.push({
        ...folder,
        imageCount
      });
    }

    console.log(`\n📋 PODSUMOWANIE WSZYSTKICH PODFOLDERÓW:`);
    let totalImages = 0;
    foldersWithCounts.forEach((folder, index) => {
      console.log(`   ${index + 1}. ${folder.name}: ${folder.imageCount} obrazów`);
      totalImages += folder.imageCount;
    });
    console.log(`📈 RAZEM: ${totalImages} obrazów w ${foldersWithCounts.length} podfolderach\n`);

    // ETAP 3: Generuj pełne dane dla strony
    console.log(`🏗️  ETAP 3: Generowanie danych dla strony...\n`);
    
    const folders: GalleryFolder[] = [];
    
    for (const folderInfo of foldersWithCounts) {
      if (folderInfo.imageCount > 0) {
        console.log(`📁 Skanowanie szczegółowe: ${folderInfo.name} (${folderInfo.imageCount} obrazów)`);
        
        const response = await axios.get(folderInfo.url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
          }
        });

        const html = response.data;
        const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
        let match;
        
        const currentFolder: GalleryFolder = {
          name: folderInfo.name,
          path: folderInfo.url,
          images: []
        };

        while ((match = linkRegex.exec(html)) !== null) {
          const href = match[1].trim();
          const fullContent = match[2];
          const text = fullContent.replace(/<[^>]*>/g, '').trim();
          
          const isImage = IMAGE_EXTENSIONS.some(ext => 
            href.toLowerCase().endsWith(ext)
          );
          
          if (isImage) {
            let fullUrl: string;
            if (href.startsWith('/')) {
              fullUrl = `https://conceptfab.com${href}`;
            } else {
              fullUrl = new URL(href, folderInfo.url).href;
            }

            // Pobierz rozmiar pliku i datę modyfikacji
            let fileSize: number | undefined;
            let lastModified: string | undefined;
            try {
              const headResponse = await axios.head(fullUrl, {
                timeout: 5000,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                }
              });
              const contentLength = headResponse.headers['content-length'];
              if (contentLength) {
                fileSize = parseInt(contentLength, 10);
              }
              
              const lastModifiedHeader = headResponse.headers['last-modified'];
              if (lastModifiedHeader) {
                lastModified = lastModifiedHeader;
              }
            } catch (error) {
              console.log(`⚠️ Nie udało się pobrać metadanych pliku ${href}`);
            }

            const imageFile: ImageFile = {
              name: text || href.split('/').pop() || href,
              path: href,
              url: fullUrl,
              fileSize,
              lastModified
            };
            currentFolder.images.push(imageFile);
          }
        }

        console.log(`   ✅ Dodano ${currentFolder.images.length} obrazów z folderu "${currentFolder.name}"`);
        folders.push(currentFolder);
      }
    }

    console.log(`\n🎉 SKANOWANIE ZAKOŃCZONE! Znaleziono ${folders.length} folderów z obrazami.\n`);
    
    return folders;
  } catch (error) {
    console.error(`❌ Błąd skanowania ${url}:`, error);
    throw error;
  }
}

// URL validation function
function validateGalleryUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Only allow HTTPS and specific conceptfab.com domain
    return parsedUrl.protocol === 'https:' && 
           parsedUrl.hostname === 'conceptfab.com' &&
           parsedUrl.pathname.startsWith('/__metro/gallery/');
  } catch {
    return false;
  }
}

// Default handler for Next.js API route
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    
    // Validate required URL
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    // Validate URL security
    if (!validateGalleryUrl(url)) {
      return res.status(400).json({ 
        error: 'Invalid URL. Only HTTPS URLs from conceptfab.com/__metro/gallery/ are allowed' 
      });
    }

    const folders = await scanRemoteDirectory(url);
    res.status(200).json({ folders });
  } catch (error) {
    console.error('Gallery scan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}