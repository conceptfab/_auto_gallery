import { NextApiRequest, NextApiResponse } from 'next';
import { getData, updateSettings, isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
        historyRetentionDays: rawSettings.historyRetentionDays ?? 7,
        thumbnailAnimationDelay: rawSettings.thumbnailAnimationDelay ?? 55,
        sessionDurationHours: rawSettings.sessionDurationHours ?? 12,
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

      const {
        highlightKeywords,
        autoCleanupEnabled,
        autoCleanupDays,
        historyRetentionDays,
        thumbnailAnimationDelay,
        sessionDurationHours,
      } = req.body;

      // Walidacja
      if (
        highlightKeywords !== undefined &&
        typeof highlightKeywords !== 'boolean'
      ) {
        return res
          .status(400)
          .json({ error: 'Nieprawidłowa wartość highlightKeywords' });
      }
      if (
        autoCleanupEnabled !== undefined &&
        typeof autoCleanupEnabled !== 'boolean'
      ) {
        return res
          .status(400)
          .json({ error: 'Nieprawidłowa wartość autoCleanupEnabled' });
      }
      if (
        autoCleanupDays !== undefined &&
        (typeof autoCleanupDays !== 'number' ||
          autoCleanupDays < 1 ||
          autoCleanupDays > 365)
      ) {
        return res
          .status(400)
          .json({ error: 'autoCleanupDays musi być liczbą od 1 do 365' });
      }
      if (
        historyRetentionDays !== undefined &&
        (typeof historyRetentionDays !== 'number' ||
          historyRetentionDays < 1 ||
          historyRetentionDays > 365)
      ) {
        return res
          .status(400)
          .json({ error: 'historyRetentionDays musi być liczbą od 1 do 365' });
      }
      if (
        thumbnailAnimationDelay !== undefined &&
        (typeof thumbnailAnimationDelay !== 'number' ||
          thumbnailAnimationDelay < 0 ||
          thumbnailAnimationDelay > 1000)
      ) {
        return res.status(400).json({
          error: 'thumbnailAnimationDelay musi być liczbą od 0 do 1000',
        });
      }
      if (
        sessionDurationHours !== undefined &&
        (typeof sessionDurationHours !== 'number' ||
          sessionDurationHours < 12 ||
          sessionDurationHours > 336)
      ) {
        return res.status(400).json({
          error: 'sessionDurationHours musi być liczbą od 12 do 336 (14 dni)',
        });
      }

      await updateSettings((settings) => {
        if (highlightKeywords !== undefined) {
          settings.highlightKeywords = highlightKeywords;
        }
        if (autoCleanupEnabled !== undefined) {
          settings.autoCleanupEnabled = autoCleanupEnabled;
        }
        if (autoCleanupDays !== undefined) {
          settings.autoCleanupDays = autoCleanupDays;
        }
        if (historyRetentionDays !== undefined) {
          settings.historyRetentionDays = historyRetentionDays;
        }
        if (thumbnailAnimationDelay !== undefined) {
          settings.thumbnailAnimationDelay = thumbnailAnimationDelay;
        }
        if (sessionDurationHours !== undefined) {
          settings.sessionDurationHours = sessionDurationHours;
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
