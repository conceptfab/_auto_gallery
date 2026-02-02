export interface PathValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Walidacja ścieżki pliku – path traversal i dozwolone znaki.
 */
export function validateFilePath(path: string): PathValidationResult {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Path is required' };
  }
  if (path.includes('..') || path.includes('./') || path.startsWith('/')) {
    return { valid: false, error: 'Invalid path' };
  }
  // Dozwolone: litery, cyfry, / _ - . spacja (ścieżki typu "metro/Meble gabinetowe/CUBE/plik_thumb.webp")
  if (!/^[a-zA-Z0-9\/_\-\.\s]+$/.test(path)) {
    return { valid: false, error: 'Invalid characters in path' };
  }
  return { valid: true };
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
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(name)) {
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
  const normalized = folderPath.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');

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
