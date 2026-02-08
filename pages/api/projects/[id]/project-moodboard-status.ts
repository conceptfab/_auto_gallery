import type { NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { getMoodboardBaseDir } from '@/src/utils/moodboardStoragePath';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';
import { getProjects, getAllProjects } from '@/src/utils/projectsStorage';

const INDEX_FILENAME = 'index.json';

interface MoodboardIndex {
  boardIds: string[];
  activeId: string;
}

function getBoardFilename(boardId: string): string {
  return `${boardId}.json`;
}

async function handler(req: GroupScopedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const projectIdOrSlug = req.query.id as string;
  if (!projectIdOrSlug) {
    return res.status(400).json({ error: 'Brak id projektu' });
  }

  try {
    const projects = req.isAdmin
      ? await getAllProjects()
      : await getProjects(req.userGroupId);
    const project = projects.find((p) => p.id === projectIdOrSlug || p.slug === projectIdOrSlug);
    if (!project) {
      return res.status(404).json({ error: 'Projekt nie znaleziony' });
    }
    const moodboardGroupId = project.groupId;
    const dir = await getMoodboardBaseDir(moodboardGroupId);
    const indexPath = path.join(dir, INDEX_FILENAME);
    let boardIds: string[] = [];
    try {
      const rawIndex = await fsp.readFile(indexPath, 'utf8');
      const index = JSON.parse(rawIndex) as unknown;
      if (index && typeof index === 'object' && Array.isArray((index as MoodboardIndex).boardIds)) {
        boardIds = (index as MoodboardIndex).boardIds;
      }
    } catch {
      return res.status(200).json({ exists: false });
    }

    const projectNameNorm = (project.name || '').trim();
    for (const boardId of boardIds) {
      try {
        const raw = await fsp.readFile(path.join(dir, getBoardFilename(boardId)), 'utf8');
        const board = JSON.parse(raw) as { id?: string; name?: string };
        if (board && (board.name || '').trim() === projectNameNorm) {
          return res.status(200).json({ exists: true, boardId: board.id || boardId });
        }
      } catch {
        // pomijamy uszkodzony plik
      }
    }
    return res.status(200).json({ exists: false });
  } catch (error) {
    console.error('Error project-moodboard-status:', error);
    return res.status(500).json({ error: 'Błąd sprawdzania moodboarda projektu' });
  }
}

export default withGroupAccess(handler);
