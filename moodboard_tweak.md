# Interaktywne rysowanie w czasie rzeczywistym — plan

## Stan obecny

| Element | Aktualnie | Problem |
|---------|-----------|---------|
| Transport | HTTP POST z debounce 2.5s | Inni widzą zmiany dopiero po odświeżeniu |
| Persystencja | JSON na dysku (plik per board) | Brak wersjonowania, konflikty przy równoczesnym zapisie |
| Obecność | Brak | Nie wiadomo kto jest na boardzie |
| Rysowanie | Lokalne, zapis po `pointerUp` | Zero feedbacku dla innych użytkowników |
| Zależności | `@upstash/redis` już w `package.json` | Nieużywany do real-time |

---

## Architektura docelowa

```
┌─────────────┐         ┌─────────────┐
│  Przeglądarka A       │  Przeglądarka B
│  (rysuje)    │         │  (obserwuje) │
└──────┬──────┘         └──────▲──────┘
       │ WebSocket              │ WebSocket
       ▼                        │
┌──────────────────────────────────────┐
│         Next.js Custom Server        │
│    socket.io  +  API Routes          │
│                                      │
│  ┌─────────────────────────────┐     │
│  │   Room per board (boardId)  │     │
│  │  - connected users[]        │     │
│  │  - drawing state per user   │     │
│  │  - operation log (ring buf) │     │
│  └─────────────────────────────┘     │
└──────────────┬───────────────────────┘
               │
       ┌───────▼───────┐
       │  Upstash Redis │  ← pub/sub między instancjami
       └───────┬───────┘     (jeśli >1 replica na Railway)
               │
       ┌───────▼───────┐
       │  Pliki JSON    │  ← zapis stanu co N sekund
       └───────────────┘     (debounced, nie per-stroke)
```

---

## Fazy implementacji

### Faza 1 — Obecność + powiadomienia (SSE, ~1-2 dni)

Minimalne zmiany, zero nowych zależności. Korzystamy z Server-Sent Events (działa z API Routes Next.js).

**Nowy endpoint:** `pages/api/moodboard/stream.ts`

```
GET /api/moodboard/stream?boardId=xxx
→ SSE stream: text/event-stream
```

**Eventy:**

| Event | Payload | Kiedy |
|-------|---------|-------|
| `user:join` | `{ email, color, timestamp }` | User otwiera board |
| `user:leave` | `{ email }` | Disconnect / zamknięcie karty |
| `user:drawing` | `{ email, sketchId, tool }` | User zaczyna rysować |
| `user:idle` | `{ email }` | User kończy rysować |
| `board:updated` | `{ version, timestamp }` | Stan boardu się zmienił |

**Jak to działa:**
1. Klient otwiera SSE po załadowaniu boardu
2. Serwer trzyma `Map<boardId, Set<Response>>` aktywnych połączeń
3. Gdy user zapisuje (POST `/api/moodboard/state`), serwer broadcastuje `board:updated` do pozostałych
4. Klient odbierający `board:updated` fetchuje nowy stan (GET) i merguje

**UI:**
- Awatary/inicjały zalogowanych userów w prawym górnym rogu boardu
- Kolorowa ramka wokół szkicu gdy ktoś na nim rysuje ("Anna rysuje...")
- Pulsujący indicator przy nazwie boardu gdy są inni online

**Ograniczenia fazy 1:**
- Widać EFEKT rysowania dopiero po zapisie (2.5s debounce + fetch)
- Brak live preview kresek
- Wystarczające dla "ktoś tu jest i coś zmienia"

---

### Faza 2 — Live stroke streaming (WebSocket, ~3-5 dni)

Pełna interaktywność: widzisz kreski innych w czasie rzeczywistym.

**Nowa zależność:** `socket.io` + `socket.io-client`

**Custom server:** `server.ts` (wymagany dla socket.io z Next.js)

```typescript
// server.ts — szkic
import { createServer } from 'http';
import next from 'next';
import { Server as SocketServer } from 'socket.io';

const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new SocketServer(httpServer, {
    path: '/ws',
    cors: { origin: process.env.NEXT_PUBLIC_URL }
  });

  io.on('connection', (socket) => {
    // Room management per boardId
    socket.on('board:join', ({ boardId, user }) => { ... });
    socket.on('board:leave', () => { ... });

    // Drawing events — relay to room
    socket.on('draw:start', (data) => { ... });
    socket.on('draw:points', (data) => { ... });
    socket.on('draw:end', (data) => { ... });
    socket.on('draw:shape', (data) => { ... });

    // Cursor position (throttled)
    socket.on('cursor:move', (data) => { ... });
  });

  httpServer.listen(process.env.PORT || 3000);
});
```

**Protokół rysowania:**

```
draw:start  → { strokeId, tool, color, width, sketchId, points: [x,y,p] }
draw:points → { strokeId, points: [x1,y1,p1, x2,y2,p2, ...] }  // batch co 30-50ms
draw:end    → { strokeId, sketchId }
draw:shape  → { shape: MoodboardDrawShape, sketchId }             // po zakończeniu kształtu
draw:undo   → { strokeId }                                        // usunięcie ostatniego stroke
```

**Jak to działa:**

1. User A rysuje → `DrawingCanvas` emituje `draw:start` + `draw:points` (throttle 30ms)
2. Serwer broadcastuje do rooma (bez User A)
3. User B otrzymuje eventy → renderuje "ghost strokes" (półprzezroczyste, inny kolor/kursor)
4. Po `draw:end` → ghost stroke staje się normalnym stroke w drawing data
5. Serwer akumuluje operacje i zapisuje do pliku co 5s (nie per-stroke!)

**Zmiany w DrawingCanvas:**

```typescript
// Nowe props:
interface DrawingCanvasProps {
  // ... istniejące
  remoteStrokes?: RemoteStroke[];      // Kreski innych userów (live preview)
  remoteCursors?: RemoteCursor[];      // Pozycje kursorów
}

interface RemoteStroke {
  id: string;
  userId: string;
  userColor: string;    // Każdy user ma unikalny kolor kursora
  tool: DrawingTool;
  points: number[];
  color: string;
  width: number;
}

interface RemoteCursor {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  tool: DrawingTool;
  isDrawing: boolean;
}
```

**Dodatkowa warstwa Konva w DrawingCanvas:**

```tsx
{/* Remote users layer — between drawn elements and local preview */}
<Layer listening={false} opacity={0.7}>
  {remoteStrokes?.map(rs => (
    <StrokePath key={rs.id} stroke={rs} />
  ))}
  {remoteCursors?.map(rc => (
    <RemoteCursorIndicator key={rc.userId} cursor={rc} />
  ))}
</Layer>
```

**Throttling i batching:**
- `draw:points` — batch punktów co 30-50ms (nie wysyłamy każdego pixela osobno)
- `cursor:move` — throttle 100ms
- Serwer nie zapisuje do pliku per-stroke, akumuluje w pamięci i flushuje co 5s

---

### Faza 3 — Bezpieczeństwo i konflikty (~2-3 dni)

**Blokada edycji (locking):**

```typescript
// Sketch-level lock (nie board-level — to by zablokowało za dużo)
interface SketchLock {
  sketchId: string;
  lockedBy: string;       // email
  lockedAt: number;       // timestamp
  expiresAt: number;      // auto-expire po 30s bez aktywności
}
```

- Gdy user zaczyna rysować na szkicu → `lock:acquire({ sketchId })`
- Serwer sprawdza czy nie jest locked przez kogoś innego
- Jeśli locked → UI pokazuje "Anna rysuje na tym szkicu" + blokada interakcji
- Lock auto-wygasa po 30s braku `draw:points` (zabezpieczenie przed disconnectem)
- Przy `draw:end` → `lock:release({ sketchId })`

**Conflict resolution (prosty model):**
- Last-write-wins na poziomie stroke (nie na poziomie boardu)
- Każdy stroke ma `timestamp` + `userId`
- Przy merge: sortuj po timestamp, zachowaj wszystkie
- Usuwanie stroke wymaga `draw:undo` z `strokeId` — serwer weryfikuje ownership

**Wersjonowanie:**

```typescript
interface BoardVersion {
  version: number;        // Inkrementowany przy każdym utrwalonym zapisie
  lastModifiedBy: string;
  timestamp: number;
}
```

- Klient wysyła `version` przy POST
- Jeśli `version` na serwerze jest wyższy → conflict → klient pobiera nowy stan i merguje
- Merge: union strokes po `id`, union shapes po `id`

---

### Faza 4 — Opcjonalna: CRDT (Yjs) (~1-2 tygodnie)

Dla pełnej offline-first + conflict-free współpracy. Prawdopodobnie overkill na obecnym etapie.

- `yjs` + `y-websocket` zamiast ręcznego protokołu
- `Y.Array<MoodboardStroke>` per sketch
- Automatyczny merge bez konfliktów
- Undo/redo gratis
- Offline support (sync po reconnect)

**Kiedy warto:** gdy pojawi się potrzeba jednoczesnej edycji tego samego szkicu przez >2 osoby, lub gdy offline support jest priorytetem. Na ten moment fazy 1-3 powinny wystarczyć.

---

## Rekomendowana kolejność

```
Faza 1 (SSE + obecność)     ███░░░░░░░  ~1-2 dni
  ↓
Faza 2 (WebSocket + live)   █████░░░░░  ~3-5 dni
  ↓
Faza 3 (locki + wersje)     ███░░░░░░░  ~2-3 dni
  ↓
Faza 4 (CRDT — opcjonalna)  ████████░░  ~1-2 tyg.
```

**Zalecenie:** Zacząć od Fazy 1 → szybki wynik, zero ryzyka. Faza 2 daje "wow effect" z live rysowaniem. Faza 3 jest niezbędna przed produkcją z wieloma userami.

---

## Zmiany w istniejącym kodzie

### `next.config.js`
- Dodać `ws://` do `connect-src` w CSP headers

### `package.json`
- `socket.io: ^4.x`, `socket.io-client: ^4.x`
- `start` script: `node server.js` zamiast `next start`

### `railway.json`
- `startCommand: "node server.js"`

### `src/contexts/MoodboardContext.tsx`
- Nowy hook `useMoodboardSocket()` — zarządza połączeniem WS
- Emituje eventy rysowania z `DrawingCanvas`
- Odbiera remote strokes i presence

### `src/components/moodboard/DrawingCanvas.tsx`
- Nowe props: `remoteStrokes`, `remoteCursors`
- Dodatkowa Konva Layer dla remote content
- Callback `onStrokeProgress(points[])` dla live streaming

### `src/components/moodboard/SketchItem.tsx` / `ImageItem.tsx`
- Przekazanie remote data z kontekstu do DrawingCanvas
- Indicator "Ktoś rysuje" na locked sketch
- Blokada wejścia w tryb rysowania gdy sketch locked

### Nowe pliki
- `server.ts` — custom Next.js server z socket.io
- `src/hooks/useMoodboardSocket.ts` — hook WS
- `src/components/moodboard/RemoteCursorIndicator.tsx` — kursor innego usera
- `src/components/moodboard/PresenceBar.tsx` — lista online userów
- `pages/api/moodboard/stream.ts` — SSE endpoint (faza 1)

---

## Szacowany wpływ na UX

| Metryka | Teraz | Po fazie 1 | Po fazie 2 |
|---------|-------|-----------|-----------|
| Czas do zobaczenia zmian innego usera | ∞ (wymaga refresh) | ~3s (debounce + fetch) | ~50ms (live WS) |
| Wiedza kto jest online | Brak | Awatary + indicator | Kursory na canvasie |
| Feedback "ktoś rysuje" | Brak | Pulsujący indicator | Live preview kresek |
| Bezpieczeństwo danych | Nadpisywanie | Wersjonowanie | Locki + merge |
