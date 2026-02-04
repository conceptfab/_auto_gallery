import { useCallback, useEffect, useRef, useState } from 'react';

type ViewType = 'folder' | 'image';
export type DesignViewType =
  | 'design_list'
  | 'design_project'
  | 'design_revision'
  | 'moodboard';

export interface DesignViewMeta {
  projectId?: string;
  revisionId?: string;
  projectName?: string;
  revisionLabel?: string;
}

function getSessionIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null;

  // Preferuj nie-HttpOnly cookie widoczne po stronie klienta
  const statsMatch = document.cookie.match(/stats_session_id=([^;]+)/);
  if (statsMatch) return decodeURIComponent(statsMatch[1]);

  // Dla zgodności: gdyby kiedyś session_id nie było HttpOnly
  const match = document.cookie.match(/session_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Zbiera informacje o urządzeniu dostępne po stronie klienta
 */
function getDeviceInfo(): {
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
} {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    screenWidth: window.screen?.width,
    screenHeight: window.screen?.height,
    language: navigator.language || navigator.languages?.[0],
  };
}

export function useStatsTracker(initialSessionId: string | null = null) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const lastViewRef = useRef<string | null>(null);

  // Upewnij się, że mamy sessionId – spróbuj odczytać z cookie po stronie klienta
  useEffect(() => {
    if (sessionId) return;
    const fromCookie = getSessionIdFromCookie();
    if (fromCookie) {
      setSessionId(fromCookie);
    }
  }, [sessionId]);

  // Heartbeat co 60 sekund
  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(() => {
      fetch('/api/stats/session-heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch((error) => {
        // Świadomie tylko logujemy do konsoli, bez przerywania UI

        console.error('Stats heartbeat failed:', error);
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const trackView = useCallback(
    async (type: ViewType, path: string, name: string) => {
      if (!sessionId) return;

      const viewKey = `${type}:${path}`;
      if (lastViewRef.current === viewKey) return;
      lastViewRef.current = viewKey;

      try {
        const deviceInfo = getDeviceInfo();
        await fetch('/api/stats/track-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            type,
            path,
            name,
            ...deviceInfo,
          }),
        });
      } catch (error) {
        console.error('trackView failed:', error);
      }
    },
    [sessionId]
  );

  const trackDownload = useCallback(
    async (filePath: string, fileName: string, fileSize?: number) => {
      if (!sessionId) return;

      try {
        const deviceInfo = getDeviceInfo();
        await fetch('/api/stats/track-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            filePath,
            fileName,
            fileSize,
            ...deviceInfo,
          }),
        });
      } catch (error) {
        console.error('trackDownload failed:', error);
      }
    },
    [sessionId]
  );

  const trackDesignView = useCallback(
    async (
      type: DesignViewType,
      path: string,
      name: string,
      meta?: DesignViewMeta
    ) => {
      if (!sessionId) return;

      const viewKey = `${type}:${path}`;
      if (lastViewRef.current === viewKey) return;
      lastViewRef.current = viewKey;

      try {
        const deviceInfo = getDeviceInfo();
        await fetch('/api/stats/track-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            type,
            path,
            name,
            ...(meta && {
              projectId: meta.projectId,
              revisionId: meta.revisionId,
              projectName: meta.projectName,
              revisionLabel: meta.revisionLabel,
            }),
            ...deviceInfo,
          }),
        });
      } catch (error) {
        console.error('trackDesignView failed:', error);
      }
    },
    [sessionId]
  );

  return { sessionId, trackView, trackDownload, trackDesignView };
}
