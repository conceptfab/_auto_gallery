import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getDataDir } from '@/src/utils/dataDir';

export interface MoodboardBoardInfo {
  id: string;
  name?: string;
  imagesCount: number;
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

export interface DataStorageTree {
  moodboard: { boards: MoodboardBoardInfo[] };
  projects: ProjectTreeItem[];
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dataDir = await getDataDir();
    const moodboardDir = path.join(dataDir, 'moodboard');
    const projectsDir = path.join(dataDir, 'projects');

    const moodboardBoards: MoodboardBoardInfo[] = [];
    try {
      const indexRaw = await fsp.readFile(path.join(moodboardDir, 'index.json'), 'utf8');
      const index = JSON.parse(indexRaw) as { boardIds?: string[] };
      const boardIds = index.boardIds || [];
      for (const boardId of boardIds) {
        let imagesCount = 0;
        try {
          const boardPath = path.join(moodboardDir, `${boardId}.json`);
          const boardRaw = await fsp.readFile(boardPath, 'utf8');
          const board = JSON.parse(boardRaw) as { name?: string; images?: unknown[] };
          imagesCount = board.images?.length ?? 0;
          moodboardBoards.push({
            id: boardId,
            name: board.name,
            imagesCount,
          });
        } catch {
          moodboardBoards.push({ id: boardId, imagesCount: 0 });
        }
      }
    } catch {
      // brak moodboard
    }

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
          revisions.push({
            id: revId,
            label,
            thumbnailPresent,
            galleryCount,
          });
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

    const tree: DataStorageTree = {
      moodboard: { boards: moodboardBoards },
      projects,
    };
    return res.status(200).json(tree);
  } catch (err) {
    console.error('Data storage tree error:', err);
    return res.status(500).json({ error: 'Błąd odczytu struktury danych' });
  }
}

export default withAdminAuth(handler);
