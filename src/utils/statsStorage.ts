import { getData, updateData } from './storage';
import type {
  UserLogin,
  UserSession,
  ViewEvent,
  DownloadEvent,
  UserStats,
  StatsData,
  DeviceInfo,
} from '../types/stats';

// Generowanie unikalnych ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function ensureStats(data: { stats?: StatsData }): StatsData {
  if (!data.stats) {
    data.stats = {
      logins: [],
      sessions: [],
      viewEvents: [],
      downloadEvents: [],
    };
  }
  return data.stats;
}

// ==================== LOGOWANIA ====================

export async function recordLogin(
  email: string,
  ip: string,
  userAgent?: string,
): Promise<UserLogin> {
  const login: UserLogin = {
    email,
    timestamp: new Date().toISOString(),
    ip,
    userAgent,
  };

  await updateData((data) => {
    const stats = ensureStats(data);
    stats.logins.push(login);

    // Ogranicz historię do ostatnich 10000 logowań
    if (stats.logins.length > 10000) {
      stats.logins = stats.logins.slice(-10000);
    }
  });

  return login;
}

export async function getLoginHistory(
  email?: string,
  limit: number = 100,
): Promise<UserLogin[]> {
  const data = await getData();
  const stats = data.stats;
  if (!stats) return [];

  let logins = stats.logins;

  if (email) {
    logins = logins.filter((l) => l.email === email);
  }

  return logins.slice(-limit).reverse();
}

// ==================== SESJE ====================

export async function startSession(
  email: string,
  ip: string,
  userAgent?: string,
): Promise<UserSession> {
  const now = new Date().toISOString();
  const session: UserSession = {
    id: generateId('sess'),
    email,
    startedAt: now,
    lastActivity: now,
    ip,
    userAgent,
  };

  await updateData((data) => {
    const stats = ensureStats(data);
    stats.sessions.push(session);
  });

  return session;
}

export async function updateSessionActivity(sessionId: string): Promise<void> {
  await updateData((data) => {
    const stats = data.stats;
    if (!stats) return;

    const session = stats.sessions.find((s) => s.id === sessionId);
    if (session && !session.endedAt) {
      session.lastActivity = new Date().toISOString();
    }
  });
}

export async function endSession(sessionId: string): Promise<void> {
  await updateData((data) => {
    const stats = data.stats;
    if (!stats) return;

    const session = stats.sessions.find((s) => s.id === sessionId);
    if (session && !session.endedAt) {
      session.endedAt = new Date().toISOString();
    }
  });
}

export async function getActiveSession(
  email: string,
): Promise<UserSession | null> {
  const data = await getData();
  const stats = data.stats;
  if (!stats) return null;

  const sessions = stats.sessions;
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  return (
    sessions.find(
      (s) => s.email === email && !s.endedAt && s.lastActivity > twoHoursAgo,
    ) || null
  );
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
  deviceInfo?: DeviceInfo,
): Promise<ViewEvent> {
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

  await updateData((data) => {
    const stats = ensureStats(data);
    stats.viewEvents.push(event);

    // Ogranicz do ostatnich 50000 zdarzeń
    if (stats.viewEvents.length > 50000) {
      stats.viewEvents = stats.viewEvents.slice(-50000);
    }
  });

  return event;
}

export async function getViewEvents(
  email?: string,
  type?: 'folder' | 'image',
  limit: number = 100,
): Promise<ViewEvent[]> {
  const data = await getData();
  const stats = data.stats;
  if (!stats) return [];

  let events = stats.viewEvents;

  if (email) {
    events = events.filter((e) => e.email === email);
  }
  if (type) {
    events = events.filter((e) => e.type === type);
  }

  return events.slice(-limit).reverse();
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
  deviceInfo?: DeviceInfo,
): Promise<DownloadEvent> {
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

  await updateData((data) => {
    const stats = ensureStats(data);
    stats.downloadEvents.push(event);

    // Ogranicz do ostatnich 10000 zdarzeń
    if (stats.downloadEvents.length > 10000) {
      stats.downloadEvents = stats.downloadEvents.slice(-10000);
    }
  });

  return event;
}

export async function getDownloadEvents(
  email?: string,
  limit: number = 100,
): Promise<DownloadEvent[]> {
  const data = await getData();
  const stats = data.stats;
  if (!stats) return [];

  let events = stats.downloadEvents;

  if (email) {
    events = events.filter((e) => e.email === email);
  }

  return events.slice(-limit).reverse();
}

// ==================== STATYSTYKI ZBIORCZE ====================

export async function getUserStats(email: string): Promise<UserStats> {
  const data = await getData();
  const stats: StatsData = data.stats || {
    logins: [],
    sessions: [],
    viewEvents: [],
    downloadEvents: [],
  };

  const userLogins = stats.logins.filter((l) => l.email === email);
  const userSessions = stats.sessions.filter((s) => s.email === email);
  const userViews = stats.viewEvents.filter((v) => v.email === email);
  const userDownloads = stats.downloadEvents.filter((d) => d.email === email);

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
    (a, b) => b[1] - a[1],
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
  const data = await getData();
  const stats: StatsData = data.stats || {
    logins: [],
    sessions: [],
    viewEvents: [],
    downloadEvents: [],
  };

  const filterByDate = <T extends { timestamp: string }>(items: T[]): T[] => {
    if (!dateRange) return items;
    return items.filter((item) => {
      const date = new Date(item.timestamp);
      return date >= dateRange.start && date <= dateRange.end;
    });
  };

  const _filteredLogins = filterByDate(stats.logins);
  const filteredViews = filterByDate(stats.viewEvents);
  const filteredDownloads = filterByDate(stats.downloadEvents);

  const allUsers = new Set<string>([
    ...stats.logins.map((l) => l.email),
    ...stats.sessions.map((s) => s.email),
  ]);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const activeUsersSet = new Set(
    stats.sessions
      .filter((s) => s.lastActivity > oneDayAgo)
      .map((s) => s.email),
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
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
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

// ==================== CZYSZCZENIE STARYCH DANYCH ====================

export async function cleanupOldStats(daysToKeep: number = 90): Promise<{
  deletedLogins: number;
  deletedSessions: number;
  deletedViews: number;
  deletedDownloads: number;
}> {
  const cutoffDate = new Date(
    Date.now() - daysToKeep * 24 * 60 * 60 * 1000,
  ).toISOString();

  let deletedLogins = 0;
  let deletedSessions = 0;
  let deletedViews = 0;
  let deletedDownloads = 0;

  await updateData((data) => {
    const stats = data.stats;
    if (!stats) return;

    const originalLogins = stats.logins.length;
    const originalSessions = stats.sessions.length;
    const originalViews = stats.viewEvents.length;
    const originalDownloads = stats.downloadEvents.length;

    stats.logins = stats.logins.filter((l) => l.timestamp > cutoffDate);
    stats.sessions = stats.sessions.filter((s) => s.startedAt > cutoffDate);
    stats.viewEvents = stats.viewEvents.filter((v) => v.timestamp > cutoffDate);
    stats.downloadEvents = stats.downloadEvents.filter(
      (d) => d.timestamp > cutoffDate,
    );

    deletedLogins = originalLogins - stats.logins.length;
    deletedSessions = originalSessions - stats.sessions.length;
    deletedViews = originalViews - stats.viewEvents.length;
    deletedDownloads = originalDownloads - stats.downloadEvents.length;
  });

  return { deletedLogins, deletedSessions, deletedViews, deletedDownloads };
}
