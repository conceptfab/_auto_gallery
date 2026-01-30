# Propozycje UX - Galeria 4K

## Spis treści
1. [Sekwencyjne ładowanie obrazów](#1-sekwencyjne-ładowanie-obrazów)
2. [System cache i detekcja zmian](#2-system-cache-i-detekcja-zmian)
3. [Delikatne animacje UI](#3-delikatne-animacje-ui)
4. [Optymalizacja dla 4K](#4-optymalizacja-dla-4k)
5. [Plan implementacji](#5-plan-implementacji)

---

## 1. Sekwencyjne ładowanie obrazów

### Priorytet: foldery specjalne

**W pierwszej kolejności** mają być pobierane pliki z **folderów specjalnych** (np. `Kolorystyka/decors`). Dla tych zasobów:

- **Inteligentne buforowanie** — treści z folderów specjalnych są buforowane z wyższym priorytetem i dłuższym czasem życia w cache, tak aby powtórny dostęp był natychmiastowy.
- **Miniaturki we wszystkich wymaganych rozmiarach** — dla każdego pliku z folderów specjalnych generowane są miniatureki we wszystkich rozmiarach używanych w UI (np. siatka, podgląd, modal), aby uniknąć opóźnień i przeładowań przy zmianie widoku.
- **Cel:** maksymalnie **płynne UI** — użytkownik nie powinien czekać na treści z folderów specjalnych; mają być dostępne od razu po wejściu w dany kontekst.

Implementacja (lista folderów specjalnych, polityka cache, zestaw rozmiarów miniaturek) powinna być konfigurowalna.

### Problem
Obecnie obrazy ładują się losowo (zależy od szybkości odpowiedzi serwera dla każdego pliku), co tworzy chaotyczne wrażenie wizualne.

### Rozwiązanie: Waterfall Loading Pattern

```
┌─────────────────────────────────────────────────────────┐
│  FAZA 0: Foldery specjalne (np. Kolorystyka/decors)     │
│  ├─ Pobierz pliki z folderów specjalnych w pierwszej   │
│  │   kolejności                                        │
│  ├─ Inteligentne buforowanie (wyższy priorytet cache)  │
│  └─ Miniaturki we wszystkich wymaganych rozmiarach     │
│      → maksymalnie płynne UI                            │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  FAZA 1: Prefetch metadata                              │
│  ├─ Pobierz listę plików z API                         │
│  ├─ Posortuj według pozycji w gridzie                  │
│  └─ Oblicz widoczne elementy (viewport)                │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  FAZA 2: Priority Queue Loading                         │
│  ├─ Viewport-first (widoczne na ekranie)               │
│  ├─ Above-fold priority (pierwszy rząd)                │
│  └─ Sequential reveal (lewy→prawy, góra→dół)           │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  FAZA 3: Background prefetch                            │
│  ├─ Kolejne rzędy (below fold)                         │
│  └─ Pełne rozdzielczości (dla modalu)                  │
└─────────────────────────────────────────────────────────┘
```

### Implementacja: `useSequentialImageLoader` hook

```typescript
// src/hooks/useSequentialImageLoader.ts

interface LoadingState {
  loaded: Set<string>;
  loading: Set<string>;
  failed: Set<string>;
}

interface UseSequentialImageLoaderOptions {
  images: ImageFile[];
  columnsPerRow: number;       // Obliczane z szerokości viewportu
  batchSize?: number;          // Ile obrazów ładować jednocześnie (default: 4)
  delayBetweenBatches?: number; // Delay między partiami (default: 50ms)
  prioritizeViewport?: boolean; // Czy priorytetyzować widoczne (default: true)
}

export function useSequentialImageLoader({
  images,
  columnsPerRow,
  batchSize = 4,
  delayBetweenBatches = 50,
  prioritizeViewport = true,
}: UseSequentialImageLoaderOptions) {
  const [loadingState, setLoadingState] = useState<LoadingState>({
    loaded: new Set(),
    loading: new Set(),
    failed: new Set(),
  });

  // 1. Sortuj obrazy według pozycji w gridzie (row-major order)
  const sortedImages = useMemo(() => {
    return [...images].map((img, originalIndex) => ({
      ...img,
      gridPosition: originalIndex, // Zachowaj oryginalną pozycję
      row: Math.floor(originalIndex / columnsPerRow),
      col: originalIndex % columnsPerRow,
    }));
  }, [images, columnsPerRow]);

  // 2. Twórz kolejkę priorytetową
  const loadQueue = useMemo(() => {
    return sortedImages.sort((a, b) => {
      // Priorytet: najpierw wiersze, potem kolumny
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
  }, [sortedImages]);

  // 3. Ładuj sekwencyjnie w partiach
  useEffect(() => {
    let cancelled = false;

    const loadBatch = async (startIndex: number) => {
      if (cancelled) return;

      const batch = loadQueue.slice(startIndex, startIndex + batchSize);
      if (batch.length === 0) return;

      // Oznacz jako ładujące się
      setLoadingState(prev => ({
        ...prev,
        loading: new Set([...prev.loading, ...batch.map(img => img.url)]),
      }));

      // Preload każdy obraz
      await Promise.all(
        batch.map(img => preloadImage(img.url))
          .map(p => p.catch(() => null)) // Nie przerywaj przy błędach
      );

      if (cancelled) return;

      // Oznacz jako załadowane
      setLoadingState(prev => ({
        ...prev,
        loaded: new Set([...prev.loaded, ...batch.map(img => img.url)]),
        loading: new Set([...prev.loading].filter(url => !batch.find(img => img.url === url))),
      }));

      // Ładuj następną partię z opóźnieniem
      setTimeout(() => loadBatch(startIndex + batchSize), delayBetweenBatches);
    };

    loadBatch(0);
    return () => { cancelled = true; };
  }, [loadQueue, batchSize, delayBetweenBatches]);

  return {
    isLoaded: (url: string) => loadingState.loaded.has(url),
    isLoading: (url: string) => loadingState.loading.has(url),
    loadingProgress: loadingState.loaded.size / images.length,
  };
}

// Helper do preloadowania obrazu
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
}
```

### Zmiany w ImageGrid.tsx

```typescript
// Dodaj do ImageGrid.tsx

const ImageGrid: React.FC<ImageGridProps> = ({ images, ... }) => {
  // Oblicz liczbę kolumn na podstawie szerokości
  const [columnsPerRow, setColumnsPerRow] = useState(4);

  useEffect(() => {
    const calculateColumns = () => {
      const gridWidth = document.querySelector('.image-grid')?.clientWidth || 1200;
      const minColumnWidth = 280; // z CSS: minmax(280px, 1fr)
      setColumnsPerRow(Math.floor(gridWidth / minColumnWidth) || 1);
    };

    calculateColumns();
    window.addEventListener('resize', calculateColumns);
    return () => window.removeEventListener('resize', calculateColumns);
  }, []);

  const { isLoaded, isLoading, loadingProgress } = useSequentialImageLoader({
    images,
    columnsPerRow,
    batchSize: columnsPerRow, // Ładuj cały rząd naraz
    delayBetweenBatches: 100,
  });

  return (
    <div className="image-grid">
      {images.map((image, index) => (
        <ImageItem
          key={image.url}
          image={image}
          isVisible={isLoaded(image.url)}
          isLoading={isLoading(image.url)}
          animationDelay={index % columnsPerRow * 50} // Staggered delay w rzędzie
          // ... reszta props
        />
      ))}
    </div>
  );
};
```

---

## 2. System cache i detekcja zmian

### Problem
- Obecny cache (Redis, 5min TTL) nie wykrywa zmian w folderach
- Pliki 4K są ciężkie - wielokrotne pobieranie jest kosztowne
- Brak lokalnego cache w przeglądarce

### Rozwiązanie: Multi-level Cache + Change Detection

```
┌───────────────────────────────────────────────────────────────┐
│                    SYSTEM CACHE 3-POZIOMOWY                   │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  POZIOM 1: Browser Memory Cache (najszybszy)                 │
│  ├─ Map<url, Blob> dla thumbnails                            │
│  ├─ Limit: 100MB                                             │
│  └─ Eviction: LRU (Least Recently Used)                      │
│                                                               │
│  POZIOM 2: IndexedDB (persistent, duży)                      │
│  ├─ Thumbnails: 150x150px WebP                               │
│  ├─ Metadata: fileHash, lastModified, dimensions             │
│  └─ Limit: 500MB (konfigurowalny)                            │
│                                                               │
│  POZIOM 3: Redis/Server Cache (współdzielony)                │
│  ├─ Struktura folderów + manifest                            │
│  ├─ ETag na podstawie hash zawartości                        │
│  └─ TTL: 5min (z rewalidacją)                                │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Detekcja zmian w folderach

```typescript
// src/utils/folderChangeDetection.ts

interface FolderManifest {
  folderPath: string;
  lastChecked: number;
  fileCount: number;
  totalSize: number;
  contentHash: string;  // SHA256 z listy plików + rozmiarów
  files: Array<{
    name: string;
    size: number;
    lastModified: number;
  }>;
}

// API endpoint: /api/folder-manifest
export async function getFolderManifest(folderPath: string): Promise<FolderManifest> {
  // Serwer oblicza hash na podstawie:
  // 1. Listy nazw plików (posortowanej)
  // 2. Rozmiarów plików
  // 3. Dat modyfikacji

  const files = await scanDirectory(folderPath);
  const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name));

  const hashInput = sortedFiles
    .map(f => `${f.name}:${f.size}:${f.lastModified}`)
    .join('|');

  return {
    folderPath,
    lastChecked: Date.now(),
    fileCount: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    contentHash: sha256(hashInput),
    files: sortedFiles,
  };
}

// Frontend: sprawdź czy cache jest aktualny
export async function isCacheValid(
  folderPath: string,
  cachedManifest: FolderManifest | null
): Promise<{ valid: boolean; newManifest?: FolderManifest }> {
  if (!cachedManifest) {
    return { valid: false };
  }

  // Quick check: tylko pobierz hash (lekkie zapytanie)
  const response = await fetch(`/api/folder-hash?path=${encodeURIComponent(folderPath)}`);
  const { hash } = await response.json();

  if (hash === cachedManifest.contentHash) {
    return { valid: true };
  }

  // Hash się zmienił - pobierz nowy manifest
  const newManifest = await getFolderManifest(folderPath);
  return { valid: false, newManifest };
}
```

### IndexedDB Cache dla thumbnails

```typescript
// src/utils/thumbnailCache.ts

const DB_NAME = 'GalleryThumbnailCache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB

interface CachedThumbnail {
  url: string;
  blob: Blob;
  originalUrl: string;
  cachedAt: number;
  lastAccessed: number;
  size: number;
}

class ThumbnailCache {
  private db: IDBDatabase | null = null;
  private memoryCache = new Map<string, Blob>();
  private memoryCacheSize = 0;
  private readonly MAX_MEMORY_CACHE = 100 * 1024 * 1024; // 100MB

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('lastAccessed', 'lastAccessed');
          store.createIndex('cachedAt', 'cachedAt');
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async get(url: string): Promise<Blob | null> {
    // 1. Sprawdź memory cache
    if (this.memoryCache.has(url)) {
      return this.memoryCache.get(url)!;
    }

    // 2. Sprawdź IndexedDB
    if (!this.db) return null;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CachedThumbnail | undefined;
        if (result) {
          // Dodaj do memory cache
          this.addToMemoryCache(url, result.blob);
          // Aktualizuj lastAccessed
          this.updateLastAccessed(url);
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    });
  }

  async set(url: string, blob: Blob, originalUrl: string): Promise<void> {
    // Dodaj do memory cache
    this.addToMemoryCache(url, blob);

    // Zapisz do IndexedDB
    if (!this.db) return;

    const entry: CachedThumbnail = {
      url,
      blob,
      originalUrl,
      cachedAt: Date.now(),
      lastAccessed: Date.now(),
      size: blob.size,
    };

    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);

    // Sprawdź rozmiar cache i wyczyść jeśli potrzeba
    await this.evictIfNeeded();
  }

  private addToMemoryCache(url: string, blob: Blob): void {
    if (this.memoryCacheSize + blob.size > this.MAX_MEMORY_CACHE) {
      // Usuń najstarsze wpisy (LRU)
      const entries = [...this.memoryCache.entries()];
      while (this.memoryCacheSize + blob.size > this.MAX_MEMORY_CACHE && entries.length > 0) {
        const [oldUrl, oldBlob] = entries.shift()!;
        this.memoryCache.delete(oldUrl);
        this.memoryCacheSize -= oldBlob.size;
      }
    }

    this.memoryCache.set(url, blob);
    this.memoryCacheSize += blob.size;
  }

  private async evictIfNeeded(): Promise<void> {
    // Implementacja LRU eviction dla IndexedDB
    // Usuń najstarsze wpisy gdy przekroczono limit
  }
}

export const thumbnailCache = new ThumbnailCache();
```

---

## 3. Delikatne animacje UI

### Zasady animacji
- **Subtle** - ledwo zauważalne, ale poprawiające odczucia
- **Purposeful** - każda animacja ma cel (feedback, orientacja, płynność)
- **Performant** - tylko `transform` i `opacity` (GPU accelerated)
- **Reducible** - respektuj `prefers-reduced-motion`

### Animacje CSS

```css
/* styles/animations.css - do dodania do globals.css */

/* ============================================
   SECTION: UX ANIMATIONS
   ============================================ */

/* Respektuj preferencje użytkownika */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* 1. Fade-in dla obrazów (sekwencyjne ładowanie) */
@keyframes image-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.image-item {
  opacity: 0;
  will-change: opacity, transform;
}

.image-item.is-visible {
  animation: image-fade-in 0.3s ease-out forwards;
}

/* Staggered delay - nadawany inline przez JS */
.image-item.is-visible {
  animation-delay: var(--stagger-delay, 0ms);
}

/* 2. Skeleton loading placeholder */
@keyframes skeleton-shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.image-skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.05) 25%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.05) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}

/* 3. Hover effects - ulepszone */
.image-container {
  transition:
    transform 0.2s ease-out,
    box-shadow 0.2s ease-out;
}

.image-container:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.image-container:active {
  transform: translateY(0);
  transition-duration: 0.1s;
}

/* 4. Folder expand/collapse */
@keyframes folder-expand {
  from {
    opacity: 0;
    max-height: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    max-height: 2000px;
    transform: translateY(0);
  }
}

@keyframes folder-collapse {
  from {
    opacity: 1;
    max-height: 2000px;
  }
  to {
    opacity: 0;
    max-height: 0;
  }
}

.folder-content {
  overflow: hidden;
}

.folder-content.is-expanding {
  animation: folder-expand 0.3s ease-out forwards;
}

.folder-content.is-collapsing {
  animation: folder-collapse 0.2s ease-in forwards;
}

/* 5. Button press feedback */
.image-action-button {
  transition:
    transform 0.15s ease-out,
    opacity 0.15s ease-out;
}

.image-action-button:hover {
  transform: scale(1.1);
}

.image-action-button:active {
  transform: scale(0.95);
  transition-duration: 0.05s;
}

/* 6. Modal open/close */
@keyframes modal-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modal-content-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-backdrop {
  animation: modal-backdrop-in 0.2s ease-out;
}

.modal-content {
  animation: modal-content-in 0.25s ease-out;
}

/* 7. Loading progress bar - płynniejsza */
.loading-progress-bar {
  transition: width 0.15s ease-out;
  transform-origin: left;
}

/* 8. Scroll indicator fade */
.scroll-to-top {
  opacity: 0;
  transform: translateY(10px);
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
  pointer-events: none;
}

.scroll-to-top.is-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* 9. Toast notifications */
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(100%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-20px) scale(0.9);
  }
}

.toast {
  animation: toast-in 0.3s ease-out;
}

.toast.is-exiting {
  animation: toast-out 0.2s ease-in forwards;
}

/* 10. Color preview tooltip - ulepszone */
.color-preview {
  animation: preview-in 0.15s ease-out;
}

@keyframes preview-in {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

### Implementacja w React

```typescript
// src/components/AnimatedImageItem.tsx

interface AnimatedImageItemProps {
  image: ImageFile;
  isVisible: boolean;
  isLoading: boolean;
  staggerIndex: number;
  columnsPerRow: number;
  // ... reszta props
}

const AnimatedImageItem: React.FC<AnimatedImageItemProps> = ({
  image,
  isVisible,
  isLoading,
  staggerIndex,
  columnsPerRow,
  ...props
}) => {
  // Oblicz delay na podstawie pozycji w rzędzie
  const rowIndex = Math.floor(staggerIndex / columnsPerRow);
  const colIndex = staggerIndex % columnsPerRow;
  const staggerDelay = colIndex * 50; // 50ms między kolumnami w rzędzie

  return (
    <div
      className={cn('image-item', {
        'is-visible': isVisible,
        'is-loading': isLoading,
      })}
      style={{
        '--stagger-delay': `${staggerDelay}ms`,
      } as React.CSSProperties}
    >
      {isLoading && !isVisible && (
        <div className="image-skeleton" style={{ aspectRatio: '4/3' }} />
      )}

      <div
        className="image-container"
        style={{ display: isVisible ? 'block' : 'none' }}
      >
        <img
          src={getOptimizedImageUrl(image, 'thumb')}
          alt={image.name}
          className="gallery-image"
        />
      </div>

      {/* ... reszta komponentu */}
    </div>
  );
};
```

---

## 4. Optymalizacja dla 4K

### Problem
- Pliki 4K (3840x2160) = ~5-15MB każdy
- Obecne rozwiązanie: brak thumbnail generation na serwerze
- Image proxy tylko przekierowuje do oryginału

### Rozwiązanie: On-demand Thumbnail Generation

```
┌─────────────────────────────────────────────────────────────┐
│                    THUMBNAIL PIPELINE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  REQUEST: /api/thumbnail?url=...&size=thumb                │
│                                                             │
│  1. Check Redis cache (hash URL + size)                    │
│     └─ HIT → Return cached thumbnail URL                   │
│                                                             │
│  2. Check if thumbnail exists on CDN                       │
│     └─ HIT → Cache URL, return                             │
│                                                             │
│  3. Generate thumbnail (Sharp)                             │
│     ├─ thumb: 400x300 WebP @ 80% quality (~15-30KB)       │
│     ├─ medium: 800x600 WebP @ 85% quality (~50-100KB)     │
│     └─ full: original (dla modal view)                    │
│                                                             │
│  4. Upload to CDN / Store in cache                         │
│                                                             │
│  5. Return thumbnail URL                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### API Endpoint

```typescript
// pages/api/thumbnail.ts

import sharp from 'sharp';
import { Redis } from '@upstash/redis';

const SIZES = {
  thumb: { width: 400, height: 300, quality: 80 },
  medium: { width: 800, height: 600, quality: 85 },
  large: { width: 1600, height: 1200, quality: 90 },
} as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url, size = 'thumb' } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  const sizeConfig = SIZES[size as keyof typeof SIZES] || SIZES.thumb;
  const cacheKey = `thumb:${sha256(url)}:${size}`;

  // 1. Sprawdź cache
  const cached = await redis.get<string>(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.redirect(301, cached);
  }

  // 2. Pobierz oryginalny obraz
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());

  // 3. Wygeneruj thumbnail
  const thumbnail = await sharp(buffer)
    .resize(sizeConfig.width, sizeConfig.height, {
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: sizeConfig.quality })
    .toBuffer();

  // 4. Opcjonalnie: upload do CDN (Cloudflare R2, S3, etc.)
  // const thumbnailUrl = await uploadToCDN(thumbnail, cacheKey);

  // 5. Cache URL (lub sam thumbnail)
  await redis.set(cacheKey, thumbnail.toString('base64'), { ex: 86400 * 30 }); // 30 dni

  // 6. Zwróć thumbnail
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(thumbnail);
}
```

### Progressive Image Loading (blur-up)

```typescript
// src/components/ProgressiveImage.tsx

interface ProgressiveImageProps {
  src: string;
  thumbnailSrc: string;
  alt: string;
  className?: string;
}

const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  thumbnailSrc,
  alt,
  className,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(thumbnailSrc);

  useEffect(() => {
    // Preload full image
    const img = new Image();
    img.onload = () => {
      setCurrentSrc(src);
      setIsLoaded(true);
    };
    img.src = src;
  }, [src]);

  return (
    <div className={cn('progressive-image-container', className)}>
      <img
        src={currentSrc}
        alt={alt}
        className={cn('progressive-image', {
          'is-thumbnail': !isLoaded,
          'is-loaded': isLoaded,
        })}
      />
    </div>
  );
};

// CSS
.progressive-image-container {
  position: relative;
  overflow: hidden;
}

.progressive-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.3s ease-out;
}

.progressive-image.is-thumbnail {
  filter: blur(10px);
  transform: scale(1.1); /* Ukryj blur na krawędziach */
}

.progressive-image.is-loaded {
  filter: blur(0);
  transform: scale(1);
}
```

---

## 5. Plan implementacji

### Faza 1: Foundation (priorytet wysoki)
**Cel:** Podstawy cache i sekwencyjnego ładowania

| Task | Pliki | Szacowana złożoność |
|------|-------|---------------------|
| Dodaj `useSequentialImageLoader` hook | `src/hooks/useSequentialImageLoader.ts` | Średnia |
| Zintegruj hook z `ImageGrid.tsx` | `src/components/ImageGrid.tsx` | Średnia |
| Dodaj animacje fade-in do CSS | `styles/globals.css` | Niska |
| Dodaj skeleton loading | `styles/globals.css`, `ImageGrid.tsx` | Niska |

### Faza 2: Cache System (priorytet wysoki)
**Cel:** Lokalny cache dla thumbnails

| Task | Pliki | Szacowana złożoność |
|------|-------|---------------------|
| Implementuj `ThumbnailCache` (IndexedDB) | `src/utils/thumbnailCache.ts` | Wysoka |
| Dodaj folder manifest API | `pages/api/folder-manifest.ts` | Średnia |
| Zintegruj cache z ładowaniem obrazów | `ImageGrid.tsx`, `imageUtils.ts` | Średnia |

### Faza 3: Thumbnail Generation (priorytet średni)
**Cel:** Server-side thumbnail generation

| Task | Pliki | Szacowana złożoność |
|------|-------|---------------------|
| Endpoint `/api/thumbnail` | `pages/api/thumbnail.ts` | Średnia |
| Progressive image loading | `src/components/ProgressiveImage.tsx` | Średnia |
| Blur-up effect CSS | `styles/globals.css` | Niska |

### Faza 4: Polish (priorytet niski)
**Cel:** Dodatkowe animacje i detale UX

| Task | Pliki | Szacowana złożoność |
|------|-------|---------------------|
| Folder expand/collapse animacje | `Gallery.tsx`, `globals.css` | Niska |
| Modal open/close animacje | `globals.css` | Niska |
| Button press feedback | `globals.css` | Niska |
| `prefers-reduced-motion` support | `globals.css` | Niska |

---

## Podsumowanie priorytetów

```
WYSOKI PRIORYTET (natychmiastowy wpływ na UX):
├─ Sekwencyjne ładowanie obrazów (lewy→prawy, góra→dół)
├─ Skeleton loading placeholders
├─ IndexedDB cache dla thumbnails
└─ Fade-in animacje przy ładowaniu

ŚREDNI PRIORYTET (znaczące ulepszenia):
├─ Server-side thumbnail generation (Sharp)
├─ Progressive blur-up loading
├─ Folder change detection
└─ LRU cache eviction

NISKI PRIORYTET (polish):
├─ Folder expand/collapse animacje
├─ Modal transitions
├─ Button micro-interactions
└─ prefers-reduced-motion support
```

---

## Metryki sukcesu

| Metryka | Obecna wartość | Cel |
|---------|----------------|-----|
| Time to First Image | ~800ms | <300ms |
| Full Grid Load (20 obrazów) | ~3-4s | <1.5s |
| Perceived Loading Time | chaotyczne | płynne, sekwencyjne |
| Cache Hit Rate | 0% (local) | >80% |
| Thumbnail Size (4K source) | 5-15MB | 15-30KB |
| Memory Usage | nieograniczony | <100MB (LRU) |
