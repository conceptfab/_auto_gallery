import type { NextApiResponse } from 'next';
import { deleteMoodboardImage } from '@/src/utils/moodboardStorage';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';

async function handler(
  req: GroupScopedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { boardId, imageId, groupId: bodyGroupId } = req.body as {
    boardId?: string;
    imageId?: string;
    groupId?: string;
  };

  if (!boardId || typeof boardId !== 'string') {
    return res.status(400).json({ error: 'Brak boardId' });
  }

  if (!imageId || typeof imageId !== 'string') {
    return res.status(400).json({ error: 'Brak imageId' });
  }

  const groupId = req.isAdmin && bodyGroupId ? bodyGroupId : req.userGroupId;

  try {
    await deleteMoodboardImage(boardId, imageId, groupId);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Moodboard delete-image error:', err);
    return res.status(500).json({ error: 'Błąd usuwania obrazu' });
  }
}

export default withGroupAccess(handler);
