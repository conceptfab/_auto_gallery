/**
 * Ścieżki do danych moodboardów w strukturze katalogowej pod /data-storage.
 * Globalne: moodboard/
 * Grupowe:  groups/{groupId}/moodboard/
 */
import path from 'path';
import fsp from 'fs/promises';
import { getDataDir } from './dataDir';

/** Zwraca katalog moodboard: globalny lub grupowy. */
export async function getMoodboardBaseDir(groupId?: string): Promise<string> {
  const dataDir = await getDataDir();
  const base = groupId
    ? path.join(dataDir, 'groups', groupId, 'moodboard')
    : path.join(dataDir, 'moodboard');
  await fsp.mkdir(base, { recursive: true });
  return base;
}

/** Zwraca katalog na obrazy moodboardu: globalny lub grupowy. */
export async function getMoodboardImagesDirByGroup(groupId?: string): Promise<string> {
  const base = await getMoodboardBaseDir(groupId);
  const imagesDir = path.join(base, 'images');
  await fsp.mkdir(imagesDir, { recursive: true });
  return imagesDir;
}
