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
  if (!/^[a-zA-Z0-9\/_\-\.]+$/.test(path)) {
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
