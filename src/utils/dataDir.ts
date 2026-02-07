import path from 'path';
import fsp from 'fs/promises';

let cached: string | null = null;

/**
 * Zwraca bazowy katalog danych.
 * - DATA_DIR (env) ma pierwszeństwo.
 * - W produkcji domyślnie `/data-storage` (bez sprawdzania dysku – wszystkie instancje muszą widzieć ten sam volume).
 * - Lokalnie: sprawdzenie /data-storage, fallback `<cwd>/data`.
 * Wynik jest cache'owany po pierwszym wywołaniu.
 */
export async function getDataDir(): Promise<string> {
  if (cached !== null) return cached;
  if (process.env.DATA_DIR) {
    cached = path.resolve(process.env.DATA_DIR);
    return cached;
  }
  if (process.env.NODE_ENV === 'production') {
    // Produkcja: zawsze ten sam katalog we wszystkich instancjach (volume).
    // Nie używamy fs.access – unikamy sytuacji, gdy jedna instancja dostanie fallback i czyta pustą whitelist.
    cached = '/data-storage';
    return cached;
  }
  try {
    await fsp.access('/data-storage');
    cached = '/data-storage';
  } catch {
    cached = path.join(process.cwd(), 'data');
  }
  return cached;
}
