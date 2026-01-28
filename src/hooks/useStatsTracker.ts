import { useCallback, useEffect, useRef, useState } from 'react';

type ViewType = 'folder' | 'image';

function getSessionIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/session_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
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
        // eslint-disable-next-line no-console
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
        await fetch('/api/stats/track-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, type, path, name }),
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('trackView failed:', error);
      }
    },
    [sessionId],
  );

  const trackDownload = useCallback(
    async (filePath: string, fileName: string) => {
      if (!sessionId) return;

      try {
        await fetch('/api/stats/track-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, filePath, fileName }),
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('trackDownload failed:', error);
      }
    },
    [sessionId],
  );

  return { sessionId, trackView, trackDownload };
}
