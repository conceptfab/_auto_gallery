import { NextApiRequest, NextApiResponse } from 'next';
import { GalleryResponse } from '@/src/types/gallery';
import { scanRemoteDirectory } from './gallery-utils';

const GALLERY_BASE_URL = 'https://conceptfab.com/__metro/gallery/';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GalleryResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Metoda nie obsługiwana' 
    });
  }

  try {
    const folders = await scanRemoteDirectory(GALLERY_BASE_URL);
    
    res.status(200).json({
      success: true,
      data: folders
    });
  } catch (error) {
    console.error('Błąd API:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas skanowania galerii'
    });
  }
}