# Wdrożenie: System Hash Detection + Cache Miniaturek

## Spis treści
1. [Podsumowanie funkcjonalności](#1-podsumowanie-funkcjonalności)
2. [Architektura rozwiązania](#2-architektura-rozwiązania)
3. [Wymagane zależności](#3-wymagane-zależności)
4. [Nowe pliki do utworzenia](#4-nowe-pliki-do-utworzenia)
5. [Modyfikacje istniejących plików](#5-modyfikacje-istniejących-plików)
6. [Schemat bazy danych](#6-schemat-bazy-danych)
7. [API Endpoints](#7-api-endpoints)
8. [Panel Admina - UI](#8-panel-admina---ui)
9. [Scheduler - implementacja](#9-scheduler---implementacja)
10. [Kolejność wdrożenia](#10-kolejność-wdrożenia)
11. [Zmienne środowiskowe](#11-zmienne-środowiskowe)
12. [Sugestie i uwagi](#12-sugestie-i-uwagi)

---

## 1. Podsumowanie funkcjonalności

### 1.1 System wykrywania zmian (xxHash)
- Proces sprawdzający zmiany w plikach/folderach na każdym serwerze
- Porównywanie aktualnego hasha z historią zapisaną w bazie
- Konfigurowalny harmonogram (np. 9-17 co 30min, 17-9 raz/nigdy)

### 1.2 Cache miniaturek
- Automatyczne generowanie zestawu miniaturek w różnych rozmiarach
- Lazy loading - serwis sprawdza przy starcie dostępność cache
- Fallback do oryginałów gdy cache niedostępny
- Wybór miejsca przechowywania: serwer źródłowy lub Railway volume

### 1.3 Panel kontrolny
- Nowa zakładka w panelu admina
- Monitorowanie statusu procesów
- Konfiguracja harmonogramu sprawdzania
- Historia zmian i logi
- Manualne triggery (force refresh, regenerate thumbnails)

---

## 2. Architektura rozwiązania

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PANEL ADMINA                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ Scheduler       │  │ Hash Monitor    │  │ Thumbnail Cache │     │
│  │ Config          │  │ Status          │  │ Status          │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
└───────────┼────────────────────┼────────────────────┼───────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                         API LAYER                                  │
│  POST /api/admin/cache/scheduler-config                           │
│  GET  /api/admin/cache/status                                     │
│  POST /api/admin/cache/trigger-scan                               │
│  POST /api/admin/cache/regenerate-thumbnails                      │
│  GET  /api/admin/cache/history                                    │
└───────────────────────────────────────────────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                      BACKGROUND SERVICES                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    SCHEDULER SERVICE                         │  │
│  │  - Uruchamia się przy starcie aplikacji                     │  │
│  │  - Sprawdza harmonogram co minutę                           │  │
│  │  - Triggeruje HashChecker i ThumbnailGenerator              │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    HASH CHECKER                              │  │
│  │  - Skanuje strukturę folderów                               │  │
│  │  - Oblicza xxHash dla plików/folderów                       │  │
│  │  - Porównuje z historią w storage                           │  │
│  │  - Zapisuje zmiany i trigguje regenerację                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                 THUMBNAIL GENERATOR                          │  │
│  │  - Sharp do przetwarzania obrazów                           │  │
│  │  - Generuje preset rozmiarów (thumb, medium, large)         │  │
│  │  - Zapisuje do wybranego storage                            │  │
│  │  - WebP/AVIF dla optymalizacji                              │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                       STORAGE LAYER                                │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │ storage.json │  │ Redis       │  │ Thumbnail Storage       │   │
│  │ - config     │  │ - job queue │  │ - /data-storage/thumbs  │   │
│  │ - history    │  │ - hash cache│  │ - OR conceptfab.com/    │   │
│  │ - hashes     │  │             │  │      thumbs/            │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Wymagane zależności

### Nowe pakiety do zainstalowania:
```bash
npm install xxhash-wasm
# LUB alternatywnie (native, szybszy ale wymaga kompilacji):
# npm install xxhash-addon

# Opcjonalnie dla schedulera (jeśli potrzebne):
npm install node-cron
```

### Już zainstalowane (używane):
- `sharp` - przetwarzanie obrazów (już jest w package.json!)
- `@upstash/redis` - distributed cache
- `axios` - HTTP requests

---

## 4. Nowe pliki do utworzenia

### 4.1 Typy
```
src/types/cache.ts
```

```typescript
// src/types/cache.ts

export interface ThumbnailSize {
  name: 'thumb' | 'medium' | 'large';
  width: number;
  height: number;
  quality: number;
}

export interface ThumbnailConfig {
  sizes: ThumbnailSize[];
  format: 'webp' | 'avif' | 'jpeg';
  storage: 'local' | 'remote';  // local = Railway, remote = conceptfab.com
}

export interface SchedulerConfig {
  enabled: boolean;
  // Harmonogram dla godzin pracy (np. 9-17)
  workHours: {
    start: number;  // 9
    end: number;    // 17
    intervalMinutes: number;  // 30
  };
  // Harmonogram poza godzinami pracy
  offHours: {
    enabled: boolean;
    intervalMinutes: number | null;  // null = wyłączone
  };
  // Timezone
  timezone: string;  // 'Europe/Warsaw'
}

export interface FileHash {
  path: string;
  hash: string;
  size: number;
  lastModified: string;
  lastChecked: string;
}

export interface FolderHash {
  path: string;
  hash: string;  // Agregowany hash wszystkich plików
  fileCount: number;
  totalSize: number;
  lastChecked: string;
}

export interface HashChangeEvent {
  id: string;
  timestamp: string;
  type: 'file_added' | 'file_modified' | 'file_deleted' | 'folder_changed';
  path: string;
  oldHash?: string;
  newHash?: string;
  details?: string;
}

export interface CacheStatus {
  scheduler: {
    enabled: boolean;
    nextRun: string | null;
    lastRun: string | null;
    lastRunDuration: number | null;  // ms
  };
  hashChecker: {
    totalFolders: number;
    totalFiles: number;
    lastScanTime: string | null;
    changesDetected: number;
  };
  thumbnails: {
    totalGenerated: number;
    pendingGeneration: number;
    storageUsed: number;  // bytes
    storageLocation: 'local' | 'remote';
  };
}

export interface CacheHistoryEntry {
  id: string;
  timestamp: string;
  action: 'scan_started' | 'scan_completed' | 'changes_detected' |
          'thumbnails_generated' | 'error';
  details: string;
  duration?: number;
  affectedPaths?: string[];
}
```

### 4.2 Hash Service
```
src/services/hashService.ts
```

```typescript
// src/services/hashService.ts

import { xxhash64 } from 'xxhash-wasm';
import axios from 'axios';
import { FileHash, FolderHash, HashChangeEvent } from '@/src/types/cache';
import { logger } from '@/src/utils/logger';

let xxhash: Awaited<ReturnType<typeof xxhash64>> | null = null;

async function getHasher() {
  if (!xxhash) {
    const { h64 } = await import('xxhash-wasm');
    xxhash = await h64();
  }
  return xxhash;
}

/**
 * Oblicza xxHash64 dla podanych danych
 */
export async function computeHash(data: string | Buffer): Promise<string> {
  const hasher = await getHasher();
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hasher(input).toString(16);
}

/**
 * Oblicza hash dla struktury folderu (lista plików + ich rozmiary)
 */
export async function computeFolderHash(
  files: Array<{ name: string; size: number; lastModified?: string }>
): Promise<string> {
  // Sortujemy dla determinizmu
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const fingerprint = sorted
    .map(f => `${f.name}:${f.size}:${f.lastModified || ''}`)
    .join('|');
  return computeHash(fingerprint);
}

/**
 * Porównuje stary i nowy hash, zwraca wykryte zmiany
 */
export function detectChanges(
  oldHashes: Map<string, FileHash>,
  newHashes: Map<string, FileHash>
): HashChangeEvent[] {
  const changes: HashChangeEvent[] = [];
  const now = new Date().toISOString();

  // Sprawdź nowe i zmodyfikowane
  for (const [path, newHash] of newHashes) {
    const oldHash = oldHashes.get(path);

    if (!oldHash) {
      changes.push({
        id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        type: 'file_added',
        path,
        newHash: newHash.hash,
      });
    } else if (oldHash.hash !== newHash.hash) {
      changes.push({
        id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        type: 'file_modified',
        path,
        oldHash: oldHash.hash,
        newHash: newHash.hash,
      });
    }
  }

  // Sprawdź usunięte
  for (const [path, oldHash] of oldHashes) {
    if (!newHashes.has(path)) {
      changes.push({
        id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        type: 'file_deleted',
        path,
        oldHash: oldHash.hash,
      });
    }
  }

  return changes;
}

/**
 * Skanuje zdalny folder i zwraca hashe plików
 */
export async function scanRemoteFolderForHashes(
  folderUrl: string
): Promise<FileHash[]> {
  try {
    // Użyj istniejącej logiki skanowania z galleryUtils
    // lub bezpośrednio pobierz listę plików przez PHP API
    const response = await axios.get(process.env.FILE_LIST_URL!, {
      params: {
        path: folderUrl,
        secret: process.env.FILE_PROXY_SECRET,
      },
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to list files');
    }

    const files = response.data.files || [];
    const hashes: FileHash[] = [];

    for (const file of files) {
      if (file.type === 'file') {
        // Dla plików używamy metadanych zamiast pobierania całego pliku
        const hash = await computeHash(`${file.name}:${file.size}:${file.modified}`);
        hashes.push({
          path: file.path,
          hash,
          size: file.size,
          lastModified: file.modified,
          lastChecked: new Date().toISOString(),
        });
      }
    }

    return hashes;
  } catch (error) {
    logger.error('Error scanning folder for hashes:', error);
    throw error;
  }
}
```

### 4.3 Thumbnail Service
```
src/services/thumbnailService.ts
```

```typescript
// src/services/thumbnailService.ts

import sharp from 'sharp';
import path from 'path';
import fsp from 'fs/promises';
import axios from 'axios';
import FormData from 'form-data';
import { ThumbnailConfig, ThumbnailSize } from '@/src/types/cache';
import { logger } from '@/src/utils/logger';

// Domyślna konfiguracja rozmiarów
export const DEFAULT_THUMBNAIL_SIZES: ThumbnailSize[] = [
  { name: 'thumb', width: 300, height: 300, quality: 80 },
  { name: 'medium', width: 800, height: 800, quality: 85 },
  { name: 'large', width: 1920, height: 1920, quality: 90 },
];

// Ścieżka do lokalnego cache (Railway volume)
const LOCAL_CACHE_PATH = '/data-storage/thumbnails';
const FALLBACK_CACHE_PATH = './data/thumbnails';

async function getCachePath(): Promise<string> {
  try {
    await fsp.access('/data-storage');
    return LOCAL_CACHE_PATH;
  } catch {
    return FALLBACK_CACHE_PATH;
  }
}

/**
 * Generuje miniaturki dla pojedynczego obrazu
 */
export async function generateThumbnails(
  sourceUrl: string,
  originalPath: string,
  config: ThumbnailConfig = { sizes: DEFAULT_THUMBNAIL_SIZES, format: 'webp', storage: 'local' }
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  try {
    // Pobierz oryginalny obraz
    const response = await axios.get(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    const imageBuffer = Buffer.from(response.data);

    // Generuj każdy rozmiar
    for (const size of config.sizes) {
      const outputBuffer = await sharp(imageBuffer)
        .resize(size.width, size.height, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        [config.format]({ quality: size.quality })
        .toBuffer();

      // Zapisz do wybranego storage
      const thumbnailPath = await saveThumbnail(
        outputBuffer,
        originalPath,
        size.name,
        config.format,
        config.storage
      );

      results.set(size.name, thumbnailPath);
    }

    logger.info(`Generated ${results.size} thumbnails for ${originalPath}`);
    return results;
  } catch (error) {
    logger.error(`Error generating thumbnails for ${originalPath}:`, error);
    throw error;
  }
}

/**
 * Zapisuje miniaturkę do storage
 */
async function saveThumbnail(
  buffer: Buffer,
  originalPath: string,
  sizeName: string,
  format: string,
  storage: 'local' | 'remote'
): Promise<string> {
  // Generuj ścieżkę miniaturki
  const pathParts = originalPath.split('/');
  const filename = pathParts.pop() || 'image';
  const baseName = filename.replace(/\.[^.]+$/, '');
  const thumbFilename = `${baseName}_${sizeName}.${format}`;
  const relativePath = [...pathParts, thumbFilename].join('/');

  if (storage === 'local') {
    // Zapisz lokalnie (Railway volume)
    const cachePath = await getCachePath();
    const fullPath = path.join(cachePath, relativePath);

    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, buffer);

    return `/api/thumbnails/${relativePath}`;
  } else {
    // Wyślij do zdalnego serwera przez PHP
    const form = new FormData();
    form.append('file', buffer, {
      filename: thumbFilename,
      contentType: `image/${format}`,
    });
    form.append('path', `thumbnails/${relativePath}`);
    form.append('secret', process.env.FILE_PROXY_SECRET || '');

    const uploadUrl = process.env.FILE_UPLOAD_URL;
    if (!uploadUrl) {
      throw new Error('FILE_UPLOAD_URL not configured');
    }

    await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
    });

    return `${process.env.GALLERY_BASE_URL}thumbnails/${relativePath}`;
  }
}

/**
 * Sprawdza czy miniaturka istnieje
 */
export async function thumbnailExists(
  originalPath: string,
  sizeName: string,
  format: string,
  storage: 'local' | 'remote'
): Promise<boolean> {
  const pathParts = originalPath.split('/');
  const filename = pathParts.pop() || 'image';
  const baseName = filename.replace(/\.[^.]+$/, '');
  const thumbFilename = `${baseName}_${sizeName}.${format}`;
  const relativePath = [...pathParts, thumbFilename].join('/');

  if (storage === 'local') {
    const cachePath = await getCachePath();
    const fullPath = path.join(cachePath, relativePath);
    try {
      await fsp.access(fullPath);
      return true;
    } catch {
      return false;
    }
  } else {
    // Sprawdź zdalnie przez HEAD request
    const url = `${process.env.GALLERY_BASE_URL}thumbnails/${relativePath}`;
    try {
      await axios.head(url, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Pobiera URL miniaturki (lub fallback do oryginału)
 */
export async function getThumbnailUrl(
  originalUrl: string,
  originalPath: string,
  sizeName: 'thumb' | 'medium' | 'large',
  config: ThumbnailConfig
): Promise<string> {
  const exists = await thumbnailExists(
    originalPath,
    sizeName,
    config.format,
    config.storage
  );

  if (exists) {
    const pathParts = originalPath.split('/');
    const filename = pathParts.pop() || 'image';
    const baseName = filename.replace(/\.[^.]+$/, '');
    const thumbFilename = `${baseName}_${sizeName}.${config.format}`;
    const relativePath = [...pathParts, thumbFilename].join('/');

    if (config.storage === 'local') {
      return `/api/thumbnails/${relativePath}`;
    } else {
      return `${process.env.GALLERY_BASE_URL}thumbnails/${relativePath}`;
    }
  }

  // Fallback do oryginału
  return originalUrl;
}

/**
 * Pobiera statystyki cache miniaturek
 */
export async function getThumbnailStats(): Promise<{
  totalFiles: number;
  totalSize: number;
  bySize: Record<string, number>;
}> {
  const cachePath = await getCachePath();
  const stats = {
    totalFiles: 0,
    totalSize: 0,
    bySize: {} as Record<string, number>,
  };

  try {
    await countFilesRecursive(cachePath, stats);
  } catch {
    // Cache directory may not exist yet
  }

  return stats;
}

async function countFilesRecursive(
  dir: string,
  stats: { totalFiles: number; totalSize: number; bySize: Record<string, number> }
): Promise<void> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await countFilesRecursive(fullPath, stats);
      } else if (entry.isFile()) {
        const fileStat = await fsp.stat(fullPath);
        stats.totalFiles++;
        stats.totalSize += fileStat.size;

        // Kategoryzuj po rozmiarze
        const sizeName = entry.name.match(/_(\w+)\.\w+$/)?.[1] || 'unknown';
        stats.bySize[sizeName] = (stats.bySize[sizeName] || 0) + 1;
      }
    }
  } catch {
    // Directory may not exist
  }
}
```

### 4.4 Scheduler Service
```
src/services/schedulerService.ts
```

```typescript
// src/services/schedulerService.ts

import { SchedulerConfig, CacheHistoryEntry } from '@/src/types/cache';
import { scanRemoteFolderForHashes, detectChanges } from './hashService';
import { generateThumbnails, DEFAULT_THUMBNAIL_SIZES } from './thumbnailService';
import { getCacheData, updateCacheData } from '@/src/utils/cacheStorage';
import { logger } from '@/src/utils/logger';

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Domyślna konfiguracja schedulera
 */
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

/**
 * Inicjalizuje scheduler przy starcie aplikacji
 */
export function initScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Sprawdzaj co minutę czy trzeba uruchomić skan
  schedulerInterval = setInterval(checkAndRun, 60 * 1000);

  logger.info('Scheduler initialized');
}

/**
 * Zatrzymuje scheduler
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  logger.info('Scheduler stopped');
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
    const isWorkHours = hour >= config.workHours.start && hour < config.workHours.end;

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
      const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);
      if (minutesSinceLastRun < intervalMinutes) {
        return;
      }
    }

    // Uruchom skan
    await runScan();
  } catch (error) {
    logger.error('Scheduler check error:', error);
  }
}

/**
 * Uruchamia pełny skan i generowanie miniaturek
 */
export async function runScan(): Promise<void> {
  if (isRunning) {
    throw new Error('Scan already in progress');
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    await addHistoryEntry('scan_started', 'Rozpoczęto skanowanie zmian');

    const cacheData = await getCacheData();
    const oldHashes = new Map(
      (cacheData.fileHashes || []).map(h => [h.path, h])
    );

    // Skanuj główny folder galerii
    const baseUrl = process.env.GALLERY_BASE_URL || '';
    const newHashList = await scanRemoteFolderForHashes(baseUrl);
    const newHashes = new Map(newHashList.map(h => [h.path, h]));

    // Wykryj zmiany
    const changes = detectChanges(oldHashes, newHashes);

    // Zapisz nowe hashe i zmiany
    await updateCacheData(data => {
      data.fileHashes = newHashList;
      data.lastSchedulerRun = new Date().toISOString();
      data.lastScanChanges = changes.length;

      // Dodaj zmiany do historii (max 1000 wpisów)
      if (!data.changeHistory) data.changeHistory = [];
      data.changeHistory = [...changes, ...data.changeHistory].slice(0, 1000);
    });

    const duration = Date.now() - startTime;

    if (changes.length > 0) {
      await addHistoryEntry(
        'changes_detected',
        `Wykryto ${changes.length} zmian`,
        duration,
        changes.map(c => c.path)
      );

      // Regeneruj miniaturki dla zmienionych plików
      await regenerateThumbnailsForChanges(changes);
    } else {
      await addHistoryEntry(
        'scan_completed',
        'Skanowanie zakończone - brak zmian',
        duration
      );
    }

    logger.info(`Scan completed in ${duration}ms, ${changes.length} changes detected`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await addHistoryEntry('error', `Błąd skanowania: ${errorMessage}`);
    logger.error('Scan error:', error);
    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * Regeneruje miniaturki dla zmienionych plików
 */
async function regenerateThumbnailsForChanges(
  changes: Array<{ type: string; path: string }>
): Promise<void> {
  const cacheData = await getCacheData();
  const config = cacheData.thumbnailConfig || {
    sizes: DEFAULT_THUMBNAIL_SIZES,
    format: 'webp' as const,
    storage: 'local' as const,
  };

  const filesToRegenerate = changes
    .filter(c => c.type === 'file_added' || c.type === 'file_modified')
    .filter(c => /\.(jpg|jpeg|png|gif|webp)$/i.test(c.path))
    .map(c => c.path);

  let generated = 0;
  for (const filePath of filesToRegenerate) {
    try {
      const sourceUrl = `${process.env.GALLERY_BASE_URL}${filePath}`;
      await generateThumbnails(sourceUrl, filePath, config);
      generated++;
    } catch (error) {
      logger.error(`Failed to generate thumbnails for ${filePath}:`, error);
    }
  }

  if (generated > 0) {
    await addHistoryEntry(
      'thumbnails_generated',
      `Wygenerowano miniaturki dla ${generated} plików`
    );
  }
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
  await updateCacheData(data => {
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
```

### 4.5 Cache Storage
```
src/utils/cacheStorage.ts
```

```typescript
// src/utils/cacheStorage.ts

import path from 'path';
import fsp from 'fs/promises';
import {
  SchedulerConfig,
  ThumbnailConfig,
  FileHash,
  HashChangeEvent,
  CacheHistoryEntry,
  CacheStatus
} from '@/src/types/cache';
import { DEFAULT_SCHEDULER_CONFIG } from '@/src/services/schedulerService';
import { DEFAULT_THUMBNAIL_SIZES } from '@/src/services/thumbnailService';

interface CacheStorageData {
  schedulerConfig: SchedulerConfig;
  thumbnailConfig: ThumbnailConfig;
  fileHashes: FileHash[];
  changeHistory: HashChangeEvent[];
  history: CacheHistoryEntry[];
  lastSchedulerRun: string | null;
  lastScanChanges: number;
}

const defaultCacheData: CacheStorageData = {
  schedulerConfig: DEFAULT_SCHEDULER_CONFIG,
  thumbnailConfig: {
    sizes: DEFAULT_THUMBNAIL_SIZES,
    format: 'webp',
    storage: 'local',
  },
  fileHashes: [],
  changeHistory: [],
  history: [],
  lastSchedulerRun: null,
  lastScanChanges: 0,
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
    cachedData = { ...defaultCacheData, ...JSON.parse(raw) };
    return cachedData;
  } catch {
    cachedData = { ...defaultCacheData };
    return cachedData;
  }
}

export async function updateCacheData(
  updater: (data: CacheStorageData) => void
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

  return {
    scheduler: {
      enabled: data.schedulerConfig.enabled,
      nextRun: calculateNextRun(data.schedulerConfig, data.lastSchedulerRun),
      lastRun: data.lastSchedulerRun,
      lastRunDuration: null, // TODO: track this
    },
    hashChecker: {
      totalFolders: 0, // TODO: count from fileHashes
      totalFiles: data.fileHashes.length,
      lastScanTime: data.lastSchedulerRun,
      changesDetected: data.lastScanChanges,
    },
    thumbnails: {
      totalGenerated: 0, // TODO: count from filesystem
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
  const isWorkHours = hour >= config.workHours.start && hour < config.workHours.end;

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
    const nextRun = new Date(new Date(lastRun).getTime() + intervalMinutes * 60 * 1000);
    return nextRun.toISOString();
  }

  return now.toISOString();
}
```

### 4.6 API Endpoints

```
pages/api/admin/cache/status.ts
```

```typescript
// pages/api/admin/cache/status.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { getCacheStatus, getCacheData } from '@/src/utils/cacheStorage';
import { isScanRunning } from '@/src/services/schedulerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const status = await getCacheStatus();
    const data = await getCacheData();

    return res.status(200).json({
      success: true,
      status: {
        ...status,
        scanInProgress: isScanRunning(),
      },
      config: {
        scheduler: data.schedulerConfig,
        thumbnails: data.thumbnailConfig,
      },
    });
  } catch (error) {
    console.error('Error getting cache status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

```
pages/api/admin/cache/config.ts
```

```typescript
// pages/api/admin/cache/config.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { getCacheData, updateCacheData } from '@/src/utils/cacheStorage';
import { SchedulerConfig, ThumbnailConfig } from '@/src/types/cache';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const data = await getCacheData();
    return res.status(200).json({
      success: true,
      schedulerConfig: data.schedulerConfig,
      thumbnailConfig: data.thumbnailConfig,
    });
  }

  if (req.method === 'POST') {
    const { schedulerConfig, thumbnailConfig } = req.body as {
      schedulerConfig?: Partial<SchedulerConfig>;
      thumbnailConfig?: Partial<ThumbnailConfig>;
    };

    await updateCacheData(data => {
      if (schedulerConfig) {
        data.schedulerConfig = { ...data.schedulerConfig, ...schedulerConfig };
      }
      if (thumbnailConfig) {
        data.thumbnailConfig = { ...data.thumbnailConfig, ...thumbnailConfig };
      }
    });

    const updatedData = await getCacheData();
    return res.status(200).json({
      success: true,
      schedulerConfig: updatedData.schedulerConfig,
      thumbnailConfig: updatedData.thumbnailConfig,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

```
pages/api/admin/cache/trigger.ts
```

```typescript
// pages/api/admin/cache/trigger.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { runScan, isScanRunning } from '@/src/services/schedulerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (isScanRunning()) {
    return res.status(409).json({
      error: 'Scan already in progress',
      inProgress: true
    });
  }

  try {
    // Uruchom skan asynchronicznie
    runScan().catch(err => {
      console.error('Background scan error:', err);
    });

    return res.status(200).json({
      success: true,
      message: 'Scan started',
    });
  } catch (error) {
    console.error('Error triggering scan:', error);
    return res.status(500).json({ error: 'Failed to start scan' });
  }
}
```

```
pages/api/admin/cache/history.ts
```

```typescript
// pages/api/admin/cache/history.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { isAdminLoggedIn } from '@/src/utils/storage';
import { getAdminEmailFromCookie } from '@/src/utils/auth';
import { getCacheData } from '@/src/utils/cacheStorage';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminEmail = getAdminEmailFromCookie(req);
  if (!adminEmail || !(await isAdminLoggedIn(adminEmail))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const data = await getCacheData();
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = (data.history || []).slice(offset, offset + limit);
    const changes = (data.changeHistory || []).slice(0, 100);

    return res.status(200).json({
      success: true,
      history,
      recentChanges: changes,
      total: data.history?.length || 0,
    });
  } catch (error) {
    console.error('Error getting cache history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

```
pages/api/thumbnails/[...path].ts
```

```typescript
// pages/api/thumbnails/[...path].ts

import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';

async function getCachePath(): Promise<string> {
  try {
    await fsp.access('/data-storage');
    return '/data-storage/thumbnails';
  } catch {
    return path.join(process.cwd(), 'data', 'thumbnails');
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pathSegments = req.query.path as string[];
    const relativePath = pathSegments.join('/');

    // Zabezpieczenie przed path traversal
    if (relativePath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const cachePath = await getCachePath();
    const fullPath = path.join(cachePath, relativePath);

    const buffer = await fsp.readFile(fullPath);

    // Określ content-type na podstawie rozszerzenia
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (error) {
    return res.status(404).json({ error: 'Thumbnail not found' });
  }
}
```

---

## 5. Modyfikacje istniejących plików

### 5.1 `src/utils/storage.ts`
Dodaj na końcu pliku:

```typescript
// ==================== CACHE CONFIG ====================

export interface CacheSettings {
  schedulerEnabled: boolean;
  workHoursStart: number;
  workHoursEnd: number;
  workHoursInterval: number;
  offHoursEnabled: boolean;
  offHoursInterval: number | null;
  thumbnailStorage: 'local' | 'remote';
  thumbnailFormat: 'webp' | 'avif' | 'jpeg';
}

// Te funkcje są teraz w cacheStorage.ts - można zaimportować stamtąd
```

### 5.2 `pages/admin.tsx`
Dodaj nową sekcję "Cache & Miniaturki" przed sekcją "Menedżer plików":

```typescript
// Importy na górze pliku
import { CacheMonitorSection } from '../src/components/admin/CacheMonitorSection';

// W JSX, przed sekcją files:
{/* Cache & Miniaturki */}
<section className="admin-section">
  <h2
    className="admin-section-title admin-section-title-clickable"
    onClick={() => toggleSection('cache')}
  >
    <span>Cache i Miniaturki</span>
    <i
      className={`las la-angle-up admin-section-toggle ${
        expandedSections.has('cache') ? '' : 'collapsed'
      }`}
    ></i>
  </h2>
  {expandedSections.has('cache') && <CacheMonitorSection />}
</section>
```

### 5.3 `src/utils/imageUtils.ts`
Rozszerz funkcję do obsługi cache miniaturek:

```typescript
// src/utils/imageUtils.ts - nowa wersja

import { ImageFile } from '@/src/types/gallery';

// Konfiguracja cache (będzie pobierana z API)
let thumbnailCacheEnabled = false;
let thumbnailConfig: { storage: 'local' | 'remote'; format: string } | null = null;

/**
 * Inicjalizuje konfigurację cache przy starcie
 */
export async function initThumbnailCache(): Promise<void> {
  try {
    const response = await fetch('/api/admin/cache/status');
    const data = await response.json();

    if (data.success && data.config) {
      thumbnailCacheEnabled = data.status.thumbnails.totalGenerated > 0;
      thumbnailConfig = data.config.thumbnails;
    }
  } catch {
    thumbnailCacheEnabled = false;
  }
}

/**
 * Zwraca URL obrazka - z cache lub przez proxy
 */
export function getOptimizedImageUrl(
  image: ImageFile,
  size: 'thumb' | 'medium' | 'large' | 'full' = 'full'
): string {
  // Jeśli cache jest włączony i mamy konfigurację
  if (thumbnailCacheEnabled && thumbnailConfig && size !== 'full') {
    const pathParts = image.path.split('/');
    const filename = pathParts.pop() || 'image';
    const baseName = filename.replace(/\.[^.]+$/, '');
    const thumbFilename = `${baseName}_${size}.${thumbnailConfig.format}`;
    const relativePath = [...pathParts, thumbFilename].join('/');

    if (thumbnailConfig.storage === 'local') {
      return `/api/thumbnails/${relativePath}`;
    } else {
      // Zakładamy GALLERY_BASE_URL z env
      return `${process.env.NEXT_PUBLIC_GALLERY_BASE_URL || ''}thumbnails/${relativePath}`;
    }
  }

  // Fallback do proxy
  return `/api/image-proxy?url=${encodeURIComponent(image.url)}&size=${size}`;
}

/**
 * Pobiera URL miniaturki z fallbackiem
 */
export async function getImageUrlWithFallback(
  image: ImageFile,
  size: 'thumb' | 'medium' | 'large'
): Promise<string> {
  const cacheUrl = getOptimizedImageUrl(image, size);

  // Sprawdź czy cache istnieje
  try {
    const response = await fetch(cacheUrl, { method: 'HEAD' });
    if (response.ok) {
      return cacheUrl;
    }
  } catch {
    // Cache niedostępny
  }

  // Fallback do oryginału
  return image.url;
}
```

### 5.4 `pages/_app.tsx` lub `pages/index.tsx`
Dodaj inicjalizację cache przy starcie:

```typescript
// Na początku komponentu lub w useEffect
import { initThumbnailCache } from '@/src/utils/imageUtils';

useEffect(() => {
  initThumbnailCache();
}, []);
```

### 5.5 `next.config.js`
Dodaj konfigurację dla API thumbnails:

```javascript
// Dodaj do rewrites jeśli potrzebne
async rewrites() {
  return [
    // ... istniejące rewrites
  ];
},
```

---

## 6. Schemat bazy danych

### Nowy plik: `data/cache-config.json`

```json
{
  "schedulerConfig": {
    "enabled": false,
    "workHours": {
      "start": 9,
      "end": 17,
      "intervalMinutes": 30
    },
    "offHours": {
      "enabled": false,
      "intervalMinutes": null
    },
    "timezone": "Europe/Warsaw"
  },
  "thumbnailConfig": {
    "sizes": [
      { "name": "thumb", "width": 300, "height": 300, "quality": 80 },
      { "name": "medium", "width": 800, "height": 800, "quality": 85 },
      { "name": "large", "width": 1920, "height": 1920, "quality": 90 }
    ],
    "format": "webp",
    "storage": "local"
  },
  "fileHashes": [],
  "changeHistory": [],
  "history": [],
  "lastSchedulerRun": null,
  "lastScanChanges": 0
}
```

---

## 7. API Endpoints

| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/api/admin/cache/status` | GET | Status cache, schedulera, miniaturek |
| `/api/admin/cache/config` | GET/POST | Pobierz/zapisz konfigurację |
| `/api/admin/cache/trigger` | POST | Ręczne uruchomienie skanu |
| `/api/admin/cache/history` | GET | Historia operacji i zmian |
| `/api/thumbnails/[...path]` | GET | Serwowanie miniaturek z cache |

---

## 8. Panel Admina - UI

### Nowy komponent: `src/components/admin/CacheMonitorSection.tsx`

```typescript
// src/components/admin/CacheMonitorSection.tsx

import React, { useState, useEffect, useCallback } from 'react';

interface CacheStatus {
  scheduler: {
    enabled: boolean;
    nextRun: string | null;
    lastRun: string | null;
  };
  hashChecker: {
    totalFiles: number;
    lastScanTime: string | null;
    changesDetected: number;
  };
  thumbnails: {
    totalGenerated: number;
    storageUsed: number;
    storageLocation: 'local' | 'remote';
  };
  scanInProgress: boolean;
}

interface SchedulerConfig {
  enabled: boolean;
  workHours: {
    start: number;
    end: number;
    intervalMinutes: number;
  };
  offHours: {
    enabled: boolean;
    intervalMinutes: number | null;
  };
}

interface HistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  duration?: number;
}

export const CacheMonitorSection: React.FC = () => {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/cache/status');
      const data = await response.json();
      if (data.success) {
        setStatus(data.status);
        setConfig(data.config.scheduler);
      }
    } catch (error) {
      console.error('Error fetching cache status:', error);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/cache/history?limit=20');
      const data = await response.json();
      if (data.success) {
        setHistory(data.history);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchStatus(), fetchHistory()]).finally(() => setLoading(false));

    // Auto-refresh co 30 sekund
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchHistory]);

  const handleTriggerScan = async () => {
    setTriggering(true);
    try {
      const response = await fetch('/api/admin/cache/trigger', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        // Odśwież status po chwili
        setTimeout(fetchStatus, 2000);
      } else {
        alert(data.error || 'Błąd uruchamiania skanu');
      }
    } catch (error) {
      console.error('Error triggering scan:', error);
      alert('Błąd uruchamiania skanu');
    } finally {
      setTriggering(false);
    }
  };

  const handleToggleScheduler = async () => {
    if (!config) return;

    try {
      const response = await fetch('/api/admin/cache/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedulerConfig: { enabled: !config.enabled },
        }),
      });
      const data = await response.json();
      if (data.success) {
        setConfig(data.schedulerConfig);
        fetchStatus();
      }
    } catch (error) {
      console.error('Error updating config:', error);
    }
  };

  const handleUpdateInterval = async (field: string, value: number) => {
    if (!config) return;

    const updates: Partial<SchedulerConfig> = {};

    if (field === 'workInterval') {
      updates.workHours = { ...config.workHours, intervalMinutes: value };
    } else if (field === 'workStart') {
      updates.workHours = { ...config.workHours, start: value };
    } else if (field === 'workEnd') {
      updates.workHours = { ...config.workHours, end: value };
    } else if (field === 'offInterval') {
      updates.offHours = { ...config.offHours, intervalMinutes: value };
    }

    try {
      const response = await fetch('/api/admin/cache/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedulerConfig: updates }),
      });
      const data = await response.json();
      if (data.success) {
        setConfig(data.schedulerConfig);
      }
    } catch (error) {
      console.error('Error updating config:', error);
    }
  };

  if (loading) {
    return <div className="admin-card">Ładowanie...</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Status */}
      <div className="admin-card">
        <h3 style={{ margin: '0 0 15px 0' }}>Status systemu</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
          {/* Scheduler */}
          <div style={{ padding: '15px', background: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
              Scheduler
            </div>
            <div style={{
              fontSize: '18px',
              fontWeight: 600,
              color: status?.scheduler.enabled ? '#059669' : '#dc2626'
            }}>
              {status?.scheduler.enabled ? 'Aktywny' : 'Wyłączony'}
            </div>
            {status?.scheduler.nextRun && (
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '5px' }}>
                Następny: {new Date(status.scheduler.nextRun).toLocaleString('pl-PL')}
              </div>
            )}
          </div>

          {/* Hash Checker */}
          <div style={{ padding: '15px', background: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
              Pliki monitorowane
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>
              {status?.hashChecker.totalFiles || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '5px' }}>
              Ostatnie zmiany: {status?.hashChecker.changesDetected || 0}
            </div>
          </div>

          {/* Thumbnails */}
          <div style={{ padding: '15px', background: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
              Miniaturki
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>
              {status?.thumbnails.totalGenerated || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '5px' }}>
              Storage: {status?.thumbnails.storageLocation === 'local' ? 'Railway' : 'Remote'}
            </div>
          </div>
        </div>

        {/* Akcje */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            onClick={handleTriggerScan}
            disabled={triggering || status?.scanInProgress}
            className="admin-btn admin-btn--purple"
          >
            {status?.scanInProgress ? 'Skanowanie...' : triggering ? 'Uruchamianie...' : 'Uruchom skan'}
          </button>
          <button
            onClick={handleToggleScheduler}
            className={`admin-btn ${config?.enabled ? 'admin-btn--danger' : 'admin-btn--success'}`}
          >
            {config?.enabled ? 'Wyłącz scheduler' : 'Włącz scheduler'}
          </button>
          <button
            onClick={() => { fetchStatus(); fetchHistory(); }}
            className="admin-btn"
          >
            Odśwież
          </button>
        </div>
      </div>

      {/* Konfiguracja harmonogramu */}
      <div className="admin-card">
        <h3 style={{ margin: '0 0 15px 0' }}>Konfiguracja harmonogramu</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Godziny pracy */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Godziny pracy</h4>
            <div style={{ display: 'grid', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '120px', fontSize: '13px' }}>Od godziny:</span>
                <select
                  value={config?.workHours.start || 9}
                  onChange={(e) => handleUpdateInterval('workStart', parseInt(e.target.value))}
                  className="admin-input"
                  style={{ width: '80px' }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '120px', fontSize: '13px' }}>Do godziny:</span>
                <select
                  value={config?.workHours.end || 17}
                  onChange={(e) => handleUpdateInterval('workEnd', parseInt(e.target.value))}
                  className="admin-input"
                  style={{ width: '80px' }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '120px', fontSize: '13px' }}>Interwał (min):</span>
                <select
                  value={config?.workHours.intervalMinutes || 30}
                  onChange={(e) => handleUpdateInterval('workInterval', parseInt(e.target.value))}
                  className="admin-input"
                  style={{ width: '80px' }}
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                  <option value={120}>120</option>
                </select>
              </label>
            </div>
          </div>

          {/* Poza godzinami pracy */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Poza godzinami pracy</h4>
            <div style={{ display: 'grid', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  checked={config?.offHours.enabled || false}
                  onChange={async () => {
                    if (!config) return;
                    const response = await fetch('/api/admin/cache/config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        schedulerConfig: {
                          offHours: {
                            ...config.offHours,
                            enabled: !config.offHours.enabled
                          },
                        },
                      }),
                    });
                    const data = await response.json();
                    if (data.success) setConfig(data.schedulerConfig);
                  }}
                />
                <span style={{ fontSize: '13px' }}>Włącz sprawdzanie</span>
              </label>
              {config?.offHours.enabled && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '120px', fontSize: '13px' }}>Interwał (min):</span>
                  <select
                    value={config?.offHours.intervalMinutes || 120}
                    onChange={(e) => handleUpdateInterval('offInterval', parseInt(e.target.value))}
                    className="admin-input"
                    style={{ width: '80px' }}
                  >
                    <option value={60}>60</option>
                    <option value={120}>120</option>
                    <option value={240}>240</option>
                    <option value={480}>480</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Historia */}
      <div className="admin-card">
        <h3 style={{ margin: '0 0 15px 0' }}>Historia operacji</h3>

        {history.length === 0 ? (
          <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Brak historii</p>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {history.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '10px',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {entry.details}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {new Date(entry.timestamp).toLocaleString('pl-PL')}
                    {entry.duration && ` • ${entry.duration}ms`}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  background: entry.action === 'error' ? '#fee2e2' :
                             entry.action === 'changes_detected' ? '#fef3c7' : '#d1fae5',
                  color: entry.action === 'error' ? '#991b1b' :
                         entry.action === 'changes_detected' ? '#92400e' : '#065f46',
                }}>
                  {entry.action.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## 9. Scheduler - implementacja

### Inicjalizacja przy starcie aplikacji

W pliku `pages/_app.tsx` lub w custom server (jeśli używany):

```typescript
// pages/_app.tsx
import { useEffect } from 'react';
import type { AppProps } from 'next/app';

// Import schedulera tylko po stronie serwera
if (typeof window === 'undefined') {
  import('../src/services/schedulerService').then(({ initScheduler }) => {
    initScheduler();
  });
}

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

**Alternatywnie** dla Railway/Vercel (serverless):

Użyj Edge Functions lub Cron Jobs:
- Railway: użyj Railway Cron lub external cron service (cron-job.org)
- Vercel: użyj Vercel Cron Jobs

Przykład endpoint dla cron:

```typescript
// pages/api/cron/cache-scan.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { runScan, isScanRunning } from '@/src/services/schedulerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Weryfikacja tokena cron
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (isScanRunning()) {
    return res.status(200).json({ message: 'Scan already running' });
  }

  try {
    await runScan();
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Scan failed' });
  }
}
```

---

## 10. Kolejność wdrożenia

### Faza 1: Infrastruktura (1-2 dni)
1. [ ] Zainstaluj `xxhash-wasm`
2. [ ] Utwórz `src/types/cache.ts`
3. [ ] Utwórz `src/utils/cacheStorage.ts`
4. [ ] Utwórz plik `data/cache-config.json`

### Faza 2: Serwisy (2-3 dni)
5. [ ] Utwórz `src/services/hashService.ts`
6. [ ] Utwórz `src/services/thumbnailService.ts`
7. [ ] Utwórz `src/services/schedulerService.ts`

### Faza 3: API (1-2 dni)
8. [ ] Utwórz `pages/api/admin/cache/status.ts`
9. [ ] Utwórz `pages/api/admin/cache/config.ts`
10. [ ] Utwórz `pages/api/admin/cache/trigger.ts`
11. [ ] Utwórz `pages/api/admin/cache/history.ts`
12. [ ] Utwórz `pages/api/thumbnails/[...path].ts`

### Faza 4: UI (1-2 dni)
13. [ ] Utwórz `src/components/admin/CacheMonitorSection.tsx`
14. [ ] Zmodyfikuj `pages/admin.tsx` - dodaj nową sekcję
15. [ ] Zmodyfikuj `src/utils/imageUtils.ts`

### Faza 5: Integracja (1 dzień)
16. [ ] Inicjalizacja schedulera przy starcie
17. [ ] Integracja miniaturek z ImageGrid
18. [ ] Testy end-to-end

### Faza 6: Deploy (1 dzień)
19. [ ] Dodaj zmienne środowiskowe
20. [ ] Deploy na Railway
21. [ ] Konfiguracja cron (jeśli potrzebne)
22. [ ] Monitoring i weryfikacja

---

## 11. Zmienne środowiskowe

Dodaj do `.env`:

```bash
# Cache & Thumbnails
CRON_SECRET=your_secure_cron_token_here
NEXT_PUBLIC_GALLERY_BASE_URL=https://conceptfab.com/__metro/gallery/

# Opcjonalnie dla zewnętrznego crona
CRON_ENABLED=true
```

---

## 12. Sugestie i uwagi

### 12.1 Optymalizacje

1. **xxHash vs metadata hash**:
   - Zamiast hashować całe pliki (kosztowne), hashujemy metadane: `nazwa + rozmiar + data_modyfikacji`
   - To wystarczy do wykrywania zmian bez pobierania całych plików

2. **Lazy thumbnail generation**:
   - Zamiast generować wszystkie miniaturki na raz, generuj on-demand
   - Pierwsze żądanie generuje i cachuje, kolejne serwują z cache

3. **Queue dla generowania**:
   - Dla dużej liczby plików rozważ kolejkę (Bull/BullMQ z Redis)
   - Zapobiegnie przeciążeniu serwera

### 12.2 Alternatywne podejścia

1. **Cloudflare Images** zamiast własnego cache:
   - Automatyczne resizing
   - Global CDN
   - ~$5/100k transformacji

2. **Imgproxy** jako oddzielny serwis:
   - Self-hosted image processing
   - Bardzo szybki (Go)
   - On-the-fly transformations

3. **Next.js Image Optimization**:
   - Wbudowane w Next.js
   - Wymaga hostingu z obsługą (Vercel, custom server)
   - Już skonfigurowane w `next.config.js`

### 12.3 Uwagi dotyczące Railway

1. **Persistent storage**:
   - Railway volume montowany na `/data-storage`
   - Limit zależy od planu (zazwyczaj 1-10GB)
   - Miniaturki WebP są małe (~20-50KB każda)

2. **Cold starts**:
   - Scheduler może nie działać w serverless
   - Użyj zewnętrznego crona do triggerowania

3. **Memory limits**:
   - Sharp używa dużo pamięci
   - Rozważ `sharp.concurrency(1)` dla ograniczonych zasobów

### 12.4 Bezpieczeństwo

1. **Walidacja ścieżek**:
   - Zawsze sprawdzaj path traversal (`..`)
   - Ogranicz dostęp do określonych folderów

2. **Rate limiting**:
   - Ogranicz częstotliwość ręcznych skanów
   - Zapobiegaj DoS przez nadmierne generowanie

3. **Autoryzacja**:
   - Wszystkie endpointy cache wymagają autoryzacji admina
   - Cron endpoint wymaga secret tokena

### 12.5 Monitorowanie

Rozważ dodanie:
- Logów do zewnętrznego serwisu (Logtail, Axiom)
- Alertów przy błędach skanowania
- Metryki czasu generowania miniaturek
- Dashboard z trendem zmian

---

## Podsumowanie

Dokument zawiera kompletną specyfikację wdrożenia systemu:
- **Hash detection** z xxHash dla wykrywania zmian
- **Cache miniaturek** z Sharp i elastycznym storage
- **Panel admina** z konfiguracją i monitoringiem
- **Scheduler** z harmonogramem godzinowym

Szacowany czas wdrożenia: **7-10 dni roboczych** dla jednego developera.

Kluczowe pliki do utworzenia: **~15 nowych plików**
Modyfikacje: **~5 istniejących plików**
