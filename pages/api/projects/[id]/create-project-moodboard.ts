import type { NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import type { MoodboardBoard } from '@/src/types/moodboard';
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

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function handler(req: GroupScopedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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
    await fsp.mkdir(dir, { recursive: true });

    const projectNameNorm = (project.name || '').trim();
    const projectName = projectNameNorm || project.id;

    let boardIds: string[] = [];
    let activeId: string = '';
    try {
      const rawIndex = await fsp.readFile(path.join(dir, INDEX_FILENAME), 'utf8');
      const index = JSON.parse(rawIndex) as unknown;
      if (index && typeof index === 'object' && Array.isArray((index as MoodboardIndex).boardIds)) {
        boardIds = (index as MoodboardIndex).boardIds;
        activeId = (index as MoodboardIndex).activeId || boardIds[0] || '';
      }
    } catch {
      // brak index – utworzymy pierwszy board
    }

    for (const bid of boardIds) {
      try {
        const raw = await fsp.readFile(path.join(dir, getBoardFilename(bid)), 'utf8');
        const board = JSON.parse(raw) as { name?: string };
        if (board && (board.name || '').trim() === projectNameNorm) {
          return res.status(200).json({ success: true, boardId: bid, alreadyExists: true });
        }
      } catch {
        // pomijamy
      }
    }

    const newId = generateId();
    const newBoard: MoodboardBoard = {
      id: newId,
      name: projectName,
      images: [],
      comments: [],
      groups: [],
    };
    boardIds = [...boardIds, newId];
    if (!activeId) activeId = newId;

    await fsp.writeFile(
      path.join(dir, getBoardFilename(newId)),
      JSON.stringify(newBoard, null, 2),
      'utf8'
    );
    await fsp.writeFile(
      path.join(dir, INDEX_FILENAME),
      JSON.stringify({ boardIds, activeId }, null, 2),
      'utf8'
    );

    return res.status(200).json({ success: true, boardId: newId });
  } catch (error) {
    console.error('Error create-project-moodboard:', error);
    return res.status(500).json({ error: 'Błąd tworzenia moodboarda projektu' });
  }
}

export default withGroupAccess(handler);
