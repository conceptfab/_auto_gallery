import path from 'path';
import fsp from 'fs/promises';
import crypto from 'crypto';
import type { StatsData } from '../types/stats';
import type {
  DrawingTool,
  MoodboardDrawingConfig,
  MoodboardDrawingConfigMap,
} from '../types/moodboard';
import { DEFAULT_MOODBOARD_DRAWING_CONFIG } from '../types/moodboard';
import { getDataDir } from './dataDir';

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
  color?: string;
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
    autoBackupEnabled?: boolean;
    autoBackupIntervalHours?: number;
    autoBackupMaxFiles?: number;
  };
  // Statystyki użytkowników
  stats?: StatsData;
}


async function getListsDir(): Promise<string> {
  return path.join(await getDataDir(), 'lists');
}

function getWhitelistPath(listsDir: string): string {
  return path.join(listsDir, 'whitelist.json');
}

function getBlacklistPath(listsDir: string): string {
  return path.join(listsDir, 'blacklist.json');
}


async function getGroupsDir(): Promise<string> {
  return path.join(await getDataDir(), 'groups');
}

function getGroupsPath(groupsDir: string): string {
  return path.join(groupsDir, 'groups.json');
}


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

function getMoodboardDrawingConfigPath(coreDir: string): string {
  return path.join(coreDir, 'moodboard-drawing-config.json');
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
  autoBackupEnabled?: boolean;
  autoBackupIntervalHours?: number;
  autoBackupMaxFiles?: number;
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
    autoBackupEnabled: false,
    autoBackupIntervalHours: 24,
    autoBackupMaxFiles: 7,
  },
  stats: {
    logins: [],
    sessions: [],
    viewEvents: [],
    downloadEvents: [],
  },
};

// ==================== GENERYCZNE HELPERY JSON ====================

async function loadJsonFile(filePath: string, label: string): Promise<unknown> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    console.error(`❌ Błąd ładowania ${label}:`, err);
    return undefined;
  }
}

async function saveJsonFile(dir: string, filePath: string, data: unknown): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fsp.rename(tmpPath, filePath);
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : [];
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

// ==================== LISTY (osobne pliki) ====================

async function loadWhitelist(): Promise<string[]> {
  return asArray(await loadJsonFile(getWhitelistPath(await getListsDir()), 'whitelist'));
}

async function saveWhitelist(list: string[]): Promise<void> {
  const dir = await getListsDir();
  await saveJsonFile(dir, getWhitelistPath(dir), list);
}

async function loadBlacklist(): Promise<string[]> {
  return asArray(await loadJsonFile(getBlacklistPath(await getListsDir()), 'blacklist'));
}

async function saveBlacklist(list: string[]): Promise<void> {
  const dir = await getListsDir();
  await saveJsonFile(dir, getBlacklistPath(dir), list);
}

// ==================== GRUPY (osobny plik) ====================

async function loadGroups(): Promise<UserGroup[]> {
  return asArray(await loadJsonFile(getGroupsPath(await getGroupsDir()), 'groups'));
}

async function saveGroups(groups: UserGroup[]): Promise<void> {
  const dir = await getGroupsDir();
  await saveJsonFile(dir, getGroupsPath(dir), groups);
}

// ==================== CORE (pending, codes, settings) ====================

async function loadPending(): Promise<
  Record<string, { timestamp: string; ip: string }>
> {
  return asRecord(await loadJsonFile(getPendingPath(await getCoreDir()), 'pending')) as Record<
    string,
    { timestamp: string; ip: string }
  >;
}

async function savePending(
  pending: Record<string, { timestamp: string; ip: string }>
): Promise<void> {
  const dir = await getCoreDir();
  await saveJsonFile(dir, getPendingPath(dir), pending);
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

const defaultCodes = {
  activeCodes: {} as Record<string, LoginCode>,
  adminCodes: {} as Record<string, LoginCode>,
  loggedInUsers: [] as string[],
  loggedInAdmins: [] as string[],
};

async function loadCodes(): Promise<typeof defaultCodes> {
  const file = await loadJsonFile(getCodesPath(await getCoreDir()), 'codes') as CodesFile | undefined;
  if (!file) return { ...defaultCodes };
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
    loggedInUsers: Array.isArray(file.loggedInUsers) ? file.loggedInUsers : [],
    loggedInAdmins: Array.isArray(file.loggedInAdmins) ? file.loggedInAdmins : [],
  };
}

async function saveCodes(codes: typeof defaultCodes): Promise<void> {
  const dir = await getCoreDir();
  const payload: CodesFile = {
    activeCodes: Object.fromEntries(
      Object.entries(codes.activeCodes).map(([e, lc]) => [e, serializeLoginCode(lc)])
    ),
    adminCodes: Object.fromEntries(
      Object.entries(codes.adminCodes).map(([e, lc]) => [e, serializeLoginCode(lc)])
    ),
    loggedInUsers: codes.loggedInUsers,
    loggedInAdmins: codes.loggedInAdmins,
  };
  await saveJsonFile(dir, getCodesPath(dir), payload);
}

async function loadSettings(): Promise<SettingsFile> {
  return asRecord(await loadJsonFile(getSettingsPath(await getCoreDir()), 'settings')) as SettingsFile;
}

async function saveSettings(settings: SettingsFile): Promise<void> {
  const dir = await getCoreDir();
  await saveJsonFile(dir, getSettingsPath(dir), settings);
}

// ==================== KONFIGURACJA PASKA RYSOWANIA MOODBOARD ====================

export async function getMoodboardDrawingConfig(): Promise<MoodboardDrawingConfigMap> {
  const raw = await loadJsonFile(
    getMoodboardDrawingConfigPath(await getCoreDir()),
    'moodboard-drawing-config'
  );
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      default: { ...DEFAULT_MOODBOARD_DRAWING_CONFIG },
      byGroup: {},
    };
  }
  const obj = raw as Record<string, unknown>;
  const defaultConfig = (obj.default && typeof obj.default === 'object' && !Array.isArray(obj.default))
    ? normalizeDrawingConfig(obj.default as Record<string, unknown>)
    : { ...DEFAULT_MOODBOARD_DRAWING_CONFIG };
  const byGroup: Record<string, MoodboardDrawingConfig> = {};
  if (obj.byGroup && typeof obj.byGroup === 'object' && !Array.isArray(obj.byGroup)) {
    for (const [groupId, cfg] of Object.entries(obj.byGroup as Record<string, unknown>)) {
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        byGroup[groupId] = normalizeDrawingConfig(cfg as Record<string, unknown>);
      }
    }
  }
  return { default: defaultConfig, byGroup };
}

function normalizeDrawingConfig(raw: Record<string, unknown>): MoodboardDrawingConfig {
  const tools = Array.isArray(raw.tools)
    ? (raw.tools as string[]).filter((t): t is DrawingTool =>
        ['pen', 'rect', 'circle', 'line', 'eraser'].includes(t))
    : [...DEFAULT_MOODBOARD_DRAWING_CONFIG.tools];
  const strokeColors = Array.isArray(raw.strokeColors)
    ? (raw.strokeColors as string[]).filter((c) => typeof c === 'string')
    : [...DEFAULT_MOODBOARD_DRAWING_CONFIG.strokeColors];
  const strokeWidths = Array.isArray(raw.strokeWidths)
    ? (raw.strokeWidths as number[]).filter((w) => typeof w === 'number' && w > 0)
    : [...DEFAULT_MOODBOARD_DRAWING_CONFIG.strokeWidths];
  return {
    tools: tools.length ? tools : DEFAULT_MOODBOARD_DRAWING_CONFIG.tools,
    strokeColors: strokeColors.length ? strokeColors : DEFAULT_MOODBOARD_DRAWING_CONFIG.strokeColors,
    strokeWidths: strokeWidths.length ? strokeWidths : DEFAULT_MOODBOARD_DRAWING_CONFIG.strokeWidths,
    defaultTool: typeof raw.defaultTool === 'string' && tools.includes(raw.defaultTool as DrawingTool)
      ? (raw.defaultTool as DrawingTool)
      : undefined,
    defaultColor: typeof raw.defaultColor === 'string' && strokeColors.includes(raw.defaultColor)
      ? raw.defaultColor
      : undefined,
    defaultWidth: typeof raw.defaultWidth === 'number' && strokeWidths.includes(raw.defaultWidth)
      ? raw.defaultWidth
      : undefined,
  };
}

export async function saveMoodboardDrawingConfig(
  config: MoodboardDrawingConfigMap
): Promise<void> {
  const dir = await getCoreDir();
  const payload = {
    default: config.default,
    byGroup: config.byGroup,
  };
  await saveJsonFile(dir, getMoodboardDrawingConfigPath(dir), payload);
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
  const normalizedEmail = email.trim().toLowerCase();
  const codes = await loadCodes();
  if (!codes.loggedInAdmins.some((u) => u.toLowerCase() === normalizedEmail)) {
    codes.loggedInAdmins.push(normalizedEmail);
    await saveCodes(codes);
    if (cachedData) cachedData.loggedInAdmins = codes.loggedInAdmins;
  }
}

export async function logoutAdmin(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const codes = await loadCodes();
  codes.loggedInAdmins = codes.loggedInAdmins.filter((u) => u.toLowerCase() !== normalizedEmail);
  await saveCodes(codes);
  if (cachedData) cachedData.loggedInAdmins = codes.loggedInAdmins;
}

export async function isAdminLoggedIn(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await getData();
  return data.loggedInAdmins.some((u) => u.toLowerCase() === normalizedEmail);
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

// ==================== GRUPY UŻYTKOWNIKÓW ====================

function generateGroupId(): string {
  return 'grp_' + crypto.randomUUID().replace(/-/g, '').substring(0, 9);
}

export async function getGroups(): Promise<UserGroup[]> {
  return loadGroups();
}

export async function getGroupById(id: string): Promise<UserGroup | undefined> {
  const groups = await loadGroups();
  return groups.find((g) => g.id === id);
}

export async function getGroupByClientName(clientName: string): Promise<UserGroup | undefined> {
  const groups = await loadGroups();
  const normalized = clientName.trim().toLowerCase();
  return groups.find((g) => g.clientName.trim().toLowerCase() === normalized);
}

function randomGroupColor(): string {
  const letters = '0123456789ABCDEF';
  let hex = '#';
  for (let i = 0; i < 6; i++) hex += letters[Math.floor(Math.random() * 16)];
  return hex;
}

export async function createGroup(
  name: string,
  clientName: string,
  galleryFolder: string
): Promise<UserGroup> {
  const groups = await loadGroups();

  const normalizedClientName = clientName.trim().toLowerCase();
  const duplicate = groups.find((g) => g.clientName.trim().toLowerCase() === normalizedClientName);
  if (duplicate) {
    throw new Error(`Nazwa klienta "${clientName}" jest już używana przez grupę "${duplicate.name}"`);
  }

  const newGroup: UserGroup = {
    id: generateGroupId(),
    name,
    clientName,
    galleryFolder,
    color: randomGroupColor(),
    users: [],
  };
  groups.push(newGroup);
  await saveGroups(groups);
  if (cachedData) cachedData.groups = groups;
  return newGroup;
}

export async function updateGroup(
  id: string,
  updates: { name?: string; clientName?: string; galleryFolder?: string; color?: string }
): Promise<UserGroup | null> {
  const groups = await loadGroups();
  const group = groups.find((g) => g.id === id);
  if (!group) return null;

  if (updates.clientName !== undefined) {
    const normalizedNew = updates.clientName.trim().toLowerCase();
    const duplicate = groups.find(
      (g) => g.id !== id && g.clientName.trim().toLowerCase() === normalizedNew
    );
    if (duplicate) {
      throw new Error(`Nazwa klienta "${updates.clientName}" jest już używana przez grupę "${duplicate.name}"`);
    }
    group.clientName = updates.clientName;
  }

  if (updates.name !== undefined) group.name = updates.name;
  if (updates.galleryFolder !== undefined)
    group.galleryFolder = updates.galleryFolder;
  if (updates.color !== undefined) {
    group.color = updates.color === '' ? undefined : (updates.color?.trim() || undefined);
  }
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
