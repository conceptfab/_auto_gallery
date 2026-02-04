import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '@/src/utils/auth';
import { deleteMoodboardImage } from '@/src/utils/moodboardStorage';

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

  const { boardId, imageId } = req.body as {
    boardId?: string;
    imageId?: string;
  };

  if (!boardId || typeof boardId !== 'string') {
    return res.status(400).json({ error: 'Brak boardId' });
  }

  if (!imageId || typeof imageId !== 'string') {
    return res.status(400).json({ error: 'Brak imageId' });
  }

  try {
    await deleteMoodboardImage(boardId, imageId);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Moodboard delete-image error:', err);
    return res.status(500).json({ error: 'Błąd usuwania obrazu' });
  }
}
