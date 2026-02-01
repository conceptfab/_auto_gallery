import { NextApiRequest, NextApiResponse } from 'next';
import { getData, updateData, isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      // GET jest publiczne - każdy może sprawdzić ustawienia
      const data = await getData();
      const rawSettings = data.settings || {};
      // Zwracamy obiekt z domyślnymi wartościami
      const settings = {
        highlightKeywords: rawSettings.highlightKeywords ?? true,
        autoCleanupEnabled: rawSettings.autoCleanupEnabled ?? false,
        autoCleanupDays: rawSettings.autoCleanupDays ?? 7,
      };
      return res.status(200).json({ success: true, settings });
    } catch (error: unknown) {
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

      if (!(await isAdminLoggedIn(adminEmail))) {
        return res.status(403).json({ error: 'Brak uprawnień administratora' });
      }

      const { highlightKeywords, autoCleanupEnabled, autoCleanupDays } = req.body;

      // Walidacja
      if (highlightKeywords !== undefined && typeof highlightKeywords !== 'boolean') {
        return res.status(400).json({ error: 'Nieprawidłowa wartość highlightKeywords' });
      }
      if (autoCleanupEnabled !== undefined && typeof autoCleanupEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Nieprawidłowa wartość autoCleanupEnabled' });
      }
      if (autoCleanupDays !== undefined && (typeof autoCleanupDays !== 'number' || autoCleanupDays < 1 || autoCleanupDays > 365)) {
        return res.status(400).json({ error: 'autoCleanupDays musi być liczbą od 1 do 365' });
      }

      await updateData((data) => {
        if (!data.settings) {
          data.settings = {};
        }
        if (highlightKeywords !== undefined) {
          data.settings.highlightKeywords = highlightKeywords;
        }
        if (autoCleanupEnabled !== undefined) {
          data.settings.autoCleanupEnabled = autoCleanupEnabled;
        }
        if (autoCleanupDays !== undefined) {
          data.settings.autoCleanupDays = autoCleanupDays;
        }
      });

      const updatedData = await getData();
      return res
        .status(200)
        .json({ success: true, settings: updatedData.settings });
    } catch (error: unknown) {
      console.error('Error saving settings:', error);
      return res.status(500).json({ error: 'Błąd zapisywania ustawień' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
