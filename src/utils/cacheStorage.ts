// src/utils/cacheStorage.ts
// Etap 4: config w cache-config.json, stan „current” i historia w history/current.json + pliki dzienne history/cache-YYYY-MM-DD.json

import path from 'path';
import fsp from 'fs/promises';
import {
  SchedulerConfig,
  ThumbnailConfig,
  CacheStorageData,
  CacheStatus,
  ThumbnailSize,
  EmailNotificationConfig,
  HistoryCleanupConfig,
  CacheHistoryEntry,
  HashChangeEvent,
} from '@/src/types/cache';

// Domyślne rozmiary miniaturek
export const DEFAULT_THUMBNAIL_SIZES: ThumbnailSize[] = [
  { name: 'thumb', width: 300, height: 300, quality: 80 },
  { name: 'medium', width: 800, height: 800, quality: 85 },
  { name: 'large', width: 1920, height: 1920, quality: 90 },
];

// Domyślna konfiguracja schedulera
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  enabled: false,
  workHours: {
    start: 9,
    end: 17,
    intervalMinutes: 30,
  },
  offHours: {
    enabled: false,
    intervalMinutes: null,
  },
  timezone: 'Europe/Warsaw',
};

// Domyślna konfiguracja miniaturek
export const DEFAULT_THUMBNAIL_CONFIG: ThumbnailConfig = {
  sizes: DEFAULT_THUMBNAIL_SIZES,
  format: 'webp',
  storage: 'local',
};

// Domyślna konfiguracja powiadomień email
export const DEFAULT_EMAIL_NOTIFICATION_CONFIG: EmailNotificationConfig = {
  enabled: false,
  email: '', // Pusty = użyj ADMIN_EMAIL
  notifyOnRebuild: true,
  notifyOnError: true,
};

// Domyślna konfiguracja czyszczenia historii
export const DEFAULT_HISTORY_CLEANUP_CONFIG: HistoryCleanupConfig = {
  autoCleanupEnabled: true,
  retentionHours: 24,
};

const defaultCacheData: CacheStorageData = {
  schedulerConfig: DEFAULT_SCHEDULER_CONFIG,
  thumbnailConfig: DEFAULT_THUMBNAIL_CONFIG,
  fileHashes: [],
  changeHistory: [],
  history: [],
  lastSchedulerRun: null,
  lastScanChanges: 0,
  lastScanDuration: null,
};

async function getCacheDataDir(): Promise<string> {
  try {
    await fsp.access('/data-storage');
    return '/data-storage';
  } catch {
    return path.join(process.cwd(), 'data');
  }
}

async function getConfigFilePath(): Promise<string> {
  return path.join(await getCacheDataDir(), 'cache-config.json');
}

async function getHistoryDir(): Promise<string> {
  return path.join(await getCacheDataDir(), 'history');
}

async function getCurrentFilePath(): Promise<string> {
  return path.join(await getHistoryDir(), 'current.json');
}

function getCacheDateString(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
}

async function getDailyHistoryPath(dateStr: string): Promise<string> {
  return path.join(await getHistoryDir(), `cache-${dateStr}.json`);
}

const HISTORY_SLICE_MAX = 500;

interface CacheConfigFile {
  schedulerConfig: SchedulerConfig;
  thumbnailConfig: ThumbnailConfig;
  emailNotificationConfig?: EmailNotificationConfig;
  historyCleanupConfig?: HistoryCleanupConfig;
}

interface CacheCurrentFile {
  fileHashes: CacheStorageData['fileHashes'];
  lastSchedulerRun: string | null;
  lastScanChanges: number;
  lastScanDuration: number | null;
  folderHashRecords?: CacheStorageData['folderHashRecords'];
  lastRebuiltFolder?: CacheStorageData['lastRebuiltFolder'];
  history: CacheHistoryEntry[];
  changeHistory: HashChangeEvent[];
}

interface DailyHistoryFile {
  date: string;
  history: CacheHistoryEntry[];
  changeHistory: HashChangeEvent[];
}

let cachedData: CacheStorageData | null = null;
let cacheMigrationDone = false;

async function loadConfig(): Promise<CacheConfigFile> {
  const filePath = await getConfigFilePath();
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      schedulerConfig: { ...DEFAULT_SCHEDULER_CONFIG, ...data.schedulerConfig },
      thumbnailConfig: { ...DEFAULT_THUMBNAIL_CONFIG, ...data.thumbnailConfig },
      emailNotificationConfig:
        data.emailNotificationConfig ?? DEFAULT_EMAIL_NOTIFICATION_CONFIG,
      historyCleanupConfig:
        data.historyCleanupConfig ?? DEFAULT_HISTORY_CLEANUP_CONFIG,
    };
  } catch {
    return {
      schedulerConfig: DEFAULT_SCHEDULER_CONFIG,
      thumbnailConfig: DEFAULT_THUMBNAIL_CONFIG,
      emailNotificationConfig: DEFAULT_EMAIL_NOTIFICATION_CONFIG,
      historyCleanupConfig: DEFAULT_HISTORY_CLEANUP_CONFIG,
    };
  }
}

async function saveConfig(config: CacheConfigFile): Promise<void> {
  const filePath = await getConfigFilePath();
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(config, null, 2));
  await fsp.rename(tmpPath, filePath);
}

async function loadCurrent(): Promise<CacheCurrentFile> {
  const filePath = await getCurrentFilePath();
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      fileHashes: Array.isArray(data.fileHashes) ? data.fileHashes : [],
      lastSchedulerRun: data.lastSchedulerRun ?? null,
      lastScanChanges: data.lastScanChanges ?? 0,
      lastScanDuration: data.lastScanDuration ?? null,
      folderHashRecords: data.folderHashRecords,
      lastRebuiltFolder: data.lastRebuiltFolder,
      history: Array.isArray(data.history) ? data.history : [],
      changeHistory: Array.isArray(data.changeHistory)
        ? data.changeHistory
        : [],
    };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') return migrateLegacyToCurrent();
    return {
      fileHashes: [],
      lastSchedulerRun: null,
      lastScanChanges: 0,
      lastScanDuration: null,
      history: [],
      changeHistory: [],
    };
  }
}

async function migrateLegacyToCurrent(): Promise<CacheCurrentFile> {
  if (cacheMigrationDone) {
    return {
      fileHashes: [],
      lastSchedulerRun: null,
      lastScanChanges: 0,
      lastScanDuration: null,
      history: [],
      changeHistory: [],
    };
  }
  const configPath = await getConfigFilePath();
  try {
    const raw = await fsp.readFile(configPath, 'utf8');
    const legacy: CacheStorageData = {
      ...defaultCacheData,
      ...JSON.parse(raw),
    };
    cacheMigrationDone = true;
    await saveConfig({
      schedulerConfig: legacy.schedulerConfig,
      thumbnailConfig: legacy.thumbnailConfig,
      emailNotificationConfig: legacy.emailNotificationConfig,
      historyCleanupConfig: legacy.historyCleanupConfig,
    });
    const current: CacheCurrentFile = {
      fileHashes: legacy.fileHashes || [],
      lastSchedulerRun: legacy.lastSchedulerRun ?? null,
      lastScanChanges: legacy.lastScanChanges ?? 0,
      lastScanDuration: legacy.lastScanDuration ?? null,
      folderHashRecords: legacy.folderHashRecords,
      lastRebuiltFolder: legacy.lastRebuiltFolder,
      history: (legacy.history || []).slice(-HISTORY_SLICE_MAX),
      changeHistory: (legacy.changeHistory || []).slice(-HISTORY_SLICE_MAX),
    };
    const historyDir = await getHistoryDir();
    await fsp.mkdir(historyDir, { recursive: true });
    const currentPath = await getCurrentFilePath();
    await fsp.writeFile(currentPath, JSON.stringify(current, null, 2));
    return current;
  } catch {
    cacheMigrationDone = true;
    return {
      fileHashes: [],
      lastSchedulerRun: null,
      lastScanChanges: 0,
      lastScanDuration: null,
      history: [],
      changeHistory: [],
    };
  }
}

async function saveCurrent(current: CacheCurrentFile): Promise<void> {
  const filePath = await getCurrentFilePath();
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(current, null, 2));
  await fsp.rename(tmpPath, filePath);
}

async function appendToDailyHistory(
  dateStr: string,
  historyAdd: CacheHistoryEntry[],
  changeHistoryAdd: HashChangeEvent[]
): Promise<void> {
  if (historyAdd.length === 0 && changeHistoryAdd.length === 0) return;
  const filePath = await getDailyHistoryPath(dateStr);
  let day: DailyHistoryFile = { date: dateStr, history: [], changeHistory: [] };
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    day = { ...day, ...JSON.parse(raw) };
    if (!Array.isArray(day.history)) day.history = [];
    if (!Array.isArray(day.changeHistory)) day.changeHistory = [];
  } catch {
    // ENOENT or parse error – start fresh
  }
  day.history.push(...historyAdd);
  day.changeHistory.push(...changeHistoryAdd);
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(day, null, 2));
  await fsp.rename(tmpPath, filePath);
}

export async function getCacheData(): Promise<CacheStorageData> {
  if (cachedData) {
    return cachedData;
  }

  const config = await loadConfig();
  const current = await loadCurrent();
  cacheMigrationDone = true;

  const merged: CacheStorageData = {
    ...config,
    fileHashes: current.fileHashes,
    lastSchedulerRun: current.lastSchedulerRun,
    lastScanChanges: current.lastScanChanges,
    lastScanDuration: current.lastScanDuration,
    folderHashRecords: current.folderHashRecords,
    lastRebuiltFolder: current.lastRebuiltFolder,
    history: current.history,
    changeHistory: current.changeHistory,
  };
  cachedData = merged;
  return merged;
}

export async function updateCacheData(
  updater: (data: CacheStorageData) => void
): Promise<void> {
  const data = await getCacheData();
  const prevHistoryLen = data.history?.length ?? 0;
  const prevChangeLen = data.changeHistory?.length ?? 0;

  updater(data);
  cachedData = data;

  await saveConfig({
    schedulerConfig: data.schedulerConfig,
    thumbnailConfig: data.thumbnailConfig,
    emailNotificationConfig: data.emailNotificationConfig,
    historyCleanupConfig: data.historyCleanupConfig,
  });

  const current: CacheCurrentFile = {
    fileHashes: data.fileHashes,
    lastSchedulerRun: data.lastSchedulerRun,
    lastScanChanges: data.lastScanChanges,
    lastScanDuration: data.lastScanDuration,
    folderHashRecords: data.folderHashRecords,
    lastRebuiltFolder: data.lastRebuiltFolder,
    history: (data.history || []).slice(-HISTORY_SLICE_MAX),
    changeHistory: (data.changeHistory || []).slice(-HISTORY_SLICE_MAX),
  };
  await saveCurrent(current);

  const newHistory = (data.history || []).slice(prevHistoryLen);
  const newChanges = (data.changeHistory || []).slice(prevChangeLen);
  if (newHistory.length > 0 || newChanges.length > 0) {
    const today = getCacheDateString(new Date());
    await appendToDailyHistory(today, newHistory, newChanges);
  }
}

export async function getCacheStatus(): Promise<CacheStatus> {
  const data = await getCacheData();

  // Zlicz unikalne foldery z hashes
  const folders = new Set(
    data.fileHashes.map((h) => {
      const parts = h.path.split('/');
      parts.pop();
      return parts.join('/');
    })
  );

  return {
    scheduler: {
      enabled: data.schedulerConfig.enabled,
      nextRun: calculateNextRun(data.schedulerConfig, data.lastSchedulerRun),
      lastRun: data.lastSchedulerRun,
      lastRunDuration: data.lastScanDuration,
    },
    hashChecker: {
      totalFolders: folders.size,
      totalFiles: data.fileHashes.length,
      lastScanTime: data.lastSchedulerRun,
      changesDetected: data.lastScanChanges,
    },
    thumbnails: {
      totalGenerated: 0, // Będzie zliczane z filesystem
      pendingGeneration: 0,
      storageUsed: 0,
      storageLocation: data.thumbnailConfig.storage,
    },
  };
}

function calculateNextRun(
  config: SchedulerConfig,
  lastRun: string | null
): string | null {
  if (!config.enabled) return null;

  const now = new Date();
  const hour = now.getHours();
  const isWorkHours =
    hour >= config.workHours.start && hour < config.workHours.end;

  let intervalMinutes: number | null = null;
  if (isWorkHours) {
    intervalMinutes = config.workHours.intervalMinutes;
  } else if (config.offHours.enabled) {
    intervalMinutes = config.offHours.intervalMinutes;
  }

  if (intervalMinutes === null) {
    // Oblicz następny start godzin pracy
    const next = new Date(now);
    if (hour >= config.workHours.end) {
      next.setDate(next.getDate() + 1);
    }
    next.setHours(config.workHours.start, 0, 0, 0);
    return next.toISOString();
  }

  if (lastRun) {
    const nextRun = new Date(
      new Date(lastRun).getTime() + intervalMinutes * 60 * 1000
    );
    return nextRun.toISOString();
  }

  return now.toISOString();
}

/**
 * Resetuje cache w pamięci (przydatne przy testach)
 */
export function resetCacheDataMemory(): void {
  cachedData = null;
}

/**
 * Czyści historię starszą niż podana liczba godzin (current + usuwa stare pliki dzienne)
 */
export async function cleanupHistory(retentionHours?: number): Promise<{
  historyRemoved: number;
  changesRemoved: number;
}> {
  const data = await getCacheData();
  const config = data.historyCleanupConfig || DEFAULT_HISTORY_CLEANUP_CONFIG;
  const hours = retentionHours ?? config.retentionHours;
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  const cutoffDateStr = getCacheDateString(cutoffTime);

  const originalHistoryLength = data.history?.length || 0;
  const originalChangesLength = data.changeHistory?.length || 0;

  const historyDir = await getHistoryDir();
  const names = await fsp.readdir(historyDir).catch(() => [] as string[]);
  for (const name of names) {
    if (
      !name.startsWith('cache-') ||
      !name.endsWith('.json') ||
      name === 'current.json'
    )
      continue;
    const dateStr = name.replace('cache-', '').replace('.json', '');
    if (dateStr < cutoffDateStr) {
      await fsp.unlink(path.join(historyDir, name)).catch(() => {});
    }
  }

  await updateCacheData((d) => {
    d.history = (d.history || []).filter(
      (entry) => new Date(entry.timestamp) > cutoffTime
    );
    d.changeHistory = (d.changeHistory || []).filter(
      (entry) => new Date(entry.timestamp) > cutoffTime
    );
  });

  const newData = await getCacheData();
  return {
    historyRemoved: originalHistoryLength - (newData.history?.length || 0),
    changesRemoved:
      originalChangesLength - (newData.changeHistory?.length || 0),
  };
}

/**
 * Usuwa całą historię (current + nie usuwa plików dziennych – można dodać opcję)
 */
export async function clearAllHistory(): Promise<void> {
  await updateCacheData((data) => {
    data.history = [];
    data.changeHistory = [];
  });
}
