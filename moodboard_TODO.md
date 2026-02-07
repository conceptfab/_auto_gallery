# Moodboard Real-Time — szczegolowy TODO

> Dokument implementacyjny na bazie `moodboard_tweak.md`.
> Kazde zadanie zawiera: pliki do zmiany, co dokladnie zrobic, snippety kodu, zaleznosci.

---

## Legenda

- `[NEW]` — nowy plik
- `[MOD]` — modyfikacja istniejacego pliku
- `[CFG]` — zmiana konfiguracji / zależności
- `BLOKUJE: X` — zadanie X nie moze ruszyc zanim to sie nie skonczy

---

# FAZA 1 — Obecnosc + powiadomienia (SSE)

Cel: userzy widza kto jest na boardzie, dostaja powiadomienie gdy ktos zmieni stan.
Zero nowych zaleznosci npm.

---

## 1.1 [NEW] Modul SSE — serwer broadcastu

**Plik:** `src/lib/sse-broker.ts`

Singleton in-memory broker do zarzadzania polaczeniami SSE.
Jeden proces Node — nie potrzebujemy jeszcze Redis pub/sub.

```typescript
// src/lib/sse-broker.ts

import type { ServerResponse } from 'http';

export interface SSEClient {
  id: string;
  res: ServerResponse;
  boardId: string;
  email: string;
}

// Kolory przypisywane userom (cyklicznie)
const USER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f97316',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

class SSEBroker {
  private clients: Map<string, SSEClient> = new Map();
  private colorIndex = 0;
  private userColors: Map<string, string> = new Map();

  /** Dodaj klienta SSE do rooma (boardId) */
  addClient(client: SSEClient): void { ... }

  /** Usun klienta (disconnect) */
  removeClient(clientId: string): void { ... }

  /** Wyslij event do wszystkich w roomie OPROCZ senderId */
  broadcast(boardId: string, event: string, data: unknown, excludeId?: string): void {
    for (const client of this.clients.values()) {
      if (client.boardId === boardId && client.id !== excludeId) {
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    }
  }

  /** Wyslij event do WSZYSTKICH w roomie (wlacznie z senderem) */
  broadcastAll(boardId: string, event: string, data: unknown): void { ... }

  /** Pobierz liste userow online na boardzie */
  getOnlineUsers(boardId: string): { email: string; color: string }[] { ... }

  /** Przypisz kolor userowi (staly per sesja) */
  getUserColor(email: string): string {
    if (!this.userColors.has(email)) {
      this.userColors.set(email, USER_COLORS[this.colorIndex % USER_COLORS.length]);
      this.colorIndex++;
    }
    return this.userColors.get(email)!;
  }
}

export const sseBroker = new SSEBroker();
```

BLOKUJE: 1.2, 1.3, 1.4

---

## 1.2 [NEW] Endpoint SSE stream

**Plik:** `pages/api/moodboard/stream.ts`

Klient laczy sie GET i dostaje stream eventow.

```typescript
// pages/api/moodboard/stream.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { sseBroker } from '@/src/lib/sse-broker';
import { verifyAuth } from '@/src/utils/auth'; // wyciagnac email z cookie

export const config = {
  api: { bodyParser: false },  // SSE nie potrzebuje parsowania body
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const boardId = req.query.boardId as string;
  if (!boardId) return res.status(400).json({ error: 'boardId required' });

  // Weryfikacja auth (cookie)
  const auth = verifyAuth(req);
  if (!auth?.email) return res.status(401).json({ error: 'Unauthorized' });

  const clientId = `${auth.email}-${Date.now()}`;

  // Naglowki SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // wylacz buforowanie nginx/Railway
  });
  res.flushHeaders();

  // Wyslij poczatkowy stan: kto jest online
  const onlineUsers = sseBroker.getOnlineUsers(boardId);
  res.write(`event: init\ndata: ${JSON.stringify({
    users: onlineUsers,
    yourColor: sseBroker.getUserColor(auth.email),
  })}\n\n`);

  // Zarejestruj klienta
  sseBroker.addClient({ id: clientId, res, boardId, email: auth.email });

  // Powiadom pozostalych
  sseBroker.broadcast(boardId, 'user:join', {
    email: auth.email,
    color: sseBroker.getUserColor(auth.email),
    timestamp: Date.now(),
  }, clientId);

  // Heartbeat co 30s (utrzymanie polaczenia)
  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 30_000);

  // Cleanup na disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseBroker.removeClient(clientId);
    sseBroker.broadcast(boardId, 'user:leave', { email: auth.email });
  });
}
```

**Zalezy od:** 1.1
**BLOKUJE:** 1.5

---

## 1.3 [MOD] Broadcast `board:updated` przy zapisie stanu

**Plik:** `pages/api/moodboard/state.ts`

Po utrwaleniu POST dodac broadcast do SSE.

**Dokladna zmiana — na koncu POST handlera (po zapisaniu plikow, przed `res.json`):**

```typescript
// Import na gorze pliku:
import { sseBroker } from '@/src/lib/sse-broker';

// W POST handler, po utrwaleniu na dysk, PRZED res.json({ success: true }):
const auth = verifyAuth(req);
if (auth?.email) {
  // Wyslij do pozostalych ze board sie zmienil
  const activeId = appState.activeId;
  sseBroker.broadcast(activeId, 'board:updated', {
    timestamp: Date.now(),
    updatedBy: auth.email,
  });
}
```

**Uwaga:** `verifyAuth` — trzeba wyciagnac/zreuzywac z istniejacego kodu auth.
Obecny state.ts nie sprawdza auth — moze potrzebna mini-refaktor.

**Zalezy od:** 1.1

---

## 1.4 [NEW] Endpoint do emitowania eventow rysowania (presence)

**Plik:** `pages/api/moodboard/presence.ts`

Lekki POST: user informuje ze zaczyna/konczy rysowanie.

```typescript
// pages/api/moodboard/presence.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { sseBroker } from '@/src/lib/sse-broker';
import { verifyAuth } from '@/src/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = verifyAuth(req);
  if (!auth?.email) return res.status(401).json({ error: 'Unauthorized' });

  const { boardId, action, sketchId, tool } = req.body;
  // action: 'drawing' | 'idle' | 'cursor'

  if (action === 'drawing') {
    sseBroker.broadcast(boardId, 'user:drawing', {
      email: auth.email,
      color: sseBroker.getUserColor(auth.email),
      sketchId,
      tool,
    });
  } else if (action === 'idle') {
    sseBroker.broadcast(boardId, 'user:idle', {
      email: auth.email,
    });
  }

  res.json({ ok: true });
}
```

**Zalezy od:** 1.1

---

## 1.5 [NEW] Hook kliencki `useBoardSSE`

**Plik:** `src/hooks/useBoardSSE.ts`

Laczy sie z SSE, zarzadza reconnect, eksponuje stan.

```typescript
// src/hooks/useBoardSSE.ts

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
  enabled: boolean;  // tylko dla zalogowanych
}

export function useBoardSSE({ boardId, enabled }: UseBoardSSEOptions) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [drawingUsers, setDrawingUsers] = useState<Map<string, DrawingPresence>>(new Map());
  const [myColor, setMyColor] = useState<string>('#999');
  const [boardUpdated, setBoardUpdated] = useState<number>(0); // timestamp ostatniego updatu
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !boardId) return;

    const es = new EventSource(`/api/moodboard/stream?boardId=${boardId}`);
    esRef.current = es;

    es.addEventListener('init', (e) => {
      const data = JSON.parse(e.data);
      setOnlineUsers(data.users);
      setMyColor(data.yourColor);
    });

    es.addEventListener('user:join', (e) => {
      const data = JSON.parse(e.data);
      setOnlineUsers(prev => {
        if (prev.some(u => u.email === data.email)) return prev;
        return [...prev, { email: data.email, color: data.color }];
      });
    });

    es.addEventListener('user:leave', (e) => {
      const data = JSON.parse(e.data);
      setOnlineUsers(prev => prev.filter(u => u.email !== data.email));
      setDrawingUsers(prev => { const m = new Map(prev); m.delete(data.email); return m; });
    });

    es.addEventListener('user:drawing', (e) => {
      const data = JSON.parse(e.data);
      setDrawingUsers(prev => new Map(prev).set(data.email, data));
    });

    es.addEventListener('user:idle', (e) => {
      const data = JSON.parse(e.data);
      setDrawingUsers(prev => { const m = new Map(prev); m.delete(data.email); return m; });
    });

    es.addEventListener('board:updated', (e) => {
      const data = JSON.parse(e.data);
      setBoardUpdated(data.timestamp);
    });

    es.onerror = () => {
      // EventSource auto-reconnects, ale wyczysc stan
      es.close();
      // Reconnect po 3s
      setTimeout(() => {
        // re-mount ustawia nowy EventSource
      }, 3000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [boardId, enabled]);

  // Funkcja do informowania serwera o aktywnosci rysowania
  const notifyDrawing = useCallback((sketchId: string, tool: string) => {
    if (!boardId) return;
    fetch('/api/moodboard/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId, action: 'drawing', sketchId, tool }),
    }).catch(() => {});
  }, [boardId]);

  const notifyIdle = useCallback(() => {
    if (!boardId) return;
    fetch('/api/moodboard/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId, action: 'idle' }),
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
```

**Zalezy od:** 1.2
**BLOKUJE:** 1.6, 1.7, 1.8

---

## 1.6 [MOD] Integracja SSE z MoodboardContext

**Plik:** `src/contexts/MoodboardContext.tsx`

### 1.6a — Podlaczyc `useBoardSSE` do providera

Wewnatrz `MoodboardProvider` (po liniach ~127-130 gdzie sa stany drawingMode):

```typescript
import { useBoardSSE } from '@/src/hooks/useBoardSSE';
import { useAuth } from '@/src/contexts/AuthContext';

// Wewnatrz MoodboardProvider:
const { authStatus } = useAuth();
const boardSSE = useBoardSSE({
  boardId: appState.activeId,
  enabled: !!authStatus?.isLoggedIn,
});
```

### 1.6b — Auto-refetch po `board:updated`

Reagowac na `boardSSE.boardUpdated` — pobranie nowego stanu z serwera.

```typescript
// Nowy useEffect:
useEffect(() => {
  if (!boardSSE.boardUpdated) return;
  // Ktos inny zmienil board — pobierz nowy stan
  fetch(API_STATE, { credentials: 'same-origin' })
    .then(r => r.json())
    .then(data => {
      if (data.success && data.state) {
        // Merge: zachowaj lokalne zmiany jesli sa nowsze
        setAppState(prev => mergeRemoteState(prev, data.state));
      }
    })
    .catch(() => {});
}, [boardSSE.boardUpdated]);
```

### 1.6c — Eksportowac dane presence w kontekscie

Dodac do `MoodboardContextValue`:

```typescript
// Nowe pola:
onlineUsers: { email: string; color: string }[];
drawingUsers: Map<string, DrawingPresence>;
myColor: string;
notifyDrawing: (sketchId: string, tool: string) => void;
notifyIdle: () => void;
```

### 1.6d — Merge helper

```typescript
// src/lib/merge-board.ts  [NEW]

import type { MoodboardAppState, MoodboardBoard } from '@/src/types/moodboard';

/**
 * Prosty merge: dla aktywnego boardu — union strokow/shapes po ID.
 * Jesli remote ma nowe stroki ktorych nie ma lokalnie — dodaj.
 * Nie usuwaj lokalnych — last-write-wins bedzie w fazie 3.
 */
export function mergeRemoteState(
  local: MoodboardAppState,
  remote: MoodboardAppState
): MoodboardAppState {
  // ... merge per-board, per-sketch stroki po id
  // ... merge per-image annotations po id
}
```

**Zalezy od:** 1.5

---

## 1.7 [NEW] Komponent PresenceBar

**Plik:** `src/components/moodboard/PresenceBar.tsx`

Wyswietla awatary (inicjaly + kolor) userow online.
Montowany w `Canvas.tsx` w prawym gornym rogu.

```typescript
// src/components/moodboard/PresenceBar.tsx

interface PresenceBarProps {
  onlineUsers: { email: string; color: string }[];
  drawingUsers: Map<string, { email: string; sketchId: string }>;
}

export default function PresenceBar({ onlineUsers, drawingUsers }: PresenceBarProps) {
  if (onlineUsers.length === 0) return null;

  return (
    <div className="moodboard-presence-bar">
      {onlineUsers.map(u => {
        const initials = u.email.slice(0, 2).toUpperCase();
        const isDrawing = drawingUsers.has(u.email);
        return (
          <div
            key={u.email}
            className={`moodboard-presence-avatar${isDrawing ? ' moodboard-presence-avatar--drawing' : ''}`}
            style={{ backgroundColor: u.color }}
            title={`${u.email}${isDrawing ? ' (rysuje)' : ''}`}
          >
            {initials}
          </div>
        );
      })}
    </div>
  );
}
```

**Zalezy od:** 1.6

---

## 1.8 [MOD] Montaz PresenceBar w Canvas

**Plik:** `src/components/moodboard/Canvas.tsx`

Dodac na poczatku renderowanego diva (obok kontekstowego menu):

```tsx
import PresenceBar from './PresenceBar';

// W renderze, wewnatrz glownego diva canvasu:
<PresenceBar
  onlineUsers={onlineUsers}
  drawingUsers={drawingUsers}
/>
```

**Zalezy od:** 1.7

---

## 1.9 [MOD] Powiadamianie o rysowaniu z SketchItem / ImageItem

**Pliki:**
- `src/components/moodboard/SketchItem.tsx`
- `src/components/moodboard/ImageItem.tsx`

Gdy user wchodzi w tryb rysowania (`setDrawingMode(true)`) — wywolac `notifyDrawing`.
Gdy wychodzi — `notifyIdle`.

```typescript
// W SketchItem, po setDrawingMode(true):
notifyDrawing(sketch.id, activeTool);

// W SketchItem/ImageItem, po setDrawingMode(false):
notifyIdle();
```

Dodac tez indicator na SketchItem: jesli ktos inny rysuje na tym szkicu,
pokazac kolorowa ramke + tooltip "Anna rysuje...":

```tsx
const otherDrawing = Array.from(drawingUsers.values()).find(
  d => d.sketchId === sketch.id
);

// W renderze:
{otherDrawing && (
  <div
    className="sketch-remote-drawing-indicator"
    style={{ borderColor: otherDrawing.color }}
  >
    {otherDrawing.email.split('@')[0]} rysuje...
  </div>
)}
```

**Zalezy od:** 1.6

---

## 1.10 [MOD] CSS — style presence

**Plik:** `styles/globals.css`

```css
/* --- Presence bar --- */
.moodboard-presence-bar {
  position: fixed;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
  z-index: 100;
  pointer-events: none;
}

.moodboard-presence-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  pointer-events: auto;
  cursor: default;
}

.moodboard-presence-avatar--drawing {
  animation: presence-pulse 1.2s ease-in-out infinite;
}

@keyframes presence-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
}

/* --- Remote drawing indicator na sketch --- */
.sketch-remote-drawing-indicator {
  position: absolute;
  inset: -3px;
  border: 2px dashed;
  border-radius: 10px;
  pointer-events: none;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 2px;
  font-size: 11px;
  font-weight: 600;
  color: inherit;
}
```

---

## 1.11 [MOD] CSP — dodac self dla EventSource

**Plik:** `next.config.js`

`connect-src` juz ma `'self'`, wiec EventSource do `/api/moodboard/stream`
bedzie dzialac bez zmian. **Nie trzeba nic zmieniac w fazie 1.**

Zmiana bedzie potrzebna w fazie 2 (WebSocket `ws://` / `wss://`).

---

## 1.12 [NEW] Util: `verifyAuth` dla API routes

**Plik:** `src/utils/auth.ts` lub nowy `src/lib/api-auth.ts`

Sprawdzic czy juz istnieje helper do wyciagania emaila z cookie w API routes.
Jesli nie — wyciagnac logike z `/api/auth/status.ts` do reużywalnej funkcji:

```typescript
export function verifyAuth(req: NextApiRequest): { email: string; isAdmin: boolean } | null {
  const authEmail = req.cookies['auth_email'];
  if (!authEmail) return null;
  // Weryfikacja HMAC podpisu...
  const [email, sig] = authEmail.split('.');
  // ... sprawdzenie podpisu ...
  return { email, isAdmin: checkAdmin(email) };
}
```

**BLOKUJE:** 1.2, 1.3, 1.4

---

# FAZA 2 — Live stroke streaming (WebSocket)

Cel: widzisz kreski innych userow w czasie rzeczywistym (~50ms lag).

---

## 2.1 [CFG] Instalacja socket.io

```bash
npm install socket.io socket.io-client
npm install -D @types/socket.io  # jesli potrzebne
```

**BLOKUJE:** 2.2, 2.3

---

## 2.2 [NEW] Custom Next.js server

**Plik:** `server.ts` (root projektu)

```typescript
// server.ts

import { createServer } from 'http';
import next from 'next';
import { Server as SocketServer } from 'socket.io';
import { setupSocketHandlers } from './src/lib/socket-handlers';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new SocketServer(httpServer, {
    path: '/ws',
    cors: {
      origin: dev ? 'http://localhost:3000' : process.env.NEXT_PUBLIC_URL,
      credentials: true,
    },
    // Transport: preferuj WebSocket, fallback na polling
    transports: ['websocket', 'polling'],
  });

  setupSocketHandlers(io);

  const port = parseInt(process.env.PORT || '3000', 10);
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
```

**BLOKUJE:** 2.3

---

## 2.3 [NEW] Socket event handlers

**Plik:** `src/lib/socket-handlers.ts`

```typescript
// src/lib/socket-handlers.ts

import type { Server, Socket } from 'socket.io';

interface RoomUser {
  socketId: string;
  email: string;
  color: string;
}

// Stan per-room (board)
const rooms = new Map<string, Map<string, RoomUser>>(); // boardId -> Map<socketId, user>

// Locki per-sketch
const sketchLocks = new Map<string, { email: string; expiresAt: number }>();

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {

    // --- DOLACZANIE DO BOARDU ---
    socket.on('board:join', ({ boardId, email, color }) => {
      socket.join(boardId);
      socket.data = { boardId, email, color };

      if (!rooms.has(boardId)) rooms.set(boardId, new Map());
      rooms.get(boardId)!.set(socket.id, { socketId: socket.id, email, color });

      // Powiadom pozostalych
      socket.to(boardId).emit('user:join', { email, color, timestamp: Date.now() });

      // Wyslij liste online do dolaczajacego
      const users = Array.from(rooms.get(boardId)!.values());
      socket.emit('room:state', { users });
    });

    // --- RYSOWANIE: START ---
    socket.on('draw:start', (data) => {
      // data: { strokeId, sketchId, tool, color, width, points }
      const { boardId } = socket.data;
      socket.to(boardId).emit('draw:start', {
        ...data,
        userId: socket.data.email,
        userColor: socket.data.color,
      });
    });

    // --- RYSOWANIE: PUNKTY (batch co 30-50ms) ---
    socket.on('draw:points', (data) => {
      // data: { strokeId, points: number[] }  (batch nowych punktow)
      const { boardId } = socket.data;
      socket.to(boardId).volatile.emit('draw:points', {
        ...data,
        userId: socket.data.email,
      });
      // .volatile = OK jesli zgubi sie jeden batch (plynnosc > kompletnosc)
    });

    // --- RYSOWANIE: KONIEC ---
    socket.on('draw:end', (data) => {
      // data: { strokeId, sketchId, finalStroke: MoodboardStroke }
      const { boardId } = socket.data;
      socket.to(boardId).emit('draw:end', {
        ...data,
        userId: socket.data.email,
      });
    });

    // --- KSZTALT: GOTOWY ---
    socket.on('draw:shape', (data) => {
      // data: { sketchId, shape: MoodboardDrawShape }
      const { boardId } = socket.data;
      socket.to(boardId).emit('draw:shape', {
        ...data,
        userId: socket.data.email,
      });
    });

    // --- KURSOR ---
    socket.on('cursor:move', (data) => {
      // data: { x, y, sketchId }
      const { boardId } = socket.data;
      socket.to(boardId).volatile.emit('cursor:move', {
        ...data,
        userId: socket.data.email,
        userColor: socket.data.color,
      });
    });

    // --- LOCK SZKICU (faza 3 ale zarezerwowane) ---
    socket.on('lock:acquire', ({ sketchId }) => { /* ... */ });
    socket.on('lock:release', ({ sketchId }) => { /* ... */ });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
      const { boardId, email } = socket.data || {};
      if (boardId && rooms.has(boardId)) {
        rooms.get(boardId)!.delete(socket.id);
        if (rooms.get(boardId)!.size === 0) rooms.delete(boardId);
        socket.to(boardId).emit('user:leave', { email });
      }
    });
  });

  // Czyszczenie wygaslych lockow co 10s
  setInterval(() => {
    const now = Date.now();
    for (const [key, lock] of sketchLocks) {
      if (lock.expiresAt < now) sketchLocks.delete(key);
    }
  }, 10_000);
}
```

**Zalezy od:** 2.2

---

## 2.4 [NEW] Hook kliencki `useMoodboardSocket`

**Plik:** `src/hooks/useMoodboardSocket.ts`

Zastepuje `useBoardSSE` z fazy 1 (lub dziala obok — SSE mozna zostawic jako fallback).

```typescript
// src/hooks/useMoodboardSocket.ts

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { MoodboardStroke, MoodboardDrawShape } from '@/src/types/moodboard';

export interface RemoteStroke {
  id: string;
  userId: string;
  userColor: string;
  tool: string;
  points: number[];
  color: string;
  width: number;
}

export interface RemoteCursor {
  userId: string;
  color: string;
  x: number;
  y: number;
  sketchId: string;
}

interface UseMoodboardSocketOptions {
  boardId: string | null;
  email: string | null;
  userColor: string;
  enabled: boolean;
}

export function useMoodboardSocket({ boardId, email, userColor, enabled }: UseMoodboardSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [remoteStrokes, setRemoteStrokes] = useState<Map<string, RemoteStroke>>(new Map());
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [completedRemoteStrokes, setCompletedRemoteStrokes] = useState<MoodboardStroke[]>([]);
  const [completedRemoteShapes, setCompletedRemoteShapes] = useState<MoodboardDrawShape[]>([]);

  useEffect(() => {
    if (!enabled || !boardId || !email) return;

    const socket = io({ path: '/ws', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('board:join', { boardId, email, color: userColor });
    });

    // Remote stroke start
    socket.on('draw:start', (data) => {
      setRemoteStrokes(prev => new Map(prev).set(data.strokeId, {
        id: data.strokeId,
        userId: data.userId,
        userColor: data.userColor,
        tool: data.tool,
        points: data.points,
        color: data.color,
        width: data.width,
      }));
    });

    // Remote stroke points (live update)
    socket.on('draw:points', (data) => {
      setRemoteStrokes(prev => {
        const map = new Map(prev);
        const existing = map.get(data.strokeId);
        if (existing) {
          map.set(data.strokeId, {
            ...existing,
            points: [...existing.points, ...data.points],
          });
        }
        return map;
      });
    });

    // Remote stroke completed
    socket.on('draw:end', (data) => {
      setRemoteStrokes(prev => { const m = new Map(prev); m.delete(data.strokeId); return m; });
      if (data.finalStroke) {
        setCompletedRemoteStrokes(prev => [...prev, data.finalStroke]);
      }
    });

    // Remote shape completed
    socket.on('draw:shape', (data) => {
      setCompletedRemoteShapes(prev => [...prev, data.shape]);
    });

    // Remote cursors
    socket.on('cursor:move', (data) => {
      setRemoteCursors(prev => new Map(prev).set(data.userId, {
        userId: data.userId,
        color: data.userColor,
        x: data.x,
        y: data.y,
        sketchId: data.sketchId,
      }));
    });

    socket.on('user:leave', (data) => {
      setRemoteCursors(prev => { const m = new Map(prev); m.delete(data.email); return m; });
      setRemoteStrokes(prev => {
        const m = new Map(prev);
        for (const [k, v] of m) { if (v.userId === data.email) m.delete(k); }
        return m;
      });
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [boardId, email, userColor, enabled]);

  // --- EMITTERY (wywolywane z DrawingCanvas) ---

  const emitDrawStart = useCallback((data: {
    strokeId: string; sketchId: string; tool: string;
    color: string; width: number; points: number[];
  }) => {
    socketRef.current?.emit('draw:start', data);
  }, []);

  const emitDrawPoints = useCallback((strokeId: string, points: number[]) => {
    socketRef.current?.emit('draw:points', { strokeId, points });
  }, []);

  const emitDrawEnd = useCallback((strokeId: string, sketchId: string, finalStroke: MoodboardStroke) => {
    socketRef.current?.emit('draw:end', { strokeId, sketchId, finalStroke });
  }, []);

  const emitDrawShape = useCallback((sketchId: string, shape: MoodboardDrawShape) => {
    socketRef.current?.emit('draw:shape', { sketchId, shape });
  }, []);

  const emitCursorMove = useCallback((x: number, y: number, sketchId: string) => {
    socketRef.current?.volatile.emit('cursor:move', { x, y, sketchId });
  }, []);

  // Konsumowanie zakonczonych strokow (po uzyciu wyzerowac)
  const consumeCompleted = useCallback(() => {
    const strokes = completedRemoteStrokes;
    const shapes = completedRemoteShapes;
    setCompletedRemoteStrokes([]);
    setCompletedRemoteShapes([]);
    return { strokes, shapes };
  }, [completedRemoteStrokes, completedRemoteShapes]);

  return {
    remoteStrokes: Array.from(remoteStrokes.values()),
    remoteCursors: Array.from(remoteCursors.values()),
    emitDrawStart,
    emitDrawPoints,
    emitDrawEnd,
    emitDrawShape,
    emitCursorMove,
    consumeCompleted,
  };
}
```

**Zalezy od:** 2.1, 2.3
**BLOKUJE:** 2.5, 2.6

---

## 2.5 [MOD] DrawingCanvas — emitowanie i renderowanie remote strokow

**Plik:** `src/components/moodboard/DrawingCanvas.tsx`

### 2.5a — Nowe props

```typescript
interface DrawingCanvasProps {
  // ... istniejace ...
  sketchId?: string;

  // Remote collaboration (opcjonalne — brak = brak real-time)
  remoteStrokes?: RemoteStroke[];
  remoteCursors?: RemoteCursor[];
  onStrokeStart?: (strokeId: string, tool: string, color: string, width: number, points: number[]) => void;
  onStrokePoints?: (strokeId: string, points: number[]) => void;
  onStrokeEnd?: (strokeId: string, finalStroke: MoodboardStroke) => void;
  onShapeEnd?: (shape: MoodboardDrawShape) => void;
  onCursorMove?: (x: number, y: number) => void;
}
```

### 2.5b — Emitowanie w handlerach

W `handlePointerDown`: po stworzeniu stroke, wywolac `onStrokeStart`.
W `handlePointerMove`: co 30-50ms (throttle), wywolac `onStrokePoints` z nowym batchem punktow.
W `handlePointerUp`: wywolac `onStrokeEnd` z finalnym stroke.

Throttle dla `onStrokePoints`:
```typescript
const lastEmitRef = useRef(0);
const pendingPointsRef = useRef<number[]>([]);
const EMIT_INTERVAL = 40; // ms

// W handlePointerMove, po dodaniu punktow:
pendingPointsRef.current.push(pos.x, pos.y, pressure);
const now = Date.now();
if (now - lastEmitRef.current >= EMIT_INTERVAL && onStrokePoints) {
  onStrokePoints(currentStrokeRef.current!.id, pendingPointsRef.current);
  pendingPointsRef.current = [];
  lastEmitRef.current = now;
}
```

### 2.5c — Renderowanie remote strokow (nowa warstwa Konva)

Miedzy "Drawn elements" Layer a "Preview" Layer:

```tsx
{/* Remote users — live strokes + cursors */}
<Layer listening={false} opacity={0.7}>
  {remoteStrokes?.map(rs => (
    <StrokePath key={rs.id} stroke={{
      id: rs.id,
      tool: rs.tool as 'pen' | 'eraser',
      points: rs.points,
      color: rs.color,
      width: rs.width,
    }} />
  ))}
  {remoteCursors?.filter(rc => rc.sketchId === sketchId).map(rc => (
    <React.Fragment key={rc.userId}>
      {/* Kolko kursora */}
      <Circle x={rc.x} y={rc.y} radius={6} fill={rc.color} opacity={0.8} />
      {/* Label z nazwa usera */}
      <Text x={rc.x + 10} y={rc.y - 6} text={rc.userId.split('@')[0]}
        fontSize={11} fill={rc.color} fontStyle="bold" />
    </React.Fragment>
  ))}
</Layer>
```

**Zalezy od:** 2.4

---

## 2.6 [MOD] SketchItem / ImageItem — przekazanie socket propsow do DrawingCanvas

**Pliki:**
- `src/components/moodboard/SketchItem.tsx`
- `src/components/moodboard/ImageItem.tsx`

Z kontekstu pobrac dane socketa i przekazac do DrawingCanvas:

```tsx
// Z kontekstu:
const { remoteStrokes, remoteCursors, emitDrawStart, emitDrawPoints, emitDrawEnd, emitDrawShape, emitCursorMove } = useMoodboard();

// Filtrowanie remote strokow dla tego sketch:
const myRemoteStrokes = remoteStrokes.filter(rs => /* sketchId match */);
const myRemoteCursors = remoteCursors.filter(rc => rc.sketchId === sketch.id);

<DrawingCanvas
  // ... istniejace props ...
  sketchId={sketch.id}
  remoteStrokes={myRemoteStrokes}
  remoteCursors={myRemoteCursors}
  onStrokeStart={(id, tool, color, width, points) =>
    emitDrawStart({ strokeId: id, sketchId: sketch.id, tool, color, width, points })
  }
  onStrokePoints={(id, points) => emitDrawPoints(id, points)}
  onStrokeEnd={(id, stroke) => emitDrawEnd(id, sketch.id, stroke)}
  onShapeEnd={(shape) => emitDrawShape(sketch.id, shape)}
  onCursorMove={(x, y) => emitCursorMove(x, y, sketch.id)}
/>
```

**Zalezy od:** 2.4, 2.5

---

## 2.7 [NEW] Komponent RemoteCursorIndicator (Konva)

**Plik:** `src/components/moodboard/drawing/RemoteCursorIndicator.tsx`

Konva Group: kolorowe kolko + label z nazwa usera.
Import `Circle`, `Text` z `react-konva`.
Uzycie w DrawingCanvas Layer (2.5c).

**Zalezy od:** 2.5

---

## 2.8 [CFG] Zmiana skryptow startowych

**Plik:** `package.json`

```json
{
  "scripts": {
    "dev": "ts-node --project tsconfig.server.json server.ts",
    "start": "node dist/server.js",
    "build": "node scripts/generate-version.js && next build && tsc --project tsconfig.server.json"
  }
}
```

Alternatywnie uzyc `tsx` zamiast `ts-node` (szybszy, zero konfiguracji):

```json
{
  "scripts": {
    "dev": "tsx server.ts",
    "start": "node dist/server.js",
    "build": "node scripts/generate-version.js && next build && tsc -p tsconfig.server.json"
  }
}
```

**Plik:** `railway.json`

```json
{
  "deploy": {
    "startCommand": "node dist/server.js"
  }
}
```

**Plik:** `tsconfig.server.json` [NEW]

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "dist",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["server.ts", "src/lib/socket-handlers.ts"]
}
```

**Zalezy od:** 2.2

---

## 2.9 [MOD] CSP — dodac WebSocket

**Plik:** `next.config.js`

```javascript
// Zmienic connect-src:
connect-src 'self' https://conceptfab.com ws://localhost:3000 wss://*.up.railway.app;
```

W produkcji na Railway URL bedzie `wss://conceptdesk-*.up.railway.app`.
Najlepiej uzyc env var: `wss://${process.env.RAILWAY_PUBLIC_DOMAIN}`.

**Zalezy od:** 2.2

---

# FAZA 3 — Bezpieczenstwo i konflikty

Cel: locki per-sketch, wersjonowanie, merge.

---

## 3.1 [MOD] Sketch locking — serwer

**Plik:** `src/lib/socket-handlers.ts`

Rozbudowac handlery `lock:acquire` i `lock:release`:

```typescript
socket.on('lock:acquire', ({ sketchId }) => {
  const existing = sketchLocks.get(sketchId);
  const now = Date.now();

  if (existing && existing.email !== socket.data.email && existing.expiresAt > now) {
    // Locked przez kogos innego
    socket.emit('lock:denied', { sketchId, lockedBy: existing.email });
    return;
  }

  // Przyznaj lock
  sketchLocks.set(sketchId, {
    email: socket.data.email,
    expiresAt: now + 30_000, // 30s timeout
  });

  socket.to(socket.data.boardId).emit('lock:acquired', {
    sketchId,
    lockedBy: socket.data.email,
    color: socket.data.color,
  });

  socket.emit('lock:granted', { sketchId });
});

socket.on('lock:release', ({ sketchId }) => {
  const existing = sketchLocks.get(sketchId);
  if (existing?.email === socket.data.email) {
    sketchLocks.delete(sketchId);
    socket.to(socket.data.boardId).emit('lock:released', { sketchId });
  }
});

// Przedluzanie locka przy kazdym draw:points
socket.on('draw:points', (data) => {
  // ... istniejacy broadcast ...
  const existing = sketchLocks.get(data.sketchId);
  if (existing?.email === socket.data.email) {
    existing.expiresAt = Date.now() + 30_000; // Odnow timeout
  }
});
```

---

## 3.2 [MOD] Lock UI — blokada rysowania gdy sketch locked

**Pliki:**
- `src/components/moodboard/SketchItem.tsx`
- `src/components/moodboard/ImageItem.tsx`

```tsx
// Z kontekstu:
const { sketchLocks } = useMoodboard();
const lock = sketchLocks.get(sketch.id);
const isLockedByOther = lock && lock.email !== myEmail;

// Zablokuj przycisk "Rysuj" jesli locked:
<button
  disabled={isLockedByOther}
  title={isLockedByOther ? `${lock.email} rysuje...` : 'Rysuj (D)'}
  onClick={() => { /* acquire lock, then setDrawingMode(true) */ }}
>
  {isLockedByOther ? `${lock.email.split('@')[0]} rysuje...` : 'Rysuj'}
</button>

// Przy wejsciu w tryb rysowania:
// 1. emitDrawLockAcquire(sketch.id)
// 2. Czekaj na 'lock:granted' callback
// 3. Dopiero wtedy setDrawingMode(true)
// 4. Jesli 'lock:denied' — pokaz toast "Szkic jest zablokowany przez X"

// Przy wyjsciu:
// emitDrawLockRelease(sketch.id)
```

---

## 3.3 [MOD] Wersjonowanie board state

**Plik:** `src/types/moodboard.ts`

Dodac wersje do boardu:

```typescript
export interface MoodboardBoard {
  // ... istniejace ...
  version?: number;          // Inkrementowany przy kazdym utrwalonym zapisie
  lastModifiedBy?: string;   // Email
  lastModifiedAt?: number;   // Timestamp
}
```

**Plik:** `pages/api/moodboard/state.ts`

W POST handler — przed zapisem:
```typescript
// Odczytaj obecna wersje z pliku
const existingBoard = JSON.parse(await fs.readFile(boardPath, 'utf-8'));
const clientVersion = board.version ?? 0;
const serverVersion = existingBoard.version ?? 0;

if (clientVersion < serverVersion) {
  // Conflict! Klient ma starsza wersje
  return res.status(409).json({
    error: 'conflict',
    serverVersion,
    serverState: existingBoard,
  });
}

// Inkrementuj wersje
board.version = serverVersion + 1;
board.lastModifiedBy = auth?.email;
board.lastModifiedAt = Date.now();
```

**Plik:** `src/contexts/MoodboardContext.tsx`

W `scheduleSave` — obsluga 409 conflict:
```typescript
saveStateToServer(nextAppState).then(
  () => setSaveError(null),
  async (err) => {
    if (err.status === 409) {
      // Conflict — pobierz nowy stan i merguj
      const remote = err.serverState;
      setAppState(prev => mergeRemoteState(prev, remote));
      // Retry save po merge
    } else {
      setSaveError(err.message);
    }
  }
);
```

---

## 3.4 [NEW] Merge helper — implementacja

**Plik:** `src/lib/merge-board.ts`

```typescript
import type { MoodboardBoard, DrawingData } from '@/src/types/moodboard';

/**
 * Merge drawing data: union strokow i shapes po ID.
 * Nowe elementy z obu stron sa zachowane.
 */
function mergeDrawingData(local: DrawingData, remote: DrawingData): DrawingData {
  const strokeIds = new Set(local.strokes.map(s => s.id));
  const shapeIds = new Set(local.shapes.map(s => s.id));

  return {
    strokes: [
      ...local.strokes,
      ...remote.strokes.filter(s => !strokeIds.has(s.id)),
    ],
    shapes: [
      ...local.shapes,
      ...remote.shapes.filter(s => !shapeIds.has(s.id)),
    ],
  };
}

/**
 * Merge dwoch wersji boardu.
 * Strategia: zachowaj wszystkie unikalne elementy z obu stron.
 */
export function mergeBoards(local: MoodboardBoard, remote: MoodboardBoard): MoodboardBoard {
  // Merge images (po id)
  const localImageIds = new Set(local.images.map(i => i.id));
  const mergedImages = [
    ...local.images.map(li => {
      const ri = remote.images.find(i => i.id === li.id);
      if (ri && li.annotations && ri.annotations) {
        return { ...li, annotations: mergeDrawingData(li.annotations, ri.annotations) };
      }
      return li;
    }),
    ...remote.images.filter(i => !localImageIds.has(i.id)),
  ];

  // Merge sketches (po id)
  const localSketchIds = new Set((local.sketches ?? []).map(s => s.id));
  const mergedSketches = [
    ...(local.sketches ?? []).map(ls => {
      const rs = (remote.sketches ?? []).find(s => s.id === ls.id);
      if (rs) {
        return { ...ls, drawing: mergeDrawingData(ls.drawing, rs.drawing) };
      }
      return ls;
    }),
    ...(remote.sketches ?? []).filter(s => !localSketchIds.has(s.id)),
  ];

  return {
    ...local,
    images: mergedImages,
    sketches: mergedSketches,
    version: Math.max(local.version ?? 0, remote.version ?? 0),
  };
}
```

---

# FAZA 4 — CRDT (opcjonalna, bez szczegolowego TODO)

Wymiana wlasnego protokolu merge na `yjs`:

- `npm install yjs y-websocket`
- Kazdy sketch → `Y.Doc` z `Y.Array<MoodboardStroke>` + `Y.Array<MoodboardDrawShape>`
- `y-websocket` provider zamiast custom socket.io handlers
- Automatyczny merge, offline sync, undo/redo
- Duzy refaktor — robic tylko jesli fazy 1-3 nie wystarczaja

---

# Kolejnosc pracy (dependency graph)

```
1.12 verifyAuth ──┐
                   ├──► 1.1 SSE Broker ──┬──► 1.2 SSE Endpoint ──► 1.5 useBoardSSE ──┐
                   │                      ├──► 1.3 broadcast w state.ts                │
                   │                      └──► 1.4 presence endpoint                   │
                   │                                                                    │
                   │    ┌───────────────────────────────────────────────────────────────┘
                   │    │
                   │    ├──► 1.6 Integracja z MoodboardContext
                   │    ├──► 1.7 PresenceBar ──► 1.8 Montaz w Canvas
                   │    ├──► 1.9 Notify z SketchItem/ImageItem
                   │    └──► 1.10 CSS
                   │
                   │    [FAZA 2]
                   │
2.1 npm install ──►├──► 2.2 server.ts ──► 2.3 socket-handlers ──► 2.4 useMoodboardSocket
                   │                                                       │
                   │    2.8 Skrypty startowe ◄─── 2.2                      │
                   │    2.9 CSP ◄─── 2.2                                   │
                   │                                                       │
                   │    2.5 DrawingCanvas remote ◄──── 2.4 ────► 2.6 SketchItem/ImageItem props
                   │    2.7 RemoteCursorIndicator ◄── 2.5
                   │
                   │    [FAZA 3]
                   │
                   ├──► 3.1 Lock serwer ──► 3.2 Lock UI
                   ├──► 3.3 Wersjonowanie
                   └──► 3.4 Merge helper
```

---

# Checklist testowy

## Faza 1
- [ ] Otworz board w 2 kartach (zalogowany na 2 rozne konta)
- [ ] Karta A widzi awatar karty B i odwrotnie
- [ ] Karta A rysuje na szkicu → po ~3s karta B widzi zmiany (po debounce + refetch)
- [ ] Karta A zamyka karte → awatar znika z karty B
- [ ] Karta A rysuje → karta B widzi pulsujacy indicator "rysuje"
- [ ] Reconnect SSE po zerwaniu polaczenia (zamnij laptop na 5s, otworz)

## Faza 2
- [ ] Karta A rysuje kreske → karta B widzi ja w CZASIE RZECZYWISTYM (ghost stroke)
- [ ] Po zakonczeniu kreski (mouseup) ghost staje sie normalnym stroke
- [ ] Kursor karty A widoczny na canvasie karty B (z labelem)
- [ ] Throttling: nie wiecej niz ~25-30 emitow/s per klient
- [ ] Disconnect: ghost strokes i kursor znikaja natychmiast

## Faza 3
- [ ] Karta A wchodzi w tryb rysowania → karta B widzi "Anna rysuje..." i nie moze rysowac
- [ ] Karta A zamyka karte w trakcie rysowania → lock wygasa po 30s
- [ ] Obie karty modyfikuja ROZNE szkice jednoczesnie → brak konfliktow
- [ ] Obie karty zapisuja w tym samym momencie → merge zamiast nadpisania
- [ ] Wersjonowanie: starszy klient dostaje 409 i automatycznie merguje
