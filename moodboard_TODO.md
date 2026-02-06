# Moodboard - Szkicowanie i rysowanie

**Biblioteka:** react-konva (v19.x) + konva + perfect-freehand
**Koszt:** ~102 kB gzip, MIT, natywne wsparcie React 19

---

## Architektura obecna (kontekst)

- Moodboard to **DOM/CSS infinite canvas** (nie HTML5 Canvas)
- Zoom/pan: CSS `transform: translate() scale()` na kontenerze `.moodboard-canvas-inner`
- Elementy: `MoodboardImage`, `MoodboardComment`, `MoodboardGroup` - pozycjonowane absolutnie
- Stan: `MoodboardContext` z auto-save (localStorage + debounced server POST)
- Pliki: `Canvas.tsx`, `ImageItem.tsx`, `CommentItem.tsx`, `GroupItem.tsx`, `Toolbar.tsx`
- Typy: `src/types/moodboard.ts`
- Context: `src/contexts/MoodboardContext.tsx`

---

## Cel

Dwa tryby rysowania:
1. **Nowy szkic (standalone)** - pusty canvas do rysowania, zachowuje sie jak ImageItem (drag, resize, grupowanie)
2. **Adnotacje na obrazie** - rysowanie po wrzuconym obrazie (overlay na istniejacym MoodboardImage)

Narzedzia: pen (freehand), ksztalty (rect, circle, line), eraser, kolor, grubosc kreski.

---

## Faza 0: Zależności

### 0.1 Instalacja pakietów
```bash
npm install react-konva konva perfect-freehand
```
- `react-konva` v19.x - deklaratywne komponenty Konva dla React 19
- `konva` v10.x - silnik canvas (peer dep react-konva)
- `perfect-freehand` v1.x - algorytm gladkich linii (~2 kB)

### 0.2 Weryfikacja
- [ ] Sprawdzic ze `react-konva` v19 jest kompatybilne z React 19.0.0 z `package.json`
- [ ] Sprawdzic ze `konva` nie wymaga `canvas` polyfill dla SSR (uzywamy `ssr: false` w dynamic import - powinno byc OK)

**Pliki:** `package.json`

---

## Faza 1: Model danych

### 1.1 Nowe typy w `src/types/moodboard.ts`

```typescript
/** Tryb narzedzia rysowania */
export type DrawingTool = 'pen' | 'rect' | 'circle' | 'line' | 'eraser';

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
  width: number;           // rect/circle: rozmiar, line: nie uzywane
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

/** Nowy typ: Standalone sketch na moodboardzie */
export interface MoodboardSketch {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;  // domyslnie bialy
  drawing: DrawingData;
  rotation?: number;
}
```

### 1.2 Rozszerzenie MoodboardImage

Dodac opcjonalne pole `annotations`:

```typescript
export interface MoodboardImage {
  // ... istniejace pola (id, imagePath, url, x, y, width, height, rotation)
  annotations?: DrawingData;  // NOWE: rysunki na obrazie
}
```

### 1.3 Rozszerzenie MoodboardBoard

```typescript
export interface MoodboardBoard {
  // ... istniejace pola
  sketches?: MoodboardSketch[];  // NOWE
}
```

**Pliki do edycji:** `src/types/moodboard.ts`

---

## Faza 2: Context - operacje na szkicach

### 2.1 Nowe metody w MoodboardContextValue

Dodac do interfejsu `MoodboardContextValue` w `src/contexts/MoodboardContext.tsx`:

```typescript
// Sketch CRUD
addSketch: (sketch: Omit<MoodboardSketch, 'id'>) => void;
updateSketch: (id: string, patch: Partial<MoodboardSketch>) => void;
removeSketch: (id: string) => void;

// Adnotacje na obrazie
updateImageAnnotations: (imageId: string, drawing: DrawingData) => void;
clearImageAnnotations: (imageId: string) => void;

// Tryb rysowania (globalny stan)
drawingMode: boolean;
setDrawingMode: (active: boolean) => void;
activeTool: DrawingTool;
setActiveTool: (tool: DrawingTool) => void;
toolColor: string;
setToolColor: (color: string) => void;
toolWidth: number;
setToolWidth: (width: number) => void;
```

### 2.2 Implementacja w MoodboardProvider

Wzorzec identyczny jak istniejace `addImage`/`updateImage`/`removeImage`:
- Immutable update `setAppState(prev => ...)`
- `scheduleSave(next)` po kazdej zmianie
- Sketch memberIds w grupach (rozszerzyc `autoGroupItem`)

### 2.3 Rozszerzenie selectedType

```typescript
selectedType: 'image' | 'comment' | 'group' | 'sketch' | null;
```

### 2.4 Stan narzedzi rysowania

Nowe `useState` w MoodboardProvider:
- `drawingMode: boolean` (domyslnie `false`)
- `activeTool: DrawingTool` (domyslnie `'pen'`)
- `toolColor: string` (domyslnie `'#000000'`)
- `toolWidth: number` (domyslnie `3`)

Gdy `drawingMode === true`:
- Canvas.tsx blokuje pan na klikniecie pustego obszaru
- Pointer events ida do komponentow rysowania zamiast do systemu drag

**Pliki do edycji:** `src/contexts/MoodboardContext.tsx`

---

## Faza 3: Komponent DrawingCanvas (silnik rysowania)

### 3.1 Nowy plik: `src/components/moodboard/DrawingCanvas.tsx`

Wspolny komponent Konva uzywany zarowno przez SketchItem jak i adnotacje na ImageItem.

**Props:**
```typescript
interface DrawingCanvasProps {
  width: number;
  height: number;
  drawing: DrawingData;
  onDrawingChange: (drawing: DrawingData) => void;
  isActive: boolean;         // czy tryb rysowania jest wlaczony
  tool: DrawingTool;
  color: string;
  strokeWidth: number;
  backgroundColor?: string;  // tylko dla standalone sketch
  backgroundImage?: string;  // URL obrazu (dla adnotacji)
}
```

**Struktura Konva:**
```
<Stage width={width} height={height}>
  <Layer>  {/* tlo */}
    {backgroundColor && <Rect fill={backgroundColor} ... />}
    {backgroundImage && <KonvaImage image={imgElement} ... />}
  </Layer>
  <Layer>  {/* narysowane elementy */}
    {drawing.strokes.map(stroke => <StrokePath ... />)}
    {drawing.shapes.map(shape => <ShapeComponent ... />)}
  </Layer>
  <Layer>  {/* aktualnie rysowany element (preview) */}
    {currentStroke && <StrokePath ... />}
    {currentShape && <ShapeComponent ... />}
  </Layer>
</Stage>
```

### 3.2 Freehand z perfect-freehand

Zbieranie punktow w `onPointerMove` -> `getStroke()` z perfect-freehand -> renderowanie jako `<Path>` lub `<Line>`:

```typescript
import { getStroke } from 'perfect-freehand';

// Na kazdym pointermove: dodaj punkt do tablicy
// getStroke(points, { size, thinning, smoothing, streamline })
// Wynik: tablica [x,y] -> konwersja do SVG path -> <Path data={svgPath} />
```

Opcje perfect-freehand:
- `size`: z `toolWidth`
- `thinning: 0.5` (wrazliwosc na nacisk)
- `smoothing: 0.5`
- `streamline: 0.5`

### 3.3 Ksztalty

Rysowanie ksztaltow: pointerdown -> ustaw punkt startowy, pointermove -> preview, pointerup -> zapisz.

- **rect**: `<Rect x y width height stroke fill />`
- **circle**: `<Ellipse x y radiusX radiusY stroke fill />`
- **line**: `<Line points={[x1,y1,x2,y2]} stroke strokeWidth />`

### 3.4 Eraser

Dwa podejscia (wybrac prostsze):

**A) Usuwanie calych stroke'ow (rekomendowane - prostsze):**
- Klikniecie na stroke/shape -> usun z tablicy `drawing.strokes`/`drawing.shapes`
- Konva ma wbudowane hit detection (`onClick` na elementach)

**B) Rysowanie "gumka" (bialym/przezroczystym):**
- Rysuj stroke z `globalCompositeOperation: 'destination-out'`
- Bardziej naturalne ale trudniejsze do cofniecia

Rekomendacja: **podejscie A** (usuwanie obiektow) - prostsze, odwracalne, mniej kodu.

### 3.5 Export do PNG/WebP

```typescript
const stage = stageRef.current;
const dataUrl = stage.toDataURL({ mimeType: 'image/webp', quality: 0.9 });
// Uzywane do: eksportu, generowania miniaturki
```

**Nowe pliki:**
- `src/components/moodboard/DrawingCanvas.tsx`
- `src/components/moodboard/drawing/StrokePath.tsx` (renderowanie stroke z perfect-freehand)
- `src/components/moodboard/drawing/ShapeRenderer.tsx` (renderowanie ksztaltow)

---

## Faza 4: SketchItem (standalone szkic)

### 4.1 Nowy plik: `src/components/moodboard/SketchItem.tsx`

Analogiczny do `ImageItem.tsx`:
- Pozycjonowany absolutnie (`left`, `top`, `width`, `height`)
- Drag gdy `drawingMode === false` (identyczny kod jak ImageItem)
- Resize przez uchwyty narozne (identyczny wzorzec)
- DrawingCanvas renderowany wewnatrz gdy `drawingMode === true`
- Klikniecie wybiela (setSelected)
- Przycisk usuwania (x) gdy zaznaczony
- Auto-grouping (autoGroupItem) po upuszczeniu

**Tryb przelaczania:**
- `drawingMode === false`: item zachowuje sie jak ImageItem (drag, resize, select)
- `drawingMode === true`: klikniecia/ruch ida do DrawingCanvas (rysowanie)

### 4.2 Integracja z Canvas.tsx

W `Canvas.tsx` dodac renderowanie szkicow obok images i comments:

```tsx
{standaloneImages.map(img => <ImageItem ... />)}
{standaloneSketches.map(sk => <SketchItem ... />)}
{standaloneComments.map(c => <CommentItem ... />)}
```

Dodac `sketches` do destrukturyzacji z `useMoodboard()`.
Dodac `sketches` do `allMemberIds`, `standaloneX` memo.

### 4.3 SketchItem w grupach

W petli `groups.map(g => ...)` dodac:
```tsx
{groupSketches.map(sk => <SketchItem ... parentX={g.x} parentY={g.y} />)}
```

**Nowe pliki:** `src/components/moodboard/SketchItem.tsx`
**Pliki do edycji:** `src/components/moodboard/Canvas.tsx`

---

## Faza 5: Adnotacje na obrazach

### 5.1 Rozszerzenie ImageItem.tsx

Gdy obraz jest zaznaczony i `drawingMode === true`:
- Overlay `<DrawingCanvas>` na wierzchu obrazka
- Canvas ma ten sam width/height co obraz
- `pointer-events: auto` na canvasie, obraz pod spodem nie reaguje na klikniecia
- Rysunki zapisywane do `image.annotations`

### 5.2 Przelaczanie trybu na obrazie

Opcja A (rekomendowana): Globalny `drawingMode` wplywane na wszystkie zaznaczone elementy
- Zaznacz obraz -> wlacz drawingMode -> rysuj po nim
- Wylacz drawingMode -> wroc do normalnego trybu (drag/resize)

Opcja B: Przycisk "Rysuj" na zaznaczonym obrazie (jak przycisk usuwania "x")
- Bardziej explicit, ale wiecej UI

Rekomendacja: **Opcja A** - globalny tryb, prostszy UX. Toolbar przelacza tryb.

### 5.3 Wizualne oznaczenie adnotacji

Gdy obraz ma niepuste `annotations`:
- Mala ikonka olowka w rogu obrazu (zawsze widoczna)
- Wskazuje ze obraz ma rysunki

**Pliki do edycji:** `src/components/moodboard/ImageItem.tsx`

---

## Faza 6: Toolbar - narzedzia rysowania

### 6.1 Rozszerzenie Toolbar.tsx

Dodac sekcje narzedzi rysowania. Layout:

```
[Istniejace: + Dodaj komentarz | kolor | waga fonta]
[NOWE: Tryb rysowania ON/OFF]
[NOWE (widoczne gdy drawing ON): Pen | Rect | Circle | Line | Eraser | Kolor | Grubosc | + Nowy szkic]
```

### 6.2 Przelacznik trybu rysowania

Przycisk toggle "Rysowanie" / ikona olowka:
- Wlacza/wylacza `drawingMode` w kontekscie
- Gdy wlaczony: toolbar rozwija dodatkowy rzad z narzedziami
- Gdy wylaczony: narzedzia ukryte, moodboard dziala normalnie

### 6.3 Narzedzia

**Wybor narzedzia** (radio buttons / toggle group):
- Pen (freehand) - domyslne
- Rect
- Circle
- Line
- Eraser

**Kolor kreski:**
- Paleta szybkich kolorow (czarny, czerwony, niebieski, zielony, pomaranczowy, bialy)
- Input `type="color"` dla dowolnego koloru

**Grubosc kreski:**
- Slider 1-20px lub przyciski presetow (1, 3, 5, 10, 20)

**Przycisk "+ Nowy szkic":**
- Tworzy MoodboardSketch na pozycji (100, 100), rozmiar 400x300
- Domyslne biale tlo

### 6.4 Kontekstowe menu rysowania

Rozszerzyc `ContextMenu.tsx` o opcje:
- "Dodaj szkic tutaj" (tworzy sketch na pozycji kursora)
- (Tylko na obrazie z adnotacjami): "Wyczysc adnotacje"

**Pliki do edycji:**
- `src/components/moodboard/Toolbar.tsx`
- `src/components/moodboard/ContextMenu.tsx`

---

## Faza 7: Interakcja - blokowanie pan/drag w trybie rysowania

### 7.1 Canvas.tsx - zmiana handlePointerDown

Gdy `drawingMode === true`:
- Klikniecie na pusty obszar NIE rozpoczyna pan
- Klikniecie na item NIE rozpoczyna drag (drag obslugiwany w ImageItem/SketchItem)
- Scroll (zoom) dziala normalnie (bez zmian)
- Space + drag nadal dziala jako pan (escape hatch)

### 7.2 Kursor

Gdy `drawingMode === true`:
- Kursor: `crosshair` (zamiast domyslnego)
- Na pustym obszarze: `crosshair`
- Na elemencie: `crosshair` (rysuj) zamiast `grab` (drag)

Dodac klase CSS: `.moodboard-canvas--drawing { cursor: crosshair; }`

### 7.3 Skrot klawiszowy

- `D` - toggle drawingMode
- `P` - pen tool
- `R` - rect tool
- `C` - circle tool
- `L` - line tool
- `E` - eraser tool
- `Escape` - wylacz drawingMode

Dodac do istniejacego `onKeyDown` w Canvas.tsx (z warunkiem `!isEditable(e.target)`).

**Pliki do edycji:** `src/components/moodboard/Canvas.tsx`, `styles/globals.css`

---

## Faza 8: Persystencja

### 8.1 Zapis szkicow

Szkice zapisywane jako JSON w `MoodboardBoard.sketches[]` - identyczny flow jak images/comments:
- `scheduleSave` po kazdej zmianie
- localStorage natychmiast
- Server debounced 2.5s

### 8.2 Optymalizacja rozmiaru danych

Stroke'i z perfect-freehand moga generowac duzo punktow. Optymalizacje:
- Redukcja punktow: co N-ty punkt (np. co 3) po zakonczeniu rysowania
- Zaokraglenie do 1 miejsca po przecinku: `Math.round(x * 10) / 10`
- Limit stroke'ow per sketch/obraz (np. 500) z ostrzezeniem

### 8.3 Migracja

Nie potrzebna - nowe pola sa opcjonalne (`sketches?: MoodboardSketch[]`, `annotations?: DrawingData`).
Stare dane laduja sie bez zmian. Nowe pola pojawiaja sie gdy uzytkownik zacznie rysowac.

### 8.4 Server-side: state.ts

`pages/api/moodboard/state.ts` - brak zmian potrzebnych. Endpoint zapisuje caly `MoodboardAppState` jako JSON. Nowe pola (`sketches`, `annotations`) automatycznie sie serializuja/deserializuja.

**Pliki:** Brak dodatkowych zmian (istniejacy flow obsluguje).

---

## Faza 9: CSS / Style

### 9.1 Nowe klasy w globals.css

```css
/* Tryb rysowania */
.moodboard-canvas--drawing { cursor: crosshair; }
.moodboard-canvas--drawing .moodboard-image-item,
.moodboard-canvas--drawing .moodboard-comment-item,
.moodboard-canvas--drawing .moodboard-sketch-item { cursor: crosshair; }

/* SketchItem */
.moodboard-sketch-item { position: absolute; border: 1px dashed #ccc; }
.moodboard-sketch-item--selected { border-color: #3b82f6; }
.moodboard-sketch-item .konvajs-content { pointer-events: auto; }

/* Toolbar - sekcja rysowania */
.moodboard-toolbar-drawing { ... }
.moodboard-toolbar-tool-btn { ... }
.moodboard-toolbar-tool-btn[aria-pressed="true"] { ... }
.moodboard-toolbar-color-input { ... }
.moodboard-toolbar-width-slider { ... }

/* Ikonka adnotacji na obrazie */
.moodboard-image-annotation-badge { ... }

/* Drawing overlay na obrazie */
.moodboard-image-drawing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
}
```

**Pliki do edycji:** `styles/globals.css`

---

## Kolejnosc implementacji

| Krok | Faza | Opis | Zależności |
|------|------|------|-----------|
| 1 | 0 | Instalacja npm | - |
| 2 | 1 | Typy danych | - |
| 3 | 2 | Context (metody CRUD + stan narzedzi) | Faza 1 |
| 4 | 3 | DrawingCanvas (silnik rysowania) | Faza 0, 1 |
| 5 | 4 | SketchItem + integracja Canvas.tsx | Faza 2, 3 |
| 6 | 6 | Toolbar - narzedzia | Faza 2 |
| 7 | 7 | Blokowanie pan/drag + kursor + skroty | Faza 2 |
| 8 | 5 | Adnotacje na obrazach | Faza 3, 7 |
| 9 | 9 | CSS/Style | Faza 4, 5, 6 |
| 10 | 8 | Optymalizacja persystencji | Faza 4, 5 |

---

## Nowe pliki (do utworzenia)

```
src/components/moodboard/DrawingCanvas.tsx        # silnik Konva
src/components/moodboard/SketchItem.tsx            # standalone szkic
src/components/moodboard/drawing/StrokePath.tsx    # renderowanie freehand stroke
src/components/moodboard/drawing/ShapeRenderer.tsx # renderowanie ksztaltow
```

## Istniejace pliki (do edycji)

```
src/types/moodboard.ts                            # nowe typy
src/contexts/MoodboardContext.tsx                  # CRUD sketch, stan narzedzi
src/components/moodboard/Canvas.tsx                # renderowanie sketches, tryb rysowania
src/components/moodboard/ImageItem.tsx             # overlay adnotacji
src/components/moodboard/Toolbar.tsx               # narzedzia rysowania
src/components/moodboard/ContextMenu.tsx           # "Dodaj szkic tutaj"
styles/globals.css                                 # style rysowania
```

---

## Ryzyka i uwagi

1. **Wydajnosc**: Konva Stage per-item moze byc ciezkie przy wielu szkicach. Rozwiazanie: lazy mount (renderuj Stage tylko gdy widoczny w viewport).

2. **Wspolrzedne**: Konva Stage jest wewnatrz CSS-transformed containera. Zdarzenia pointer dzialaja poprawnie (przeglądarka transformuje wspolrzedne), ale `stage.toDataURL()` eksportuje w oryginalnej skali (bez zoom) - to jest pozadane zachowanie.

3. **Touch/stylus**: Konva obsluguje touch events natywnie. `perfect-freehand` przyjmuje pressure z PointerEvent - dziala z rysikiem.

4. **SSR**: Konva wymaga DOM. Juz teraz Canvas jest ladowany z `ssr: false` w `pages/moodboard.tsx` - brak problemu.

5. **Rozmiar danych**: Dlugie sesje rysowania moga generowac duzy JSON. Monitoring: logowac rozmiar stanu przy zapisie, ostrzec > 5 MB.

6. **Undo/Redo**: Nie jest w scope tego etapu. Mozna dodac pozniej (stos operacji). Na razie: eraser (usuwanie obiektow) jako namiastka cofania.
