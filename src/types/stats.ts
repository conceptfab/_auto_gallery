// Typy dla systemu statystyk użytkowników
// Zgodnie z dokumentem wdrozenie.md (System Statystyk Użytkowników)

// Pojedyncze logowanie użytkownika
export interface UserLogin {
  email: string;
  timestamp: string; // ISO date
  ip: string;
  userAgent?: string;
}

// Sesja użytkownika (od logowania do wylogowania/zamknięcia)
export interface UserSession {
  id: string; // sess_xxxxxxxx
  email: string;
  startedAt: string; // ISO date
  endedAt?: string; // ISO date (null jeśli aktywna)
  lastActivity: string; // ISO date ostatniej aktywności
  ip: string;
  userAgent?: string;
}

// Zdarzenie przeglądania (folder lub obraz)
export interface ViewEvent {
  id: string; // view_xxxxxxxx
  email: string;
  sessionId: string;
  timestamp: string;
  type: 'folder' | 'image';
  path: string; // ścieżka do folderu/obrazu
  folderName?: string; // nazwa folderu (dla kontekstu)
  imageName?: string; // nazwa pliku obrazu
  duration?: number; // czas oglądania w sekundach (dla obrazów)
}

// Zdarzenie pobrania pliku
export interface DownloadEvent {
  id: string; // dl_xxxxxxxx
  email: string;
  sessionId: string;
  timestamp: string;
  filePath: string;
  fileName: string;
  fileSize?: number;
}

// Statystyki zbiorcze użytkownika
export interface UserStats {
  email: string;
  totalLogins: number;
  totalSessions: number;
  totalTimeSpent: number; // w sekundach
  totalImagesViewed: number;
  totalFoldersViewed: number;
  totalDownloads: number;
  lastLogin?: string;
  lastActivity?: string;
  favoriteFolder?: string; // najczęściej odwiedzany
}

// Główna struktura statystyk w storage
export interface StatsData {
  logins: UserLogin[];
  sessions: UserSession[];
  viewEvents: ViewEvent[];
  downloadEvents: DownloadEvent[];
  // Opcjonalnie: cache dla szybszego dostępu
  userStatsCache?: Record<string, UserStats>;
}
