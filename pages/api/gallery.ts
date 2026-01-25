import { NextApiRequest, NextApiResponse } from 'next';
import { GalleryResponse } from '@/src/types/gallery';
import { scanRemoteDirectory } from './gallery-utils';
import { withRateLimit } from '@/src/utils/rateLimiter';
import { GALLERY_BASE_URL } from '@/src/config/constants';

async function galleryHandler(
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

// Apply rate limiting: 5 requests per minute
export default withRateLimit(5, 60000)(galleryHandler);