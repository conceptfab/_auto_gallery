import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getMoodboardBaseDir, getMoodboardImagesDirByGroup } from '@/src/utils/moodboardStorage';
import { getMoodboardImagesDir } from '@/src/utils/moodboardStorage';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { boardId, fromGroupId, toGroupId } = req.body;
    if (!boardId || typeof boardId !== 'string') {
      return res.status(400).json({ error: 'boardId jest wymagane' });
    }

    const srcDir = await getMoodboardBaseDir(fromGroupId || undefined);
    const dstDir = await getMoodboardBaseDir(toGroupId || undefined);
    const srcFile = path.join(srcDir, `${boardId}.json`);

    // Sprawdź czy board istnieje
    let boardRaw: string;
    try {
      boardRaw = await fsp.readFile(srcFile, 'utf8');
    } catch {
      return res.status(404).json({ error: 'Moodboard nie znaleziony' });
    }

    // Nowy ID dla kopii
    const newBoardId = generateId();
    const board = JSON.parse(boardRaw);
    const oldBoardId = board.id;
    board.id = newBoardId;
    if (board.name) board.name = board.name + ' (kopia)';

    // Aktualizuj imagePath we wszystkich obrazach
    if (Array.isArray(board.images)) {
      for (const img of board.images) {
        if (img.imagePath && typeof img.imagePath === 'string') {
          img.imagePath = img.imagePath.replace(oldBoardId, newBoardId);
        }
      }
    }

    const dstFile = path.join(dstDir, `${newBoardId}.json`);
    await fsp.writeFile(dstFile, JSON.stringify(board, null, 2), 'utf8');

    // Kopiuj obrazy boarda
    const srcImgDir = fromGroupId
      ? await getMoodboardImagesDirByGroup(fromGroupId)
      : await getMoodboardImagesDir();
    const dstImgDir = toGroupId
      ? await getMoodboardImagesDirByGroup(toGroupId)
      : await getMoodboardImagesDir();
    const srcBoardImgDir = path.join(srcImgDir, oldBoardId);
    const dstBoardImgDir = path.join(dstImgDir, newBoardId);

    try {
      await fsp.access(srcBoardImgDir);
      await fsp.mkdir(dstBoardImgDir, { recursive: true });
      const files = await fsp.readdir(srcBoardImgDir);
      for (const f of files) {
        await fsp.copyFile(path.join(srcBoardImgDir, f), path.join(dstBoardImgDir, f));
      }
    } catch {
      // Brak obrazów – OK
    }

    // Dodaj do index.json w celu
    const dstIndexPath = path.join(dstDir, 'index.json');
    try {
      const raw = await fsp.readFile(dstIndexPath, 'utf8');
      const index = JSON.parse(raw) as { boardIds: string[]; activeId: string };
      index.boardIds.push(newBoardId);
      await fsp.writeFile(dstIndexPath, JSON.stringify(index, null, 2), 'utf8');
    } catch {
      await fsp.writeFile(dstIndexPath, JSON.stringify({
        boardIds: [newBoardId],
        activeId: newBoardId,
      }, null, 2), 'utf8');
    }

    return res.status(200).json({ success: true, newBoardId });
  } catch (error) {
    console.error('Error copying moodboard:', error);
    return res.status(500).json({ error: 'Błąd kopiowania moodboardu' });
  }
}

export default withAdminAuth(handler);
