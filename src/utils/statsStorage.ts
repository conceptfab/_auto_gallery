import path from 'path';
import fsp from 'fs/promises';
import { getData, getUsersDir } from './storage';
import type {
  UserLogin,
  UserSession,
  ViewEvent,
  DownloadEvent,
  UserStats,
  StatsData,
  DeviceInfo,
} from '../types/stats';

// Etap 3: jeden plik na dzień – users/stats-YYYY-MM-DD.json
const STATS_TIMEZONE = 'Europe/Warsaw';

interface DailyStatsFile {
  date: string;
  logins: UserLogin[];
  sessions: UserSession[];
  viewEvents: ViewEvent[];
  downloadEvents: DownloadEvent[];
}

function emptyDaily(dateStr: string): DailyStatsFile {
  return {
    date: dateStr,
    logins: [],
    sessions: [],
    viewEvents: [],
    downloadEvents: [],
  };
}

function getDateString(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: STATS_TIMEZONE });
}

function getDateFromTimestamp(iso: string): string {
  return getDateString(new Date(iso));
}

async function getStatsFilePath(dateStr: string): Promise<string> {
  const dir = await getUsersDir();
  return path.join(dir, `stats-${dateStr}.json`);
}

async function loadStatsFile(dateStr: string): Promise<DailyStatsFile> {
  const filePath = await getStatsFilePath(dateStr);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      date: dateStr,
      logins: Array.isArray(data.logins) ? data.logins : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      viewEvents: Array.isArray(data.viewEvents) ? data.viewEvents : [],
      downloadEvents: Array.isArray(data.downloadEvents)
        ? data.downloadEvents
        : [],
    };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') return emptyDaily(dateStr);
    console.error('Błąd ładowania stats dla', dateStr, err);
    return emptyDaily(dateStr);
  }
}

async function saveStatsFile(
  dateStr: string,
  data: DailyStatsFile
): Promise<void> {
  const dir = await getUsersDir();
  await fsp.mkdir(dir, { recursive: true });
  const filePath = await getStatsFilePath(dateStr);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fsp.rename(tmpPath, filePath);
}

let migrationDone = false;

async function migrateStatsToDailyFiles(): Promise<void> {
  if (migrationDone) return;
  const data = await getData();
  const stats = data.stats;
  if (
    !stats ||
    (stats.logins.length === 0 &&
      stats.sessions.length === 0 &&
      stats.viewEvents.length === 0 &&
      stats.downloadEvents.length === 0)
  ) {
    migrationDone = true;
    return;
  }
  const byDate: Record<string, DailyStatsFile> = {};
  const add = (dateStr: string) => {
    if (!byDate[dateStr]) byDate[dateStr] = emptyDaily(dateStr);
    return byDate[dateStr];
  };
  stats.logins.forEach((l) =>
    add(getDateFromTimestamp(l.timestamp)).logins.push(l)
  );
  stats.sessions.forEach((s) =>
    add(getDateFromTimestamp(s.startedAt)).sessions.push(s)
  );
  stats.viewEvents.forEach((v) =>
    add(getDateFromTimestamp(v.timestamp)).viewEvents.push(v)
  );
  stats.downloadEvents.forEach((d) =>
    add(getDateFromTimestamp(d.timestamp)).downloadEvents.push(d)
  );
  for (const dateStr of Object.keys(byDate).sort()) {
    await saveStatsFile(dateStr, byDate[dateStr]);
  }
  migrationDone = true;
}

async function listStatsDates(): Promise<string[]> {
  const dir = await getUsersDir();
  try {
    const names = await fsp.readdir(dir);
    const dates = names
      .filter((n) => n.startsWith('stats-') && n.endsWith('.json'))
      .map((n) => n.replace('stats-', '').replace('.json', ''));
    return dates.sort().reverse();
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') return [];
    return [];
  }
}

// Generowanie unikalnych ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

// ==================== LOGOWANIA ====================

export async function recordLogin(
  email: string,
  ip: string,
  userAgent?: string
): Promise<UserLogin> {
  await migrateStatsToDailyFiles();
  const login: UserLogin = {
    email,
    timestamp: new Date().toISOString(),
    ip,
    userAgent,
  };
  const today = getDateString(new Date());
  const day = await loadStatsFile(today);
  day.logins.push(login);
  await saveStatsFile(today, day);
  return login;
}

export async function getLoginHistory(
  email?: string,
  limit: number = 100
): Promise<UserLogin[]> {
  await migrateStatsToDailyFiles();
  const dates = await listStatsDates();
  const out: UserLogin[] = [];
  for (const dateStr of dates) {
    const day = await loadStatsFile(dateStr);
    let list = day.logins;
    if (email) list = list.filter((l) => l.email === email);
    for (const l of list.reverse()) {
      out.push(l);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

// ==================== SESJE ====================

export async function startSession(
  email: string,
  ip: string,
  userAgent?: string
): Promise<UserSession> {
  await migrateStatsToDailyFiles();
  const now = new Date().toISOString();
  const session: UserSession = {
    id: generateId('sess'),
    email,
    startedAt: now,
    lastActivity: now,
    ip,
    userAgent,
  };
  const today = getDateString(new Date());
  const day = await loadStatsFile(today);
  day.sessions.push(session);
  await saveStatsFile(today, day);
  return session;
}

export async function updateSessionActivity(sessionId: string): Promise<void> {
  const dates = await listStatsDates();
  const toCheck = dates.slice(0, 7);
  for (const dateStr of toCheck) {
    const day = await loadStatsFile(dateStr);
    const session = day.sessions.find((s) => s.id === sessionId);
    if (session && !session.endedAt) {
      session.lastActivity = new Date().toISOString();
      await saveStatsFile(dateStr, day);
      return;
    }
  }
}

export async function endSession(sessionId: string): Promise<void> {
  const dates = await listStatsDates();
  const toCheck = dates.slice(0, 7);
  for (const dateStr of toCheck) {
    const day = await loadStatsFile(dateStr);
    const session = day.sessions.find((s) => s.id === sessionId);
    if (session && !session.endedAt) {
      session.endedAt = new Date().toISOString();
      await saveStatsFile(dateStr, day);
      return;
    }
  }
}

export async function getActiveSession(
  email: string
): Promise<UserSession | null> {
  await migrateStatsToDailyFiles();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const dates = await listStatsDates();
  const toCheck = dates.slice(0, 3);
  for (const dateStr of toCheck) {
    const day = await loadStatsFile(dateStr);
    const session = day.sessions.find(
      (s) => s.email === email && !s.endedAt && s.lastActivity > twoHoursAgo
    );
    if (session) return session;
  }
  return null;
}

// ==================== ZDARZENIA WYŚWIETLEŃ ====================

export async function recordViewEvent(
  email: string,
  sessionId: string,
  type: 'folder' | 'image',
  path: string,
  name: string,
  ip?: string,
  userAgent?: string,
  deviceInfo?: DeviceInfo
): Promise<ViewEvent> {
  await migrateStatsToDailyFiles();
  const event: ViewEvent = {
    id: generateId('view'),
    email,
    sessionId,
    timestamp: new Date().toISOString(),
    type,
    path,
    [type === 'folder' ? 'folderName' : 'imageName']: name,
    ip,
    userAgent,
    deviceInfo,
  };
  const today = getDateString(new Date());
  const day = await loadStatsFile(today);
  day.viewEvents.push(event);
  await saveStatsFile(today, day);
  return event;
}

export async function getViewEvents(
  email?: string,
  type?: 'folder' | 'image',
  limit: number = 100
): Promise<ViewEvent[]> {
  await migrateStatsToDailyFiles();
  const dates = await listStatsDates();
  const out: ViewEvent[] = [];
  for (const dateStr of dates) {
    const day = await loadStatsFile(dateStr);
    let list = day.viewEvents;
    if (email) list = list.filter((e) => e.email === email);
    if (type) list = list.filter((e) => e.type === type);
    for (const e of list.reverse()) {
      out.push(e);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

// ==================== ZDARZENIA POBRAŃ ====================

export async function recordDownloadEvent(
  email: string,
  sessionId: string,
  filePath: string,
  fileName: string,
  fileSize?: number,
  ip?: string,
  userAgent?: string,
  deviceInfo?: DeviceInfo
): Promise<DownloadEvent> {
  await migrateStatsToDailyFiles();
  const event: DownloadEvent = {
    id: generateId('dl'),
    email,
    sessionId,
    timestamp: new Date().toISOString(),
    filePath,
    fileName,
    fileSize,
    ip,
    userAgent,
    deviceInfo,
  };
  const today = getDateString(new Date());
  const day = await loadStatsFile(today);
  day.downloadEvents.push(event);
  await saveStatsFile(today, day);
  return event;
}

export async function getDownloadEvents(
  email?: string,
  limit: number = 100
): Promise<DownloadEvent[]> {
  await migrateStatsToDailyFiles();
  const dates = await listStatsDates();
  const out: DownloadEvent[] = [];
  for (const dateStr of dates) {
    const day = await loadStatsFile(dateStr);
    let list = day.downloadEvents;
    if (email) list = list.filter((e) => e.email === email);
    for (const e of list.reverse()) {
      out.push(e);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

// ==================== STATYSTYKI ZBIORCZE ====================

async function aggregateStatsForUser(
  email: string,
  dates: string[]
): Promise<{
  logins: UserLogin[];
  sessions: UserSession[];
  viewEvents: ViewEvent[];
  downloadEvents: DownloadEvent[];
}> {
  const logins: UserLogin[] = [];
  const sessions: UserSession[] = [];
  const viewEvents: ViewEvent[] = [];
  const downloadEvents: DownloadEvent[] = [];
  for (const dateStr of dates) {
    const day = await loadStatsFile(dateStr);
    logins.push(...day.logins.filter((l) => l.email === email));
    sessions.push(...day.sessions.filter((s) => s.email === email));
    viewEvents.push(...day.viewEvents.filter((v) => v.email === email));
    downloadEvents.push(...day.downloadEvents.filter((d) => d.email === email));
  }
  return { logins, sessions, viewEvents, downloadEvents };
}

export async function getUserStats(email: string): Promise<UserStats> {
  await migrateStatsToDailyFiles();
  const dates = await listStatsDates();
  const {
    logins: userLogins,
    sessions: userSessions,
    viewEvents: userViews,
    downloadEvents: userDownloads,
  } = await aggregateStatsForUser(email, dates);

  const totalTimeSpent = userSessions.reduce((total, session) => {
    if (session.endedAt) {
      const start = new Date(session.startedAt).getTime();
      const end = new Date(session.endedAt).getTime();
      return total + Math.floor((end - start) / 1000);
    }
    return total;
  }, 0);

  const folderCounts: Record<string, number> = {};
  userViews
    .filter((v) => v.type === 'folder')
    .forEach((v) => {
      const key = v.folderName || v.path;
      folderCounts[key] = (folderCounts[key] || 0) + 1;
    });
  const favoriteFolder = Object.entries(folderCounts).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

  const lastLogin =
    userLogins.length > 0
      ? userLogins[userLogins.length - 1].timestamp
      : undefined;

  const lastActivity =
    userSessions.length > 0
      ? userSessions[userSessions.length - 1].lastActivity
      : undefined;

  return {
    email,
    totalLogins: userLogins.length,
    totalSessions: userSessions.length,
    totalTimeSpent,
    totalImagesViewed: userViews.filter((v) => v.type === 'image').length,
    totalFoldersViewed: userViews.filter((v) => v.type === 'folder').length,
    totalDownloads: userDownloads.length,
    lastLogin,
    lastActivity,
    favoriteFolder,
  };
}

export async function getOverviewStats(dateRange?: {
  start: Date;
  end: Date;
}): Promise<{
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
  await migrateStatsToDailyFiles();
  const dates = await listStatsDates();
  const stats: StatsData = {
    logins: [],
    sessions: [],
    viewEvents: [],
    downloadEvents: [],
  };
  const dateRangeStart = dateRange ? getDateString(dateRange.start) : null;
  const dateRangeEnd = dateRange ? getDateString(dateRange.end) : null;
  for (const dateStr of dates) {
    if (dateRangeStart && dateStr < dateRangeStart) continue;
    if (dateRangeEnd && dateStr > dateRangeEnd) continue;
    const day = await loadStatsFile(dateStr);
    stats.logins.push(...day.logins);
    stats.sessions.push(...day.sessions);
    stats.viewEvents.push(...day.viewEvents);
    stats.downloadEvents.push(...day.downloadEvents);
  }

  const filterByDate = <T extends { timestamp: string }>(items: T[]): T[] => {
    if (!dateRange) return items;
    return items.filter((item) => {
      const date = new Date(item.timestamp);
      return date >= dateRange.start && date <= dateRange.end;
    });
  };

  const filteredViews = filterByDate(stats.viewEvents);
  const filteredDownloads = filterByDate(stats.downloadEvents);

  const allUsers = new Set<string>([
    ...stats.logins.map((l) => l.email),
    ...stats.sessions.map((s) => s.email),
  ]);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const activeUsersSet = new Set(
    stats.sessions.filter((s) => s.lastActivity > oneDayAgo).map((s) => s.email)
  );

  const userStatsMap: Record<
    string,
    { sessions: number; views: number; downloads: number; lastActive: string }
  > = {};

  for (const email of allUsers) {
    const userSessions = stats.sessions.filter((s) => s.email === email);
    const userViews = filteredViews.filter((v) => v.email === email);
    const userDownloads = filteredDownloads.filter((d) => d.email === email);

    userStatsMap[email] = {
      sessions: userSessions.length,
      views: userViews.length,
      downloads: userDownloads.length,
      lastActive:
        userSessions.length > 0
          ? userSessions[userSessions.length - 1].lastActivity
          : '',
    };
  }

  const topUsers = Object.entries(userStatsMap)
    .map(([email, s]) => ({ email, ...s }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const recentActivity: Array<{
    email: string;
    action: string;
    target: string;
    timestamp: string;
  }> = [];

  filteredViews.slice(-20).forEach((v) => {
    recentActivity.push({
      email: v.email,
      action: v.type === 'folder' ? 'otworzył folder' : 'obejrzał obraz',
      target: v.folderName || v.imageName || v.path,
      timestamp: v.timestamp,
    });
  });

  filteredDownloads.slice(-10).forEach((d) => {
    recentActivity.push({
      email: d.email,
      action: 'pobrał plik',
      target: d.fileName,
      timestamp: d.timestamp,
    });
  });

  recentActivity.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return {
    totalUsers: allUsers.size,
    activeUsers: activeUsersSet.size,
    totalSessions: stats.sessions.length,
    totalViews: filteredViews.length,
    totalDownloads: filteredDownloads.length,
    topUsers,
    recentActivity: recentActivity.slice(0, 20),
  };
}

// ==================== CZYSZCZENIE STARYCH DANYCH (Etap 3 – usuwanie plików) ====================

export async function cleanupOldStats(daysToKeep: number = 90): Promise<{
  deletedLogins: number;
  deletedSessions: number;
  deletedViews: number;
  deletedDownloads: number;
}> {
  const dir = await getUsersDir();
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const cutoffStr = getDateString(cutoff);

  let deletedLogins = 0;
  let deletedSessions = 0;
  let deletedViews = 0;
  let deletedDownloads = 0;

  const names = await fsp.readdir(dir).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.startsWith('stats-') || !name.endsWith('.json')) continue;
    const dateStr = name.replace('stats-', '').replace('.json', '');
    if (dateStr >= cutoffStr) continue;
    const filePath = path.join(dir, name);
    const day = await loadStatsFile(dateStr);
    deletedLogins += day.logins.length;
    deletedSessions += day.sessions.length;
    deletedViews += day.viewEvents.length;
    deletedDownloads += day.downloadEvents.length;
    await fsp.unlink(filePath).catch(() => {});
  }

  return { deletedLogins, deletedSessions, deletedViews, deletedDownloads };
}
