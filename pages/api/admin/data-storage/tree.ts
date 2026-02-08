import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getDataDir } from '@/src/utils/dataDir';
import { getGroups } from '@/src/utils/storage';

export interface MoodboardBoardInfo {
  id: string;
  name?: string;
  imagesCount: number;
  sketchesCount: number;
}

export interface RevisionInfo {
  id: string;
  label?: string;
  thumbnailPresent: boolean;
  galleryCount: number;
}

export interface ProjectTreeItem {
  id: string;
  name: string;
  slug?: string;
  revisions: RevisionInfo[];
}

export interface GroupTreeItem {
  groupId: string;
  /** Czytelna nazwa grupy z groups.json (lub groupId gdy brak) */
  groupName: string;
  moodboard: { boards: MoodboardBoardInfo[] };
  projects: ProjectTreeItem[];
}

export interface DataStorageTree {
  moodboard: { boards: MoodboardBoardInfo[] };
  projects: ProjectTreeItem[];
  groups: GroupTreeItem[];
}

async function readMoodboardBoards(moodboardDir: string): Promise<MoodboardBoardInfo[]> {
  const boards: MoodboardBoardInfo[] = [];
  try {
    const indexRaw = await fsp.readFile(path.join(moodboardDir, 'index.json'), 'utf8');
    const index = JSON.parse(indexRaw) as { boardIds?: string[] };
    const boardIds = index.boardIds || [];
    for (const boardId of boardIds) {
      try {
        const boardPath = path.join(moodboardDir, `${boardId}.json`);
        const boardRaw = await fsp.readFile(boardPath, 'utf8');
        const board = JSON.parse(boardRaw) as { name?: string; images?: unknown[]; sketches?: unknown[] };
        boards.push({
          id: boardId,
          name: board.name,
          imagesCount: board.images?.length ?? 0,
          sketchesCount: board.sketches?.length ?? 0,
        });
      } catch {
        boards.push({ id: boardId, imagesCount: 0, sketchesCount: 0 });
      }
    }
  } catch {
    // brak moodboard
  }
  return boards;
}

async function readProjects(projectsDir: string): Promise<ProjectTreeItem[]> {
  const projects: ProjectTreeItem[] = [];
  try {
    const projectIds = await fsp.readdir(projectsDir);
    for (const projectId of projectIds) {
      const projectPath = path.join(projectsDir, projectId);
      const stat = await fsp.stat(projectPath).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const projectJsonPath = path.join(projectPath, 'project.json');
      let meta: { id: string; name: string; slug?: string; revisionIds?: string[] };
      try {
        const raw = await fsp.readFile(projectJsonPath, 'utf8');
        meta = JSON.parse(raw) as typeof meta;
      } catch {
        continue;
      }
      const revisionIds = meta.revisionIds || [];
      const revisions: RevisionInfo[] = [];
      const rewizjeDir = path.join(projectPath, 'rewizje');
      for (const revId of revisionIds) {
        const revDir = path.join(rewizjeDir, revId);
        let thumbnailPresent = false;
        let galleryCount = 0;
        let label: string | undefined;
        try {
          await fsp.access(path.join(revDir, 'thumbnail.webp'));
          thumbnailPresent = true;
        } catch {
          // brak
        }
        try {
          const revRaw = await fsp.readFile(path.join(revDir, 'revision.json'), 'utf8');
          const revMeta = JSON.parse(revRaw) as { label?: string; galleryPaths?: string[] };
          label = revMeta.label;
          galleryCount = revMeta.galleryPaths?.length ?? 0;
        } catch {
          try {
            const galleryDir = path.join(revDir, 'gallery');
            const files = await fsp.readdir(galleryDir);
            galleryCount = files.filter((f) => /\.(webp|jpg|jpeg|png|gif)$/i.test(f)).length;
          } catch {
            // brak
          }
        }
        revisions.push({ id: revId, label, thumbnailPresent, galleryCount });
      }
      projects.push({
        id: meta.id,
        name: meta.name || projectId,
        slug: meta.slug,
        revisions,
      });
    }
  } catch {
    // brak projects
  }
  return projects;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dataDir = await getDataDir();

    const moodboardBoards = await readMoodboardBoards(path.join(dataDir, 'moodboard'));
    const projects = await readProjects(path.join(dataDir, 'projects'));

    // Scan group folders i dopasuj czytelne nazwy z groups.json
    const groupItems: GroupTreeItem[] = [];
    const groupsList = await getGroups().catch(() => []);
    const groupsDir = path.join(dataDir, 'groups');
    try {
      const groupDirs = await fsp.readdir(groupsDir);
      for (const gid of groupDirs) {
        if (gid === 'groups.json') continue;
        const groupPath = path.join(groupsDir, gid);
        const gstat = await fsp.stat(groupPath).catch(() => null);
        if (!gstat?.isDirectory()) continue;
        const gMoodboard = await readMoodboardBoards(path.join(groupPath, 'moodboard'));
        const gProjects = await readProjects(path.join(groupPath, 'projects'));
        const groupMeta = groupsList.find((g) => g.id === gid);
        groupItems.push({
          groupId: gid,
          groupName: groupMeta?.name?.trim() || groupMeta?.clientName?.trim() || gid,
          moodboard: { boards: gMoodboard },
          projects: gProjects,
        });
      }
    } catch {
      // brak groups
    }

    const tree: DataStorageTree = {
      moodboard: { boards: moodboardBoards },
      projects,
      groups: groupItems,
    };
    return res.status(200).json(tree);
  } catch (err) {
    console.error('Data storage tree error:', err);
    return res.status(500).json({ error: 'Błąd odczytu struktury danych' });
  }
}

export default withAdminAuth(handler);
