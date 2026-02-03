// Centralized configuration constants
// Na serwerze: GALLERY_BASE_URL lub NEXT_PUBLIC_*; w bundlu klienta tylko NEXT_PUBLIC_* jest dostępne
export const GALLERY_BASE_URL =
  process.env.NEXT_PUBLIC_GALLERY_BASE_URL ||
  process.env.GALLERY_BASE_URL ||
  'https://conceptfab.com/__metro/gallery/';
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'michal@conceptfab.com';
export const EMAIL_FROM =
  process.env.EMAIL_FROM || 'Content Browser <no-reply@conceptfab.com>';
export const ADMIN_PANEL_URL =
  process.env.ADMIN_PANEL_URL || 'https://app.conceptfab.com/admin';

// Email code expiration time in minutes
export const LOGIN_CODE_EXPIRY_MINUTES = 15;

// API timeouts (in milliseconds)
export const API_TIMEOUT_SHORT = 15000; // 15 seconds
export const API_TIMEOUT_LONG = 30000; // 30 seconds

// UI delays (in milliseconds)
export const UI_DELAY_SHORT = 200; // 200ms
export const UI_DELAY_MEDIUM = 500; // 500ms
export const PREVIEW_TIMEOUT = 2000; // 2 seconds

// Loading progress values (percentages)
export const LOADING_PROGRESS_FETCH = 30;
export const LOADING_PROGRESS_MID = 60;
export const LOADING_PROGRESS_PARSE = 80;
export const LOADING_PROGRESS_COMPLETE = 100;

// UI position offsets (in pixels)
export const PREVIEW_OFFSET_X = 100;
export const PREVIEW_OFFSET_Y = 210;

// File conversion constants
export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_FOLDER_DEPTH = 5;
export const CONVERT_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const CONVERT_RATE_LIMIT_MAX = 5; // max 5 requests per minute

// Volume Storage Path
// W produkcji (Railway) używamy /data-storage (Volume mount)
// Lokalnie używamy tymczasowego katalogu w projekcie
export const VOLUME_ROOT =
  process.env.VOLUME_ROOT ||
  (process.env.NODE_ENV === 'production'
    ? '/data-storage'
    : './tmp/data-storage');
