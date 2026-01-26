import { GalleryFolder, ImageFile } from '@/src/types/gallery';
import { generateListUrl, generateSignedUrl, isFileProtectionEnabled } from './fileToken';

interface PHPListResponse {
  folders: { name: string; path: string }[];
  files: { name: string; path: string; size: number; modified: string }[];
  error?: string;
}

/**
 * Pobiera listę plików i folderów z PHP
 */
async function fetchFolderContents(folder: string): Promise<PHPListResponse | null> {
  try {
    const listUrl = generateListUrl(folder);
    console.log(`📁 PHP list request: "${folder}"`);
    console.log(`📁 URL: ${listUrl.substring(0, 100)}...`);
    
    const response = await fetch(listUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ PHP error ${response.status}:`, errorText);
      return null;
    }
    
    const data: PHPListResponse = await response.json();
    console.log(`📁 PHP response for "${folder}": ${data.folders?.length || 0} folders, ${data.files?.length || 0} files`);
    
    if (data.error) {
      console.error(`❌ PHP returned error:`, data.error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Fetch error for "${folder}":`, error);
    return null;
  }
}

/**
 * Skanuje prywatny folder galerii przez PHP endpoint
 */
export async function scanPrivateDirectory(folder: string = '', depth: number = 0): Promise<GalleryFolder[]> {
  console.log(`📁 scanPrivateDirectory("${folder}", depth=${depth})`);
  
  if (depth > 10) {
    console.warn(`⚠️ Max depth reached for "${folder}"`);
    return [];
  }
  
  const data = await fetchFolderContents(folder);
  if (!data) return [];
  
  const results: GalleryFolder[] = [];
  
  // Jeśli są pliki w tym folderze, utwórz GalleryFolder z obrazkami
  if (data.files && data.files.length > 0) {
    const images: ImageFile[] = data.files.map(file => ({
      name: file.name,
      path: file.path,
      url: isFileProtectionEnabled() ? generateSignedUrl(file.path) : file.path,
      fileSize: file.size,
      lastModified: file.modified
    }));
    
    const folderName = folder ? folder.split('/').pop() || folder : 'Galeria';
    console.log(`📁 Found ${images.length} images in "${folderName}"`);
    
    results.push({
      name: folderName,
      path: folder,
      images: images,
      isCategory: false,
      level: depth
    });
  }
  
  // Rekurencyjnie skanuj podfoldery
  if (data.folders && data.folders.length > 0) {
    for (const subfolder of data.folders) {
      console.log(`📁 Scanning subfolder: "${subfolder.path}"`);
      
      const subResults = await scanPrivateDirectory(subfolder.path, depth + 1);
      
      if (subResults.length > 0) {
        // Sprawdź czy podfolder ma bezpośrednio obrazki czy tylko dalsze podfoldery
        const hasDirectImages = subResults.some(r => r.path === subfolder.path && r.images.length > 0);
        
        if (hasDirectImages && subResults.length === 1) {
          // Tylko obrazki w tym folderze - dodaj bezpośrednio
          results.push(...subResults);
        } else {
          // Ma podfoldery - utwórz kategorię
          results.push({
            name: subfolder.name,
            path: subfolder.path,
            images: [],
            subfolders: subResults,
            isCategory: true,
            level: depth
          });
        }
      }
    }
  }
  
  console.log(`📁 scanPrivateDirectory("${folder}") returning ${results.length} results`);
  return results;
}
