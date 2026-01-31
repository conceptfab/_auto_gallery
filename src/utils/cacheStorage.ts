// src/utils/cacheStorage.ts

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

async function getCacheFilePath(): Promise<string> {
  try {
    await fsp.access('/data-storage');
    return '/data-storage/cache-config.json';
  } catch {
    return path.join(process.cwd(), 'data', 'cache-config.json');
  }
}

let cachedData: CacheStorageData | null = null;

export async function getCacheData(): Promise<CacheStorageData> {
  if (cachedData) {
    return cachedData;
  }

  try {
    const filePath = await getCacheFilePath();
    const raw = await fsp.readFile(filePath, 'utf8');
    const loadedData: CacheStorageData = { ...defaultCacheData, ...JSON.parse(raw) };
    cachedData = loadedData;
    return loadedData;
  } catch {
    const newData: CacheStorageData = { ...defaultCacheData };
    cachedData = newData;
    return newData;
  }
}

export async function updateCacheData(
  updater: (data: CacheStorageData) => void,
): Promise<void> {
  const data = await getCacheData();
  updater(data);
  cachedData = data;

  const filePath = await getCacheFilePath();
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function getCacheStatus(): Promise<CacheStatus> {
  const data = await getCacheData();

  // Zlicz unikalne foldery z hashes
  const folders = new Set(
    data.fileHashes.map((h) => {
      const parts = h.path.split('/');
      parts.pop();
      return parts.join('/');
    }),
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
  lastRun: string | null,
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
      new Date(lastRun).getTime() + intervalMinutes * 60 * 1000,
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
 * Czyści historię starszą niż podana liczba godzin
 */
export async function cleanupHistory(retentionHours?: number): Promise<{
  historyRemoved: number;
  changesRemoved: number;
}> {
  const data = await getCacheData();
  const config = data.historyCleanupConfig || DEFAULT_HISTORY_CLEANUP_CONFIG;
  const hours = retentionHours ?? config.retentionHours;
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  const originalHistoryLength = data.history?.length || 0;
  const originalChangesLength = data.changeHistory?.length || 0;

  await updateCacheData((d) => {
    // Filtruj wpisy historii
    d.history = (d.history || []).filter(
      (entry) => new Date(entry.timestamp) > cutoffTime
    );

    // Filtruj historię zmian
    d.changeHistory = (d.changeHistory || []).filter(
      (entry) => new Date(entry.timestamp) > cutoffTime
    );
  });

  const newData = await getCacheData();

  return {
    historyRemoved: originalHistoryLength - (newData.history?.length || 0),
    changesRemoved: originalChangesLength - (newData.changeHistory?.length || 0),
  };
}

/**
 * Usuwa całą historię
 */
export async function clearAllHistory(): Promise<void> {
  await updateCacheData((data) => {
    data.history = [];
    data.changeHistory = [];
  });
}
