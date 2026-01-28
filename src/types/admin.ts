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
}

export interface FolderStatus {
  groupId: string;
  exists: boolean;
  path: string;
}
