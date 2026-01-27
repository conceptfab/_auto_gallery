import { NextApiRequest, NextApiResponse } from 'next';
import { getData, updateData, isAdminLoggedIn } from '@/src/utils/storage';
import { ADMIN_EMAIL } from '@/src/config/constants';

function getAdminEmailFromCookie(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;

  const emailMatch = cookies.match(/admin_email=([^;]*)/);
  const loggedMatch = cookies.match(/admin_logged=([^;]*)/);

  if (
    emailMatch &&
    loggedMatch &&
    loggedMatch[1] === 'true' &&
    emailMatch[1] === ADMIN_EMAIL
  ) {
    return emailMatch[1];
  }

  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      // GET jest publiczne - każdy może sprawdzić ustawienia
      const data = getData();
      const settings = data.settings || {
        highlightKeywords: true,
      };
      return res.status(200).json({ success: true, settings });
    } catch (error: any) {
      console.error('Error loading settings:', error);
      return res.status(500).json({ error: 'Błąd ładowania ustawień' });
    }
  }

  if (req.method === 'POST') {
    try {
      // POST wymaga autoryzacji admina
      const adminEmail = getAdminEmailFromCookie(req);
      if (!adminEmail) {
        return res.status(401).json({ error: 'Brak autoryzacji' });
      }

      if (!isAdminLoggedIn(adminEmail)) {
        return res.status(403).json({ error: 'Brak uprawnień administratora' });
      }

      const { highlightKeywords } = req.body;

      if (typeof highlightKeywords !== 'boolean') {
        return res.status(400).json({ error: 'Nieprawidłowa wartość' });
      }

      updateData((data) => {
        if (!data.settings) {
          data.settings = {};
        }
        data.settings.highlightKeywords = highlightKeywords;
      });

      const updatedData = getData();
      return res
        .status(200)
        .json({ success: true, settings: updatedData.settings });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      return res.status(500).json({ error: 'Błąd zapisywania ustawień' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
