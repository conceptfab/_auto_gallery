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
}

interface SettingsContextValue {
  settings: Settings | null;
  loading: boolean;
  /** highlightKeywords – null dopóki nie załadowano, potem boolean */
  highlightKeywords: boolean | null;
}

const defaults: Settings = {
  highlightKeywords: true,
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
    };
  }
  return ctx;
}
