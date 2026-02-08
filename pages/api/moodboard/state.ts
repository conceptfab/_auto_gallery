import type { NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import type { MoodboardAppState, MoodboardBoard, MoodboardViewport } from '@/src/types/moodboard';
import {
  decodeDataUrlToBuffer,
  saveMoodboardImage,
} from '@/src/utils/moodboardStorage';
import { getMoodboardBaseDir } from '@/src/utils/moodboardStoragePath';
import { getGroupsBaseDir } from '@/src/utils/projectsStoragePath';
import { sseBroker } from '@/src/lib/sse-broker';
import { withGroupAccess, GroupScopedRequest } from '@/src/utils/groupAccessMiddleware';

/** Jeden moodboard = jeden plik JSON. index.json trzyma listę id i activeId. */

/** Zwiększony limit body – stan moodboarda z obrazami base64 może być duży (domyślnie Next.js ~1 MB). */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

const INDEX_FILENAME = 'index.json';
const LEGACY_STATE_FILENAME = 'state.json';

interface MoodboardIndex {
  boardIds: string[];
  activeId: string;
}

/** Zwraca folder moodboarda z uwzględnieniem grupy. */
async function getMoodboardDir(groupId?: string): Promise<string> {
  return getMoodboardBaseDir(groupId);
}

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

/** Migracja: konwersja obrazów z base64 (url) na pliki (imagePath). */
async function migrateImagesToFiles(board: MoodboardBoard): Promise<boolean> {
  let dirty = false;
  for (const img of board.images) {
    if (img.url && !img.imagePath && img.url.startsWith('data:')) {
      const buffer = decodeDataUrlToBuffer(img.url);
      if (buffer && buffer.length > 0) {
        let ext = '.webp';
        if (img.url.includes('image/png')) ext = '.png';
        else if (img.url.includes('image/jpeg') || img.url.includes('image/jpg')) ext = '.jpg';
        else if (img.url.includes('image/gif')) ext = '.gif';

        const imagePath = await saveMoodboardImage(board.id, img.id, buffer, ext);
        img.imagePath = imagePath;
        img.url = undefined;
        dirty = true;
      }
    }
  }
  return dirty;
}

/** Z pliku legacy state.json → konwersja do AppState (używane przy migracji). */
function toAppState(raw: unknown): MoodboardAppState {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (
    Array.isArray(obj.boards) &&
    typeof obj.activeId === 'string' &&
    obj.boards.length > 0
  ) {
    const boards = (obj.boards as MoodboardBoard[]).filter(isValidBoard);
    const activeId =
      (boards.some((b) => b.id === obj.activeId) && obj.activeId) ||
      boards[0].id;
    return { boards, activeId };
  }
  const name = typeof obj.name === 'string' ? obj.name : undefined;
  const images = Array.isArray(obj.images) ? obj.images : [];
  const comments = Array.isArray(obj.comments) ? obj.comments : [];
  const groups = Array.isArray(obj.groups) ? obj.groups : [];
  const viewport = (obj.viewport && typeof obj.viewport === 'object') ? (obj.viewport as MoodboardViewport) : undefined;
  const id = generateId();
  return {
    boards: [{ id, name, images, comments, groups, viewport }],
    activeId: id,
  };
}

/** Migracja: zapisanie każdego boarda do osobnego pliku i utworzenie index.json. */
async function migrateLegacyToPerFile(
  dir: string,
  appState: MoodboardAppState
): Promise<void> {
  for (const board of appState.boards) {
    const fp = path.join(dir, getBoardFilename(board.id));
    await fsp.writeFile(fp, JSON.stringify(board, null, 2), 'utf8');
  }
  const index: MoodboardIndex = {
    boardIds: appState.boards.map((b) => b.id),
    activeId: appState.activeId,
  };
  await fsp.writeFile(
    path.join(dir, INDEX_FILENAME),
    JSON.stringify(index, null, 2),
    'utf8'
  );
}

/** GET: odczyt index.json + ładowanie każdego boarda z osobnego pliku. */
async function loadAppStateFromFiles(
  dir: string
): Promise<MoodboardAppState | null> {
  const indexPath = path.join(dir, INDEX_FILENAME);
  let rawIndex: string;
  try {
    rawIndex = await fsp.readFile(indexPath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw err;
  }
  const index = JSON.parse(rawIndex) as unknown;
  if (
    !index ||
    typeof index !== 'object' ||
    !Array.isArray((index as MoodboardIndex).boardIds) ||
    typeof (index as MoodboardIndex).activeId !== 'string'
  ) {
    return null;
  }
  const { boardIds, activeId } = index as MoodboardIndex;
  const boards: MoodboardBoard[] = [];
  for (const id of boardIds) {
    const boardPath = path.join(dir, getBoardFilename(id));
    try {
      const raw = await fsp.readFile(boardPath, 'utf8');
      const board = JSON.parse(raw) as unknown;
      if (isValidBoard(board)) {
        // Migracja: konwertuj base64 obrazy na pliki
        const migrated = await migrateImagesToFiles(board);
        if (migrated) {
          await fsp.writeFile(boardPath, JSON.stringify(board, null, 2), 'utf8');
        }
        boards.push(board);
      }
    } catch {
      // plik usunięty lub uszkodzony – pomijamy ten board
    }
  }
  const validActiveId = boards.some((b) => b.id === activeId)
    ? activeId
    : boards[0]?.id ?? generateId();
  if (boards.length === 0) {
    const newBoard: MoodboardBoard = {
      id: validActiveId,
      images: [],
      comments: [],
      groups: [],
    };
    boards.push(newBoard);
    await fsp.writeFile(
      path.join(dir, getBoardFilename(newBoard.id)),
      JSON.stringify(newBoard, null, 2),
      'utf8'
    );
    await fsp.writeFile(
      path.join(dir, INDEX_FILENAME),
      JSON.stringify(
        { boardIds: [newBoard.id], activeId: newBoard.id },
        null,
        2
      ),
      'utf8'
    );
  }
  return { boards, activeId: validActiveId };
}

/** Odczyt boardów z katalogu z przypisaniem groupId (bez migracji obrazów). */
async function loadBoardsWithGroupId(
  dir: string,
  groupIdForBoards: string | undefined
): Promise<MoodboardBoard[]> {
  const indexPath = path.join(dir, INDEX_FILENAME);
  let rawIndex: string;
  try {
    rawIndex = await fsp.readFile(indexPath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw err;
  }
  const index = JSON.parse(rawIndex) as unknown;
  if (
    !index ||
    typeof index !== 'object' ||
    !Array.isArray((index as MoodboardIndex).boardIds)
  ) {
    return [];
  }
  const { boardIds } = index as MoodboardIndex;
  const boards: MoodboardBoard[] = [];
  for (const id of boardIds) {
    const boardPath = path.join(dir, getBoardFilename(id));
    try {
      const raw = await fsp.readFile(boardPath, 'utf8');
      const board = JSON.parse(raw) as unknown;
      if (isValidBoard(board)) {
        boards.push({ ...board, groupId: groupIdForBoards });
      }
    } catch {
      // pomijamy
    }
  }
  return boards;
}

/** (Admin) Ładuje połączony stan moodboardów ze wszystkich grup + global. */
async function loadAllGroupsMoodboardState(): Promise<MoodboardAppState> {
  const allBoards: MoodboardBoard[] = [];
  const globalDir = await getMoodboardDir(undefined);
  const globalBoards = await loadBoardsWithGroupId(globalDir, undefined);
  allBoards.push(...globalBoards);

  const groupsBase = await getGroupsBaseDir();
  let groupDirs: string[] = [];
  try {
    groupDirs = await fsp.readdir(groupsBase);
  } catch {
    // brak katalogu grup
  }
  for (const gid of groupDirs) {
    if (gid === 'groups.json') continue;
    const groupMoodboardDir = path.join(groupsBase, gid, 'moodboard');
    try {
      const stat = await fsp.stat(groupMoodboardDir);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    const groupBoards = await loadBoardsWithGroupId(groupMoodboardDir, gid);
    allBoards.push(...groupBoards);
  }

  const boardIds = allBoards.map((b) => b.id);
  const activeId = boardIds.length > 0 ? boardIds[0] : generateId();
  return { boards: allBoards, activeId };
}

function normalizeAppState(body: unknown): MoodboardAppState {
  const obj =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (Array.isArray(obj.boards) && typeof obj.activeId === 'string') {
    const boards = (obj.boards as MoodboardBoard[]).filter(isValidBoard);
    const activeId =
      boards.length > 0 && boards.some((b) => b.id === obj.activeId)
        ? (obj.activeId as string)
        : boards[0]?.id ?? generateId();
    if (boards.length === 0) {
      return { boards: [{ id: activeId, images: [], comments: [], groups: [] }], activeId };
    }
    return { boards, activeId };
  }
  const name = typeof obj.name === 'string' ? obj.name : undefined;
  const images = Array.isArray(obj.images) ? obj.images : [];
  const comments = Array.isArray(obj.comments) ? obj.comments : [];
  const groups = Array.isArray(obj.groups) ? obj.groups : [];
  const viewport = (obj.viewport && typeof obj.viewport === 'object') ? (obj.viewport as MoodboardViewport) : undefined;
  const id = generateId();
  return { boards: [{ id, name, images, comments, groups, viewport }], activeId: id };
}

async function handler(
  req: GroupScopedRequest,
  res: NextApiResponse
) {
  // Ustal groupId: admin może podać ?groupId=, user ma z middleware
  const queryGroupId = req.query.groupId as string | undefined;
  const allGroups = req.isAdmin && req.query.allGroups === '1';
  const groupId = req.isAdmin && queryGroupId ? queryGroupId : req.userGroupId;

  const dir = await getMoodboardDir(groupId);

  if (req.method === 'GET') {
    try {
      if (allGroups) {
        const appState = await loadAllGroupsMoodboardState();
        return res.status(200).json({ success: true, state: appState });
      }

      await fsp.mkdir(dir, { recursive: true });

      let appState = await loadAppStateFromFiles(dir);

      if (!appState) {
        // Legacy migration only for global (no group) moodboard
        if (!groupId) {
          const legacyPath = path.join(dir, LEGACY_STATE_FILENAME);
          try {
            const raw = await fsp.readFile(legacyPath, 'utf8');
            const parsed = JSON.parse(raw) as unknown;
            appState = toAppState(parsed);
            await migrateLegacyToPerFile(dir, appState);
          } catch (legacyErr: unknown) {
            if ((legacyErr as NodeJS.ErrnoException)?.code !== 'ENOENT') {
              throw legacyErr;
            }
          }
        }

        if (!appState) {
          const id = generateId();
          appState = {
            boards: [{ id, images: [], comments: [] }],
            activeId: id,
          };
          await fsp.writeFile(
            path.join(dir, getBoardFilename(id)),
            JSON.stringify(appState.boards[0], null, 2),
            'utf8'
          );
          await fsp.writeFile(
            path.join(dir, INDEX_FILENAME),
            JSON.stringify({ boardIds: [id], activeId: id }, null, 2),
            'utf8'
          );
        }
      }

      return res.status(200).json({ success: true, state: appState });
    } catch (err: unknown) {
      console.error('Moodboard GET error', err);
      return res.status(500).json({ error: 'Błąd odczytu stanu moodboarda' });
    }
  }

  if (req.method === 'POST') {
    try {
      const appState = normalizeAppState(req.body);
      await fsp.mkdir(dir, { recursive: true });

      for (const board of appState.boards) {
        const boardPath = path.join(dir, getBoardFilename(board.id));
        await fsp.writeFile(boardPath, JSON.stringify(board, null, 2), 'utf8');
      }

      const index: MoodboardIndex = {
        boardIds: appState.boards.map((b) => b.id),
        activeId: appState.activeId,
      };
      await fsp.writeFile(
        path.join(dir, INDEX_FILENAME),
        JSON.stringify(index, null, 2),
        'utf8'
      );

      // Notify other SSE clients that board state changed
      sseBroker.broadcast(appState.activeId, 'board:updated', {
        timestamp: Date.now(),
        updatedBy: req.userEmail ?? '',
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Moodboard POST error', err);
      return res.status(500).json({ error: 'Błąd zapisu stanu moodboarda' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withGroupAccess(handler);
