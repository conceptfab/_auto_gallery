import type { NextApiRequest, NextApiResponse } from 'next';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { cleanupOldStats } from '../../../../src/utils/statsStorage';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { daysToKeep = 7 } = req.body;

  // Walidacja
  if (typeof daysToKeep !== 'number' || daysToKeep < 1 || daysToKeep > 365) {
    return res.status(400).json({ error: 'daysToKeep musi być liczbą od 1 do 365' });
  }

  try {
    const result = await cleanupOldStats(daysToKeep);

    return res.status(200).json({
      success: true,
      message: `Usunięto dane starsze niż ${daysToKeep} dni`,
      deleted: result,
    });
  } catch (error) {
    console.error('Error cleaning up stats:', error);
    return res.status(500).json({ error: 'Błąd podczas czyszczenia danych' });
  }
}

export default withAdminAuth(handler);
