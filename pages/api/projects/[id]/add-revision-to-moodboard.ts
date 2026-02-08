import type { NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import type { MoodboardBoard } from '@/src/types/moodboard';
import { getMoodboardBaseDir } from '@/src/utils/moodboardStoragePath';
import { saveMoodboardImage } from '@/src/utils/moodboardStorage';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';
import { getProjects, getAllProjects, getThumbnailFilePath } from '@/src/utils/projectsStorage';

function getBoardFilename(boardId: string): string {
  return `${boardId}.json`;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function isValidBoard(b: unknown): b is MoodboardBoard {
  return (
    b !== null &&
    typeof b === 'object' &&
    typeof (b as MoodboardBoard).id === 'string' &&
    Array.isArray((b as MoodboardBoard).images) &&
    Array.isArray((b as MoodboardBoard).comments)
  );
}

async function handler(req: GroupScopedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const projectIdOrSlug = req.query.id as string;
  const { revisionId, boardId } = req.body;
  if (!projectIdOrSlug || !revisionId || !boardId) {
    return res.status(400).json({ error: 'Wymagane: id projektu, revisionId, boardId' });
  }

  try {
    const projects = req.isAdmin
      ? await getAllProjects()
      : await getProjects(req.userGroupId);
    const project = projects.find((p) => p.id === projectIdOrSlug || p.slug === projectIdOrSlug);
    if (!project) return res.status(404).json({ error: 'Projekt nie znaleziony' });

    const revision = (project.revisions || []).find((r) => r.id === revisionId);
    if (!revision) return res.status(404).json({ error: 'Rewizja nie znaleziona' });

    const moodboardGroupId = project.groupId;

    const revisionLabel =
      revision.label ||
      `Rewizja ${
        revision.createdAt
          ? new Date(revision.createdAt).toLocaleDateString('pl-PL')
          : revision.id.slice(0, 8)
      }`;

    let imageId: string | null = null;
    let imagePath: string | null = null;
    const imgW = 300;
    const imgH = 200;
    const thumbPath = await getThumbnailFilePath(project.id, revision.id, moodboardGroupId);
    if (thumbPath) {
      const buffer = await fsp.readFile(thumbPath);
      if (buffer.length > 0) {
        imageId = generateId();
        imagePath = await saveMoodboardImage(
          boardId,
          imageId,
          buffer,
          '.webp',
          moodboardGroupId
        );
      }
    }

    const dir = await getMoodboardBaseDir(moodboardGroupId);
    const boardPath = path.join(dir, getBoardFilename(boardId));
    let raw: string;
    try {
      raw = await fsp.readFile(boardPath, 'utf8');
    } catch {
      return res.status(404).json({ error: 'Moodboard nie znaleziony' });
    }
    const board = JSON.parse(raw) as unknown;
    if (!isValidBoard(board)) return res.status(500).json({ error: 'Nieprawidłowy stan moodboarda' });

    const baseX = 50 + Math.random() * 200;
    const baseY = 50 + Math.random() * 200;

    const commentId = generateId();
    const commentText = revision.description
      ? `${revisionLabel}\n${revision.description}`
      : revisionLabel;
    const commentWidth = Math.max(200, 160);
    const commentHeight = 60;
    const newComment = {
      id: commentId,
      text: commentText,
      color: 'none' as const,
      font: 'sans' as const,
      fontWeight: 'normal' as const,
      fontSize: 12,
      fontColor: '#888888',
      x: baseX,
      y: imagePath ? baseY + imgH + 4 : baseY,
      width: commentWidth,
      height: commentHeight,
    };
    board.comments.push(newComment);

    if (imagePath && imageId) {
      board.images.push({
        id: imageId,
        imagePath,
        x: baseX,
        y: baseY,
        width: imgW,
        height: imgH,
      });
    }

    const groupId_ = generateId();
    const groupPadding = 10;
    const memberIds = imageId ? [imageId, commentId] : [commentId];
    const groupW =
      (imagePath ? Math.max(imgW, commentWidth) : commentWidth) + groupPadding * 2;
    const groupH =
      (imagePath ? imgH + commentHeight + 4 : commentHeight) + groupPadding * 2;
    const newGroup = {
      id: groupId_,
      name: revisionLabel,
      x: baseX - groupPadding,
      y: baseY - groupPadding,
      width: groupW,
      height: groupH,
      memberIds,
    };
    if (!board.groups) board.groups = [];
    board.groups.push(newGroup);

    await fsp.writeFile(boardPath, JSON.stringify(board, null, 2), 'utf8');
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error add-revision-to-moodboard:', error);
    return res.status(500).json({ error: 'Błąd dodawania rewizji do moodboarda' });
  }
}

export default withGroupAccess(handler);
