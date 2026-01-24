import fs from 'fs';
import path from 'path';

// Trwałe przechowywanie danych w plikach JSON

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

interface StorageData {
  pendingEmails: Record<string, { timestamp: string; ip: string }>;
  whitelist: string[];
  blacklist: string[];
  activeCodes: Record<string, LoginCode>;
  loggedInUsers: string[];
  adminCodes: Record<string, LoginCode>;
  loggedInAdmins: string[];
}

const DATA_FILE = path.join(process.cwd(), 'data', 'storage.json');

// Domyślne dane
const defaultData: StorageData = {
  pendingEmails: {},
  whitelist: [],
  blacklist: [],
  activeCodes: {},
  loggedInUsers: [],
  adminCodes: {},
  loggedInAdmins: []
};

// Załaduj dane z pliku
function loadData(): StorageData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return { ...defaultData, ...data };
    }
  } catch (error) {
    console.error('❌ Błąd ładowania danych:', error);
  }
  return defaultData;
}

// Zapisz dane do pliku
function saveData(data: StorageData): void {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Błąd zapisywania danych:', error);
  }
}

// Cache danych w pamięci
let cachedData: StorageData | null = null;

function getData(): StorageData {
  if (!cachedData) {
    cachedData = loadData();
  }
  return cachedData;
}

function updateData(updater: (data: StorageData) => void): void {
  const data = getData();
  updater(data);
  cachedData = data;
  saveData(data);
}

// Funkcje pomocnicze
export function addPendingEmail(email: string, ip: string): void {
  updateData((data) => {
    data.pendingEmails[email] = { timestamp: new Date().toISOString(), ip };
  });
}

export function removePendingEmail(email: string): void {
  updateData((data) => {
    delete data.pendingEmails[email];
  });
}

export function getPendingEmails(): PendingEmail[] {
  const data = getData();
  return Object.entries(data.pendingEmails).map(([email, item]) => ({
    email,
    timestamp: new Date(item.timestamp),
    ip: item.ip
  }));
}

export function addToWhitelist(email: string): void {
  updateData((data) => {
    if (!data.whitelist.includes(email)) {
      data.whitelist.push(email);
    }
  });
}

export function addToBlacklist(email: string): void {
  updateData((data) => {
    if (!data.blacklist.includes(email)) {
      data.blacklist.push(email);
    }
  });
}

export function getWhitelist(): string[] {
  return getData().whitelist;
}

export function getBlacklist(): string[] {
  return getData().blacklist;
}

export function addActiveCode(email: string, loginCode: LoginCode): void {
  updateData((data) => {
    data.activeCodes[email] = loginCode;
  });
}

export function getActiveCode(email: string): LoginCode | undefined {
  return getData().activeCodes[email];
}

export function removeActiveCode(email: string): void {
  updateData((data) => {
    delete data.activeCodes[email];
  });
}

export function loginUser(email: string): void {
  updateData((data) => {
    if (!data.loggedInUsers.includes(email)) {
      data.loggedInUsers.push(email);
    }
  });
}

export function logoutUser(email: string): void {
  updateData((data) => {
    data.loggedInUsers = data.loggedInUsers.filter(u => u !== email);
  });
}

export function isUserLoggedIn(email: string): boolean {
  return getData().loggedInUsers.includes(email);
}

export function cleanupExpiredCodes(): number {
  const now = new Date();
  let expiredCount = 0;
  
  updateData((data) => {
    Object.keys(data.activeCodes).forEach(email => {
      const loginCode = data.activeCodes[email];
      if (now > new Date(loginCode.expiresAt)) {
        delete data.activeCodes[email];
        expiredCount++;
      }
    });
  });
  
  return expiredCount;
}

export function cleanupOldRequests(): number {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let cleanedCount = 0;
  
  updateData((data) => {
    Object.keys(data.pendingEmails).forEach(email => {
      const item = data.pendingEmails[email];
      if (new Date(item.timestamp) < dayAgo) {
        delete data.pendingEmails[email];
        cleanedCount++;
      }
    });
  });
  
  return cleanedCount;
}

export function addAdminCode(email: string, loginCode: LoginCode): void {
  updateData((data) => {
    data.adminCodes[email] = loginCode;
  });
}

export function getAdminCode(email: string): LoginCode | undefined {
  return getData().adminCodes[email];
}

export function removeAdminCode(email: string): void {
  updateData((data) => {
    delete data.adminCodes[email];
  });
}

export function loginAdmin(email: string): void {
  updateData((data) => {
    if (!data.loggedInAdmins.includes(email)) {
      data.loggedInAdmins.push(email);
    }
  });
}

export function logoutAdmin(email: string): void {
  updateData((data) => {
    data.loggedInAdmins = data.loggedInAdmins.filter(u => u !== email);
  });
}

export function isAdminLoggedIn(email: string): boolean {
  return getData().loggedInAdmins.includes(email);
}

export function cleanupExpiredAdminCodes(): number {
  const now = new Date();
  let expiredCount = 0;
  
  updateData((data) => {
    Object.keys(data.adminCodes).forEach(email => {
      const loginCode = data.adminCodes[email];
      if (now > new Date(loginCode.expiresAt)) {
        delete data.adminCodes[email];
        expiredCount++;
      }
    });
  });
  
  return expiredCount;
}