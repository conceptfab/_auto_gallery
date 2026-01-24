// Globalne przechowywanie danych w pamięci
// W produkcji powinno być zastąpione bazą danych

export interface PendingEmail {
  email: string;
  timestamp: Date;
  ip: string;
}

export interface LoginCode {
  email: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
}

// Globalne storage
const globalStorage = {
  pendingEmails: new Map<string, { timestamp: Date; ip: string }>(),
  whitelist: new Set<string>(),
  blacklist: new Set<string>(),
  activeCodes: new Map<string, LoginCode>(),
  loggedInUsers: new Set<string>(),
  adminCodes: new Map<string, LoginCode>(),
  loggedInAdmins: new Set<string>()
};

// Sprawdź czy to jest pierwszy import
if (!global.authStorage) {
  global.authStorage = globalStorage;
}

export const storage = global.authStorage;

// Funkcje pomocnicze
export function addPendingEmail(email: string, ip: string): void {
  storage.pendingEmails.set(email, { timestamp: new Date(), ip });
}

export function removePendingEmail(email: string): void {
  storage.pendingEmails.delete(email);
}

export function getPendingEmails(): PendingEmail[] {
  return Array.from(storage.pendingEmails.entries()).map(([email, data]) => ({
    email,
    timestamp: data.timestamp,
    ip: data.ip
  }));
}

export function addToWhitelist(email: string): void {
  storage.whitelist.add(email);
}

export function addToBlacklist(email: string): void {
  storage.blacklist.add(email);
}

export function getWhitelist(): string[] {
  return Array.from(storage.whitelist);
}

export function getBlacklist(): string[] {
  return Array.from(storage.blacklist);
}

export function addActiveCode(email: string, loginCode: LoginCode): void {
  storage.activeCodes.set(email, loginCode);
}

export function getActiveCode(email: string): LoginCode | undefined {
  return storage.activeCodes.get(email);
}

export function removeActiveCode(email: string): void {
  storage.activeCodes.delete(email);
}

export function loginUser(email: string): void {
  storage.loggedInUsers.add(email);
}

export function logoutUser(email: string): void {
  storage.loggedInUsers.delete(email);
}

export function isUserLoggedIn(email: string): boolean {
  return storage.loggedInUsers.has(email);
}

export function cleanupExpiredCodes(): number {
  const now = new Date();
  let expiredCount = 0;
  
  Array.from(storage.activeCodes.entries()).forEach(([email, loginCode]) => {
    if (now > loginCode.expiresAt) {
      storage.activeCodes.delete(email);
      expiredCount++;
    }
  });
  
  return expiredCount;
}

export function cleanupOldRequests(): number {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let cleanedCount = 0;
  
  Array.from(storage.pendingEmails.entries()).forEach(([email, data]) => {
    if (data.timestamp < dayAgo) {
      storage.pendingEmails.delete(email);
      cleanedCount++;
    }
  });
  
  return cleanedCount;
}

export function addAdminCode(email: string, loginCode: LoginCode): void {
  storage.adminCodes.set(email, loginCode);
}

export function getAdminCode(email: string): LoginCode | undefined {
  return storage.adminCodes.get(email);
}

export function removeAdminCode(email: string): void {
  storage.adminCodes.delete(email);
}

export function loginAdmin(email: string): void {
  storage.loggedInAdmins.add(email);
}

export function logoutAdmin(email: string): void {
  storage.loggedInAdmins.delete(email);
}

export function isAdminLoggedIn(email: string): boolean {
  return storage.loggedInAdmins.has(email);
}

export function cleanupExpiredAdminCodes(): number {
  const now = new Date();
  let expiredCount = 0;
  
  Array.from(storage.adminCodes.entries()).forEach(([email, loginCode]) => {
    if (now > loginCode.expiresAt) {
      storage.adminCodes.delete(email);
      expiredCount++;
    }
  });
  
  return expiredCount;
}

// Rozszerzenie global interface dla TypeScript
declare global {
  var authStorage: typeof globalStorage | undefined;
}