/** Tryb narzedzia rysowania */
export type DrawingTool = 'pen' | 'rect' | 'circle' | 'line' | 'eraser';

/** Konfiguracja paska rysowania (narzędzia, kolory, grubości) – domyślna lub dla grupy */
export interface MoodboardDrawingConfig {
  /** Dostępne narzędzia w kolejności wyświetlania */
  tools: DrawingTool[];
  /** Dostępne kolory obrysu (hex) */
  strokeColors: string[];
  /** Dostępne grubości linii (px) */
  strokeWidths: number[];
  /** Domyślne narzędzie przy wejściu w tryb rysowania (opcjonalne) */
  defaultTool?: DrawingTool;
  /** Domyślny kolor (opcjonalne) */
  defaultColor?: string;
  /** Domyślna grubość (opcjonalne) */
  defaultWidth?: number;
}

/** Pełna konfiguracja paska rysowania: domyślna + nadpisania per grupa */
export interface MoodboardDrawingConfigMap {
  default: MoodboardDrawingConfig;
  byGroup: Record<string, MoodboardDrawingConfig>;
}

/** Domyślna konfiguracja paska rysowania (zgodna z obecnym Toolbar) */
export const DEFAULT_MOODBOARD_DRAWING_CONFIG: MoodboardDrawingConfig = {
  tools: ['pen', 'rect', 'circle', 'line', 'eraser'],
  strokeColors: ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f97316', '#ffffff'],
  strokeWidths: [1, 3, 5, 10, 20],
  defaultTool: 'pen',
  defaultColor: '#000000',
  defaultWidth: 3,
};

/** Pojedyncza kreska (freehand lub eraser) */
export interface MoodboardStroke {
  id: string;
  tool: 'pen' | 'eraser';
  points: number[];       // flat array [x1,y1,pressure1, x2,y2,pressure2, ...]
  color: string;           // hex
  width: number;           // px
}

/** Ksztalt geometryczny */
export interface MoodboardDrawShape {
  id: string;
  type: 'rect' | 'circle' | 'line';
  x: number;
  y: number;
  width: number;           // rect/circle: rozmiar
  height: number;
  endX?: number;           // line: punkt koncowy
  endY?: number;
  stroke: string;          // kolor obrysu
  strokeWidth: number;
  fill?: string;           // kolor wypelnienia (opcjonalny)
}

/** Dane rysunku (wspolne dla standalone sketch i adnotacji na obrazie) */
export interface DrawingData {
  strokes: MoodboardStroke[];
  shapes: MoodboardDrawShape[];
}

/** Standalone sketch na moodboardzie */
export interface MoodboardSketch {
  id: string;
  name?: string;             // nazwa szkicu (jak grupa)
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;  // domyslnie bialy
  drawing: DrawingData;
  rotation?: number;
}

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
  annotations?: DrawingData;
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

/** Widok (zoom i pozycja) moodboardu */
export interface MoodboardViewport {
  scale: number;
  translateX: number;
  translateY: number;
}

/** Pojedyncza tablica moodboard (jedna zakładka) */
export interface MoodboardBoard {
  id: string;
  name?: string;
  /** ID grupy (dla oznakowania kolorem w widoku admina) */
  groupId?: string;
  images: MoodboardImage[];
  comments: MoodboardComment[];
  groups?: MoodboardGroup[];
  sketches?: MoodboardSketch[];
  viewport?: MoodboardViewport;
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
