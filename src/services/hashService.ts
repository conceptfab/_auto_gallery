// src/services/hashService.ts

import { FileHash, HashChangeEvent, FolderHashRecord } from '@/src/types/cache';
import { logger } from '@/src/utils/logger';
import axios from 'axios';
import xxhashInit from 'xxhash-wasm';
import { generateListUrl } from '@/src/utils/fileToken';
import { getCacheData, updateCacheData } from '@/src/utils/cacheStorage';

// Lazy-loaded xxhash API
type XXHashAPI = Awaited<ReturnType<typeof xxhashInit>>;
let xxhashApi: XXHashAPI | null = null;

async function getXxhash(): Promise<XXHashAPI> {
  if (!xxhashApi) {
    xxhashApi = await xxhashInit();
  }
  return xxhashApi;
}

/**
 * Oblicza xxHash64 dla podanych danych
 */
export async function computeHash(data: string | Buffer): Promise<string> {
  const api = await getXxhash();
  const input = typeof data === 'string' ? data : new TextDecoder().decode(data);
  return api.h64ToString(input);
}

/**
 * Oblicza hash dla struktury folderu (lista plików + ich metadane)
 */
export async function computeFolderHash(
  files: Array<{ name: string; size: number; lastModified?: string }>,
): Promise<string> {
  // Sortujemy dla determinizmu
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const fingerprint = sorted
    .map((f) => `${f.name}:${f.size}:${f.lastModified || ''}`)
    .join('|');
  return computeHash(fingerprint);
}

/**
 * Oblicza hash dla pojedynczego pliku na podstawie metadanych
 */
export async function computeFileMetadataHash(file: {
  name: string;
  size: number;
  lastModified?: string;
}): Promise<string> {
  const fingerprint = `${file.name}:${file.size}:${file.lastModified || ''}`;
  return computeHash(fingerprint);
}

/**
 * Porównuje stary i nowy hash, zwraca wykryte zmiany
 */
export function detectChanges(
  oldHashes: Map<string, FileHash>,
  newHashes: Map<string, FileHash>,
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
        details: `Nowy plik: ${path}`,
      });
    } else if (oldHash.hash !== newHash.hash) {
      changes.push({
        id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        type: 'file_modified',
        path,
        oldHash: oldHash.hash,
        newHash: newHash.hash,
        details: `Zmodyfikowany: ${path}`,
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
        details: `Usunięty: ${path}`,
      });
    }
  }

  return changes;
}

interface RemoteFolder {
  name: string;
  path: string;
}

interface RemoteFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}

interface PHPListResponse {
  folders: RemoteFolder[];
  files: RemoteFile[];
  error?: string;
}

/**
 * Skanuje zdalny folder i zwraca hashe plików
 */
export async function scanRemoteFolderForHashes(
  basePath: string = '',
): Promise<FileHash[]> {
  const hashes: FileHash[] = [];

  try {
    // Rekurencyjne skanowanie z tokenami
    await scanFolderRecursive(basePath, hashes);
    logger.info(`Scanned ${hashes.length} files from ${basePath || 'root'}`);
    return hashes;
  } catch (error) {
    logger.error('Error scanning folder for hashes:', error);
    throw error;
  }
}

async function scanFolderRecursive(
  folderPath: string,
  hashes: FileHash[],
): Promise<void> {
  try {
    const listUrl = generateListUrl(folderPath);
    logger.debug(`Scanning folder: ${folderPath || 'root'}, URL: ${listUrl.substring(0, 100)}...`);

    const response = await axios.get<PHPListResponse>(listUrl, { timeout: 30000 });

    if (response.data.error) {
      logger.warn(`Failed to list folder ${folderPath}: ${response.data.error}`);
      return;
    }

    const folders = response.data.folders || [];
    const files = response.data.files || [];

    logger.debug(`Response for ${folderPath || 'root'}: folders=${folders.length}, files=${files.length}`);

    // Przetwarzaj pliki (tylko obrazy)
    const fileProcessingPromises = files.map(async (file) => {
      if (/\.(jpg|jpeg|png|gif|webp|avif)$/i.test(file.name)) {
        const hash = await computeFileMetadataHash({
          name: file.name,
          size: file.size || 0,
          lastModified: file.modified,
        });

        return {
          path: file.path,
          hash,
          size: file.size || 0,
          lastModified: file.modified || '',
          lastChecked: new Date().toISOString(),
        };
      }
      return null;
    });

    const fileResults = await Promise.all(fileProcessingPromises);
    for (const res of fileResults) {
      if (res) hashes.push(res);
    }

    // Rekurencja do podfolderów (równolegle)
    if (folders.length > 0) {
      await Promise.all(folders.map(folder => scanFolderRecursive(folder.path, hashes)));
    }
  } catch (error) {
    logger.error(`Error scanning folder ${folderPath}:`, error);
  }
}


/**
 * Pobiera statystyki zmian
 */
export function getChangeStats(changes: HashChangeEvent[]): {
  added: number;
  modified: number;
  deleted: number;
  total: number;
} {
  return {
    added: changes.filter((c) => c.type === 'file_added').length,
    modified: changes.filter((c) => c.type === 'file_modified').length,
    deleted: changes.filter((c) => c.type === 'file_deleted').length,
    total: changes.length,
  };
}

/**
 * Oblicza i zapisuje hashe dla każdego folderu
 * Porównuje z poprzednimi hashami i zwraca rekordy
 */
export async function computeAndStoreFolderHashes(): Promise<FolderHashRecord[]> {
  const cacheData = await getCacheData();
  const fileHashes = cacheData.fileHashes || [];

  // Grupuj pliki po folderach
  const folderMap = new Map<string, FileHash[]>();
  for (const file of fileHashes) {
    const parts = file.path.split('/');
    parts.pop(); // Usuń nazwę pliku
    const folderPath = parts.join('/') || '/';

    if (!folderMap.has(folderPath)) {
      folderMap.set(folderPath, []);
    }
    folderMap.get(folderPath)!.push(file);
  }

  // Oblicz hash dla każdego folderu
  const records: FolderHashRecord[] = [];
  const existingRecords = cacheData.folderHashRecords || [];

  for (const [folderPath, files] of folderMap) {
    const currentHash = await computeFolderHash(
      files.map((f) => ({
        name: f.path.split('/').pop()!,
        size: f.size,
        lastModified: f.lastModified,
      }))
    );

    const existingRecord = existingRecords.find((r) => r.path === folderPath);

    records.push({
      path: folderPath,
      currentHash,
      previousHash: existingRecord?.currentHash || null,
      timestamp: new Date().toISOString(),
      fileCount: files.length,
    });
  }

  // Zapisz zaktualizowane rekordy
  await updateCacheData((data) => {
    data.folderHashRecords = records;
  });

  logger.info(`Computed and stored hashes for ${records.length} folders`);

  return records;
}
