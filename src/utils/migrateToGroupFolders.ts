import path from 'path';
import fsp from 'fs/promises';
import { getDataDir } from './dataDir';
import { getGroupsBaseDir } from './projectsStoragePath';
import { ensureGroupFolders } from './projectsStoragePath';
import { getGroups } from './storage';

interface MigrationReport {
  projectsMoved: number;
  moodboardsMoved: number;
  errors: string[];
  details: string[];
}

/**
 * Migruje istniejące projekty i moodboardy z globalnych folderów
 * do folderów odpowiednich grup na podstawie ich groupId.
 * Idempotentna — bezpieczna do wielokrotnego uruchomienia.
 */
export async function migrateToGroupFolders(): Promise<MigrationReport> {
  const report: MigrationReport = {
    projectsMoved: 0,
    moodboardsMoved: 0,
    errors: [],
    details: [],
  };

  const dataDir = await getDataDir();
  const groups = await getGroups();
  const groupIds = new Set(groups.map((g) => g.id));

  // Ensure group folders exist
  for (const group of groups) {
    await ensureGroupFolders(group.id);
  }

  // === MIGRACJA PROJEKTÓW ===
  const globalProjectsDir = path.join(dataDir, 'projects');
  try {
    const entries = await fsp.readdir(globalProjectsDir);
    for (const entry of entries) {
      const projectDir = path.join(globalProjectsDir, entry);
      const stat = await fsp.stat(projectDir).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const projectJsonPath = path.join(projectDir, 'project.json');
      let raw: string;
      try {
        raw = await fsp.readFile(projectJsonPath, 'utf8');
      } catch {
        continue;
      }

      let meta: { id: string; groupId?: string; [key: string]: unknown };
      try {
        meta = JSON.parse(raw);
      } catch {
        report.errors.push(`Nie można sparsować project.json: ${entry}`);
        continue;
      }

      if (!meta.groupId || !groupIds.has(meta.groupId)) continue;

      // Projekt ma groupId i ta grupa istnieje — przenieś
      const groupId = meta.groupId;
      const groupsBase = await getGroupsBaseDir();
      const dstDir = path.join(groupsBase, groupId, 'projects', entry);

      try {
        await fsp.access(dstDir);
        report.details.push(`Projekt ${entry} już istnieje w grupie ${groupId} — pomijam`);
        continue;
      } catch {
        // Nie istnieje — kontynuuj przenoszenie
      }

      try {
        await copyDirRecursive(projectDir, dstDir);
        await fsp.rm(projectDir, { recursive: true, force: true });
        report.projectsMoved++;
        report.details.push(`Przeniesiono projekt ${entry} → grupa ${groupId}`);
      } catch (err) {
        report.errors.push(`Błąd przenoszenia projektu ${entry}: ${err}`);
      }
    }
  } catch {
    report.details.push('Brak globalnego folderu projects — pomijam');
  }

  // === MIGRACJA MOODBOARDÓW ===
  const globalMoodboardDir = path.join(dataDir, 'moodboard');
  const globalImagesDir = path.join(dataDir, 'moodboard', 'images');

  try {
    const indexPath = path.join(globalMoodboardDir, 'index.json');
    let indexRaw: string;
    try {
      indexRaw = await fsp.readFile(indexPath, 'utf8');
    } catch {
      report.details.push('Brak globalnego index.json moodboard — pomijam');
      return report;
    }

    let index: { boardIds: string[]; activeId: string };
    try {
      index = JSON.parse(indexRaw);
    } catch {
      report.errors.push('Nie można sparsować globalnego index.json moodboard');
      return report;
    }

    const boardsToRemove: string[] = [];

    for (const boardId of index.boardIds) {
      const boardFilePath = path.join(globalMoodboardDir, `${boardId}.json`);
      let boardRaw: string;
      try {
        boardRaw = await fsp.readFile(boardFilePath, 'utf8');
      } catch {
        continue;
      }

      let board: { id: string; groupId?: string; [key: string]: unknown };
      try {
        board = JSON.parse(boardRaw);
      } catch {
        report.errors.push(`Nie można sparsować board ${boardId}.json`);
        continue;
      }

      if (!board.groupId || !groupIds.has(board.groupId)) continue;

      const groupId = board.groupId;
      const groupsBase = await getGroupsBaseDir();
      const dstMoodboardDir = path.join(groupsBase, groupId, 'moodboard');
      const dstBoardFile = path.join(dstMoodboardDir, `${boardId}.json`);

      // Sprawdź czy board już istnieje w grupie
      try {
        await fsp.access(dstBoardFile);
        report.details.push(`Moodboard ${boardId} już istnieje w grupie ${groupId} — pomijam`);
        boardsToRemove.push(boardId);
        continue;
      } catch {
        // Nie istnieje — kontynuuj
      }

      try {
        // Przenieś plik JSON boarda
        await fsp.mkdir(dstMoodboardDir, { recursive: true });
        await fsp.copyFile(boardFilePath, dstBoardFile);
        await fsp.unlink(boardFilePath);

        // Przenieś obrazy boarda
        const srcImgDir = path.join(globalImagesDir, boardId);
        const dstImgDir = path.join(dstMoodboardDir, 'images', boardId);
        try {
          await fsp.access(srcImgDir);
          await fsp.mkdir(dstImgDir, { recursive: true });
          const imgFiles = await fsp.readdir(srcImgDir);
          for (const f of imgFiles) {
            await fsp.copyFile(path.join(srcImgDir, f), path.join(dstImgDir, f));
          }
          await fsp.rm(srcImgDir, { recursive: true, force: true });
        } catch {
          // Brak obrazów — OK
        }

        // Zaktualizuj index.json grupy
        const dstIndexPath = path.join(dstMoodboardDir, 'index.json');
        try {
          const dstIndexRaw = await fsp.readFile(dstIndexPath, 'utf8');
          const dstIndex = JSON.parse(dstIndexRaw) as { boardIds: string[]; activeId: string };
          if (!dstIndex.boardIds.includes(boardId)) {
            dstIndex.boardIds.push(boardId);
          }
          await fsp.writeFile(dstIndexPath, JSON.stringify(dstIndex, null, 2), 'utf8');
        } catch {
          await fsp.writeFile(dstIndexPath, JSON.stringify({
            boardIds: [boardId],
            activeId: boardId,
          }, null, 2), 'utf8');
        }

        boardsToRemove.push(boardId);
        report.moodboardsMoved++;
        report.details.push(`Przeniesiono moodboard ${boardId} → grupa ${groupId}`);
      } catch (err) {
        report.errors.push(`Błąd przenoszenia moodboard ${boardId}: ${err}`);
      }
    }

    // Zaktualizuj globalny index.json
    if (boardsToRemove.length > 0) {
      const removeSet = new Set(boardsToRemove);
      index.boardIds = index.boardIds.filter((id) => !removeSet.has(id));
      if (removeSet.has(index.activeId) && index.boardIds.length > 0) {
        index.activeId = index.boardIds[0];
      }
      await fsp.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
    }
  } catch {
    report.details.push('Brak globalnego folderu moodboard — pomijam');
  }

  return report;
}

async function copyDirRecursive(src: string, dst: string): Promise<void> {
  await fsp.mkdir(dst, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, dstPath);
    } else {
      await fsp.copyFile(srcPath, dstPath);
    }
  }
}
