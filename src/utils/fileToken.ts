import crypto from 'crypto';

// Sekret do generowania tokenów (musi być taki sam jak w PHP)
// Przy włączonej ochronie plików wymagany jest sekret min. 32 znaki.
function getSecretKey(): string {
  const secret = process.env.FILE_PROXY_SECRET;
  if (process.env.FILE_PROTECTION_ENABLED === 'true') {
    if (!secret || secret.length < 32) {
      throw new Error(
        'FILE_PROXY_SECRET must be set and at least 32 characters when FILE_PROTECTION_ENABLED is true'
      );
    }
    return secret;
  }
  return secret || '';
}

/**
 * Pobiera wymaganą zmienną środowiskową.
 * W środowisku produkcyjnym rzuca błędem, jeśli zmienna nie jest ustawiona.
 */
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // W środowisku produkcyjnym rzuć błędem
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Critical environment variable ${name} is missing!`);
    }
    // W deweloperskim zaloguj ostrzeżenie i zwróć pusty string (aplikacja może nie działać poprawnie, ale się uruchomi)
    console.warn(`Warning: Environment variable ${name} is missing.`);
    return '';
  }
  return value;
}

// URL do skryptów pomocniczych na serwerze PHP
const getFileUrl = (name: string) => getRequiredEnv(name);

// Czas ważności tokenu w sekundach (2 godziny)
const TOKEN_EXPIRY_SECONDS = 7200;

/**
 * Generuje podpisany URL do pliku
 * @param filePath - ścieżka do pliku względem folderu galerii (np. "klient1/foto.jpg")
 * @returns podpisany URL z tokenem
 */
export function generateSignedUrl(filePath: string): string {
  const secretKey = getSecretKey();
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const proxyUrl = getFileUrl('FILE_PROXY_URL');

  // Token = HMAC-SHA256(filePath|expires, secret)
  const token = crypto
    .createHmac('sha256', secretKey)
    .update(`${filePath}|${expires}`)
    .digest('hex');

  const params = new URLSearchParams({
    file: filePath,
    token: token,
    expires: expires.toString(),
  });

  return `${proxyUrl}?${params.toString()}`;
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
  const secretKey = getSecretKey();
  const fileListUrl = getFileUrl('FILE_LIST_URL');
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;

  // Token dla listowania = HMAC-SHA256("list|folder|expires", secret)
  const token = crypto
    .createHmac('sha256', secretKey)
    .update(`list|${folder}|${expires}`)
    .digest('hex');

  const params = new URLSearchParams({
    folder: folder,
    token: token,
    expires: expires.toString(),
  });

  return `${fileListUrl}?${params.toString()}`;
}

// ========== FILE MANAGEMENT TOKENS ==========

/**
 * Generuje token dla uploadu plików
 */
export function generateUploadToken(folder: string = ''): {
  token: string;
  expires: number;
  url: string;
} {
  const secretKey = getSecretKey();
  const fileUploadUrl = getFileUrl('FILE_UPLOAD_URL');
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', secretKey)
    .update(`upload|${folder}|${expires}`)
    .digest('hex');

  return { token, expires, url: fileUploadUrl };
}

/**
 * Generuje token dla usuwania plików
 */
export function generateDeleteToken(path: string): {
  token: string;
  expires: number;
  url: string;
} {
  const secretKey = getSecretKey();
  const fileDeleteUrl = getFileUrl('FILE_DELETE_URL');
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', secretKey)
    .update(`delete|${path}|${expires}`)
    .digest('hex');

  return { token, expires, url: fileDeleteUrl };
}

/**
 * Generuje token dla zmiany nazwy
 */
export function generateRenameToken(
  oldPath: string,
  newName: string
): { token: string; expires: number; url: string } {
  const secretKey = getSecretKey();
  const fileRenameUrl = getFileUrl('FILE_RENAME_URL');
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', secretKey)
    .update(`rename|${oldPath}|${newName}|${expires}`)
    .digest('hex');

  return { token, expires, url: fileRenameUrl };
}

/**
 * Generuje token dla tworzenia folderu
 */
export function generateMkdirToken(
  parentFolder: string,
  folderName: string
): { token: string; expires: number; url: string } {
  const secretKey = getSecretKey();
  const fileMkdirUrl = getFileUrl('FILE_MKDIR_URL');
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', secretKey)
    .update(`mkdir|${parentFolder}|${folderName}|${expires}`)
    .digest('hex');

  return { token, expires, url: fileMkdirUrl };
}

/**
 * Generuje token dla przenoszenia plików
 */
export function generateMoveToken(
  sourcePath: string,
  targetFolder: string
): { token: string; expires: number; url: string } {
  const secretKey = getSecretKey();
  const fileMoveUrl = getFileUrl('FILE_MOVE_URL');
  const expires = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const token = crypto
    .createHmac('sha256', secretKey)
    .update(`move|${sourcePath}|${targetFolder}|${expires}`)
    .digest('hex');

  return { token, expires, url: fileMoveUrl };
}
