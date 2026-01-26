import fs from 'fs';
import path from 'path';

// Trwałe przechowywanie danych w plikach JSON

// ==================== WALIDACJA I SANITYZACJA ====================

const LIMITS = {
  MAX_PENDING_EMAILS: 1000,
  MAX_WHITELIST: 10000,
  MAX_BLACKLIST: 10000,
  MAX_GROUPS: 500,
  MAX_USERS_PER_GROUP: 1000,
  MAX_ACTIVE_CODES: 5000,
  MAX_LOGGED_IN_USERS: 10000
};

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.toLowerCase().trim().substring(0, 254);
}

function sanitizeIp(ip: string): string {
  if (!ip || typeof ip !== 'string') return 'unknown';
  // Tylko dozwolone znaki w IP (IPv4, IPv6, forwarded)
  return ip.replace(/[^a-fA-F0-9.:,\s]/g, '').substring(0, 100);
}

function sanitizeGroupId(id: string): string {
  if (!id || typeof id !== 'string') return '';
  return id.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
}

function sanitizeFolderPath(path: string): string {
  if (!path || typeof path !== 'string') return '';
  return path.trim()
    .replace(/\.\./g, '')  // Blokuj path traversal
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .substring(0, 200);
}

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

export interface UserGroup {
  id: string;
  name: string;
  clientName: string;
  galleryFolder: string;
  users: string[];
}

interface StorageData {
  pendingEmails: Record<string, { timestamp: string; ip: string }>;
  whitelist: string[];
  blacklist: string[];
  activeCodes: Record<string, LoginCode>;
  loggedInUsers: string[];
  adminCodes: Record<string, LoginCode>;
  loggedInAdmins: string[];
  groups: UserGroup[];
}

// Użyj Railway volume /data-storage jeśli istnieje, w przeciwnym razie lokalny folder data/
const DATA_FILE = fs.existsSync('/data-storage')
  ? '/data-storage/storage.json'
  : path.join(process.cwd(), 'data', 'storage.json');

// Domyślne dane
const defaultData: StorageData = {
  pendingEmails: {},
  whitelist: [],
  blacklist: [],
  activeCodes: {},
  loggedInUsers: [],
  adminCodes: {},
  loggedInAdmins: [],
  groups: []
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
  const sanitizedEmail = sanitizeEmail(email);
  if (!isValidEmail(sanitizedEmail)) {
    throw new Error('Invalid email format');
  }
  
  const sanitizedIp = sanitizeIp(ip);
  
  updateData((data) => {
    // Sprawdź limit
    const pendingCount = Object.keys(data.pendingEmails).length;
    if (pendingCount >= LIMITS.MAX_PENDING_EMAILS) {
      // Usuń najstarszy wpis
      const entries = Object.entries(data.pendingEmails)
        .sort(([,a], [,b]) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (entries.length > 0) {
        delete data.pendingEmails[entries[0][0]];
      }
    }
    
    data.pendingEmails[sanitizedEmail] = { 
      timestamp: new Date().toISOString(), 
      ip: sanitizedIp 
    };
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
  const sanitizedEmail = sanitizeEmail(email);
  if (!isValidEmail(sanitizedEmail)) {
    throw new Error('Invalid email format');
  }
  
  updateData((data) => {
    if (data.whitelist.length >= LIMITS.MAX_WHITELIST) {
      throw new Error('Whitelist limit reached');
    }
    if (!data.whitelist.includes(sanitizedEmail)) {
      data.whitelist.push(sanitizedEmail);
    }
  });
}

export function addToBlacklist(email: string): void {
  const sanitizedEmail = sanitizeEmail(email);
  if (!isValidEmail(sanitizedEmail)) {
    throw new Error('Invalid email format');
  }
  
  updateData((data) => {
    if (data.blacklist.length >= LIMITS.MAX_BLACKLIST) {
      throw new Error('Blacklist limit reached');
    }
    if (!data.blacklist.includes(sanitizedEmail)) {
      data.blacklist.push(sanitizedEmail);
    }
  });
}

export function getWhitelist(): string[] {
  return getData().whitelist;
}

export function removeFromWhitelist(email: string): void {
  updateData((data) => {
    data.whitelist = data.whitelist.filter(e => e !== email);
  });
}

export function getBlacklist(): string[] {
  return getData().blacklist;
}

export function removeFromBlacklist(email: string): void {
  updateData((data) => {
    data.blacklist = data.blacklist.filter(e => e !== email);
  });
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

// ==================== GRUPY UŻYTKOWNIKÓW ====================

function generateGroupId(): string {
  return 'grp_' + Math.random().toString(36).substring(2, 11);
}

export function getGroups(): UserGroup[] {
  return getData().groups || [];
}

export function getGroupById(id: string): UserGroup | undefined {
  return getGroups().find(g => g.id === id);
}

export function createGroup(name: string, clientName: string, galleryFolder: string): UserGroup {
  // Walidacja
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Group name is required');
  }
  if (!clientName || typeof clientName !== 'string' || clientName.trim().length === 0) {
    throw new Error('Client name is required');
  }
  if (!galleryFolder || typeof galleryFolder !== 'string') {
    throw new Error('Gallery folder is required');
  }
  
  const newGroup: UserGroup = {
    id: generateGroupId(),
    name: name.trim().substring(0, 100),
    clientName: clientName.trim().substring(0, 100),
    galleryFolder: sanitizeFolderPath(galleryFolder),
    users: []
  };
  
  updateData((data) => {
    if (!data.groups) data.groups = [];
    
    if (data.groups.length >= LIMITS.MAX_GROUPS) {
      throw new Error('Groups limit reached');
    }
    
    data.groups.push(newGroup);
  });
  
  return newGroup;
}

export function updateGroup(id: string, updates: { name?: string; clientName?: string; galleryFolder?: string }): UserGroup | null {
  let updatedGroup: UserGroup | null = null;
  
  updateData((data) => {
    const group = data.groups?.find(g => g.id === id);
    if (group) {
      if (updates.name !== undefined) group.name = updates.name;
      if (updates.clientName !== undefined) group.clientName = updates.clientName;
      if (updates.galleryFolder !== undefined) group.galleryFolder = updates.galleryFolder;
      updatedGroup = { ...group };
    }
  });
  
  return updatedGroup;
}

export function deleteGroup(id: string): boolean {
  let deleted = false;
  
  updateData((data) => {
    const index = data.groups?.findIndex(g => g.id === id) ?? -1;
    if (index !== -1) {
      data.groups.splice(index, 1);
      deleted = true;
    }
  });
  
  return deleted;
}

export function addUserToGroup(groupId: string, email: string): boolean {
  const sanitizedGroupId = sanitizeGroupId(groupId);
  const sanitizedEmail = sanitizeEmail(email);
  
  if (!sanitizedGroupId) {
    throw new Error('Invalid group ID');
  }
  if (!isValidEmail(sanitizedEmail)) {
    throw new Error('Invalid email format');
  }
  
  let added = false;
  
  updateData((data) => {
    // Usuń użytkownika z innych grup
    data.groups?.forEach(g => {
      g.users = g.users.filter(u => u !== sanitizedEmail);
    });
    
    // Dodaj do wybranej grupy
    const group = data.groups?.find(g => g.id === sanitizedGroupId);
    if (group) {
      if (group.users.length >= LIMITS.MAX_USERS_PER_GROUP) {
        throw new Error('Group users limit reached');
      }
      if (!group.users.includes(sanitizedEmail)) {
        group.users.push(sanitizedEmail);
        added = true;
      }
    }
  });
  
  return added;
}

export function removeUserFromGroup(groupId: string, email: string): boolean {
  let removed = false;
  
  updateData((data) => {
    const group = data.groups?.find(g => g.id === groupId);
    if (group) {
      const index = group.users.indexOf(email);
      if (index !== -1) {
        group.users.splice(index, 1);
        removed = true;
      }
    }
  });
  
  return removed;
}

export function getUserGroup(email: string): UserGroup | null {
  const groups = getGroups();
  return groups.find(g => g.users.includes(email)) || null;
}