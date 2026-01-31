// src/services/schedulerService.ts

import { HashChangeEvent, CacheHistoryEntry } from '@/src/types/cache';
import {
  scanRemoteFolderForHashes,
  detectChanges,
  getChangeStats,
} from './hashService';
import { generateThumbnails } from './thumbnailService';
import {
  getCacheData,
  updateCacheData,
  DEFAULT_SCHEDULER_CONFIG,
} from '@/src/utils/cacheStorage';
import { logger } from '@/src/utils/logger';
import { GALLERY_BASE_URL } from '@/src/config/constants';

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let lastCheckTime: Date | null = null;

/**
 * Inicjalizuje scheduler przy starcie aplikacji
 */
export function initScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Sprawdzaj co minutę czy trzeba uruchomić skan
  schedulerInterval = setInterval(checkAndRun, 60 * 1000);

  logger.info('Cache scheduler initialized');
}

/**
 * Zatrzymuje scheduler
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  logger.info('Cache scheduler stopped');
}

/**
 * Sprawdza czy trzeba uruchomić skan według harmonogramu
 */
async function checkAndRun(): Promise<void> {
  if (isRunning) {
    logger.debug('Scheduler: Skip - previous run still in progress');
    return;
  }

  try {
    const cacheData = await getCacheData();
    const config = cacheData.schedulerConfig || DEFAULT_SCHEDULER_CONFIG;

    if (!config.enabled) {
      return;
    }

    const now = new Date();
    const hour = now.getHours();
    const lastRun = cacheData.lastSchedulerRun
      ? new Date(cacheData.lastSchedulerRun)
      : null;

    // Sprawdź czy jesteśmy w godzinach pracy
    const isWorkHours =
      hour >= config.workHours.start && hour < config.workHours.end;

    let intervalMinutes: number | null = null;

    if (isWorkHours) {
      intervalMinutes = config.workHours.intervalMinutes;
    } else if (config.offHours.enabled) {
      intervalMinutes = config.offHours.intervalMinutes;
    }

    if (intervalMinutes === null) {
      return; // Nie uruchamiaj w tym czasie
    }

    // Sprawdź czy minął wymagany interwał
    if (lastRun) {
      const minutesSinceLastRun =
        (now.getTime() - lastRun.getTime()) / (1000 * 60);
      if (minutesSinceLastRun < intervalMinutes) {
        return;
      }
    }

    // Uruchom skan
    logger.info('Scheduler triggering automatic scan');
    await runScan();
  } catch (error) {
    logger.error('Scheduler check error:', error);
  }
}

/**
 * Uruchamia pełny skan i generowanie miniaturek
 */
export async function runScan(): Promise<{
  success: boolean;
  changes: number;
  duration: number;
  error?: string;
}> {
  if (isRunning) {
    return {
      success: false,
      changes: 0,
      duration: 0,
      error: 'Scan already in progress',
    };
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    await addHistoryEntry('scan_started', 'Rozpoczęto skanowanie zmian');

    const cacheData = await getCacheData();
    const oldHashes = new Map(
      (cacheData.fileHashes || []).map((h) => [h.path, h])
    );

    // Skanuj folder galerii
    const newHashList = await scanRemoteFolderForHashes('');
    const newHashes = new Map(newHashList.map((h) => [h.path, h]));

    // Wykryj zmiany
    const changes = detectChanges(oldHashes, newHashes);
    const stats = getChangeStats(changes);
    const duration = Date.now() - startTime;

    // Zapisz nowe hashe i zmiany
    await updateCacheData((data) => {
      data.fileHashes = newHashList;
      data.lastSchedulerRun = new Date().toISOString();
      data.lastScanChanges = changes.length;
      data.lastScanDuration = duration;

      // Dodaj zmiany do historii (max 1000 wpisów)
      if (!data.changeHistory) data.changeHistory = [];
      data.changeHistory = [...changes, ...data.changeHistory].slice(0, 1000);
    });

    if (changes.length > 0) {
      await addHistoryEntry(
        'changes_detected',
        `Wykryto ${changes.length} zmian (dodane: ${stats.added}, zmodyfikowane: ${stats.modified}, usunięte: ${stats.deleted})`,
        duration,
        changes.slice(0, 20).map((c) => c.path)
      );

      // Regeneruj miniaturki dla zmienionych plików
      const regenerated = await regenerateThumbnailsForChanges(changes);

      if (regenerated > 0) {
        await addHistoryEntry(
          'thumbnails_generated',
          `Wygenerowano miniaturki dla ${regenerated} plików`
        );
      }
    } else {
      await addHistoryEntry(
        'scan_completed',
        `Skanowanie zakończone - brak zmian (${newHashList.length} plików)`,
        duration
      );
    }

    logger.info(
      `Scan completed in ${duration}ms, ${changes.length} changes detected`
    );

    return {
      success: true,
      changes: changes.length,
      duration,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await addHistoryEntry('error', `Błąd skanowania: ${errorMessage}`);
    logger.error('Scan error:', error);

    return {
      success: false,
      changes: 0,
      duration: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    isRunning = false;
    lastCheckTime = new Date();
  }
}

/**
 * Regeneruje miniaturki dla zmienionych plików
 */
async function regenerateThumbnailsForChanges(
  changes: HashChangeEvent[]
): Promise<number> {
  const cacheData = await getCacheData();
  const config = cacheData.thumbnailConfig;

  const filesToRegenerate = changes
    .filter((c) => c.type === 'file_added' || c.type === 'file_modified')
    .filter((c) => /\.(jpg|jpeg|png|gif|webp)$/i.test(c.path))
    .map((c) => c.path);

  let generated = 0;

  const baseUrl = GALLERY_BASE_URL.endsWith('/')
    ? GALLERY_BASE_URL
    : GALLERY_BASE_URL + '/';

  for (const filePath of filesToRegenerate) {
    try {
      const sourceUrl = new URL(filePath.replace(/^\//, ''), baseUrl).href;

      await generateThumbnails(sourceUrl, filePath, config);
      generated++;

      // Loguj co kilka plików
      if (generated % 10 === 0) {
        logger.info(
          `Generated thumbnails for ${generated}/${filesToRegenerate.length} files`
        );
      }
    } catch (error) {
      logger.error(`Failed to generate thumbnails for ${filePath}:`, error);
    }
  }

  return generated;
}

/**
 * Dodaje wpis do historii
 */
async function addHistoryEntry(
  action: CacheHistoryEntry['action'],
  details: string,
  duration?: number,
  affectedPaths?: string[]
): Promise<void> {
  await updateCacheData((data) => {
    if (!data.history) data.history = [];

    data.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action,
      details,
      duration,
      affectedPaths,
    });

    // Limit historii do 500 wpisów
    data.history = data.history.slice(0, 500);
  });
}

/**
 * Sprawdza czy skan jest w toku
 */
export function isScanRunning(): boolean {
  return isRunning;
}

/**
 * Pobiera status schedulera
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  lastCheckTime: string | null;
  intervalActive: boolean;
} {
  return {
    isRunning,
    lastCheckTime: lastCheckTime?.toISOString() || null,
    intervalActive: schedulerInterval !== null,
  };
}

/**
 * Wymusza natychmiastowe uruchomienie skanu
 */
export async function forceScan(): Promise<{
  success: boolean;
  changes: number;
  duration: number;
  error?: string;
}> {
  return runScan();
}

/**
 * Regeneruje wszystkie miniaturki (pełny rebuild)
 */
export async function regenerateAllThumbnails(): Promise<{
  success: boolean;
  generated: number;
  failed: number;
  duration: number;
}> {
  const startTime = Date.now();
  let generated = 0;
  let failed = 0;

  try {
    await addHistoryEntry(
      'scan_started',
      'Rozpoczęto regenerację wszystkich miniaturek'
    );

    const cacheData = await getCacheData();
    const config = cacheData.thumbnailConfig;
    const files = cacheData.fileHashes.filter((f) =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(f.path)
    );

    logger.info(`Regenerating thumbnails for ${files.length} files`);

    const baseUrl = GALLERY_BASE_URL.endsWith('/')
      ? GALLERY_BASE_URL
      : GALLERY_BASE_URL + '/';

    for (const file of files) {
      try {
        const sourceUrl = new URL(file.path.replace(/^\//, ''), baseUrl).href;

        const results = await generateThumbnails(sourceUrl, file.path, config);
        if (results.size > 0) {
          generated++;
        } else {
          failed++;
        }

        if (generated % 20 === 0 && generated > 0) {
          logger.info(`Progress: ${generated}/${files.length} files`);
        }
      } catch {
        failed++;
      }
    }

    const duration = Date.now() - startTime;

    await addHistoryEntry(
      'thumbnails_generated',
      `Regeneracja zakończona: ${generated} sukces, ${failed} błędów`,
      duration
    );

    return { success: true, generated, failed, duration };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await addHistoryEntry('error', `Błąd regeneracji: ${errorMessage}`);

    return {
      success: false,
      generated,
      failed,
      duration: Date.now() - startTime,
    };
  }
}
