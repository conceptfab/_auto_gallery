import path from 'path';
import fsp from 'fs/promises';
import crypto from 'crypto';
import { getDataDir } from './dataDir';
import {
  getProjectsBaseDir,
  getProjectDir,
  getRevisionDir,
  getRevisionGalleryDir,
  REVISION_THUMBNAIL_FILENAME,
} from './projectsStoragePath';
import { decodeDataUrlToBuffer } from './moodboardStorage';
import { logger } from '@/src/utils/logger';
import type { Revision, Project } from '@/src/types/projects';

export type { Revision, Project };

/** Format project.json na dysku (katalog projects/{id}/). */
interface ProjectMeta {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  createdAt: string;
  revisionIds: string[];
}

/** Format revision.json na dysku (katalog projects/{id}/rewizje/{revId}/). */
interface RevisionMeta {
  id: string;
  label?: string;
  description?: string;
  embedUrl?: string;
  createdAt: string;
  thumbnailPath?: string;
  galleryPaths?: string[];
}

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

function revisionMetaToRevision(meta: RevisionMeta, _projectId: string): Revision {
  const rev: Revision = {
    id: meta.id,
    label: meta.label,
    description: meta.description,
    embedUrl: meta.embedUrl,
    createdAt: meta.createdAt,
    galleryPaths: meta.galleryPaths ? [...meta.galleryPaths] : undefined,
    thumbnailPath: meta.thumbnailPath || undefined,
  };
  return rev;
}

function revisionToMeta(rev: Revision): RevisionMeta {
  return {
    id: rev.id,
    label: rev.label,
    description: rev.description,
    embedUrl: rev.embedUrl,
    createdAt: rev.createdAt,
    thumbnailPath: rev.thumbnailPath || undefined,
    galleryPaths: rev.galleryPaths?.length ? [...rev.galleryPaths] : undefined,
  };
}

let legacyMigrationAttempted = false;

/**
 * Jednorazowa migracja z legacy projects.json do struktury katalogowej.
 * Kopiuje miniatury i galerie ze starych ścieżek (thumbnails/design-revision, design-gallery).
 */
async function migrateLegacyToFolderStructure(
  dataDir: string,
  legacyProjects: Project[]
): Promise<void> {
  if (legacyProjects.length === 0) return;
  const projectsDir = path.join(dataDir, 'projects');
  const oldThumbBase = path.join(dataDir, 'thumbnails', 'design-revision');
  const oldGalleryBase = path.join(dataDir, 'thumbnails', 'design-gallery');

  await fsp.mkdir(projectsDir, { recursive: true });

  for (const project of legacyProjects) {
    const projectId = project.id;
    const projectPath = path.join(projectsDir, projectId);
    await fsp.mkdir(projectPath, { recursive: true });

    const meta: ProjectMeta = {
      id: projectId,
      name: project.name || 'Projekt',
      slug: project.slug,
      description: project.description,
      createdAt: project.createdAt || new Date().toISOString(),
      revisionIds: (project.revisions || []).map((r) => r.id),
    };
    await fsp.writeFile(
      path.join(projectPath, 'project.json'),
      JSON.stringify(meta, null, 2),
      'utf8'
    );

    for (const rev of project.revisions || []) {
      const revId = rev.id;
      const revDir = path.join(projectPath, 'rewizje', revId);
      await fsp.mkdir(revDir, { recursive: true });

      const oldThumbFile = path.join(oldThumbBase, projectId, `${revId}.webp`);
      const newThumbFile = path.join(revDir, REVISION_THUMBNAIL_FILENAME);
      let thumbnailCopied = false;
      try {
        await fsp.copyFile(oldThumbFile, newThumbFile);
        thumbnailCopied = true;
      } catch {
        // brak starej miniaturki w thumbnails/design-revision
      }

      const galleryDir = path.join(revDir, 'gallery');
      await fsp.mkdir(galleryDir, { recursive: true });

      const galleryPaths: string[] = [];
      for (const rel of rev.galleryPaths || []) {
        const parts = rel.split(/[/\\]/);
        const filename = parts[parts.length - 1];
        if (!filename) continue;
        const oldFile = path.join(oldGalleryBase, projectId, revId, filename);
        const newFile = path.join(galleryDir, filename);
        try {
          await fsp.copyFile(oldFile, newFile);
          galleryPaths.push(filename);
        } catch {
          // plik mógł nie istnieć
        }
      }

      const revMeta: RevisionMeta = {
        id: rev.id,
        label: rev.label,
        description: rev.description,
        embedUrl: rev.embedUrl,
        createdAt: rev.createdAt || new Date().toISOString(),
        thumbnailPath: thumbnailCopied ? REVISION_THUMBNAIL_FILENAME : undefined,
        galleryPaths: galleryPaths.length ? galleryPaths : undefined,
      };
      await fsp.writeFile(
        path.join(revDir, 'revision.json'),
        JSON.stringify(revMeta, null, 2),
        'utf8'
      );
    }
  }
}

/** Odczytuje listę projektów ze struktury katalogowej projects/. Przy braku danych uruchamia automatyczną migrację z legacy projects.json. */
export async function getProjects(): Promise<Project[]> {
  const dataDir = await getDataDir();
  const projectsDir = await getProjectsBaseDir();
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(projectsDir);
  } catch {
    return [];
  }

  if (entries.length === 0 && !legacyMigrationAttempted) {
    legacyMigrationAttempted = true;
    const legacyPath = path.join(dataDir, 'projects.json');
    try {
      const raw = await fsp.readFile(legacyPath, 'utf8');
      const legacy = JSON.parse(raw) as unknown;
      const legacyProjects = Array.isArray(legacy) ? (legacy as Project[]) : [];
      if (legacyProjects.length > 0) {
        await migrateLegacyToFolderStructure(dataDir, legacyProjects);
        return getProjects();
      }
    } catch {
      // brak lub błąd legacy – zwróć pustą listę
    }
  }

  const projects: Project[] = [];
  for (const name of entries) {
    const projectDir = path.join(projectsDir, name);
    const stat = await fsp.stat(projectDir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const projectJsonPath = path.join(projectDir, 'project.json');
    let raw: string;
    try {
      raw = await fsp.readFile(projectJsonPath, 'utf8');
    } catch {
      continue;
    }
    let meta: ProjectMeta;
    try {
      meta = JSON.parse(raw) as ProjectMeta;
    } catch {
      continue;
    }
    if (meta.id !== name) continue;
    const revisionIds = Array.isArray(meta.revisionIds) ? meta.revisionIds : [];
    const revisions: Revision[] = [];
    const rewizjeDir = path.join(projectDir, 'rewizje');
    for (const revId of revisionIds) {
      const revPath = path.join(rewizjeDir, revId, 'revision.json');
      try {
        const revRaw = await fsp.readFile(revPath, 'utf8');
        const revMeta = JSON.parse(revRaw) as RevisionMeta;
        revisions.push(revisionMetaToRevision(revMeta, meta.id));
      } catch {
        // pomiń uszkodzoną/brakującą rewizję
      }
    }
    projects.push({
      id: meta.id,
      name: meta.name,
      slug: meta.slug,
      description: meta.description,
      createdAt: meta.createdAt,
      revisions,
    });
  }
  return projects;
}


/** Zapisuje bufor jako miniaturkę rewizji. Zwraca nazwę pliku (thumbnail.webp). */
export async function saveThumbnailFile(
  projectId: string,
  revisionId: string,
  buffer: Buffer
): Promise<string> {
  const revDir = await getRevisionDir(projectId, revisionId);
  const filePath = path.join(revDir, REVISION_THUMBNAIL_FILENAME);
  await fsp.writeFile(filePath, buffer);
  return REVISION_THUMBNAIL_FILENAME;
}

/** Zwraca ścieżkę absolutną do pliku miniaturki lub null. */
export async function getThumbnailFilePath(
  projectId: string,
  revisionId: string
): Promise<string | null> {
  const revDir = await getRevisionDir(projectId, revisionId);
  const filePath = path.join(revDir, REVISION_THUMBNAIL_FILENAME);
  try {
    await fsp.access(filePath);
    return filePath;
  } catch {
    logger.warn('[thumbnail] Plik nie istnieje', { path: filePath, projectId, revisionId });
    return null;
  }
}

/** Usuwa plik miniaturki rewizji. */
export async function deleteThumbnailFile(
  projectId: string,
  revisionId: string
): Promise<void> {
  const revDir = await getRevisionDir(projectId, revisionId);
  const filePath = path.join(revDir, REVISION_THUMBNAIL_FILENAME);
  try {
    await fsp.unlink(filePath);
  } catch {
    // ignoruj brak pliku
  }
}

/** Zapisuje plik obrazu do galerii rewizji. Zwraca nazwę pliku (np. uuid.webp). */
export async function saveGalleryFile(
  projectId: string,
  revisionId: string,
  buffer: Buffer,
  extension: string = '.webp'
): Promise<string> {
  const galleryDir = await getRevisionGalleryDir(projectId, revisionId);
  const name = `${crypto.randomUUID()}${extension}`;
  const filePath = path.join(galleryDir, name);
  await fsp.writeFile(filePath, buffer);
  return name;
}

/** Zwraca ścieżkę absolutną do pliku galerii lub null. */
export async function getGalleryFilePath(
  projectId: string,
  revisionId: string,
  filename: string
): Promise<string | null> {
  const galleryDir = await getRevisionGalleryDir(projectId, revisionId);
  const filePath = path.join(galleryDir, filename);
  const base = path.normalize(galleryDir);
  const full = path.normalize(filePath);
  if (!full.startsWith(base)) {
    logger.warn('[gallery] Path traversal', { galleryDir, filename, projectId, revisionId });
    return null;
  }
  try {
    await fsp.access(filePath);
    return filePath;
  } catch {
    logger.warn('[gallery] Plik nie istnieje', { path: filePath, projectId, revisionId, filename });
    return null;
  }
}

/** Dodaje ścieżki galerii (nazwy plików) do rewizji. */
export async function appendRevisionGalleryPaths(
  projectId: string,
  revisionId: string,
  filenames: string[]
): Promise<Revision | null> {
  const revDir = await getRevisionDir(projectId, revisionId);
  const revPath = path.join(revDir, 'revision.json');
  let raw: string;
  try {
    raw = await fsp.readFile(revPath, 'utf8');
  } catch {
    return null;
  }
  let meta: RevisionMeta;
  try {
    meta = JSON.parse(raw) as RevisionMeta;
  } catch {
    return null;
  }
  const current = meta.galleryPaths ?? [];
  meta.galleryPaths = [...current, ...filenames];
  await fsp.writeFile(revPath, JSON.stringify(meta, null, 2), 'utf8');
  return revisionMetaToRevision(meta, projectId);
}

export async function addProject(
  name: string,
  description?: string
): Promise<Project> {
  const projects = await getProjects();
  const existingSlugs = projects.filter((p) => p.slug).map((p) => p.slug!);
  const projectId = crypto.randomUUID();
  const slug = generateSlug(name.trim(), existingSlugs);
  const meta: ProjectMeta = {
    id: projectId,
    name: name.trim(),
    slug,
    description: description?.trim() || undefined,
    createdAt: new Date().toISOString(),
    revisionIds: [],
  };
  const projectDir = await getProjectDir(projectId);
  await fsp.mkdir(projectDir, { recursive: true });
  await fsp.writeFile(
    path.join(projectDir, 'project.json'),
    JSON.stringify(meta, null, 2),
    'utf8'
  );
  return {
    id: projectId,
    slug,
    name: meta.name,
    description: meta.description,
    createdAt: meta.createdAt,
    revisions: [],
  };
}

export async function updateProject(
  id: string,
  updates: { name?: string; description?: string }
): Promise<Project | null> {
  const dataDir = await getDataDir();
  const projectPath = path.join(dataDir, 'projects', id, 'project.json');
  let raw: string;
  try {
    raw = await fsp.readFile(projectPath, 'utf8');
  } catch {
    return null;
  }
  let meta: ProjectMeta;
  try {
    meta = JSON.parse(raw) as ProjectMeta;
  } catch {
    return null;
  }
  if (updates.name !== undefined) {
    meta.name = updates.name.trim();
    const projects = await getProjects();
    const existingSlugs = projects.filter((p) => p.id !== id && p.slug).map((p) => p.slug!);
    meta.slug = generateSlug(meta.name, existingSlugs);
  }
  if (updates.description !== undefined) {
    meta.description =
      updates.description.trim() === ''
        ? undefined
        : updates.description.trim();
  }
  await fsp.writeFile(projectPath, JSON.stringify(meta, null, 2), 'utf8');
  return {
    id: meta.id,
    name: meta.name,
    slug: meta.slug,
    description: meta.description,
    createdAt: meta.createdAt,
    revisions: (await getProjects()).find((p) => p.id === id)?.revisions ?? [],
  };
}

export async function addProjectRevision(
  projectId: string,
  label?: string,
  embedUrl?: string
): Promise<Revision | null> {
  const dataDir = await getDataDir();
  const projectPath = path.join(dataDir, 'projects', projectId, 'project.json');
  let raw: string;
  try {
    raw = await fsp.readFile(projectPath, 'utf8');
  } catch {
    return null;
  }
  let meta: ProjectMeta;
  try {
    meta = JSON.parse(raw) as ProjectMeta;
  } catch {
    return null;
  }
  const revisionId = crypto.randomUUID();
  const revision: Revision = {
    id: revisionId,
    label: label?.trim() || undefined,
    embedUrl: embedUrl?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const revDir = await getRevisionDir(projectId, revisionId);
  await fsp.writeFile(
    path.join(revDir, 'revision.json'),
    JSON.stringify(revisionToMeta(revision), null, 2),
    'utf8'
  );
  meta.revisionIds = [...(meta.revisionIds || []), revisionId];
  await fsp.writeFile(projectPath, JSON.stringify(meta, null, 2), 'utf8');
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
    thumbnailPath?: string;
  }
): Promise<Revision | null> {
  const revDir = await getRevisionDir(projectId, revisionId);
  const revPath = path.join(revDir, 'revision.json');
  let raw: string;
  try {
    raw = await fsp.readFile(revPath, 'utf8');
  } catch {
    return null;
  }
  let meta: RevisionMeta;
  try {
    meta = JSON.parse(raw) as RevisionMeta;
  } catch {
    return null;
  }
  if (updates.label !== undefined) {
    meta.label = updates.label.trim() === '' ? undefined : updates.label.trim();
  }
  if (updates.description !== undefined) {
    meta.description =
      updates.description?.trim() === ''
        ? undefined
        : updates.description?.trim();
  }
  if (updates.embedUrl !== undefined) {
    meta.embedUrl = updates.embedUrl.trim() === '' ? undefined : updates.embedUrl.trim();
  }
  if (updates.thumbnailPath !== undefined) {
    meta.thumbnailPath = updates.thumbnailPath || undefined;
  }
  if (updates.thumbnailDataUrl !== undefined) {
    if (updates.thumbnailDataUrl === '') {
      await deleteThumbnailFile(projectId, revisionId);
      meta.thumbnailPath = undefined;
    } else {
      const buffer = decodeDataUrlToBuffer(updates.thumbnailDataUrl);
      if (buffer && buffer.length > 0) {
        await saveThumbnailFile(projectId, revisionId, buffer);
        meta.thumbnailPath = REVISION_THUMBNAIL_FILENAME;
      }
    }
  }
  await fsp.writeFile(revPath, JSON.stringify(meta, null, 2), 'utf8');
  return revisionMetaToRevision(meta, projectId);
}

export async function reorderProjectRevisions(
  projectId: string,
  revisionIds: string[]
): Promise<Project | null> {
  if (!Array.isArray(revisionIds) || revisionIds.length === 0) return null;
  const dataDir = await getDataDir();
  const projectPath = path.join(dataDir, 'projects', projectId, 'project.json');
  let raw: string;
  try {
    raw = await fsp.readFile(projectPath, 'utf8');
  } catch {
    return null;
  }
  let meta: ProjectMeta;
  try {
    meta = JSON.parse(raw) as ProjectMeta;
  } catch {
    return null;
  }
  const existing = new Set(meta.revisionIds || []);
  const ordered = revisionIds.filter((id) => existing.has(id));
  for (const id of meta.revisionIds || []) {
    if (!revisionIds.includes(id)) ordered.push(id);
  }
  meta.revisionIds = ordered;
  await fsp.writeFile(projectPath, JSON.stringify(meta, null, 2), 'utf8');
  return (await getProjects()).find((p) => p.id === projectId) ?? null;
}

export async function deleteProjectRevision(
  projectId: string,
  revisionId: string
): Promise<boolean> {
  const revDir = await getRevisionDir(projectId, revisionId);
  try {
    await fsp.rm(revDir, { recursive: true, force: true });
  } catch {
    // ignoruj jeśli nie istnieje
  }

  const dataDir = await getDataDir();
  const projectPath = path.join(dataDir, 'projects', projectId, 'project.json');
  let raw: string;
  try {
    raw = await fsp.readFile(projectPath, 'utf8');
  } catch {
    return false;
  }
  let meta: ProjectMeta;
  try {
    meta = JSON.parse(raw) as ProjectMeta;
  } catch {
    return false;
  }
  meta.revisionIds = (meta.revisionIds || []).filter((id) => id !== revisionId);
  await fsp.writeFile(projectPath, JSON.stringify(meta, null, 2), 'utf8');
  return true;
}

export async function deleteProject(id: string): Promise<boolean> {
  const projectDir = path.join(await getDataDir(), 'projects', id);
  try {
    await fsp.rm(projectDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
