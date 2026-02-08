import { useState, useEffect, useCallback } from 'react';
import type {
  MoodboardDrawingConfig,
  MoodboardDrawingConfigMap,
} from '@/src/types/moodboard';
import { DEFAULT_MOODBOARD_DRAWING_CONFIG } from '@/src/types/moodboard';

export function useMoodboardDrawingConfig() {
  const [configMap, setConfigMap] = useState<MoodboardDrawingConfigMap | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/moodboard/drawing-config', {
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (data.success && data.config) {
        setConfigMap({
          default: data.config.default ?? { ...DEFAULT_MOODBOARD_DRAWING_CONFIG },
          byGroup: data.config.byGroup ?? {},
        });
      } else {
        setConfigMap({
          default: { ...DEFAULT_MOODBOARD_DRAWING_CONFIG },
          byGroup: {},
        });
      }
    } catch {
      setConfigMap({
        default: { ...DEFAULT_MOODBOARD_DRAWING_CONFIG },
        byGroup: {},
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /** Konfiguracja dla danej grupy (lub domyślna gdy groupId brak) */
  const getConfigForGroup = useCallback(
    (groupId: string | undefined): MoodboardDrawingConfig => {
      if (!configMap) return DEFAULT_MOODBOARD_DRAWING_CONFIG;
      if (groupId && configMap.byGroup[groupId]) {
        return configMap.byGroup[groupId];
      }
      return configMap.default;
    },
    [configMap]
  );

  return {
    configMap,
    loading,
    getConfigForGroup,
    refetch: fetchConfig,
  };
}
