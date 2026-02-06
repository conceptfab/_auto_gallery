import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '@/src/utils/auth';
import {
  decodeDataUrlToBuffer,
  saveMoodboardImage,
} from '@/src/utils/moodboardStorage';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const email = getEmailFromCookie(req);
  if (!email) {
    return res.status(401).json({ error: 'Wymagane logowanie' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { boardId, imageId, dataUrl } = req.body as {
    boardId?: string;
    imageId?: string;
    dataUrl?: string;
  };

  if (!boardId || typeof boardId !== 'string') {
    return res.status(400).json({ error: 'Brak boardId' });
  }

  if (!imageId || typeof imageId !== 'string') {
    return res.status(400).json({ error: 'Brak imageId' });
  }

  // Walidacja path traversal
  const SAFE_ID = /^[a-zA-Z0-9_-]+$/;
  if (!SAFE_ID.test(boardId) || !SAFE_ID.test(imageId)) {
    return res.status(400).json({ error: 'Nieprawidłowy boardId lub imageId' });
  }

  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Brak dataUrl' });
  }

  try {
    const buffer = decodeDataUrlToBuffer(dataUrl);
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Nieprawidłowy format obrazu' });
    }

    // Określ rozszerzenie na podstawie typu MIME
    let ext = '.webp';
    if (dataUrl.includes('image/png')) {
      ext = '.png';
    } else if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) {
      ext = '.jpg';
    } else if (dataUrl.includes('image/gif')) {
      ext = '.gif';
    }

    const imagePath = await saveMoodboardImage(boardId, imageId, buffer, ext);

    return res.status(200).json({
      success: true,
      imagePath,
    });
  } catch (err) {
    console.error('Moodboard upload error:', err);
    return res.status(500).json({ error: 'Błąd zapisu obrazu' });
  }
}
