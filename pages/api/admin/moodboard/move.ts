import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { withAdminAuth } from '@/src/utils/adminMiddleware';
import { getMoodboardBaseDir, getMoodboardImagesDirByGroup } from '@/src/utils/moodboardStorage';
import { getMoodboardImagesDir } from '@/src/utils/moodboardStorage';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { boardId, fromGroupId, toGroupId } = req.body;
    if (!boardId || typeof boardId !== 'string') {
      return res.status(400).json({ error: 'boardId jest wymagane' });
    }
    if (fromGroupId === toGroupId) {
      return res.status(400).json({ error: 'Źródłowa i docelowa grupa są takie same' });
    }

    const srcDir = await getMoodboardBaseDir(fromGroupId || undefined);
    const dstDir = await getMoodboardBaseDir(toGroupId || undefined);
    const srcFile = path.join(srcDir, `${boardId}.json`);
    const dstFile = path.join(dstDir, `${boardId}.json`);

    // Sprawdź czy board istnieje
    try {
      await fsp.access(srcFile);
    } catch {
      return res.status(404).json({ error: 'Moodboard nie znaleziony' });
    }

    // Przenieś plik JSON boarda
    await fsp.copyFile(srcFile, dstFile);
    await fsp.unlink(srcFile);

    // Przenieś obrazy boarda
    const srcImgDir = fromGroupId
      ? await getMoodboardImagesDirByGroup(fromGroupId)
      : await getMoodboardImagesDir();
    const dstImgDir = toGroupId
      ? await getMoodboardImagesDirByGroup(toGroupId)
      : await getMoodboardImagesDir();
    const srcBoardImgDir = path.join(srcImgDir, boardId);
    const dstBoardImgDir = path.join(dstImgDir, boardId);

    try {
      await fsp.access(srcBoardImgDir);
      await fsp.mkdir(dstBoardImgDir, { recursive: true });
      const files = await fsp.readdir(srcBoardImgDir);
      for (const f of files) {
        await fsp.copyFile(path.join(srcBoardImgDir, f), path.join(dstBoardImgDir, f));
      }
      await fsp.rm(srcBoardImgDir, { recursive: true, force: true });
    } catch {
      // Brak obrazów – OK
    }

    // Aktualizuj index.json w źródle (usuń boardId)
    const srcIndexPath = path.join(srcDir, 'index.json');
    try {
      const raw = await fsp.readFile(srcIndexPath, 'utf8');
      const index = JSON.parse(raw) as { boardIds: string[]; activeId: string };
      index.boardIds = index.boardIds.filter((id: string) => id !== boardId);
      if (index.activeId === boardId && index.boardIds.length > 0) {
        index.activeId = index.boardIds[0];
      }
      await fsp.writeFile(srcIndexPath, JSON.stringify(index, null, 2), 'utf8');
    } catch {
      // ignoruj
    }

    // Aktualizuj index.json w celu (dodaj boardId)
    const dstIndexPath = path.join(dstDir, 'index.json');
    try {
      const raw = await fsp.readFile(dstIndexPath, 'utf8');
      const index = JSON.parse(raw) as { boardIds: string[]; activeId: string };
      if (!index.boardIds.includes(boardId)) {
        index.boardIds.push(boardId);
      }
      await fsp.writeFile(dstIndexPath, JSON.stringify(index, null, 2), 'utf8');
    } catch {
      // Utwórz nowy index
      await fsp.writeFile(dstIndexPath, JSON.stringify({
        boardIds: [boardId],
        activeId: boardId,
      }, null, 2), 'utf8');
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error moving moodboard:', error);
    return res.status(500).json({ error: 'Błąd przenoszenia moodboardu' });
  }
}

export default withAdminAuth(handler);
