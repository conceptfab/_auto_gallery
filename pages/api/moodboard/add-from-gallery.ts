import type { NextApiResponse } from 'next';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';
import { saveMoodboardImage } from '@/src/utils/moodboardStorage';
import { GALLERY_BASE_URL } from '@/src/config/constants';

async function handler(req: GroupScopedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageUrl, boardId, imageId } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'imageUrl jest wymagane' });
    }
    if (!boardId || typeof boardId !== 'string') {
      return res.status(400).json({ error: 'boardId jest wymagane' });
    }
    if (!imageId || typeof imageId !== 'string') {
      return res.status(400).json({ error: 'imageId jest wymagane' });
    }

    // Validate URL - must be from our gallery or a relative path
    const fullUrl = imageUrl.startsWith('http')
      ? imageUrl
      : imageUrl.startsWith('/')
        ? `${req.headers.origin || 'http://localhost:3000'}${imageUrl}`
        : `${GALLERY_BASE_URL}${imageUrl}`;

    // Fetch image
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'ConceptDesk-Gallery-Import/1.0',
      },
    });

    if (!response.ok) {
      return res.status(400).json({ error: 'Nie udało się pobrać obrazu z galerii' });
    }

    const contentType = response.headers.get('content-type') || '';
    let ext = '.webp';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('webp')) ext = '.webp';

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Pusty plik obrazu' });
    }

    // Determine groupId
    const queryGroupId = req.query.groupId as string | undefined;
    const groupId = req.isAdmin && queryGroupId ? queryGroupId : req.userGroupId;

    // Save to moodboard images
    const imagePath = await saveMoodboardImage(boardId, imageId, buffer, ext, groupId);

    return res.status(200).json({ success: true, imagePath });
  } catch (error) {
    console.error('Error adding gallery image to moodboard:', error);
    return res.status(500).json({ error: 'Błąd dodawania obrazu do moodboarda' });
  }
}

export default withGroupAccess(handler);
