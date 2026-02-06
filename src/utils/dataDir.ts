import path from 'path';
import fsp from 'fs/promises';

let cached: string | null = null;

/**
 * Zwraca bazowy katalog danych.
 * Produkcja (Railway volume): `/data-storage`
 * Lokalnie: `<cwd>/data`
 * Wynik jest cache'owany po pierwszym wywołaniu.
 */
export async function getDataDir(): Promise<string> {
  if (cached !== null) return cached;
  try {
    await fsp.access('/data-storage');
    cached = '/data-storage';
  } catch {
    cached = path.join(process.cwd(), 'data');
  }
  return cached;
}
