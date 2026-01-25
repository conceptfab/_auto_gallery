// Centralized configuration constants
export const GALLERY_BASE_URL = process.env.GALLERY_BASE_URL || 'https://conceptfab.com/__metro/gallery/';
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'michal@conceptfab.com';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Content Browser <no-reply@conceptfab.com>';
export const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'https://app.conceptfab.com/admin';

// Email code expiration time in minutes
export const LOGIN_CODE_EXPIRY_MINUTES = 15;

// Rate limiting configuration
export const RATE_LIMIT_REQUESTS = 10;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute