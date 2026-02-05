import path from 'path';
import fsp from 'fs/promises';
import crypto from 'crypto';
import {
  getDesignRevisionThumbnailsDir,
  getDesignGalleryDir,
} from './thumbnailStoragePath';
import type { Revision, Project } from '@/src/types/projects';

export type { Revision, Project };

/** Generuje URL-friendly slug z nazwy projektu (obsługuje polskie znaki). */
function generateSlug(name: string, existingSlugs: string[] = []): string {
  const polishMap: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'a', 'Ć': 'c', 'Ę': 'e', 'Ł': 'l', 'Ń': 'n',
    'Ó': 'o', 'Ś': 's', 'Ź': 'z', 'Ż': 'z',
  };
  let slug = name
    .split('')
    .map((c) => polishMap[c] || c)
    .join('')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'projekt';
  let final = slug;
  let i = 2;
  while (existingSlugs.includes(final)) {
    final = `${slug}-${i}`;
    i++;
  }
  return final;
}

async function getDataDir(): Promise<string> {
  try {
    await fsp.access('/data-storage');
    return '/data-storage';
  } catch {
    return path.join(process.cwd(), 'data');
  }
}

async function getProjectsFilePath(): Promise<string> {
  const dir = await getDataDir();
  return path.join(dir, 'projects.json');
}

async function getThumbnailsDir(): Promise<string> {
  return getDesignRevisionThumbnailsDir();
}

/** Zapisuje bufor obrazu jako plik miniaturki. Zwraca ścieżkę względną (projectId/revisionId.webp). */
export async function saveThumbnailFile(
  projectId: string,
  revisionId: string,
  buffer: Buffer
): Promise<string> {
  const base = await getThumbnailsDir();
  const projectDir = path.join(base, projectId);
  await fsp.mkdir(projectDir, { recursive: true });
  const ext = '.webp';
  const filePath = path.join(projectDir, `${revisionId}${ext}`);
  await fsp.writeFile(filePath, buffer);
  return `${projectId}/${revisionId}${ext}`;
}

/** Zwraca ścieżkę absolutną do pliku miniaturki lub null. */
export async function getThumbnailFilePath(
  projectId: string,
  revisionId: string
): Promise<string | null> {
  const base = await getThumbnailsDir();
  const filePath = path.join(base, projectId, `${revisionId}.webp`);
  try {
    await fsp.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

/** Usuwa plik miniaturki rewizji. */
export async function deleteThumbnailFile(
  projectId: string,
  revisionId: string
): Promise<void> {
  const base = await getThumbnailsDir();
  const filePath = path.join(base, projectId, `${revisionId}.webp`);
  try {
    await fsp.unlink(filePath);
  } catch {
    // ignoruj brak pliku
  }
}

async function getGalleryDir(): Promise<string> {
  return getDesignGalleryDir();
}

/** Zapisuje plik obrazu do galerii rewizji. Zwraca ścieżkę względną. */
export async function saveGalleryFile(
  projectId: string,
  revisionId: string,
  buffer: Buffer,
  extension: string = '.webp'
): Promise<string> {
  const base = await getGalleryDir();
  const revisionDir = path.join(base, projectId, revisionId);
  await fsp.mkdir(revisionDir, { recursive: true });
  const name = `${crypto.randomUUID()}${extension}`;
  const filePath = path.join(revisionDir, name);
  await fsp.writeFile(filePath, buffer);
  return `${projectId}/${revisionId}/${name}`;
}

/** Zwraca ścieżkę absolutną do pliku galerii lub null. */
export async function getGalleryFilePath(
  projectId: string,
  revisionId: string,
  filename: string
): Promise<string | null> {
  const base = await getGalleryDir();
  const filePath = path.join(base, projectId, revisionId, filename);
  const safe = path.normalize(filePath);
  if (!safe.startsWith(path.normalize(base))) return null;
  try {
    await fsp.access(safe);
    return safe;
  } catch {
    return null;
  }
}

/** Dodaje ścieżki galerii do rewizji. */
export async function appendRevisionGalleryPaths(
  projectId: string,
  revisionId: string,
  relativePaths: string[]
): Promise<Revision | null> {
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const pIdx = projects.findIndex((p) => p.id === projectId);
  if (pIdx === -1) return null;
  const project = projects[pIdx];
  const revisions = project.revisions ?? [];
  const rIdx = revisions.findIndex((r) => r.id === revisionId);
  if (rIdx === -1) return null;
  const current = revisions[rIdx].galleryPaths ?? [];
  revisions[rIdx].galleryPaths = [...current, ...relativePaths];
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
  await fsp.rename(tmpPath, filePath);
  return revisions[rIdx];
}

function decodeDataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
}

async function ensureProjectsFile(filePath: string): Promise<Project[]> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
    if (code === 'ENOENT') {
      const dir = path.dirname(filePath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(filePath, JSON.stringify([], null, 2));
      return [];
    }
    throw err;
  }
}

/** Jednorazowa migracja: zapis miniaturek z thumbnailDataUrl do plików i usunięcie z JSON. */
async function migrateThumbnailsToFiles(projects: Project[]): Promise<boolean> {
  let dirty = false;
  for (const project of projects) {
    for (const rev of project.revisions ?? []) {
      if (rev.thumbnailDataUrl && !rev.thumbnailPath) {
        const buffer = decodeDataUrlToBuffer(rev.thumbnailDataUrl);
        if (buffer && buffer.length > 0) {
          const relativePath = await saveThumbnailFile(
            project.id,
            rev.id,
            buffer
          );
          rev.thumbnailPath = relativePath;
          rev.thumbnailDataUrl = undefined;
          dirty = true;
        }
      }
    }
  }
  return dirty;
}

/** Jednorazowa migracja: nadaj slug projektom które go nie mają. */
function migrateSlugs(projects: Project[]): boolean {
  let dirty = false;
  const usedSlugs: string[] = projects.filter((p) => p.slug).map((p) => p.slug!);
  for (const project of projects) {
    if (!project.slug) {
      project.slug = generateSlug(project.name, usedSlugs);
      usedSlugs.push(project.slug);
      dirty = true;
    }
  }
  return dirty;
}

export async function getProjects(): Promise<Project[]> {
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const dirtyThumbs = await migrateThumbnailsToFiles(projects);
  const dirtySlugs = migrateSlugs(projects);
  if (dirtyThumbs || dirtySlugs) {
    const tmpPath = filePath + '.tmp';
    await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
    await fsp.rename(tmpPath, filePath);
  }
  return projects;
}

export async function addProject(
  name: string,
  description?: string
): Promise<Project> {
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const existingSlugs = projects.filter((p) => p.slug).map((p) => p.slug!);
  const project: Project = {
    id: crypto.randomUUID(),
    slug: generateSlug(name.trim(), existingSlugs),
    name: name.trim(),
    description: description?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  projects.push(project);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
  await fsp.rename(tmpPath, filePath);
  return project;
}

export async function updateProject(
  id: string,
  updates: { name?: string; description?: string }
): Promise<Project | null> {
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  if (updates.name !== undefined) {
    projects[idx].name = updates.name.trim();
    const existingSlugs = projects.filter((_, i) => i !== idx && projects[i].slug).map((p) => p.slug!);
    projects[idx].slug = generateSlug(updates.name.trim(), existingSlugs);
  }
  if (updates.description !== undefined) {
    projects[idx].description =
      updates.description.trim() === ''
        ? undefined
        : updates.description.trim();
  }
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
  await fsp.rename(tmpPath, filePath);
  return projects[idx];
}

export async function addProjectRevision(
  projectId: string,
  label?: string,
  embedUrl?: string
): Promise<Revision | null> {
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;
  const project = projects[idx];
  if (!project.revisions) project.revisions = [];
  const revision: Revision = {
    id: crypto.randomUUID(),
    label: label?.trim() || undefined,
    embedUrl: embedUrl?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  project.revisions.push(revision);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
  await fsp.rename(tmpPath, filePath);
  return revision;
}

export async function updateProjectRevision(
  projectId: string,
  revisionId: string,
  updates: {
    label?: string;
    description?: string;
    embedUrl?: string;
    thumbnailDataUrl?: string;
    screenshotDataUrl?: string;
    /** Ścieżka do pliku miniaturki już zapisanego w data-storage (np. z upload-thumbnail). */
    thumbnailPath?: string;
  }
): Promise<Revision | null> {
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const pIdx = projects.findIndex((p) => p.id === projectId);
  if (pIdx === -1) return null;
  const project = projects[pIdx];
  const revisions = project.revisions ?? [];
  const rIdx = revisions.findIndex((r) => r.id === revisionId);
  if (rIdx === -1) return null;
  if (updates.label !== undefined) {
    revisions[rIdx].label =
      updates.label.trim() === '' ? undefined : updates.label.trim();
  }
  if (updates.description !== undefined) {
    revisions[rIdx].description =
      updates.description.trim() === ''
        ? undefined
        : updates.description.trim();
  }
  if (updates.embedUrl !== undefined) {
    revisions[rIdx].embedUrl =
      updates.embedUrl.trim() === '' ? undefined : updates.embedUrl.trim();
  }
  if (updates.thumbnailPath !== undefined) {
    revisions[rIdx].thumbnailPath = updates.thumbnailPath || undefined;
    revisions[rIdx].thumbnailDataUrl = undefined;
    revisions[rIdx].screenshotDataUrl = undefined;
  }
  if (updates.thumbnailDataUrl !== undefined) {
    if (updates.thumbnailDataUrl === '') {
      await deleteThumbnailFile(projectId, revisionId);
      revisions[rIdx].thumbnailPath = undefined;
      revisions[rIdx].thumbnailDataUrl = undefined;
    } else {
      const buffer = decodeDataUrlToBuffer(updates.thumbnailDataUrl);
      if (buffer && buffer.length > 0) {
        const relativePath = await saveThumbnailFile(
          projectId,
          revisionId,
          buffer
        );
        revisions[rIdx].thumbnailPath = relativePath;
        revisions[rIdx].thumbnailDataUrl = undefined;
      }
    }
  }
  if (updates.screenshotDataUrl !== undefined) {
    revisions[rIdx].screenshotDataUrl =
      updates.screenshotDataUrl === '' ? undefined : updates.screenshotDataUrl;
  }
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
  await fsp.rename(tmpPath, filePath);
  return revisions[rIdx];
}

export async function reorderProjectRevisions(
  projectId: string,
  revisionIds: string[]
): Promise<Project | null> {
  if (!Array.isArray(revisionIds) || revisionIds.length === 0) return null;
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const pIdx = projects.findIndex((p) => p.id === projectId);
  if (pIdx === -1) return null;
  const project = projects[pIdx];
  const revisions = project.revisions ?? [];
  const byId = new Map(revisions.map((r) => [r.id, r]));
  const ordered: Revision[] = [];
  for (const rid of revisionIds) {
    const rev = byId.get(rid);
    if (rev) ordered.push(rev);
  }
  for (const rev of revisions) {
    if (!revisionIds.includes(rev.id)) ordered.push(rev);
  }
  project.revisions = ordered;
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
  await fsp.rename(tmpPath, filePath);
  return project;
}

export async function deleteProjectRevision(
  projectId: string,
  revisionId: string
): Promise<boolean> {
  await deleteThumbnailFile(projectId, revisionId);
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const pIdx = projects.findIndex((p) => p.id === projectId);
  if (pIdx === -1) return false;
  const project = projects[pIdx];
  const revisions = project.revisions ?? [];
  const rIdx = revisions.findIndex((r) => r.id === revisionId);
  if (rIdx === -1) return false;
  revisions.splice(rIdx, 1);
  project.revisions = revisions;
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
  await fsp.rename(tmpPath, filePath);
  return true;
}

export async function deleteProject(id: string): Promise<boolean> {
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  projects.splice(idx, 1);
  const tmpPath = filePath + '.tmp';
  await fsp.writeFile(tmpPath, JSON.stringify(projects, null, 2));
  await fsp.rename(tmpPath, filePath);
  return true;
}
