import { useState, useCallback } from 'react';
import type { AdminSettings } from '@/src/types/admin';
import { logger } from '@/src/utils/logger';

const defaultSettings: AdminSettings = {
  highlightKeywords: true,
  autoCleanupEnabled: false,
  autoCleanupDays: 7,
  historyRetentionDays: 7,
  thumbnailAnimationDelay: 55,
  sessionDurationHours: 12,
};

export function useAdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>(defaultSettings);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/settings');
      const result = await response.json();
      if (result.success && result.settings) {
        setSettings(result.settings);
      }
    } catch (error) {
      logger.error('Error fetching settings', error);
    }
  }, []);

  const updateSettings = useCallback(
    async (newSettings: Partial<AdminSettings>) => {
      try {
        const response = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSettings),
        });
        const result = await response.json();
        if (result.success && result.settings) {
          setSettings(result.settings);
        } else {
          alert('Błąd aktualizacji ustawień');
        }
      } catch (error) {
        logger.error('Error updating settings', error);
        alert('Błąd aktualizacji ustawień');
      }
    },
    []
  );

  return { settings, setSettings, fetchSettings, updateSettings };
}
