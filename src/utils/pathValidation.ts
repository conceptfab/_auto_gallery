import path from 'path';

export interface PathValidationResult {
  valid: boolean;
  error?: string;
  sanitizedPath?: string;
}

const BASE_PATH = path.resolve(process.cwd());

/**
 * Walidacja ścieżki pliku – path traversal (z normalizacją) i dozwolone znaki.
 */
export function validateFilePath(inputPath: string): PathValidationResult {
  if (!inputPath || typeof inputPath !== 'string') {
    return { valid: false, error: 'Path is required' };
  }
  // Normalizacja ścieżki (obsługa .., ./, Unicode, backslashy)
  const normalized = path
    .normalize(inputPath)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const resolved = path.resolve(BASE_PATH, normalized);
  if (!resolved.startsWith(BASE_PATH)) {
    return { valid: false, error: 'Path traversal detected' };
  }
  // Dozwolone: litery (Unicode), cyfry, / _ - . spacja (ścieżki typu "metro/Meble gabinetowe/CUBE/plik_thumb.webp")
  if (!/^[\p{L}0-9\/_\-\.\s]+$/u.test(normalized)) {
    return { valid: false, error: 'Invalid characters in path' };
  }
  return { valid: true, sanitizedPath: normalized || '.' };
}

export interface FileNameValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Walidacja nazwy pliku (bez ścieżki).
 */
export function validateFileName(name: string): FileNameValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Name is required' };
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return { valid: false, error: 'Invalid file name' };
  }
  if (!/^[\p{L}0-9_\-\.]+$/u.test(name)) {
    return { valid: false, error: 'Invalid characters in name' };
  }
  return { valid: true };
}

/**
 * Walidacja ścieżki folderu z dodatkowymi sprawdzeniami (głębokość, normalizacja).
 * Używana w convert-folder.ts i innych miejscach wymagających szczegółowej walidacji.
 */
export function validateFolderPathDetailed(
  folderPath: string,
  maxDepth: number = 5
): PathValidationResult {
  // Podstawowa walidacja
  const basicValidation = validateFilePath(folderPath);
  if (!basicValidation.valid) {
    return basicValidation;
  }

  // Normalizacja ścieżki
  const normalized = path
    .normalize(folderPath)
    .replace(/\\/g, '/')
    .replace(/^\/|\/$/g, '');

  // Sprawdź czy normalizacja nie zmieniła ścieżki w nieoczekiwany sposób
  const cleaned = folderPath.replace(/^\/|\/$/g, '');
  if (normalized !== cleaned) {
    return { valid: false, error: 'Invalid path normalization' };
  }

  // Sprawdź głębokość folderów
  const depth = normalized.split('/').length;
  if (depth > maxDepth) {
    return {
      valid: false,
      error: `Path depth exceeds maximum of ${maxDepth} levels`,
    };
  }

  return { valid: true };
}
