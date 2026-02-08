import type { NextApiResponse } from 'next';
import {
  decodeDataUrlToBuffer,
  saveMoodboardImage,
} from '@/src/utils/moodboardStorage';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';

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

    // Określ rozszerzenie na podstawie typu MIME
    let ext = '.webp';
    if (dataUrl.includes('image/png')) {
      ext = '.png';
    } else if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) {
      ext = '.jpg';
    } else if (dataUrl.includes('image/gif')) {
      ext = '.gif';
    }

    const imagePath = await saveMoodboardImage(boardId, imageId, buffer, ext, groupId);

    return res.status(200).json({
      success: true,
      imagePath,
    });
  } catch (err) {
    console.error('Moodboard upload error:', err);
    return res.status(500).json({ error: 'Błąd zapisu obrazu' });
  }
}

export default withGroupAccess(handler);
