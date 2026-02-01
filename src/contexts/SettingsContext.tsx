import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from 'react';
import { logger } from '@/src/utils/logger';

export interface Settings {
  highlightKeywords: boolean;
  thumbnailAnimationDelay: number;
}

interface SettingsContextValue {
  settings: Settings | null;
  loading: boolean;
  /** highlightKeywords – null dopóki nie załadowano, potem boolean */
  highlightKeywords: boolean | null;
  /** thumbnailAnimationDelay – opóźnienie animacji miniaturek w ms (domyślnie 55) */
  thumbnailAnimationDelay: number;
}

const defaults: Settings = {
  highlightKeywords: true,
  thumbnailAnimationDelay: 55,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/admin/settings');
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.settings) {
          setSettings({
            highlightKeywords: data.settings.highlightKeywords !== false,
            thumbnailAnimationDelay: data.settings.thumbnailAnimationDelay ?? 55,
          });
        } else {
          setSettings(defaults);
        }
      } catch (err) {
        if (cancelled) return;
        logger.error('Błąd ładowania ustawień', err);
        setSettings(defaults);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      loading,
      highlightKeywords:
        settings === null ? null : (settings.highlightKeywords ?? true),
      thumbnailAnimationDelay: settings?.thumbnailAnimationDelay ?? 55,
    }),
    [settings, loading],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    return {
      settings: null,
      loading: true,
      highlightKeywords: null,
      thumbnailAnimationDelay: 55,
    };
  }
  return ctx;
}
