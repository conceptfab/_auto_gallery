import crypto from 'crypto';

// Sekret do generowania tokenów (musi być taki sam jak w PHP)
// WAŻNE: Ustaw FILE_PROXY_SECRET w env vars! Przy włączonej ochronie plików pusty sekret = niebezpieczne.
const SECRET_KEY = process.env.FILE_PROXY_SECRET || '';

function ensureSecretWarned(): void {
  if (
    process.env.FILE_PROTECTION_ENABLED === 'true' &&
    !SECRET_KEY &&
    !(ensureSecretWarned as { done?: boolean }).done
  ) {
    (ensureSecretWarned as { done?: boolean }).done = true;
    console.warn(
      '[fileToken] FILE_PROTECTION_ENABLED=true but FILE_PROXY_SECRET is empty – tokeny są niebezpieczne. Ustaw FILE_PROXY_SECRET.'
    );
  }
}

// URL do skryptu proxy na serwerze PHP
const FILE_PROXY_URL =
  process.env.FILE_PROXY_URL || 'https://conceptfab.com/file-proxy.php';

// Czas ważności tokenu w sekundach (2 godziny)
const TOKEN_EXPIRY_SECONDS = 7200;

/**
 * Generuje podpisany URL do pliku
 * @param filePath - ścieżka do pliku względem folderu galerii (np. "klient1/foto.jpg")
 * @returns podpisany URL z tokenem
 */
export function generateSignedUrl(filePath: string): string {
  ensureSecretWarned();
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;

  // Token = HMAC-SHA256(filePath|expires, secret)
  const token = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${filePath}|${expires}`)
    .digest('hex');

  const params = new URLSearchParams({
    file: filePath,
    token: token,
    expires: expires.toString(),
  });

  return `${FILE_PROXY_URL}?${params.toString()}`;
}

/**
 * Konwertuje bezpośredni URL galerii na podpisany URL proxy
 * @param directUrl - bezpośredni URL (np. "https://conceptfab.com/__metro/gallery/klient1/foto.jpg")
 * @param baseGalleryUrl - bazowy URL galerii do usunięcia
 * @returns podpisany URL proxy
 */
export function convertToSignedUrl(
  directUrl: string,
  baseGalleryUrl: string
): string {
  // Wyciągnij ścieżkę pliku z URL
  const filePath = directUrl.replace(baseGalleryUrl, '').replace(/^\//, '');

  return generateSignedUrl(filePath);
}

/**
 * Sprawdza czy ochrona plików jest włączona
 */
export function isFileProtectionEnabled(): boolean {
  return process.env.FILE_PROTECTION_ENABLED === 'true';
}

/**
 * Generuje URL do listowania plików przez PHP
 * @param folder - ścieżka folderu (np. "klient1" lub "")
 */
export function generateListUrl(folder: string = ''): string {
  ensureSecretWarned();
  const FILE_LIST_URL =
    process.env.FILE_LIST_URL || 'https://conceptfab.com/file-list.php';
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;

  // Token dla listowania = HMAC-SHA256("list|folder|expires", secret)
  const token = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`list|${folder}|${expires}`)
    .digest('hex');

  const params = new URLSearchParams({
    folder: folder,
    token: token,
    expires: expires.toString(),
  });

  return `${FILE_LIST_URL}?${params.toString()}`;
}

// ========== FILE MANAGEMENT TOKENS ==========

const FILE_UPLOAD_URL =
  process.env.FILE_UPLOAD_URL || 'https://conceptfab.com/file-upload.php';
const FILE_DELETE_URL =
  process.env.FILE_DELETE_URL || 'https://conceptfab.com/file-delete.php';
const FILE_RENAME_URL =
  process.env.FILE_RENAME_URL || 'https://conceptfab.com/file-rename.php';
const FILE_MKDIR_URL =
  process.env.FILE_MKDIR_URL || 'https://conceptfab.com/file-mkdir.php';
const FILE_MOVE_URL =
  process.env.FILE_MOVE_URL || 'https://conceptfab.com/file-move.php';

/**
 * Generuje token dla uploadu plików
 */
export function generateUploadToken(folder: string = ''): {
  token: string;
  expires: number;
  url: string;
} {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`upload|${folder}|${expires}`)
    .digest('hex');

  return { token, expires, url: FILE_UPLOAD_URL };
}

/**
 * Generuje token dla usuwania plików
 */
export function generateDeleteToken(path: string): {
  token: string;
  expires: number;
  url: string;
} {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`delete|${path}|${expires}`)
    .digest('hex');

  return { token, expires, url: FILE_DELETE_URL };
}

/**
 * Generuje token dla zmiany nazwy
 */
export function generateRenameToken(
  oldPath: string,
  newName: string
): { token: string; expires: number; url: string } {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`rename|${oldPath}|${newName}|${expires}`)
    .digest('hex');

  return { token, expires, url: FILE_RENAME_URL };
}

/**
 * Generuje token dla tworzenia folderu
 */
export function generateMkdirToken(
  parentFolder: string,
  folderName: string
): { token: string; expires: number; url: string } {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`mkdir|${parentFolder}|${folderName}|${expires}`)
    .digest('hex');

  return { token, expires, url: FILE_MKDIR_URL };
}

/**
 * Generuje token dla przenoszenia plików
 */
export function generateMoveToken(
  sourcePath: string,
  targetFolder: string
): { token: string; expires: number; url: string } {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`move|${sourcePath}|${targetFolder}|${expires}`)
    .digest('hex');

  return { token, expires, url: FILE_MOVE_URL };
}
