import path from 'path';
import fsp from 'fs/promises';
import { getDataDir } from './dataDir';

/** Zwraca katalog na obrazy moodboardu: /data-storage/moodboard/images */
export async function getMoodboardImagesDir(): Promise<string> {
  const dataDir = await getDataDir();
  return path.join(dataDir, 'moodboard', 'images');
}

/** Dekoduje Data URL do buffera. Zwraca null jeśli format nieprawidłowy. */
export function decodeDataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/\w+;base64,(.+)$/.exec((dataUrl || '').trim());
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
}

/** Zapisuje bufor obrazu jako plik. Zwraca ścieżkę względną (boardId/imageId.webp). */
export async function saveMoodboardImage(
  boardId: string,
  imageId: string,
  buffer: Buffer,
  extension: string = '.webp'
): Promise<string> {
  const baseDir = await getMoodboardImagesDir();
  const boardDir = path.join(baseDir, boardId);
  await fsp.mkdir(boardDir, { recursive: true });
  const filename = `${imageId}${extension}`;
  const filePath = path.join(boardDir, filename);
  await fsp.writeFile(filePath, buffer);
  return `${boardId}/${filename}`;
}

/** Usuwa plik obrazu moodboardu. */
export async function deleteMoodboardImage(
  boardId: string,
  imageId: string
): Promise<void> {
  const baseDir = await getMoodboardImagesDir();
  const boardDir = path.join(baseDir, boardId);

  try {
    const files = await fsp.readdir(boardDir);
    const imageFile = files.find((f) => f.startsWith(imageId + '.'));
    if (imageFile) {
      await fsp.unlink(path.join(boardDir, imageFile));
    }
  } catch {
    // Ignoruj błędy - plik może nie istnieć
  }
}

/** Zwraca ścieżkę absolutną do pliku obrazu lub null jeśli nie istnieje. */
export async function getMoodboardImageAbsolutePath(
  relativePath: string
): Promise<string | null> {
  const baseDir = await getMoodboardImagesDir();
  const fullPath = path.join(baseDir, relativePath);

  // Sprawdź path traversal
  const normalizedBase = path.normalize(baseDir);
  const normalizedFull = path.normalize(fullPath);
  if (!normalizedFull.startsWith(normalizedBase)) {
    return null;
  }

  try {
    await fsp.access(fullPath);
    return fullPath;
  } catch {
    return null;
  }
}

/** Usuwa wszystkie obrazy danego moodboardu (przy usuwaniu całego boardu). */
export async function deleteAllBoardImages(boardId: string): Promise<void> {
  const baseDir = await getMoodboardImagesDir();
  const boardDir = path.join(baseDir, boardId);

  try {
    await fsp.rm(boardDir, { recursive: true, force: true });
  } catch {
    // Ignoruj błędy
  }
}
