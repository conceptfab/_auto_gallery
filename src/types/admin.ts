/**
 * Współdzielone typy dla panelu administracyjnego.
 * Importuj te typy zamiast definiować je lokalnie.
 */

export interface PendingEmail {
  email: string;
  timestamp: string;
  ip: string;
}

export interface UserGroup {
  id: string;
  name: string;
  clientName: string;
  galleryFolder: string;
  /** Kolor grupy (hex, np. #3b82f6) – wyświetlany na karcie grupy */
  color?: string;
  users: string[];
}

export interface AdminData {
  pending: PendingEmail[];
  whitelist: string[];
  blacklist: string[];
}

export interface AdminAuthStatus {
  isAdminLoggedIn: boolean;
  email: string | null;
}

export interface AdminSettings {
  highlightKeywords: boolean;
  autoCleanupEnabled: boolean;
  autoCleanupDays: number;
  historyRetentionDays: number;
  thumbnailAnimationDelay: number;
  sessionDurationHours: number;
}
