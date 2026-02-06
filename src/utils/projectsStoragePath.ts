/**
 * Ścieżki do danych projektów w strukturze katalogowej pod /data-storage.
 * projects/{projectId}/project.json, projects/{projectId}/rewizje/{revisionId}/...
 */
import path from 'path';
import fsp from 'fs/promises';
import { getDataDir } from './dataDir';

export async function getProjectsBaseDir(): Promise<string> {
  const dataDir = await getDataDir();
  const base = path.join(dataDir, 'projects');
  await fsp.mkdir(base, { recursive: true });
  return base;
}

export async function getProjectDir(projectId: string): Promise<string> {
  const base = await getProjectsBaseDir();
  return path.join(base, projectId);
}

export async function getProjectRevisionsDir(projectId: string): Promise<string> {
  const projectDir = await getProjectDir(projectId);
  const revDir = path.join(projectDir, 'rewizje');
  await fsp.mkdir(revDir, { recursive: true });
  return revDir;
}

export async function getRevisionDir(
  projectId: string,
  revisionId: string
): Promise<string> {
  const revsDir = await getProjectRevisionsDir(projectId);
  const dir = path.join(revsDir, revisionId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

export async function getRevisionGalleryDir(
  projectId: string,
  revisionId: string
): Promise<string> {
  const revDir = await getRevisionDir(projectId, revisionId);
  const galleryDir = path.join(revDir, 'gallery');
  await fsp.mkdir(galleryDir, { recursive: true });
  return galleryDir;
}

/** Nazwa pliku miniaturki w katalogu rewizji (stała). */
export const REVISION_THUMBNAIL_FILENAME = 'thumbnail.webp';
