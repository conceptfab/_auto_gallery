import { useEffect, useRef, useState, useCallback } from 'react';

export interface OnlineUser {
  email: string;
  color: string;
}

export interface DrawingPresence {
  email: string;
  color: string;
  sketchId: string;
  tool: string;
}

interface UseBoardSSEOptions {
  boardId: string | null;
  enabled: boolean;
}

export function useBoardSSE({ boardId, enabled }: UseBoardSSEOptions) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [drawingUsers, setDrawingUsers] = useState<Map<string, DrawingPresence>>(new Map());
  const [myColor, setMyColor] = useState<string>('#999');
  const [boardUpdated, setBoardUpdated] = useState<number>(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !boardId) return;

    function connect() {
      if (!mountedRef.current) return;

      const es = new EventSource(`/api/moodboard/stream?boardId=${boardId}`);
      esRef.current = es;

      es.addEventListener('init', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setOnlineUsers(data.users);
        setMyColor(data.yourColor);
      });

      es.addEventListener('user:join', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setOnlineUsers(prev => {
          if (prev.some(u => u.email === data.email)) return prev;
          return [...prev, { email: data.email, color: data.color }];
        });
      });

      es.addEventListener('user:leave', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setOnlineUsers(prev => prev.filter(u => u.email !== data.email));
        setDrawingUsers(prev => {
          if (!prev.has(data.email)) return prev;
          const m = new Map(prev);
          m.delete(data.email);
          return m;
        });
      });

      es.addEventListener('user:drawing', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setDrawingUsers(prev => new Map(prev).set(data.email, data));
      });

      es.addEventListener('user:idle', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setDrawingUsers(prev => {
          if (!prev.has(data.email)) return prev;
          const m = new Map(prev);
          m.delete(data.email);
          return m;
        });
      });

      es.addEventListener('board:updated', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setBoardUpdated(data.timestamp);
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Reconnect after 3s
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setOnlineUsers([]);
      setDrawingUsers(new Map());
    };
  }, [boardId, enabled]);

  const notifyDrawing = useCallback((sketchId: string, tool: string) => {
    if (!boardId) return;
    fetch('/api/moodboard/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId, action: 'drawing', sketchId, tool }),
      credentials: 'same-origin',
    }).catch(() => {});
  }, [boardId]);

  const notifyIdle = useCallback(() => {
    if (!boardId) return;
    fetch('/api/moodboard/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId, action: 'idle' }),
      credentials: 'same-origin',
    }).catch(() => {});
  }, [boardId]);

  return {
    onlineUsers,
    drawingUsers,
    myColor,
    boardUpdated,
    notifyDrawing,
    notifyIdle,
  };
}
