import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

interface CacheClearResponse {
  success: boolean;
  message: string;
  filesRemoved?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CacheClearResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  try {
    console.log('🧹 Starting cache clear...');
    
    const cacheDir = path.join(process.cwd(), 'public', 'cache');
    let filesRemoved = 0;

    if (fs.existsSync(cacheDir)) {
      // Pobierz wszystkie pliki i podfoldery w cache
      const items = fs.readdirSync(cacheDir);
      
      for (const item of items) {
        const itemPath = path.join(cacheDir, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          // Usuń wszystkie pliki w podfolderze
          const subItems = fs.readdirSync(itemPath);
          for (const subItem of subItems) {
            const subItemPath = path.join(itemPath, subItem);
            fs.unlinkSync(subItemPath);
            filesRemoved++;
            console.log(`🗑️ Removed file: ${subItem}`);
          }
          
          // Usuń pusty podfolder
          fs.rmdirSync(itemPath);
          console.log(`🗑️ Removed directory: ${item}`);
        } else {
          // Usuń plik (manifest, cache-ready.json, etc.)
          fs.unlinkSync(itemPath);
          filesRemoved++;
          console.log(`🗑️ Removed file: ${item}`);
        }
      }
    }

    console.log(`✅ Cache cleared successfully. Removed ${filesRemoved} files.`);
    
    res.status(200).json({
      success: true,
      message: `Cache cleared successfully. Removed ${filesRemoved} files.`,
      filesRemoved
    });

  } catch (error) {
    console.error('❌ Cache clear error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      message: `Error clearing cache: ${errorMessage}`
    });
  }
}