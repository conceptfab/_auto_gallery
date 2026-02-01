// src/services/schedulerService.ts

import { HashChangeEvent, CacheHistoryEntry } from '@/src/types/cache';
import {
  scanRemoteFolderForHashes,
  detectChanges,
  getChangeStats,
  computeAndStoreFolderHashes,
} from './hashService';
import {
  generateThumbnails,
  cleanupOrphanThumbnailFolders,
} from './thumbnailService';
import {
  getCacheData,
  updateCacheData,
  DEFAULT_SCHEDULER_CONFIG,
  DEFAULT_HISTORY_CLEANUP_CONFIG,
  DEFAULT_EMAIL_NOTIFICATION_CONFIG,
  cleanupHistory,
} from '@/src/utils/cacheStorage';
import { logger } from '@/src/utils/logger';
import { GALLERY_BASE_URL } from '@/src/config/constants';
import { sendRebuildNotification } from '@/src/utils/email';
import { getData } from '@/src/utils/storage';
import { cleanupOldStats } from '@/src/utils/statsStorage';

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let lastCheckTime: Date | null = null;

/**
 * Inicjalizuje scheduler przy starcie aplikacji.
 * Deploy = początek odliczania: od razu uruchamia pierwszy check (i skan jeśli config na to pozwala).
 */
export function initScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Sprawdzaj co minutę czy trzeba uruchomić skan
  schedulerInterval = setInterval(checkAndRun, 60 * 1000);

  // Od razu pierwszy check – udany deploy to początek odliczania
  checkAndRun().catch((err) =>
    logger.error('Scheduler initial check error:', err)
  );

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

    // Uruchom skan (cykliczny/automatyczny)
    logger.info('Scheduler triggering automatic scan');
    await runScan(true);
  } catch (error) {
    logger.error('Scheduler check error:', error);
  }
}

/**
 * Uruchamia pełny skan i generowanie miniaturek
 * @param isScheduled - czy skan został uruchomiony automatycznie przez scheduler
 */
export async function runScan(isScheduled = false): Promise<{
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
  const triggerSource = isScheduled ? '[CYKLICZNE]' : '[RĘCZNE]';

  try {
    await addHistoryEntry(
      'scan_started',
      `${triggerSource} Rozpoczęto skanowanie zmian`
    );

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

    // Oblicz i zapisz hashe folderów do weryfikacji
    await computeAndStoreFolderHashes();

    // Usuń foldery miniaturek dla folderów usuniętych w galerii (struktura 1:1)
    const thumbConfig = (await getCacheData()).thumbnailConfig;
    if (thumbConfig?.storage === 'local') {
      try {
        const removed = await cleanupOrphanThumbnailFolders(newHashList);
        if (removed > 0) {
          await addHistoryEntry(
            'scan_completed',
            `Usunięto ${removed} nieaktualnych folderów miniaturek (usunięte w galerii)`,
            undefined
          );
        }
      } catch (cleanupErr) {
        logger.error('Cleanup orphan thumbnail folders failed:', cleanupErr);
      }
    }

    if (changes.length > 0) {
      await addHistoryEntry(
        'changes_detected',
        `${triggerSource} Wykryto ${changes.length} zmian (dodane: ${stats.added}, zmodyfikowane: ${stats.modified}, usunięte: ${stats.deleted})`,
        duration,
        changes.slice(0, 20).map((c) => c.path)
      );

      // Regeneruj miniaturki dla zmienionych plików
      const regenerated = await regenerateThumbnailsForChanges(changes);

      if (regenerated > 0) {
        await addHistoryEntry(
          'thumbnails_generated',
          `${triggerSource} Wygenerowano miniaturki dla ${regenerated} plików`
        );
      }

      // Wyślij powiadomienie email do admina o wykrytych zmianach
      const emailConfig =
        cacheData.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG;
      if (emailConfig.enabled && emailConfig.notifyOnRebuild) {
        try {
          console.log(
            '[Scan] Wysyłam powiadomienie email o wykrytych zmianach...'
          );
          await sendRebuildNotification(
            {
              success: true,
              duration: Date.now() - startTime,
              filesProcessed: changes.length,
              thumbnailsGenerated: regenerated,
              failed: 0,
            },
            emailConfig.email || undefined
          );
        } catch (emailErr) {
          logger.error('Failed to send scan changes notification', emailErr);
          console.error(
            '[Scan] Błąd wysyłki powiadomienia o wykrytych zmianach:',
            emailErr
          );
        }
      }
    } else {
      await addHistoryEntry(
        'scan_completed',
        `${triggerSource} Skanowanie zakończone - brak zmian (${newHashList.length} plików)`,
        duration
      );
    }

    logger.info(
      `Scan completed in ${duration}ms, ${changes.length} changes detected`
    );

    // Auto-cleanup starej historii cache (skanów/zmian) – retencja z core/settings (Etap 6)
    const storageData = await getData();
    const cleanupConfig =
      cacheData.historyCleanupConfig || DEFAULT_HISTORY_CLEANUP_CONFIG;
    if (cleanupConfig.autoCleanupEnabled) {
      const historyRetentionDays =
        storageData.settings?.historyRetentionDays ?? 7;
      const historyRetentionHours = historyRetentionDays * 24;
      await cleanupHistory(historyRetentionHours);
    }

    // Auto-cleanup statystyk użytkowników (logowania, sesje, wyświetlenia, pobrania)
    const statsAutoCleanup = storageData.settings?.autoCleanupEnabled ?? false;
    const statsDaysToKeep = storageData.settings?.autoCleanupDays ?? 7;
    if (statsAutoCleanup) {
      const statsResult = await cleanupOldStats(statsDaysToKeep);
      logger.info(
        `Stats cleanup: removed ${statsResult.deletedLogins} logins, ${statsResult.deletedSessions} sessions, ${statsResult.deletedViews} views, ${statsResult.deletedDownloads} downloads (older than ${statsDaysToKeep} days)`
      );
    }

    return {
      success: true,
      changes: changes.length,
      duration,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;
    await addHistoryEntry(
      'error',
      `${triggerSource} Błąd skanowania: ${errorMessage}`
    );
    logger.error('Scan error:', error);

    // Wyślij powiadomienie email o błędzie skanowania (tak samo jak przy awarii regeneracji)
    try {
      const cacheData = await getCacheData();
      const emailConfig =
        cacheData.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG;
      if (emailConfig.enabled && emailConfig.notifyOnError) {
        console.log(
          '[Scan] Wysyłam powiadomienie email o błędzie skanowania...'
        );
        await sendRebuildNotification(
          {
            success: false,
            duration,
            filesProcessed: 0,
            thumbnailsGenerated: 0,
            failed: 0,
            error: `Błąd skanowania: ${errorMessage}`,
          },
          emailConfig.email || undefined
        );
      }
    } catch (emailErr) {
      logger.error('Failed to send scan error notification', emailErr);
      console.error('[Scan] Błąd wysyłki powiadomienia o błędzie:', emailErr);
    }

    return {
      success: false,
      changes: 0,
      duration,
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
 * Pobiera status schedulera.
 * Przy pierwszym wywołaniu (po deployu) automatycznie uruchamia scheduler,
 * żeby nie zależeć od instrumentation ani od konkretnego endpointu.
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  lastCheckTime: string | null;
  intervalActive: boolean;
} {
  if (schedulerInterval === null) {
    initScheduler();
  }
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

    // Wyślij powiadomienie email jeśli włączone
    const emailConfig =
      cacheData.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG;
    if (!emailConfig.enabled || !emailConfig.notifyOnRebuild) {
      console.log(
        '[Rebuild] Powiadomienie email pominięte (włącz je w Konfiguracja → Powiadomienia email)'
      );
    } else {
      console.log(
        '[Rebuild] Wysyłam powiadomienie email o zakończeniu regeneracji...'
      );
      await sendRebuildNotification(
        {
          success: true,
          duration,
          filesProcessed: files.length,
          thumbnailsGenerated: generated,
          failed,
        },
        emailConfig.email || undefined
      );
    }

    return { success: true, generated, failed, duration };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await addHistoryEntry('error', `Błąd regeneracji: ${errorMessage}`);

    // Wyślij powiadomienie email o błędzie jeśli włączone
    const cacheData = await getCacheData();
    const emailConfig =
      cacheData.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG;
    if (!emailConfig.enabled || !emailConfig.notifyOnError) {
      console.log(
        '[Rebuild] Powiadomienie email o błędzie pominięte (włącz w Konfiguracja → Powiadomienia email)'
      );
    } else {
      console.log(
        '[Rebuild] Wysyłam powiadomienie email o błędzie regeneracji...'
      );
      await sendRebuildNotification(
        {
          success: false,
          duration: Date.now() - startTime,
          filesProcessed: 0,
          thumbnailsGenerated: generated,
          failed,
          error: errorMessage,
        },
        emailConfig.email || undefined
      );
    }

    return {
      success: false,
      generated,
      failed,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Przebudowuje miniaturki dla konkretnego folderu
 */
export async function rebuildFolderThumbnails(folderPath: string): Promise<{
  success: boolean;
  filesProcessed: number;
  thumbnailsGenerated: number;
  duration: number;
}> {
  const startTime = Date.now();
  let filesProcessed = 0;
  let thumbnailsGenerated = 0;

  try {
    const cacheData = await getCacheData();
    const config = cacheData.thumbnailConfig;

    // Filtruj pliki w określonym folderze
    const normalizedPath = folderPath.startsWith('/')
      ? folderPath
      : '/' + folderPath;
    const files = cacheData.fileHashes.filter(
      (f) =>
        f.path.startsWith(normalizedPath) &&
        /\.(jpg|jpeg|png|gif|webp)$/i.test(f.path)
    );

    logger.info(
      `Rebuilding thumbnails for folder ${folderPath}, ${files.length} files`
    );

    const baseUrl = GALLERY_BASE_URL.endsWith('/')
      ? GALLERY_BASE_URL
      : GALLERY_BASE_URL + '/';

    for (const file of files) {
      try {
        const sourceUrl = new URL(file.path.replace(/^\//, ''), baseUrl).href;
        const results = await generateThumbnails(sourceUrl, file.path, config);
        filesProcessed++;
        if (results.size > 0) {
          thumbnailsGenerated++;
        }
      } catch {
        // Kontynuuj z pozostałymi plikami
      }
    }

    const duration = Date.now() - startTime;

    // Zapisz informację o ostatnio przebudowanym folderze
    await updateCacheData((data) => {
      data.lastRebuiltFolder = {
        path: folderPath,
        timestamp: new Date().toISOString(),
        filesProcessed,
        thumbnailsGenerated,
      };
    });

    await addHistoryEntry(
      'thumbnails_generated',
      `Przebudowano folder ${folderPath}: ${thumbnailsGenerated} miniaturek`,
      duration
    );

    return { success: true, filesProcessed, thumbnailsGenerated, duration };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;
    logger.error(`Error rebuilding folder ${folderPath}:`, error);

    // Wyślij powiadomienie email o błędzie (przy awarii przebudowy folderu)
    try {
      const cacheData = await getCacheData();
      const emailConfig =
        cacheData.emailNotificationConfig || DEFAULT_EMAIL_NOTIFICATION_CONFIG;
      if (emailConfig.enabled && emailConfig.notifyOnError) {
        console.log(
          '[Rebuild folder] Wysyłam powiadomienie email o błędzie...'
        );
        await sendRebuildNotification(
          {
            success: false,
            duration,
            filesProcessed,
            thumbnailsGenerated: thumbnailsGenerated,
            failed: 0,
            error: `Błąd przebudowy folderu ${folderPath}: ${errorMessage}`,
          },
          emailConfig.email || undefined
        );
      }
    } catch (emailErr) {
      logger.error(
        'Failed to send folder rebuild error notification',
        emailErr
      );
      console.error('[Rebuild folder] Błąd wysyłki powiadomienia:', emailErr);
    }

    return {
      success: false,
      filesProcessed,
      thumbnailsGenerated,
      duration,
    };
  }
}
