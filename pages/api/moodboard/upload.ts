import type { NextApiResponse } from 'next';
import sharp from 'sharp';
import {
  decodeDataUrlToBuffer,
  saveMoodboardImage,
} from '@/src/utils/moodboardStorage';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';

const MAX_DIMENSION = 2000;
const THUMB_DIMENSION = 400;
const MAIN_QUALITY = 85;
const THUMB_QUALITY = 70;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

async function handler(
  req: GroupScopedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { boardId, imageId, dataUrl, groupId: bodyGroupId } = req.body as {
    boardId?: string;
    imageId?: string;
    dataUrl?: string;
    groupId?: string;
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

  // Ustal groupId: admin może podać jawnie, user ma z middleware
  const groupId = req.isAdmin && bodyGroupId ? bodyGroupId : req.userGroupId;

  try {
    const buffer = decodeDataUrlToBuffer(dataUrl);
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Nieprawidłowy format obrazu' });
    }

    // Resize do max 2000px i konwertuj do WebP (limit pamięci + fastShrinkOnLoad – audyt)
    const sharpOpt = { limitInputPixels: 4096 * 4096 };
    const resizeOpt = { fit: 'inside' as const, withoutEnlargement: true, fastShrinkOnLoad: true };
    const resizedBuffer = await sharp(buffer, sharpOpt)
      .resize(MAX_DIMENSION, MAX_DIMENSION, resizeOpt)
      .webp({ quality: MAIN_QUALITY })
      .toBuffer();

    const ext = '.webp';
    const imagePath = await saveMoodboardImage(boardId, imageId, resizedBuffer, ext, groupId);

    // Wygeneruj thumbnail (_thumb)
    const thumbBuffer = await sharp(buffer, sharpOpt)
      .resize(THUMB_DIMENSION, THUMB_DIMENSION, resizeOpt)
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    await saveMoodboardImage(boardId, `${imageId}_thumb`, thumbBuffer, '.webp', groupId);

    return res.status(200).json({
      success: true,
      imagePath,
      thumbPath: `${boardId}/${imageId}_thumb.webp`,
    });
  } catch (err) {
    console.error('Moodboard upload error:', err);
    return res.status(500).json({ error: 'Błąd zapisu obrazu' });
  }
}

export default withGroupAccess(handler);
