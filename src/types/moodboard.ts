/** Element obrazka na moodboardzie */
export interface MoodboardImage {
  id: string;
  /** Data URL (base64) lub URL obrazka */
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

/** Kolor tła komentarza (klucz w palecie) */
export type CommentColorKey =
  | 'yellow'
  | 'pink'
  | 'blue'
  | 'green'
  | 'orange'
  | 'purple';

/** Font komentarza (zachowane dla kompatybilności, używany jest Inter) */
export type CommentFontKey = 'sans' | 'serif' | 'mono';

/** Waga fonta komentarza (Inter) */
export type CommentFontWeightKey = 'normal' | 'medium' | 'semibold' | 'bold';

/** Element komentarza na moodboardzie */
export interface MoodboardComment {
  id: string;
  text: string;
  color: CommentColorKey;
  font: CommentFontKey;
  fontWeight?: CommentFontWeightKey;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface MoodboardState {
  images: MoodboardImage[];
  comments: MoodboardComment[];
}

export const MOODBOARD_STORAGE_KEY = 'moodboard-state';

/** Maksymalny rozmiar pliku obrazka (10 MB) */
export const MOODBOARD_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
