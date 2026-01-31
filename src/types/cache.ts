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
  storage: 'local' | 'remote'; // local = Railway, remote = conceptfab.com
}

export interface SchedulerConfig {
  enabled: boolean;
  // Harmonogram dla godzin pracy (np. 9-17)
  workHours: {
    start: number; // 9
    end: number; // 17
    intervalMinutes: number; // 30
  };
  // Harmonogram poza godzinami pracy
  offHours: {
    enabled: boolean;
    intervalMinutes: number | null; // null = wyłączone
  };
  // Timezone
  timezone: string; // 'Europe/Warsaw'
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
  hash: string; // Agregowany hash wszystkich plików
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
    lastRunDuration: number | null; // ms
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
    storageUsed: number; // bytes
    storageLocation: 'local' | 'remote';
  };
}

export interface CacheHistoryEntry {
  id: string;
  timestamp: string;
  action:
    | 'scan_started'
    | 'scan_completed'
    | 'changes_detected'
    | 'thumbnails_generated'
    | 'error';
  details: string;
  duration?: number;
  affectedPaths?: string[];
}

// Konfiguracja powiadomień email
export interface EmailNotificationConfig {
  enabled: boolean;
  email: string; // Pusty = użyj ADMIN_EMAIL
  notifyOnRebuild: boolean;
  notifyOnError: boolean;
}

// Informacje o ostatnio przebudowanym folderze
export interface LastRebuiltFolder {
  path: string;
  timestamp: string;
  filesProcessed: number;
  thumbnailsGenerated: number;
}

// Konfiguracja czyszczenia historii
export interface HistoryCleanupConfig {
  autoCleanupEnabled: boolean;
  retentionHours: number; // Domyślnie 24
}

// Rekord hasha folderu do weryfikacji
export interface FolderHashRecord {
  path: string;
  currentHash: string;
  previousHash: string | null;
  timestamp: string;
  fileCount: number;
}

export interface CacheStorageData {
  schedulerConfig: SchedulerConfig;
  thumbnailConfig: ThumbnailConfig;
  fileHashes: FileHash[];
  changeHistory: HashChangeEvent[];
  history: CacheHistoryEntry[];
  lastSchedulerRun: string | null;
  lastScanChanges: number;
  lastScanDuration: number | null;
  // Nowe pola
  emailNotificationConfig?: EmailNotificationConfig;
  lastRebuiltFolder?: LastRebuiltFolder;
  historyCleanupConfig?: HistoryCleanupConfig;
  folderHashRecords?: FolderHashRecord[];
}
