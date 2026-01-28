# System Statystyk Użytkowników - Plan Wdrożenia

## 1. Przegląd

System statystyk użytkowników dla Content Browser pozwoli administratorowi śledzić:
- **Historię logowań** - kiedy użytkownik się logował, z jakiego IP
- **Czas spędzony na stronie** - sesje z czasem rozpoczęcia i zakończenia
- **Przeglądane treści** - które foldery i obrazy użytkownik oglądał
- **Pobrania plików** - które pliki zostały pobrane
- **Statystyki zbiorcze** - liczba wizyt, najpopularniejsze obrazy, aktywność

---

## 2. Struktura Danych

### 2.1 Nowe interfejsy TypeScript (`src/types/stats.ts`)

```typescript
// Pojedyncze logowanie użytkownika
export interface UserLogin {
  email: string;
  timestamp: string;      // ISO date
  ip: string;
  userAgent?: string;
}

// Sesja użytkownika (od logowania do wylogowania/zamknięcia)
export interface UserSession {
  id: string;             // sess_xxxxxxxx
  email: string;
  startedAt: string;      // ISO date
  endedAt?: string;       // ISO date (null jeśli aktywna)
  lastActivity: string;   // ISO date ostatniej aktywności
  ip: string;
  userAgent?: string;
}

// Zdarzenie przeglądania (folder lub obraz)
export interface ViewEvent {
  id: string;             // view_xxxxxxxx
  email: string;
  sessionId: string;
  timestamp: string;
  type: 'folder' | 'image';
  path: string;           // ścieżka do folderu/obrazu
  folderName?: string;    // nazwa folderu (dla kontekstu)
  imageName?: string;     // nazwa pliku obrazu
  duration?: number;      // czas oglądania w sekundach (dla obrazów)
}

// Zdarzenie pobrania pliku
export interface DownloadEvent {
  id: string;             // dl_xxxxxxxx
  email: string;
  sessionId: string;
  timestamp: string;
  filePath: string;
  fileName: string;
  fileSize?: number;
}

// Statystyki zbiorcze użytkownika
export interface UserStats {
  email: string;
  totalLogins: number;
  totalSessions: number;
  totalTimeSpent: number;       // w sekundach
  totalImagesViewed: number;
  totalFoldersViewed: number;
  totalDownloads: number;
  lastLogin?: string;
  lastActivity?: string;
  favoriteFolder?: string;      // najczęściej odwiedzany
}

// Główna struktura statystyk w storage
export interface StatsData {
  logins: UserLogin[];
  sessions: UserSession[];
  viewEvents: ViewEvent[];
  downloadEvents: DownloadEvent[];
  // Opcjonalnie: cache dla szybszego dostępu
  userStatsCache?: Record<string, UserStats>;
}
```

### 2.2 Rozszerzenie StorageData (`src/utils/storage.ts`)

```typescript
interface StorageData {
  // ... istniejące pola ...

  // NOWE: Statystyki użytkowników
  stats?: StatsData;
}
```

---

## 3. Nowe Pliki do Utworzenia

### 3.1 Backend - API Endpoints

| Plik | Opis |
|------|------|
| `pages/api/stats/track-view.ts` | Zapisuje zdarzenie przeglądania folderu/obrazu |
| `pages/api/stats/track-download.ts` | Zapisuje zdarzenie pobrania pliku |
| `pages/api/stats/session-heartbeat.ts` | Aktualizuje aktywność sesji (heartbeat) |
| `pages/api/stats/end-session.ts` | Kończy sesję użytkownika |
| `pages/api/admin/stats/overview.ts` | Pobiera ogólne statystyki (tylko admin) |
| `pages/api/admin/stats/user-details.ts` | Pobiera szczegóły statystyk użytkownika |
| `pages/api/admin/stats/activity-log.ts` | Pobiera log aktywności |
| `pages/api/admin/stats/export.ts` | Eksportuje statystyki do CSV/JSON |

### 3.2 Backend - Utility Functions

| Plik | Opis |
|------|------|
| `src/utils/statsStorage.ts` | Funkcje CRUD dla statystyk |
| `src/types/stats.ts` | Interfejsy TypeScript dla statystyk |

### 3.3 Frontend - Komponenty

| Plik | Opis |
|------|------|
| `src/components/admin/StatsOverview.tsx` | Główny dashboard statystyk |
| `src/components/admin/UserStatsCard.tsx` | Karta ze statystykami użytkownika |
| `src/components/admin/ActivityTimeline.tsx` | Timeline aktywności |
| `src/components/admin/StatsCharts.tsx` | Wykresy (opcjonalnie) |
| `src/hooks/useStatsTracker.ts` | Hook do trackingu na frontendzie |

---

## 4. Szczegóły Implementacji

### 4.1 Tracking Logowań

**Modyfikacja:** `pages/api/auth/verify-code.ts`

Po pomyślnej weryfikacji kodu dodać:
```typescript
import { recordLogin, startSession } from '@/src/utils/statsStorage';

// Po udanym logowaniu:
await recordLogin(email, req.headers['x-forwarded-for'] || req.socket.remoteAddress, req.headers['user-agent']);
const session = await startSession(email, ip, userAgent);
// Zapisz sessionId w cookie lub zwróć w odpowiedzi
```

### 4.2 Tracking Sesji (Heartbeat)

**Nowy endpoint:** `pages/api/stats/session-heartbeat.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { updateSessionActivity } from '@/src/utils/statsStorage';
import { getAuthEmail } from '@/src/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = getAuthEmail(req);
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = req.body;
  await updateSessionActivity(sessionId);

  res.json({ success: true });
}
```

**Frontend hook:** `src/hooks/useStatsTracker.ts`

```typescript
import { useEffect, useRef } from 'react';

export function useStatsTracker(sessionId: string | null) {
  const lastViewRef = useRef<string | null>(null);

  // Heartbeat co 60 sekund
  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(() => {
      fetch('/api/stats/session-heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [sessionId]);

  // Funkcja do trackowania widoków
  const trackView = async (type: 'folder' | 'image', path: string, name: string) => {
    if (!sessionId) return;

    // Unikaj duplikatów
    const viewKey = `${type}:${path}`;
    if (lastViewRef.current === viewKey) return;
    lastViewRef.current = viewKey;

    await fetch('/api/stats/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type, path, name })
    });
  };

  // Funkcja do trackowania pobrań
  const trackDownload = async (filePath: string, fileName: string) => {
    if (!sessionId) return;

    await fetch('/api/stats/track-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, filePath, fileName })
    });
  };

  return { trackView, trackDownload };
}
```

### 4.3 Tracking Przeglądanych Treści

**Modyfikacja:** `src/components/Gallery.tsx`

```typescript
import { useStatsTracker } from '@/src/hooks/useStatsTracker';

// W komponencie Gallery:
const { trackView } = useStatsTracker(sessionId);

// Przy otwieraniu folderu:
const handleFolderOpen = (folder: GalleryFolder) => {
  trackView('folder', folder.path, folder.name);
  // ... istniejąca logika
};

// Przy kliknięciu w obraz (lightbox):
const handleImageClick = (image: ImageFile) => {
  trackView('image', image.path, image.name);
  // ... istniejąca logika
};
```

### 4.4 Tracking Pobrań

**Modyfikacja:** `src/utils/downloadUtils.ts`

```typescript
export async function downloadFile(
  url: string,
  filename?: string,
  trackFn?: (filePath: string, fileName: string) => Promise<void>
): Promise<void> {
  try {
    // Śledź pobranie
    if (trackFn && filename) {
      await trackFn(url, filename);
    }

    // ... istniejąca logika pobierania
  } catch (error) {
    console.error('Błąd pobierania pliku:', error);
  }
}
```

### 4.5 Panel Admina - Sekcja Statystyk

**Nowy komponent:** `src/components/admin/StatsOverview.tsx`

```typescript
import React, { useState, useEffect } from 'react';

interface StatsOverviewData {
  totalUsers: number;
  activeUsers: number;       // aktywni w ostatnich 24h
  totalSessions: number;
  totalViews: number;
  totalDownloads: number;
  topUsers: Array<{
    email: string;
    sessions: number;
    views: number;
    downloads: number;
    lastActive: string;
  }>;
  recentActivity: Array<{
    email: string;
    action: string;
    target: string;
    timestamp: string;
  }>;
}

export function StatsOverview() {
  const [data, setData] = useState<StatsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('week');

  useEffect(() => {
    fetchStats();
  }, [dateRange]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/stats/overview?range=${dateRange}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Ładowanie statystyk...</div>;
  if (!data) return <div>Brak danych</div>;

  return (
    <div className="stats-overview">
      {/* Karty z podsumowaniem */}
      <div className="stats-cards">
        <div className="stats-card">
          <h4>Użytkownicy</h4>
          <div className="stats-value">{data.totalUsers}</div>
          <div className="stats-label">aktywnych: {data.activeUsers}</div>
        </div>
        <div className="stats-card">
          <h4>Sesje</h4>
          <div className="stats-value">{data.totalSessions}</div>
        </div>
        <div className="stats-card">
          <h4>Wyświetlenia</h4>
          <div className="stats-value">{data.totalViews}</div>
        </div>
        <div className="stats-card">
          <h4>Pobrania</h4>
          <div className="stats-value">{data.totalDownloads}</div>
        </div>
      </div>

      {/* Tabela top użytkowników */}
      <div className="stats-section">
        <h3>Najaktywniejszi użytkownicy</h3>
        <table className="stats-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Sesje</th>
              <th>Wyświetlenia</th>
              <th>Pobrania</th>
              <th>Ostatnia aktywność</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {data.topUsers.map(user => (
              <tr key={user.email}>
                <td>{user.email}</td>
                <td>{user.sessions}</td>
                <td>{user.views}</td>
                <td>{user.downloads}</td>
                <td>{new Date(user.lastActive).toLocaleString('pl-PL')}</td>
                <td>
                  <button onClick={() => showUserDetails(user.email)}>
                    Szczegóły
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Timeline ostatniej aktywności */}
      <div className="stats-section">
        <h3>Ostatnia aktywność</h3>
        <div className="activity-timeline">
          {data.recentActivity.map((activity, idx) => (
            <div key={idx} className="activity-item">
              <span className="activity-time">
                {new Date(activity.timestamp).toLocaleString('pl-PL')}
              </span>
              <span className="activity-user">{activity.email}</span>
              <span className="activity-action">{activity.action}</span>
              <span className="activity-target">{activity.target}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 5. Zmiany w Istniejących Plikach

### 5.1 `src/utils/storage.ts`

Dodać import i rozszerzyć interfejs:

```typescript
// Na początku pliku:
import { StatsData, UserLogin, UserSession, ViewEvent, DownloadEvent } from '../types/stats';

// Rozszerzyć StorageData:
interface StorageData {
  // ... istniejące pola ...
  stats?: StatsData;
}

// Rozszerzyć defaultData:
const defaultData: StorageData = {
  // ... istniejące pola ...
  stats: {
    logins: [],
    sessions: [],
    viewEvents: [],
    downloadEvents: []
  }
};
```

### 5.2 `pages/admin.tsx`

Dodać nową sekcję statystyk:

```typescript
import { StatsOverview } from '../src/components/admin/StatsOverview';

// W JSX, po sekcji "Ustawienia":
{/* Statystyki użytkowników */}
<section className="admin-section">
  <h2 className="admin-section-title" style={{ color: '#00BCD4', borderBottom: '2px solid #00BCD4' }}>
    Statystyki użytkowników
  </h2>
  <StatsOverview />
</section>
```

### 5.3 `pages/api/auth/verify-code.ts`

Po udanym logowaniu dodać tracking:

```typescript
import { recordLogin, startSession } from '@/src/utils/statsStorage';

// Po: await loginUser(email);
const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.socket.remoteAddress || 'unknown';
const userAgent = req.headers['user-agent'] || 'unknown';

await recordLogin(email, ip, userAgent);
const session = await startSession(email, ip, userAgent);

// Dodać sessionId do odpowiedzi lub cookie
res.setHeader('Set-Cookie', [
  // ... istniejące cookies ...
  `session_id=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`
]);
```

### 5.4 `pages/api/auth/logout.ts`

Dodać zakończenie sesji:

```typescript
import { endSession } from '@/src/utils/statsStorage';

// Na początku handlera:
const sessionId = req.cookies.session_id;
if (sessionId) {
  await endSession(sessionId);
}
```

---

## 6. Nowy Plik: `src/utils/statsStorage.ts`

```typescript
import { getData, updateData } from './storage';
import { UserLogin, UserSession, ViewEvent, DownloadEvent, UserStats } from '../types/stats';

// Generowanie unikalnych ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ==================== LOGOWANIA ====================

export async function recordLogin(email: string, ip: string, userAgent?: string): Promise<UserLogin> {
  const login: UserLogin = {
    email,
    timestamp: new Date().toISOString(),
    ip,
    userAgent
  };

  await updateData(data => {
    if (!data.stats) {
      data.stats = { logins: [], sessions: [], viewEvents: [], downloadEvents: [] };
    }
    data.stats.logins.push(login);

    // Ogranicz historię do ostatnich 10000 logowań
    if (data.stats.logins.length > 10000) {
      data.stats.logins = data.stats.logins.slice(-10000);
    }
  });

  return login;
}

export async function getLoginHistory(email?: string, limit: number = 100): Promise<UserLogin[]> {
  const data = await getData();
  let logins = data.stats?.logins || [];

  if (email) {
    logins = logins.filter(l => l.email === email);
  }

  return logins.slice(-limit).reverse();
}

// ==================== SESJE ====================

export async function startSession(email: string, ip: string, userAgent?: string): Promise<UserSession> {
  const session: UserSession = {
    id: generateId('sess'),
    email,
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    ip,
    userAgent
  };

  await updateData(data => {
    if (!data.stats) {
      data.stats = { logins: [], sessions: [], viewEvents: [], downloadEvents: [] };
    }
    data.stats.sessions.push(session);
  });

  return session;
}

export async function updateSessionActivity(sessionId: string): Promise<void> {
  await updateData(data => {
    const session = data.stats?.sessions.find(s => s.id === sessionId);
    if (session && !session.endedAt) {
      session.lastActivity = new Date().toISOString();
    }
  });
}

export async function endSession(sessionId: string): Promise<void> {
  await updateData(data => {
    const session = data.stats?.sessions.find(s => s.id === sessionId);
    if (session && !session.endedAt) {
      session.endedAt = new Date().toISOString();
    }
  });
}

export async function getActiveSession(email: string): Promise<UserSession | null> {
  const data = await getData();
  const sessions = data.stats?.sessions || [];

  // Znajdź aktywną sesję (bez endedAt, aktywność w ciągu ostatnich 2h)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  return sessions.find(s =>
    s.email === email &&
    !s.endedAt &&
    s.lastActivity > twoHoursAgo
  ) || null;
}

// ==================== ZDARZENIA WYŚWIETLEŃ ====================

export async function recordViewEvent(
  email: string,
  sessionId: string,
  type: 'folder' | 'image',
  path: string,
  name: string
): Promise<ViewEvent> {
  const event: ViewEvent = {
    id: generateId('view'),
    email,
    sessionId,
    timestamp: new Date().toISOString(),
    type,
    path,
    [type === 'folder' ? 'folderName' : 'imageName']: name
  };

  await updateData(data => {
    if (!data.stats) {
      data.stats = { logins: [], sessions: [], viewEvents: [], downloadEvents: [] };
    }
    data.stats.viewEvents.push(event);

    // Ogranicz do ostatnich 50000 zdarzeń
    if (data.stats.viewEvents.length > 50000) {
      data.stats.viewEvents = data.stats.viewEvents.slice(-50000);
    }
  });

  return event;
}

export async function getViewEvents(
  email?: string,
  type?: 'folder' | 'image',
  limit: number = 100
): Promise<ViewEvent[]> {
  const data = await getData();
  let events = data.stats?.viewEvents || [];

  if (email) {
    events = events.filter(e => e.email === email);
  }
  if (type) {
    events = events.filter(e => e.type === type);
  }

  return events.slice(-limit).reverse();
}

// ==================== ZDARZENIA POBRAŃ ====================

export async function recordDownloadEvent(
  email: string,
  sessionId: string,
  filePath: string,
  fileName: string,
  fileSize?: number
): Promise<DownloadEvent> {
  const event: DownloadEvent = {
    id: generateId('dl'),
    email,
    sessionId,
    timestamp: new Date().toISOString(),
    filePath,
    fileName,
    fileSize
  };

  await updateData(data => {
    if (!data.stats) {
      data.stats = { logins: [], sessions: [], viewEvents: [], downloadEvents: [] };
    }
    data.stats.downloadEvents.push(event);

    // Ogranicz do ostatnich 10000 zdarzeń
    if (data.stats.downloadEvents.length > 10000) {
      data.stats.downloadEvents = data.stats.downloadEvents.slice(-10000);
    }
  });

  return event;
}

export async function getDownloadEvents(email?: string, limit: number = 100): Promise<DownloadEvent[]> {
  const data = await getData();
  let events = data.stats?.downloadEvents || [];

  if (email) {
    events = events.filter(e => e.email === email);
  }

  return events.slice(-limit).reverse();
}

// ==================== STATYSTYKI ZBIORCZE ====================

export async function getUserStats(email: string): Promise<UserStats> {
  const data = await getData();
  const stats = data.stats || { logins: [], sessions: [], viewEvents: [], downloadEvents: [] };

  const userLogins = stats.logins.filter(l => l.email === email);
  const userSessions = stats.sessions.filter(s => s.email === email);
  const userViews = stats.viewEvents.filter(v => v.email === email);
  const userDownloads = stats.downloadEvents.filter(d => d.email === email);

  // Oblicz czas spędzony (suma zakończonych sesji)
  const totalTimeSpent = userSessions.reduce((total, session) => {
    if (session.endedAt) {
      const start = new Date(session.startedAt).getTime();
      const end = new Date(session.endedAt).getTime();
      return total + Math.floor((end - start) / 1000);
    }
    return total;
  }, 0);

  // Znajdź najczęściej odwiedzany folder
  const folderCounts: Record<string, number> = {};
  userViews.filter(v => v.type === 'folder').forEach(v => {
    folderCounts[v.folderName || v.path] = (folderCounts[v.folderName || v.path] || 0) + 1;
  });
  const favoriteFolder = Object.entries(folderCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  const lastLogin = userLogins.length > 0
    ? userLogins[userLogins.length - 1].timestamp
    : undefined;

  const lastActivity = userSessions.length > 0
    ? userSessions[userSessions.length - 1].lastActivity
    : undefined;

  return {
    email,
    totalLogins: userLogins.length,
    totalSessions: userSessions.length,
    totalTimeSpent,
    totalImagesViewed: userViews.filter(v => v.type === 'image').length,
    totalFoldersViewed: userViews.filter(v => v.type === 'folder').length,
    totalDownloads: userDownloads.length,
    lastLogin,
    lastActivity,
    favoriteFolder
  };
}

export async function getOverviewStats(dateRange?: { start: Date; end: Date }): Promise<{
  totalUsers: number;
  activeUsers: number;
  totalSessions: number;
  totalViews: number;
  totalDownloads: number;
  topUsers: Array<{
    email: string;
    sessions: number;
    views: number;
    downloads: number;
    lastActive: string;
  }>;
  recentActivity: Array<{
    email: string;
    action: string;
    target: string;
    timestamp: string;
  }>;
}> {
  const data = await getData();
  const stats = data.stats || { logins: [], sessions: [], viewEvents: [], downloadEvents: [] };

  // Filtruj po dacie jeśli podano
  const filterByDate = <T extends { timestamp: string }>(items: T[]): T[] => {
    if (!dateRange) return items;
    return items.filter(item => {
      const date = new Date(item.timestamp);
      return date >= dateRange.start && date <= dateRange.end;
    });
  };

  const filteredLogins = filterByDate(stats.logins);
  const filteredViews = filterByDate(stats.viewEvents);
  const filteredDownloads = filterByDate(stats.downloadEvents);

  // Unikalni użytkownicy
  const allUsers = new Set([
    ...stats.logins.map(l => l.email),
    ...stats.sessions.map(s => s.email)
  ]);

  // Aktywni w ostatnich 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const activeUsers = new Set(
    stats.sessions
      .filter(s => s.lastActivity > oneDayAgo)
      .map(s => s.email)
  );

  // Top użytkownicy
  const userStats: Record<string, { sessions: number; views: number; downloads: number; lastActive: string }> = {};

  for (const email of allUsers) {
    const userSessions = stats.sessions.filter(s => s.email === email);
    const userViews = filteredViews.filter(v => v.email === email);
    const userDownloads = filteredDownloads.filter(d => d.email === email);

    userStats[email] = {
      sessions: userSessions.length,
      views: userViews.length,
      downloads: userDownloads.length,
      lastActive: userSessions.length > 0
        ? userSessions[userSessions.length - 1].lastActivity
        : ''
    };
  }

  const topUsers = Object.entries(userStats)
    .map(([email, s]) => ({ email, ...s }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Ostatnia aktywność (mix wszystkich zdarzeń)
  const recentActivity: Array<{ email: string; action: string; target: string; timestamp: string }> = [];

  filteredViews.slice(-20).forEach(v => {
    recentActivity.push({
      email: v.email,
      action: v.type === 'folder' ? 'otworzył folder' : 'obejrzał obraz',
      target: v.folderName || v.imageName || v.path,
      timestamp: v.timestamp
    });
  });

  filteredDownloads.slice(-10).forEach(d => {
    recentActivity.push({
      email: d.email,
      action: 'pobrał plik',
      target: d.fileName,
      timestamp: d.timestamp
    });
  });

  recentActivity.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return {
    totalUsers: allUsers.size,
    activeUsers: activeUsers.size,
    totalSessions: stats.sessions.length,
    totalViews: filteredViews.length,
    totalDownloads: filteredDownloads.length,
    topUsers,
    recentActivity: recentActivity.slice(0, 20)
  };
}

// ==================== CZYSZCZENIE STARYCH DANYCH ====================

export async function cleanupOldStats(daysToKeep: number = 90): Promise<{
  deletedLogins: number;
  deletedSessions: number;
  deletedViews: number;
  deletedDownloads: number;
}> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

  let deletedLogins = 0;
  let deletedSessions = 0;
  let deletedViews = 0;
  let deletedDownloads = 0;

  await updateData(data => {
    if (!data.stats) return;

    const originalLogins = data.stats.logins.length;
    const originalSessions = data.stats.sessions.length;
    const originalViews = data.stats.viewEvents.length;
    const originalDownloads = data.stats.downloadEvents.length;

    data.stats.logins = data.stats.logins.filter(l => l.timestamp > cutoffDate);
    data.stats.sessions = data.stats.sessions.filter(s => s.startedAt > cutoffDate);
    data.stats.viewEvents = data.stats.viewEvents.filter(v => v.timestamp > cutoffDate);
    data.stats.downloadEvents = data.stats.downloadEvents.filter(d => d.timestamp > cutoffDate);

    deletedLogins = originalLogins - data.stats.logins.length;
    deletedSessions = originalSessions - data.stats.sessions.length;
    deletedViews = originalViews - data.stats.viewEvents.length;
    deletedDownloads = originalDownloads - data.stats.downloadEvents.length;
  });

  return { deletedLogins, deletedSessions, deletedViews, deletedDownloads };
}
```

---

## 7. Style CSS

Dodać do pliku stylów (np. `styles/admin.css` lub `styles/globals.css`):

```css
/* Statystyki - karty */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.stats-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.stats-card h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  opacity: 0.9;
}

.stats-value {
  font-size: 32px;
  font-weight: bold;
}

.stats-label {
  font-size: 12px;
  opacity: 0.8;
  margin-top: 5px;
}

/* Statystyki - tabela */
.stats-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
}

.stats-table th,
.stats-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.stats-table th {
  background: #f5f5f5;
  font-weight: 600;
  color: #333;
}

.stats-table tr:hover {
  background: #f9f9f9;
}

/* Timeline aktywności */
.activity-timeline {
  max-height: 400px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  gap: 15px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

.activity-time {
  color: #666;
  min-width: 140px;
}

.activity-user {
  color: #9C27B0;
  font-weight: 500;
  min-width: 180px;
}

.activity-action {
  color: #333;
}

.activity-target {
  color: #2196F3;
  word-break: break-all;
}

/* Filtr dat */
.stats-date-filter {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.stats-date-filter button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.stats-date-filter button.active,
.stats-date-filter button:hover {
  background: #00BCD4;
  color: white;
  border-color: #00BCD4;
}

/* Sekcja statystyk */
.stats-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.stats-section h3 {
  margin: 0 0 15px 0;
  color: #333;
  border-bottom: 2px solid #00BCD4;
  padding-bottom: 10px;
}
```

---

## 8. Kolejność Wdrożenia

### Faza 1: Backend (podstawy)
1. Utworzyć `src/types/stats.ts`
2. Utworzyć `src/utils/statsStorage.ts`
3. Rozszerzyć `src/utils/storage.ts`

### Faza 2: API Endpoints
4. `pages/api/stats/track-view.ts`
5. `pages/api/stats/track-download.ts`
6. `pages/api/stats/session-heartbeat.ts`
7. `pages/api/stats/end-session.ts`
8. `pages/api/admin/stats/overview.ts`
9. `pages/api/admin/stats/user-details.ts`

### Faza 3: Integracja z logowaniem
10. Zmodyfikować `pages/api/auth/verify-code.ts`
11. Zmodyfikować `pages/api/auth/logout.ts`

### Faza 4: Frontend tracking
12. Utworzyć `src/hooks/useStatsTracker.ts`
13. Zmodyfikować `src/components/Gallery.tsx`
14. Zmodyfikować `src/utils/downloadUtils.ts`

### Faza 5: Panel Admina
15. Utworzyć `src/components/admin/StatsOverview.tsx`
16. Zmodyfikować `pages/admin.tsx`
17. Dodać style CSS

### Faza 6: Dodatkowe funkcje (opcjonalnie)
18. Eksport do CSV/JSON
19. Wykresy (chart.js lub recharts)
20. Szczegółowy widok użytkownika

---

## 9. Testowanie

### Scenariusze testowe:
1. **Logowanie** - sprawdzić czy zapisuje się rekord logowania i tworzy się sesja
2. **Przeglądanie** - sprawdzić czy kliknięcia w foldery/obrazy są rejestrowane
3. **Pobieranie** - sprawdzić czy pobrania są rejestrowane
4. **Heartbeat** - sprawdzić czy sesja się aktualizuje
5. **Wylogowanie** - sprawdzić czy sesja jest kończona
6. **Panel admina** - sprawdzić czy statystyki się wyświetlają
7. **Filtrowanie po dacie** - sprawdzić czy filtry działają

---

## 10. Uwagi dotyczące wydajności

1. **Limity danych** - automatyczne przycinanie starych rekordów
2. **Cache** - wykorzystanie istniejącego cache w storage.ts
3. **Debouncing** - heartbeat co 60s, a nie przy każdej akcji
4. **Lazy loading** - ładowanie statystyk tylko gdy admin otwiera sekcję
5. **Paginacja** - dla długich list aktywności

---

## 11. Prywatność i RODO

Należy rozważyć:
1. Informowanie użytkowników o zbieraniu danych
2. Możliwość eksportu danych użytkownika
3. Możliwość usunięcia danych użytkownika
4. Anonimizacja IP (np. hash lub maskowanie)
5. Retencja danych (automatyczne usuwanie po X dniach)

---

## 12. Przyszłe rozszerzenia

1. **Wykresy** - wizualizacja aktywności w czasie
2. **Alerty** - powiadomienia o nietypowej aktywności
3. **Eksport raportów** - PDF/Excel
4. **Porównania** - porównanie aktywności między użytkownikami
5. **Heatmapa** - najpopularniejsze obrazy/foldery
6. **Geolokalizacja** - mapa logowań (na podstawie IP)
