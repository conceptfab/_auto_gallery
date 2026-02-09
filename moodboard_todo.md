# Moodboard - Optymalizacja wydajności

## Stan obecny (problemy)

| Obszar | Stan | Wpływ |
|--------|------|-------|
| Obrazy | Pełna rozdzielczość (do 10MB), brak thumbnailów, brak lazy loading | WYSOKI |
| Renderowanie | Wszystkie elementy renderowane (brak wirtualizacji) | WYSOKI |
| Rysowanie | perfect-freehand przelicza co klatkę, 60 update'ów/s | WYSOKI |
| State | localStorage.setItem synchronicznie przy każdej zmianie | ŚREDNI |
| Context | Każda zmiana → re-render WSZYSTKICH konsumentów MoodboardContext | ŚREDNI |
| Sieć | Obrazy przez API route (nie statyczne), upload jako base64 JSON (+33% rozmiaru) | ŚREDNI |

---

## 1. OBRAZY - resize do 2000px + thumbnails

### 1a. Resize przy uploadzie (PRIORYTET WYSOKI)
- **Gdzie**: `pages/api/moodboard/upload.ts`
- **Co**: Po zapisaniu pliku, użyć `sharp` do resize:
  - Max wymiar: **2000px** (dłuższy bok), zachowując proporcje
  - Format: WebP, quality 85 (obecne pliki już w WebP)
  - Thumbnail: dodatkowy plik `{imageId}_thumb.webp` → **400px**, quality 70
- **Efekt**: Obraz 4000×3000 (8MB) → 2000×1500 (~300KB) + thumb 400×300 (~20KB)
- **Migracja**: Skrypt jednorazowy do resize istniejących plików w `data/moodboard/images/`

### 1b. Lazy loading obrazów (PRIORYTET WYSOKI)
- **Gdzie**: `src/components/moodboard/ImageItem.tsx` linia ~295
- **Co**:
  - Dodać `loading="lazy"` na `<img>` (natywne lazy loading)
  - LUB Intersection Observer: ładuj obraz dopiero gdy w viewport
  - Wyświetlaj thumbnail do momentu wejścia w viewport / zoom > 0.5
- **Efekt**: Board ze 100 obrazami → ładuje 5-10 widocznych zamiast 100

### 1c. Progresywne ładowanie
- Pokaż thumbnail natychmiast → podmień na pełny obraz po załadowaniu
- Opcjonalnie: blur placeholder (LQIP) z base64 ~1KB wbudowanego w JSON boarda

---

## 2. CACHE / szybsze ładowanie

### 2a. Debounce localStorage (PRIORYTET ŚREDNI)
- **Gdzie**: `src/contexts/MoodboardContext.tsx` linia ~305
- **Co**: Zamiast `localStorage.setItem()` przy KAŻDEJ zmianie stanu:
  - Throttle do max 1x/sekundę
  - Użyć `requestIdleCallback` żeby nie blokować UI
- **Efekt**: Brak mikro-freezów podczas przeciągania elementów

### 2b. IndexedDB zamiast localStorage dla dużych boardów
- localStorage limit: ~5-10MB
- Board z 100+ elementami → 100KB+ JSON
- IndexedDB: asynchroniczne zapisy, brak limitu rozmiaru
- Biblioteka: `idb-keyval` (2KB, prosty wrapper)

### 2c. SWR / React Query dla API
- Automatyczna deduplikacja requestów
- Background revalidation
- Stale-while-revalidate pattern
- Optimistic updates

### 2d. Prefetching obrazów
- Podczas idle: prefetchuj obrazy sąsiadujące z widocznym viewport
- `new Image().src = url` w `requestIdleCallback`

---

## 3. RYSOWANIE - szybsze efekty

### 3a. Throttle aktualizacji stanu rysowania (PRIORYTET WYSOKI)
- **Gdzie**: `src/components/moodboard/DrawingCanvas.tsx` linia ~198-325
- **Co**:
  - Zamiast `setCurrentStroke()` co pointermove (60/s):
  - Akumuluj punkty w `useRef` arrayu
  - Flushuj do stanu w `requestAnimationFrame` (max 1x/frame)
  - Redukuje: 60 re-renderów → 1 re-render per frame
- **Efekt**: Płynniejsze rysowanie, mniej GC pressure

### 3b. Memoizacja perfect-freehand (PRIORYTET WYSOKI)
- **Gdzie**: `src/components/moodboard/StrokePath.tsx`
- **Co**:
  - `getStroke()` wywoływany przy KAŻDYM renderze
  - Cachuj wynik w `useMemo` z zależnością od punktów i parametrów
  - Dla zakończonych kresek: oblicz raz i zapisz gotowy SVG path w stanie
- **Efekt**: Zakończone kreski → 0 obliczeń przy re-renderze

### 3c. Offscreen rendering preview
- Podczas rysowania: renderuj preview na osobnym `<canvas>` (nie Konva)
- Po zakończeniu kreski → konwertuj do Konva Path
- Natywne Canvas API 5-10x szybsze niż Konva SVG Path

### 3d. Web Worker dla perfect-freehand (PRZYSZŁOŚĆ)
- Przeniesienie `getStroke()` do Web Workera
- Worker przetwarza punkty → zwraca gotowy SVG path
- Main thread nie blokowany obliczeniami
- Wymaga `OffscreenCanvas` (nie wspierany w Safari < 16.4)

---

## 4. WIRTUALIZACJA renderowania (PRIORYTET WYSOKI)

### 4a. Viewport culling
- **Gdzie**: `src/components/moodboard/Canvas.tsx` linia ~670-689
- **Co**:
  - Oblicz bounding box widocznego viewport na podstawie zoom/pan
  - Filtruj elementy: renderuj tylko te w viewport + margines 200px
  - `useMemo` z zależnością od viewport + items
- **Pseudokod**:
  ```ts
  const visibleImages = useMemo(() => {
    const vp = getViewportBounds(viewport, containerSize);
    return images.filter(img => intersects(img, vp));
  }, [images, viewport, containerSize]);
  ```
- **Efekt**: 100 elementów na boardzie, widocznych 10 → renderuje 10

### 4b. Level-of-Detail (LOD)
- Przy zoom < 0.3: pokaż thumbnails zamiast pełnych obrazów
- Przy zoom < 0.15: pokaż kolorowe prostokąty (placeholdery) zamiast obrazów
- Przy zoom > 1.5: ładuj pełną rozdzielczość

### 4c. Spatial indexing (PRZYSZŁOŚĆ)
- Quadtree / R-tree do szybkiego wyszukiwania elementów w viewport
- Potrzebne przy 500+ elementach
- Biblioteka: `rbush` (3KB, szybki R-tree)

---

## 5. CONTEXT / STATE (PRIORYTET ŚREDNI)

### 5a. Rozdzielenie kontekstów
- **Gdzie**: `src/contexts/MoodboardContext.tsx`
- **Co**: Zamiast jednego MoodboardContext → podziel na:
  - `MoodboardDataContext` – images, comments, sketches, groups (rzadkie zmiany)
  - `MoodboardViewportContext` – zoom, pan (zmienia się ciągle)
  - `MoodboardSelectionContext` – zaznaczenie, narzędzie (zmienia się często)
  - `MoodboardDrawingContext` – stan rysowania (zmienia się co klatkę)
- **Efekt**: Zmiana zoom → nie re-renderuje ImageItem; rysowanie → nie re-renderuje grup

### 5b. Normalizacja stanu
- Zamiast `images: MoodboardImage[]` → `imagesById: Record<string, MoodboardImage>`
- Zamiast `group.memberIds.includes(img.id)` O(n²) → `imageGroupMap: Record<imageId, groupId>` O(1)
- Efekt: szybsze wyszukiwanie i mniejsze koszty re-renderów

---

## 6. SIEĆ (PRIORYTET NISKI)

### 6a. Upload przez FormData zamiast base64 JSON
- Obecne: plik → DataURL (base64) → JSON body (+33% rozmiaru)
- Lepsze: plik → FormData (binary) → multipart upload
- Efekt: 10MB plik wysyłany jako 10MB zamiast 13.3MB

### 6b. Kompresja HTTP
- Włączyć gzip/brotli w next.config.js dla JSON responses
- Obrazy WebP już skompresowane (brak zysku)

### 6c. Next.js Image component (OPCJONALNIE)
- Zamienić `<img>` na `<Image>` z next/image
- Automatyczne: srcset, lazy loading, WebP, blur placeholder
- Wymaga konfiguracji `remotePatterns` dla lokalnych ścieżek

---

## Kolejność wdrożenia (rekomendacja)

### Faza 1 - Quick wins (1-2 dni)
1. **Resize obrazów do 2000px** przy uploadzie (`sharp`)
2. **Lazy loading** na `<img>` (`loading="lazy"`)
3. **Throttle rysowania** przez `requestAnimationFrame`
4. **Memoizacja** `getStroke()` w StrokePath

### Faza 2 - Core perf (2-3 dni)
5. **Viewport culling** - renderuj tylko widoczne elementy
6. **Thumbnails** - generuj przy uploadzie, używaj przy zoom < 0.5
7. **Debounce localStorage** - throttle 1s + requestIdleCallback
8. **Progresywne ładowanie** obrazów (thumb → full)

### Faza 3 - Architecture (3-5 dni)
9. **Rozdzielenie kontekstów** (viewport/selection/data/drawing)
10. **Upload przez FormData**
11. **LOD rendering** (różne detale przy różnym zoomie)
12. **Normalizacja stanu** (Map zamiast Array)

### Faza 4 - Advanced (przyszłość)
13. **Web Worker** dla perfect-freehand
14. **Spatial indexing** (rbush/quadtree)
15. **IndexedDB** zamiast localStorage
16. **Service Worker** + offline mode
