import path from 'path';
import fsp from 'fs/promises';
import type { StatsData } from '../types/stats';

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
  settings?: {
    highlightKeywords?: boolean;
    autoCleanupEnabled?: boolean;
    autoCleanupDays?: number;
    historyRetentionDays?: number;
    thumbnailAnimationDelay?: number;
    sessionDurationHours?: number;
  };
  // Statystyki użytkowników
  stats?: StatsData;
}

// Katalog danych: /data-storage (volume) lub data/ (lokalnie)
async function getDataDir(): Promise<string> {
  try {
    await fsp.access('/data-storage');
    return '/data-storage';
  } catch {
    return path.join(process.cwd(), 'data');
  }
}

// saveData() usunięte – dane core zapisywane do core/pending.json, core/codes.json, core/settings.json

// Katalog list (Etap 1 konwersji)
async function getListsDir(): Promise<string> {
  return path.join(await getDataDir(), 'lists');
}

function getWhitelistPath(listsDir: string): string {
  return path.join(listsDir, 'whitelist.json');
}

function getBlacklistPath(listsDir: string): string {
  return path.join(listsDir, 'blacklist.json');
}

// Katalog grup (Etap 2 konwersji)
async function getGroupsDir(): Promise<string> {
  return path.join(await getDataDir(), 'groups');
}

function getGroupsPath(groupsDir: string): string {
  return path.join(groupsDir, 'groups.json');
}

// Katalog core (Etap 5 konwersji): pending, codes, settings
async function getCoreDir(): Promise<string> {
  return path.join(await getDataDir(), 'core');
}

function getPendingPath(coreDir: string): string {
  return path.join(coreDir, 'pending.json');
}

function getCodesPath(coreDir: string): string {
  return path.join(coreDir, 'codes.json');
}

function getSettingsPath(coreDir: string): string {
  return path.join(coreDir, 'settings.json');
}

// Typy dla plików core (serializacja – daty jako string w JSON)
/** Kształt pliku core/pending.json (dokumentacja) */
interface _PendingFile {
  [email: string]: { timestamp: string; ip: string };
}

type SerializedLoginCode = Omit<LoginCode, 'expiresAt' | 'createdAt'> & {
  expiresAt: string;
  createdAt: string;
};

interface CodesFile {
  activeCodes: Record<string, SerializedLoginCode>;
  adminCodes: Record<string, SerializedLoginCode>;
  loggedInUsers: string[];
  loggedInAdmins: string[];
}

interface SettingsFile {
  highlightKeywords?: boolean;
  autoCleanupEnabled?: boolean;
  autoCleanupDays?: number;
  historyRetentionDays?: number;
  thumbnailAnimationDelay?: number;
  sessionDurationHours?: number;
}

// Normalizacja LoginCode z pliku (daty jako string) do LoginCode (Date)
function normalizeLoginCode(raw: SerializedLoginCode): LoginCode {
  return {
    email: raw.email,
    code: raw.code,
    expiresAt: new Date(raw.expiresAt),
    createdAt: new Date(raw.createdAt),
  };
}

// Katalog plików dziennych użytkowników (Etap 3 konwersji)
export async function getUsersDir(): Promise<string> {
  return path.join(await getDataDir(), 'users');
}

// Domyślne dane
const defaultData: StorageData = {
  pendingEmails: {},
  whitelist: [],
  blacklist: [],
  activeCodes: {},
  loggedInUsers: [],
  adminCodes: {},
  loggedInAdmins: [],
  groups: [],
  settings: {
    highlightKeywords: true,
    thumbnailAnimationDelay: 55,
    autoCleanupDays: 7,
    historyRetentionDays: 7,
  },
  stats: {
    logins: [],
    sessions: [],
    viewEvents: [],
    downloadEvents: [],
  },
};

// loadData() usunięte – nowa struktura plików jest stabilna

// saveData() usunięte – dane core zapisywane do core/pending.json, core/codes.json, core/settings.json

// ==================== ETAP 1: LISTY (osobne pliki) ====================

async function loadWhitelist(): Promise<string[]> {
  const listsDir = await getListsDir();
  const filePath = getWhitelistPath(listsDir);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') {
      return [];
    }
    console.error('❌ Błąd ładowania whitelist:', err);
    return [];
  }
}

async function saveWhitelist(list: string[]): Promise<void> {
  const listsDir = await getListsDir();
  await fsp.mkdir(listsDir, { recursive: true });
  const filePath = getWhitelistPath(listsDir);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(list, null, 2));
  await fsp.rename(tmpPath, filePath);
}

async function loadBlacklist(): Promise<string[]> {
  const listsDir = await getListsDir();
  const filePath = getBlacklistPath(listsDir);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') {
      return [];
    }
    console.error('❌ Błąd ładowania blacklist:', err);
    return [];
  }
}

async function saveBlacklist(list: string[]): Promise<void> {
  const listsDir = await getListsDir();
  await fsp.mkdir(listsDir, { recursive: true });
  const filePath = getBlacklistPath(listsDir);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(list, null, 2));
  await fsp.rename(tmpPath, filePath);
}

// ==================== ETAP 2: GRUPY (osobny plik) ====================

async function loadGroups(): Promise<UserGroup[]> {
  const groupsDir = await getGroupsDir();
  const filePath = getGroupsPath(groupsDir);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') {
      return [];
    }
    console.error('❌ Błąd ładowania grup:', err);
    return [];
  }
}

async function saveGroups(groups: UserGroup[]): Promise<void> {
  const groupsDir = await getGroupsDir();
  await fsp.mkdir(groupsDir, { recursive: true });
  const filePath = getGroupsPath(groupsDir);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(groups, null, 2));
  await fsp.rename(tmpPath, filePath);
}

// ==================== ETAP 5: CORE (pending, codes, settings) ====================

async function loadPending(): Promise<
  Record<string, { timestamp: string; ip: string }>
> {
  const coreDir = await getCoreDir();
  const filePath = getPendingPath(coreDir);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') {
      return {};
    }
    console.error('❌ Błąd ładowania pending:', err);
    return {};
  }
}

async function savePending(
  pending: Record<string, { timestamp: string; ip: string }>
): Promise<void> {
  const coreDir = await getCoreDir();
  await fsp.mkdir(coreDir, { recursive: true });
  const filePath = getPendingPath(coreDir);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(pending, null, 2));
  await fsp.rename(tmpPath, filePath);
}

function serializeLoginCode(lc: LoginCode): SerializedLoginCode {
  return {
    ...lc,
    expiresAt:
      lc.expiresAt instanceof Date
        ? lc.expiresAt.toISOString()
        : (lc.expiresAt as unknown as string),
    createdAt:
      lc.createdAt instanceof Date
        ? lc.createdAt.toISOString()
        : (lc.createdAt as unknown as string),
  };
}

async function loadCodes(): Promise<{
  activeCodes: Record<string, LoginCode>;
  adminCodes: Record<string, LoginCode>;
  loggedInUsers: string[];
  loggedInAdmins: string[];
}> {
  const coreDir = await getCoreDir();
  const filePath = getCodesPath(coreDir);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const file: CodesFile = JSON.parse(raw);
    const activeCodes: Record<string, LoginCode> = {};
    const adminCodes: Record<string, LoginCode> = {};
    if (file.activeCodes && typeof file.activeCodes === 'object') {
      for (const [email, lc] of Object.entries(file.activeCodes)) {
        activeCodes[email] = normalizeLoginCode(lc);
      }
    }
    if (file.adminCodes && typeof file.adminCodes === 'object') {
      for (const [email, lc] of Object.entries(file.adminCodes)) {
        adminCodes[email] = normalizeLoginCode(lc);
      }
    }
    return {
      activeCodes,
      adminCodes,
      loggedInUsers: Array.isArray(file.loggedInUsers)
        ? file.loggedInUsers
        : [],
      loggedInAdmins: Array.isArray(file.loggedInAdmins)
        ? file.loggedInAdmins
        : [],
    };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') {
      return {
        activeCodes: {},
        adminCodes: {},
        loggedInUsers: [],
        loggedInAdmins: [],
      };
    }
    console.error('❌ Błąd ładowania codes:', err);
    return {
      activeCodes: {},
      adminCodes: {},
      loggedInUsers: [],
      loggedInAdmins: [],
    };
  }
}

async function saveCodes(codes: {
  activeCodes: Record<string, LoginCode>;
  adminCodes: Record<string, LoginCode>;
  loggedInUsers: string[];
  loggedInAdmins: string[];
}): Promise<void> {
  const coreDir = await getCoreDir();
  await fsp.mkdir(coreDir, { recursive: true });
  const filePath = getCodesPath(coreDir);
  const payload: CodesFile = {
    activeCodes: Object.fromEntries(
      Object.entries(codes.activeCodes).map(([e, lc]) => [
        e,
        serializeLoginCode(lc),
      ])
    ),
    adminCodes: Object.fromEntries(
      Object.entries(codes.adminCodes).map(([e, lc]) => [
        e,
        serializeLoginCode(lc),
      ])
    ),
    loggedInUsers: codes.loggedInUsers,
    loggedInAdmins: codes.loggedInAdmins,
  };
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(payload, null, 2));
  await fsp.rename(tmpPath, filePath);
}

async function loadSettings(): Promise<SettingsFile> {
  const coreDir = await getCoreDir();
  const filePath = getSettingsPath(coreDir);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') {
      return {};
    }
    console.error('❌ Błąd ładowania settings:', err);
    return {};
  }
}

async function saveSettings(settings: SettingsFile): Promise<void> {
  const coreDir = await getCoreDir();
  await fsp.mkdir(coreDir, { recursive: true });
  const filePath = getSettingsPath(coreDir);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(settings, null, 2));
  await fsp.rename(tmpPath, filePath);
}

// Cache danych w pamięci (składany z list, groups, core – bez odczytu storage.json w głównej ścieżce)
let cachedData: StorageData | null = null;

export async function getData(): Promise<StorageData> {
  if (!cachedData) {
    const [whitelist, blacklist, groups, pending, codes, settings] =
      await Promise.all([
        loadWhitelist(),
        loadBlacklist(),
        loadGroups(),
        loadPending(),
        loadCodes(),
        loadSettings(),
      ]);
    cachedData = {
      pendingEmails: pending,
      whitelist,
      blacklist,
      activeCodes: codes.activeCodes,
      loggedInUsers: codes.loggedInUsers,
      adminCodes: codes.adminCodes,
      loggedInAdmins: codes.loggedInAdmins,
      groups,
      settings: Object.keys(settings).length ? settings : defaultData.settings,
      stats: defaultData.stats,
    } as StorageData;
  }
  return cachedData;
}

/** Aktualizacja tylko ustawień (core/settings.json). Używane przez API admin/settings. */
export async function updateSettings(
  updater: (settings: NonNullable<StorageData['settings']>) => void
): Promise<void> {
  const settings = await loadSettings();
  const merged = { ...defaultData.settings, ...settings } as NonNullable<
    StorageData['settings']
  >;
  updater(merged);
  await saveSettings(merged);
  if (cachedData) cachedData.settings = merged;
}

/** Zwraca czas trwania sesji w sekundach na podstawie ustawień (domyślnie 12h = 43200s). */
export async function getSessionDurationSeconds(): Promise<number> {
  const settings = await loadSettings();
  const hours = settings.sessionDurationHours ?? 12;
  return hours * 3600;
}

// Funkcje pomocnicze (core – pending)
export async function addPendingEmail(
  email: string,
  ip: string
): Promise<void> {
  const pending = await loadPending();
  pending[email] = { timestamp: new Date().toISOString(), ip };
  await savePending(pending);
  if (cachedData) cachedData.pendingEmails = pending;
}

export async function removePendingEmail(email: string): Promise<void> {
  const pending = await loadPending();
  delete pending[email];
  await savePending(pending);
  if (cachedData) cachedData.pendingEmails = pending;
}

export async function getPendingEmails(): Promise<PendingEmail[]> {
  const data = await getData();
  return Object.entries(data.pendingEmails).map(([email, item]) => ({
    email,
    timestamp: new Date(item.timestamp),
    ip: item.ip,
  }));
}

export async function getWhitelist(): Promise<string[]> {
  return loadWhitelist();
}

export async function addToWhitelist(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const list = await loadWhitelist();
  // Sprawdź case-insensitive
  if (!list.some((e) => e.toLowerCase() === normalizedEmail)) {
    list.push(normalizedEmail);
    await saveWhitelist(list);
    if (cachedData) cachedData.whitelist = list;
  }
}

export async function removeFromWhitelist(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const list = await loadWhitelist();
  const next = list.filter((e) => e.toLowerCase() !== normalizedEmail);
  if (next.length !== list.length) {
    await saveWhitelist(next);
    if (cachedData) cachedData.whitelist = next;
  }
}

export async function getBlacklist(): Promise<string[]> {
  return loadBlacklist();
}

export async function addToBlacklist(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const list = await loadBlacklist();
  // Sprawdź case-insensitive
  if (!list.some((e) => e.toLowerCase() === normalizedEmail)) {
    list.push(normalizedEmail);
    await saveBlacklist(list);
    if (cachedData) cachedData.blacklist = list;
  }
}

export async function removeFromBlacklist(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const list = await loadBlacklist();
  const next = list.filter((e) => e.toLowerCase() !== normalizedEmail);
  if (next.length !== list.length) {
    await saveBlacklist(next);
    if (cachedData) cachedData.blacklist = next;
  }
}

export async function addActiveCode(
  email: string,
  loginCode: LoginCode
): Promise<void> {
  const codes = await loadCodes();
  codes.activeCodes[email] = loginCode;
  await saveCodes(codes);
  if (cachedData) {
    cachedData.activeCodes = codes.activeCodes;
    cachedData.loggedInUsers = codes.loggedInUsers;
    cachedData.adminCodes = codes.adminCodes;
    cachedData.loggedInAdmins = codes.loggedInAdmins;
  }
}

export async function getActiveCode(
  email: string
): Promise<LoginCode | undefined> {
  const data = await getData();
  return data.activeCodes[email];
}

export async function removeActiveCode(email: string): Promise<void> {
  const codes = await loadCodes();
  delete codes.activeCodes[email];
  await saveCodes(codes);
  if (cachedData) {
    cachedData.activeCodes = codes.activeCodes;
    cachedData.loggedInUsers = codes.loggedInUsers;
    cachedData.adminCodes = codes.adminCodes;
    cachedData.loggedInAdmins = codes.loggedInAdmins;
  }
}

export async function loginUser(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const codes = await loadCodes();
  // Sprawdź case-insensitive
  if (!codes.loggedInUsers.some((u) => u.toLowerCase() === normalizedEmail)) {
    codes.loggedInUsers.push(normalizedEmail);
    await saveCodes(codes);
    if (cachedData) cachedData.loggedInUsers = codes.loggedInUsers;
  }
}

export async function logoutUser(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const codes = await loadCodes();
  codes.loggedInUsers = codes.loggedInUsers.filter((u) => u.toLowerCase() !== normalizedEmail);
  await saveCodes(codes);
  if (cachedData) cachedData.loggedInUsers = codes.loggedInUsers;
}

export async function isUserLoggedIn(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await getData();
  return data.loggedInUsers.some((u) => u.toLowerCase() === normalizedEmail);
}

export async function cleanupExpiredCodes(): Promise<number> {
  const now = new Date();
  const codes = await loadCodes();
  let expiredCount = 0;
  for (const email of Object.keys(codes.activeCodes)) {
    if (now > codes.activeCodes[email].expiresAt) {
      delete codes.activeCodes[email];
      expiredCount++;
    }
  }
  if (expiredCount > 0) {
    await saveCodes(codes);
    if (cachedData) cachedData.activeCodes = codes.activeCodes;
  }
  return expiredCount;
}

export async function cleanupOldRequests(): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pending = await loadPending();
  let cleanedCount = 0;
  for (const email of Object.keys(pending)) {
    if (new Date(pending[email].timestamp) < dayAgo) {
      delete pending[email];
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    await savePending(pending);
    if (cachedData) cachedData.pendingEmails = pending;
  }
  return cleanedCount;
}

export async function addAdminCode(
  email: string,
  loginCode: LoginCode
): Promise<void> {
  const codes = await loadCodes();
  codes.adminCodes[email] = loginCode;
  await saveCodes(codes);
  if (cachedData) {
    cachedData.activeCodes = codes.activeCodes;
    cachedData.loggedInUsers = codes.loggedInUsers;
    cachedData.adminCodes = codes.adminCodes;
    cachedData.loggedInAdmins = codes.loggedInAdmins;
  }
}

export async function getAdminCode(
  email: string
): Promise<LoginCode | undefined> {
  const data = await getData();
  return data.adminCodes[email];
}

export async function removeAdminCode(email: string): Promise<void> {
  const codes = await loadCodes();
  delete codes.adminCodes[email];
  await saveCodes(codes);
  if (cachedData) {
    cachedData.activeCodes = codes.activeCodes;
    cachedData.loggedInUsers = codes.loggedInUsers;
    cachedData.adminCodes = codes.adminCodes;
    cachedData.loggedInAdmins = codes.loggedInAdmins;
  }
}

export async function loginAdmin(email: string): Promise<void> {
  const codes = await loadCodes();
  if (!codes.loggedInAdmins.includes(email)) {
    codes.loggedInAdmins.push(email);
    await saveCodes(codes);
    if (cachedData) cachedData.loggedInAdmins = codes.loggedInAdmins;
  }
}

export async function logoutAdmin(email: string): Promise<void> {
  const codes = await loadCodes();
  codes.loggedInAdmins = codes.loggedInAdmins.filter((u) => u !== email);
  await saveCodes(codes);
  if (cachedData) cachedData.loggedInAdmins = codes.loggedInAdmins;
}

export async function isAdminLoggedIn(email: string): Promise<boolean> {
  const data = await getData();
  return data.loggedInAdmins.includes(email);
}

export async function cleanupExpiredAdminCodes(): Promise<number> {
  const now = new Date();
  const codes = await loadCodes();
  let expiredCount = 0;
  for (const email of Object.keys(codes.adminCodes)) {
    if (now > codes.adminCodes[email].expiresAt) {
      delete codes.adminCodes[email];
      expiredCount++;
    }
  }
  if (expiredCount > 0) {
    await saveCodes(codes);
    if (cachedData) cachedData.adminCodes = codes.adminCodes;
  }
  return expiredCount;
}

// ==================== GRUPY UŻYTKOWNIKÓW (Etap 2 – groups/groups.json) ====================

function generateGroupId(): string {
  return 'grp_' + Math.random().toString(36).substring(2, 11);
}

export async function getGroups(): Promise<UserGroup[]> {
  return loadGroups();
}

export async function getGroupById(id: string): Promise<UserGroup | undefined> {
  const groups = await loadGroups();
  return groups.find((g) => g.id === id);
}

export async function createGroup(
  name: string,
  clientName: string,
  galleryFolder: string
): Promise<UserGroup> {
  const newGroup: UserGroup = {
    id: generateGroupId(),
    name,
    clientName,
    galleryFolder,
    users: [],
  };
  const groups = await loadGroups();
  groups.push(newGroup);
  await saveGroups(groups);
  if (cachedData) cachedData.groups = groups;
  return newGroup;
}

export async function updateGroup(
  id: string,
  updates: { name?: string; clientName?: string; galleryFolder?: string }
): Promise<UserGroup | null> {
  const groups = await loadGroups();
  const group = groups.find((g) => g.id === id);
  if (!group) return null;
  if (updates.name !== undefined) group.name = updates.name;
  if (updates.clientName !== undefined) group.clientName = updates.clientName;
  if (updates.galleryFolder !== undefined)
    group.galleryFolder = updates.galleryFolder;
  await saveGroups(groups);
  if (cachedData) cachedData.groups = groups;
  return { ...group };
}

export async function deleteGroup(id: string): Promise<boolean> {
  const groups = await loadGroups();
  const index = groups.findIndex((g) => g.id === id);
  if (index === -1) return false;
  groups.splice(index, 1);
  await saveGroups(groups);
  if (cachedData) cachedData.groups = groups;
  return true;
}

export async function addUserToGroup(
  groupId: string,
  email: string
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const groups = await loadGroups();
  // Usuń użytkownika ze wszystkich grup (case-insensitive)
  groups.forEach((g) => {
    g.users = g.users.filter((u) => u.toLowerCase() !== normalizedEmail);
  });
  const group = groups.find((g) => g.id === groupId);
  if (!group) return false;
  // Sprawdź czy już jest (case-insensitive) - nie powinno być po usunięciu powyżej
  if (group.users.some((u) => u.toLowerCase() === normalizedEmail)) return false;
  group.users.push(normalizedEmail);
  await saveGroups(groups);
  if (cachedData) cachedData.groups = groups;
  return true;
}

export async function removeUserFromGroup(
  groupId: string,
  email: string
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const groups = await loadGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return false;
  const index = group.users.findIndex((u) => u.toLowerCase() === normalizedEmail);
  if (index === -1) return false;
  group.users.splice(index, 1);
  await saveGroups(groups);
  if (cachedData) cachedData.groups = groups;
  return true;
}

export async function getUserGroup(email: string): Promise<UserGroup | null> {
  const groups = await loadGroups();
  const normalizedEmail = email.trim().toLowerCase();
  return groups.find((g) =>
    g.users.some((u) => u.toLowerCase() === normalizedEmail)
  ) || null;
}
