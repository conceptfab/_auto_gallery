import fs from 'fs';
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
  };
  // Statystyki użytkowników
  stats?: StatsData;
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
  groups: [],
  settings: {
    highlightKeywords: true,
  },
  stats: {
    logins: [],
    sessions: [],
    viewEvents: [],
    downloadEvents: [],
  },
};

// Załaduj dane z pliku (async)
async function loadData(): Promise<StorageData> {
  try {
    const raw = await fsp.readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return { ...defaultData, ...data };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return { ...defaultData };
    }
    console.error('❌ Błąd ładowania danych:', err);
    return { ...defaultData };
  }
}

// Zapisz dane do pliku (async)
async function saveData(data: StorageData): Promise<void> {
  try {
    const dir = path.dirname(DATA_FILE);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Błąd zapisywania danych:', error);
    throw error;
  }
}

// Cache danych w pamięci
let cachedData: StorageData | null = null;

export async function getData(): Promise<StorageData> {
  if (!cachedData) {
    cachedData = await loadData();
  }
  return cachedData;
}

export async function updateData(
  updater: (data: StorageData) => void,
): Promise<void> {
  const data = await getData();
  updater(data);
  cachedData = data;
  await saveData(data);
}

// Funkcje pomocnicze
export async function addPendingEmail(
  email: string,
  ip: string,
): Promise<void> {
  await updateData((data) => {
    data.pendingEmails[email] = { timestamp: new Date().toISOString(), ip };
  });
}

export async function removePendingEmail(email: string): Promise<void> {
  await updateData((data) => {
    delete data.pendingEmails[email];
  });
}

export async function getPendingEmails(): Promise<PendingEmail[]> {
  const data = await getData();
  return Object.entries(data.pendingEmails).map(([email, item]) => ({
    email,
    timestamp: new Date(item.timestamp),
    ip: item.ip,
  }));
}

export async function addToWhitelist(email: string): Promise<void> {
  await updateData((data) => {
    if (!data.whitelist.includes(email)) {
      data.whitelist.push(email);
    }
  });
}

export async function addToBlacklist(email: string): Promise<void> {
  await updateData((data) => {
    if (!data.blacklist.includes(email)) {
      data.blacklist.push(email);
    }
  });
}

export async function getWhitelist(): Promise<string[]> {
  const data = await getData();
  return data.whitelist;
}

export async function removeFromWhitelist(email: string): Promise<void> {
  await updateData((data) => {
    data.whitelist = data.whitelist.filter((e) => e !== email);
  });
}

export async function getBlacklist(): Promise<string[]> {
  const data = await getData();
  return data.blacklist;
}

export async function removeFromBlacklist(email: string): Promise<void> {
  await updateData((data) => {
    data.blacklist = data.blacklist.filter((e) => e !== email);
  });
}

export async function addActiveCode(
  email: string,
  loginCode: LoginCode,
): Promise<void> {
  await updateData((data) => {
    data.activeCodes[email] = loginCode;
  });
}

export async function getActiveCode(
  email: string,
): Promise<LoginCode | undefined> {
  const data = await getData();
  return data.activeCodes[email];
}

export async function removeActiveCode(email: string): Promise<void> {
  await updateData((data) => {
    delete data.activeCodes[email];
  });
}

export async function loginUser(email: string): Promise<void> {
  await updateData((data) => {
    if (!data.loggedInUsers.includes(email)) {
      data.loggedInUsers.push(email);
    }
  });
}

export async function logoutUser(email: string): Promise<void> {
  await updateData((data) => {
    data.loggedInUsers = data.loggedInUsers.filter((u) => u !== email);
  });
}

export async function isUserLoggedIn(email: string): Promise<boolean> {
  const data = await getData();
  return data.loggedInUsers.includes(email);
}

export async function cleanupExpiredCodes(): Promise<number> {
  const now = new Date();
  let expiredCount = 0;

  await updateData((data) => {
    Object.keys(data.activeCodes).forEach((email) => {
      const loginCode = data.activeCodes[email];
      if (now > new Date(loginCode.expiresAt)) {
        delete data.activeCodes[email];
        expiredCount++;
      }
    });
  });

  return expiredCount;
}

export async function cleanupOldRequests(): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let cleanedCount = 0;

  await updateData((data) => {
    Object.keys(data.pendingEmails).forEach((email) => {
      const item = data.pendingEmails[email];
      if (new Date(item.timestamp) < dayAgo) {
        delete data.pendingEmails[email];
        cleanedCount++;
      }
    });
  });

  return cleanedCount;
}

export async function addAdminCode(
  email: string,
  loginCode: LoginCode,
): Promise<void> {
  await updateData((data) => {
    data.adminCodes[email] = loginCode;
  });
}

export async function getAdminCode(
  email: string,
): Promise<LoginCode | undefined> {
  const data = await getData();
  return data.adminCodes[email];
}

export async function removeAdminCode(email: string): Promise<void> {
  await updateData((data) => {
    delete data.adminCodes[email];
  });
}

export async function loginAdmin(email: string): Promise<void> {
  await updateData((data) => {
    if (!data.loggedInAdmins.includes(email)) {
      data.loggedInAdmins.push(email);
    }
  });
}

export async function logoutAdmin(email: string): Promise<void> {
  await updateData((data) => {
    data.loggedInAdmins = data.loggedInAdmins.filter((u) => u !== email);
  });
}

export async function isAdminLoggedIn(email: string): Promise<boolean> {
  const data = await getData();
  return data.loggedInAdmins.includes(email);
}

export async function cleanupExpiredAdminCodes(): Promise<number> {
  const now = new Date();
  let expiredCount = 0;

  await updateData((data) => {
    Object.keys(data.adminCodes).forEach((email) => {
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

export async function getGroups(): Promise<UserGroup[]> {
  const data = await getData();
  return data.groups || [];
}

export async function getGroupById(id: string): Promise<UserGroup | undefined> {
  const groups = await getGroups();
  return groups.find((g) => g.id === id);
}

export async function createGroup(
  name: string,
  clientName: string,
  galleryFolder: string,
): Promise<UserGroup> {
  const newGroup: UserGroup = {
    id: generateGroupId(),
    name,
    clientName,
    galleryFolder,
    users: [],
  };

  await updateData((data) => {
    if (!data.groups) data.groups = [];
    data.groups.push(newGroup);
  });

  return newGroup;
}

export async function updateGroup(
  id: string,
  updates: { name?: string; clientName?: string; galleryFolder?: string },
): Promise<UserGroup | null> {
  let updatedGroup: UserGroup | null = null;

  await updateData((data) => {
    const group = data.groups?.find((g) => g.id === id);
    if (group) {
      if (updates.name !== undefined) group.name = updates.name;
      if (updates.clientName !== undefined)
        group.clientName = updates.clientName;
      if (updates.galleryFolder !== undefined)
        group.galleryFolder = updates.galleryFolder;
      updatedGroup = { ...group };
    }
  });

  return updatedGroup;
}

export async function deleteGroup(id: string): Promise<boolean> {
  let deleted = false;

  await updateData((data) => {
    const index = data.groups?.findIndex((g) => g.id === id) ?? -1;
    if (index !== -1) {
      data.groups!.splice(index, 1);
      deleted = true;
    }
  });

  return deleted;
}

export async function addUserToGroup(
  groupId: string,
  email: string,
): Promise<boolean> {
  let added = false;

  await updateData((data) => {
    // Usuń użytkownika z innych grup
    data.groups?.forEach((g) => {
      g.users = g.users.filter((u) => u !== email);
    });

    // Dodaj do wybranej grupy
    const group = data.groups?.find((g) => g.id === groupId);
    if (group && !group.users.includes(email)) {
      group.users.push(email);
      added = true;
    }
  });

  return added;
}

export async function removeUserFromGroup(
  groupId: string,
  email: string,
): Promise<boolean> {
  let removed = false;

  await updateData((data) => {
    const group = data.groups?.find((g) => g.id === groupId);
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

export async function getUserGroup(email: string): Promise<UserGroup | null> {
  const groups = await getGroups();
  return groups.find((g) => g.users.includes(email)) || null;
}
