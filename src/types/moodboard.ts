/** Element obrazka na moodboardzie */
export interface MoodboardImage {
  id: string;
  /** Ścieżka do pliku obrazu: boardId/imageId.webp */
  imagePath?: string;
  /** DEPRECATED: Data URL (base64) - tylko dla migracji starych danych */
  url?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

/** Kolor tła komentarza (klucz w palecie); 'none' = bez tła (sam tekst) */
export type CommentColorKey =
  | 'none'
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
  fontColor?: string;    // kolor tekstu (domyślnie #000)
  fontSize?: number;     // rozmiar fontu w px (domyślnie 16)
  bgColor?: string;      // kolor tła (hex, domyślnie z puli color)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

/** Grupa elementów na moodboardzie */
export interface MoodboardGroup {
  id: string;
  name: string;
  color?: string;        // kolor tła grupy (opcjonalny)
  x: number;
  y: number;
  width: number;
  height: number;
  memberIds: string[];   // ID obrazków i komentarzy w grupie
  labelSize?: number;    // rozmiar etykiety grupy
  labelColor?: string;   // kolor tekstu etykiety
}

/** Pojedyncza tablica moodboard (jedna zakładka) */
export interface MoodboardBoard {
  id: string;
  name?: string;
  images: MoodboardImage[];
  comments: MoodboardComment[];
  groups?: MoodboardGroup[];
}

/** Stan pojedynczego moodboarda (legacy / wewnętrzny) */
export interface MoodboardState {
  name?: string;
  images: MoodboardImage[];
  comments: MoodboardComment[];
}

/** Pełny stan aplikacji moodboard: wiele tablic, aktywna na środku */
export interface MoodboardAppState {
  boards: MoodboardBoard[];
  activeId: string;
}

export const MOODBOARD_STORAGE_KEY = 'moodboard-state';

/** Maksymalny rozmiar pliku obrazka (10 MB) */
export const MOODBOARD_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
