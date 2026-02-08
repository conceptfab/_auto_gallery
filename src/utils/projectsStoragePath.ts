/**
 * Ścieżki do danych projektów w strukturze katalogowej pod /data-storage.
 * Globalne: projects/{projectId}/project.json
 * Grupowe:  groups/{groupId}/projects/{projectId}/project.json
 */
import path from 'path';
import fsp from 'fs/promises';
import { getDataDir } from './dataDir';

// ==================== GLOBALNE (bez grupy) ====================

export async function getProjectsBaseDir(groupId?: string): Promise<string> {
  const dataDir = await getDataDir();
  const base = groupId
    ? path.join(dataDir, 'groups', groupId, 'projects')
    : path.join(dataDir, 'projects');
  await fsp.mkdir(base, { recursive: true });
  return base;
}

export async function getProjectDir(projectId: string, groupId?: string): Promise<string> {
  const base = await getProjectsBaseDir(groupId);
  return path.join(base, projectId);
}

export async function getProjectRevisionsDir(projectId: string, groupId?: string): Promise<string> {
  const projectDir = await getProjectDir(projectId, groupId);
  const revDir = path.join(projectDir, 'rewizje');
  await fsp.mkdir(revDir, { recursive: true });
  return revDir;
}

export async function getRevisionDir(
  projectId: string,
  revisionId: string,
  groupId?: string
): Promise<string> {
  const revsDir = await getProjectRevisionsDir(projectId, groupId);
  const dir = path.join(revsDir, revisionId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

export async function getRevisionGalleryDir(
  projectId: string,
  revisionId: string,
  groupId?: string
): Promise<string> {
  const revDir = await getRevisionDir(projectId, revisionId, groupId);
  const galleryDir = path.join(revDir, 'gallery');
  await fsp.mkdir(galleryDir, { recursive: true });
  return galleryDir;
}

/** Nazwa pliku miniaturki w katalogu rewizji (stała). */
export const REVISION_THUMBNAIL_FILENAME = 'thumbnail.webp';

// ==================== HELPERS ====================

/** Zwraca bazowy folder grup: /data-storage/groups/ */
export async function getGroupsBaseDir(): Promise<string> {
  const dataDir = await getDataDir();
  const base = path.join(dataDir, 'groups');
  await fsp.mkdir(base, { recursive: true });
  return base;
}

/** Zwraca folder danej grupy: /data-storage/groups/{groupId}/ */
export async function getGroupDir(groupId: string): Promise<string> {
  const base = await getGroupsBaseDir();
  const dir = path.join(base, groupId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/** Tworzy strukturę folderów dla grupy (projects/ i moodboard/). */
export async function ensureGroupFolders(groupId: string): Promise<void> {
  const groupDir = await getGroupDir(groupId);
  await fsp.mkdir(path.join(groupDir, 'projects'), { recursive: true });
  await fsp.mkdir(path.join(groupDir, 'moodboard'), { recursive: true });
  await fsp.mkdir(path.join(groupDir, 'moodboard', 'images'), { recursive: true });
}
