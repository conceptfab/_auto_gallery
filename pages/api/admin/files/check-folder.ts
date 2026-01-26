import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { generateListUrl } from '../../../../src/utils/fileToken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź czy to admin
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { folder = '' } = req.query;
  const folderPath = typeof folder === 'string' ? folder : '';

  // Wyczyść ścieżkę folderu
  const cleanFolder = folderPath
    .replace(/^https?:\/\/[^\/]+\//, '') // Usuń URL bazowy
    .replace(/^\/+/, '') // Usuń początkowe slashe
    .replace(/\/+$/, ''); // Usuń końcowe slashe

  try {
    const listUrl = generateListUrl(cleanFolder);
    const response = await fetch(listUrl);
    
    if (!response.ok) {
      return res.status(200).json({ 
        exists: false, 
        folder: cleanFolder,
        error: `HTTP ${response.status}` 
      });
    }

    const data = await response.json();
    
    if (data.error) {
      return res.status(200).json({ 
        exists: false, 
        folder: cleanFolder,
        error: data.error 
      });
    }

    // Folder istnieje - zwróć też liczbę plików/podfolderów
    res.status(200).json({ 
      exists: true, 
      folder: cleanFolder,
      foldersCount: data.folders?.length || 0,
      filesCount: data.files?.length || 0
    });
  } catch (error) {
    console.error('Error checking folder:', error);
    res.status(200).json({ 
      exists: false, 
      folder: cleanFolder,
      error: 'Connection error' 
    });
  }
}
