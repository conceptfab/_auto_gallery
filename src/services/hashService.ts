// src/services/hashService.ts

import { FileHash, HashChangeEvent } from '@/src/types/cache';
import { logger } from '@/src/utils/logger';
import axios from 'axios';
import xxhashInit from 'xxhash-wasm';

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

interface RemoteFile {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
}

/**
 * Skanuje zdalny folder i zwraca hashe plików
 */
export async function scanRemoteFolderForHashes(
  basePath: string = '',
): Promise<FileHash[]> {
  const hashes: FileHash[] = [];
  const fileListUrl = process.env.FILE_LIST_URL;
  const secret = process.env.FILE_PROXY_SECRET;

  if (!fileListUrl || !secret) {
    logger.warn('FILE_LIST_URL or FILE_PROXY_SECRET not configured');
    return hashes;
  }

  try {
    // Rekurencyjne skanowanie
    await scanFolderRecursive(basePath, hashes, fileListUrl, secret);
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
  fileListUrl: string,
  secret: string,
): Promise<void> {
  try {
    const response = await axios.post(
      fileListUrl,
      { path: folderPath, secret },
      { timeout: 30000 },
    );

    if (!response.data.success) {
      logger.warn(`Failed to list folder ${folderPath}: ${response.data.error}`);
      return;
    }

    const items: RemoteFile[] = response.data.files || [];

    for (const item of items) {
      if (item.type === 'file') {
        // Tylko obrazy
        if (/\.(jpg|jpeg|png|gif|webp|avif)$/i.test(item.name)) {
          const hash = await computeFileMetadataHash({
            name: item.name,
            size: item.size || 0,
            lastModified: item.modified,
          });

          hashes.push({
            path: item.path,
            hash,
            size: item.size || 0,
            lastModified: item.modified || '',
            lastChecked: new Date().toISOString(),
          });
        }
      } else if (item.type === 'folder') {
        // Rekurencja do podfolderów
        await scanFolderRecursive(item.path, hashes, fileListUrl, secret);
      }
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
