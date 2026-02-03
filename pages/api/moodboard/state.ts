import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fsp from 'fs/promises';
import { getEmailFromCookie } from '@/src/utils/auth';
import type { MoodboardState } from '@/src/types/moodboard';

async function getMoodboardFilePath(): Promise<string> {
  let dataDir: string;
  try {
    await fsp.access('/data-storage');
    dataDir = '/data-storage';
  } catch {
    dataDir = path.join(process.cwd(), 'data');
  }
  return path.join(dataDir, 'moodboard', 'state.json');
}

function normalizeState(body: unknown): MoodboardState {
  const obj = body && typeof body === 'object' ? body : {};
  const images = Array.isArray((obj as { images?: unknown }).images)
    ? (obj as { images: MoodboardState['images'] }).images
    : [];
  const comments = Array.isArray((obj as { comments?: unknown }).comments)
    ? (obj as { comments: MoodboardState['comments'] }).comments
    : [];
  return { images, comments };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const email = getEmailFromCookie(req);
  if (!email) {
    return res.status(401).json({ error: 'Wymagane logowanie' });
  }

  if (req.method === 'GET') {
    try {
      const filePath = await getMoodboardFilePath();
      const raw = await fsp.readFile(filePath, 'utf8');
      const state = JSON.parse(raw) as MoodboardState;
      const normalized: MoodboardState = {
        images: Array.isArray(state.images) ? state.images : [],
        comments: Array.isArray(state.comments) ? state.comments : [],
      };
      return res.status(200).json({ success: true, state: normalized });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return res.status(200).json({
          success: true,
          state: { images: [], comments: [] },
        });
      }
      console.error('Moodboard GET error', err);
      return res.status(500).json({ error: 'Błąd odczytu stanu moodboarda' });
    }
  }

  if (req.method === 'POST') {
    try {
      const state = normalizeState(req.body);
      const filePath = await getMoodboardFilePath();
      const dir = path.dirname(filePath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Moodboard POST error', err);
      return res.status(500).json({ error: 'Błąd zapisu stanu moodboarda' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
