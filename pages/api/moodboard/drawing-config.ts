import type { NextApiRequest, NextApiResponse } from 'next';
import { getMoodboardDrawingConfig } from '@/src/utils/storage';

/**
 * Publiczne API konfiguracji paska rysowania moodboarda.
 * GET – zwraca konfigurację domyślną i per grupa (bez autoryzacji, do użycia na stronie moodboarda).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const config = await getMoodboardDrawingConfig();
    return res.status(200).json({ success: true, config });
  } catch (error: unknown) {
    console.error('Error loading moodboard drawing config:', error);
    return res.status(500).json({ error: 'Błąd ładowania konfiguracji' });
  }
}
