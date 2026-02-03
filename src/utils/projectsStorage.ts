import path from 'path';
import fsp from 'fs/promises';
import crypto from 'crypto';

export interface Revision {
  id: string;
  label?: string;
  description?: string;
  embedUrl?: string;
  /** Miniaturka – obraz (np. webp) jako Data URL */
  thumbnailDataUrl?: string;
  /** @deprecated użyj thumbnailDataUrl */
  screenshotDataUrl?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  revisions?: Revision[];
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

export async function getProjects(): Promise<Project[]> {
  const filePath = await getProjectsFilePath();
  return ensureProjectsFile(filePath);
}

export async function addProject(
  name: string,
  description?: string
): Promise<Project> {
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const project: Project = {
    id: crypto.randomUUID(),
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
  if (updates.thumbnailDataUrl !== undefined) {
    revisions[rIdx].thumbnailDataUrl =
      updates.thumbnailDataUrl === '' ? undefined : updates.thumbnailDataUrl;
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
  const filePath = await getProjectsFilePath();
  const projects = await ensureProjectsFile(filePath);
  const pIdx = projects.findIndex((p) => p.id === projectId);
  if (pIdx === -1) return false;
  const project = projects[pIdx];
  const revisions = project.revisions ?? [];
  const rIdx = revisions.findIndex((r) => r.id === revisionId);
  if (rIdx === -1) return false;
  revisions.splice(rIdx, 1);
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
