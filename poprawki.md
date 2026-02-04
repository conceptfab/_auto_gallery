# Raport Analizy Kodu - Content Browser

**Data:** 2026-02-04
**Wersja:** b 0.3 (branch: version_0.3)
**Projekt:** Next.js 15.5.9 + React 19 + TypeScript

---

## Spis Treści

1. [Podsumowanie](#podsumowanie)
2. [Bezpieczeństwo](#1-bezpieczeństwo)
3. [Optymalizacja Wydajności](#2-optymalizacja-wydajności)
4. [Duplikacja Kodu](#3-duplikacja-kodu)
5. [Martwy Kod](#4-martwy-kod)
6. [Over-Engineering](#5-over-engineering)
7. [Plan Naprawczy](#6-plan-naprawczy)

---

## Podsumowanie

| Kategoria        | Krytyczne | Wysokie | Średnie | Niskie | Razem  |
| ---------------- | --------- | ------- | ------- | ------ | ------ |
| Bezpieczeństwo   | 5         | 4       | 6       | 5      | **20** |
| Wydajność        | -         | 4       | 3       | 2      | **9**  |
| Duplikacja       | -         | 2       | 3       | -      | **5**  |
| Martwy kod       | -         | -       | 1       | 3      | **4**  |
| Over-engineering | -         | 1       | 3       | 2      | **6**  |
| **RAZEM**        | **5**     | **11**  | **16**  | **12** | **44** |

---

## 1. Bezpieczeństwo

### 1.1 KRYTYCZNE (P0) - Natychmiastowa naprawa

#### SEC-001: Exposed API Keys w .env

- **Plik:** `.env`
- **Linie:** 19, 24
- **Problem:** Klucze API Resend i FILE_PROXY_SECRET są widoczne w repozytorium
- **Ryzyko:** Nieautoryzowany dostęp do usług email, kradzież danych
- **Rozwiązanie:**
  1. Natychmiast zrotować wszystkie klucze
  2. Przenieść sekrety do Railway Variables / Vercel Environment
  3. Dodać `.env` do `.gitignore` (już jest, ale sekrety zostały scommitowane)
  4. Usunąć z historii git: `git filter-branch`

#### SEC-002: Weak Emergency Admin Code

- **Plik:** `.env`
- **Linia:** 17
- **Problem:** `ADMIN_EMERGENCY_CODE=MASTER123` - słabe, statyczne hasło bypass
- **Ryzyko:** Każdy kto zna kod może ominąć weryfikację email
- **Rozwiązanie:**
  1. Usunąć mechanizm emergency code
  2. Lub: Implementować time-limited, one-time use tokens
  3. Logować wszystkie próby użycia emergency code

#### SEC-003: Path Traversal Vulnerability ✅

- **Plik:** `src/utils/pathValidation.ts`
- **Problem:** Walidacja ścieżki używa prostego string matching bez normalizacji

```typescript
// AKTUALNIE (PODATNE):
if (path.includes('..') || path.includes('./') || path.startsWith('/')) {
  return { valid: false, error: 'Invalid path' };
}
```

- **Ryzyko:** Bypass przez Unicode encoding (`%2e%2e/`), Windows paths (`..\\`)
- **Rozwiązanie:**

```typescript
// POPRAWIONE:
import path from 'path';

export function validateFilePath(inputPath: string): PathValidationResult {
  if (!inputPath || typeof inputPath !== 'string') {
    return { valid: false, error: 'Path is required' };
  }

  // Normalizuj ścieżkę
  const normalized = path.normalize(inputPath);
  const resolved = path.resolve(BASE_PATH, normalized);

  // Sprawdź czy jest w dozwolonym katalogu
  if (!resolved.startsWith(BASE_PATH)) {
    return { valid: false, error: 'Path traversal detected' };
  }

  return { valid: true, sanitizedPath: resolved };
}
```

#### SEC-004: Missing Authentication on File List API ✅

- **Plik:** `pages/api/admin/files/list.ts`
- **Problem:** Endpoint nie ma middleware `withAdminAuth` – naprawione
- **Ryzyko:** Nieuprawnieni użytkownicy mogą enumerować strukturę plików
- **Rozwiązanie:**

```typescript
import { withAdminAuth } from '@/utils/adminMiddleware';

export default withAdminAuth(async function handler(req, res) {
  // ... existing code
});
```

#### SEC-005: Weak Crypto - Empty Secret Default ✅

- **Plik:** `src/utils/fileToken.ts`
- **Problem:**

```typescript
const SECRET_KEY = process.env.FILE_PROXY_SECRET || ''; // EMPTY STRING!
```

- **Ryzyko:** HMAC z pustym kluczem jest kryptograficznie bezwartościowy
- **Rozwiązanie:**

```typescript
const SECRET_KEY = process.env.FILE_PROXY_SECRET;
if (!SECRET_KEY || SECRET_KEY.length < 32) {
  throw new Error('FILE_PROXY_SECRET must be at least 32 characters');
}
```

---

### 1.2 WYSOKIE (P1) - Naprawa w ciągu tygodnia

#### SEC-006: XSS via DOMPurify Configuration ✅

- **Plik:** `src/components/ImageGrid.tsx`
- **Problem:**

```typescript
dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(highlightedName, {
    ALLOWED_TAGS: ['span'],
    ALLOWED_ATTR: ['style', 'class'],  // STYLE POZWALA NA CSS INJECTION
  }),
}}
```

- **Ryzyko:** CSS-based XSS przez złośliwe nazwy plików
- **Rozwiązanie:**

```typescript
// Opcja 1: Usunąć style z allowed attrs
ALLOWED_ATTR: ['class']

// Opcja 2: Użyć textContent zamiast innerHTML
<span className="filename">{displayName}</span>
```

#### SEC-007: Regex-based HTML Parsing ✅

- **Plik:** `src/utils/galleryUtils.ts`
- **Status:** Parsowanie przez cheerio (parseLinksFromHtml), bez regex na HTML

#### SEC-008: IP Spoofing in Rate Limiter ✅

- **Plik:** `src/utils/rateLimiter.ts`
- **Status:** X-Forwarded-For używane tylko gdy TRUST_PROXY === 'true'

```typescript
function getClientId(req: NextApiRequest): string {
  // Ufaj tylko jeśli za reverse proxy (sprawdź w Railway)
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
```

#### SEC-009: Cookie without HttpOnly Flag ✅

- **Plik:** `pages/api/auth/admin/verify-code.ts`
- **Problem:**

```typescript
`admin_logged=true; Path=/; Max-Age=43200; SameSite=Strict${secure}`,
// BRAKUJE: HttpOnly
```

- **Ryzyko:** Cookie dostępne przez JavaScript, podatne na XSS
- **Rozwiązanie:**

```typescript
`admin_logged=true; Path=/; Max-Age=43200; SameSite=Strict; HttpOnly${secure}`,
```

---

### 1.3 ŚREDNIE (P2)

#### SEC-010: No CSRF Protection

- **Pliki:** Wszystkie POST/PUT/DELETE endpoints
- **Problem:** Brak tokenów CSRF
- **Rozwiązanie:** Implementować CSRF middleware lub użyć `SameSite=Strict` (częściowo już jest)

#### SEC-011: Missing Security Headers ✅

- **Plik:** `next.config.js`
- **Problem:** Brak nagłówków bezpieczeństwa
- **Status:** Naprawione – dodano `async headers()` w next.config.js

#### SEC-012: Fetch Without Timeout ✅

- **Pliki:** src/utils/fetchWithTimeout.ts, API_TIMEOUT w cacheStatusService/axios
- **Status:** fetchWithTimeout util; axios/cacheStatusService używają API_TIMEOUT

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
try {
  const response = await fetch(url, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

#### SEC-013: Base64 Decode Without Size Limit ✅

- **Plik:** `pages/api/bug-report.ts`
- **Problem:** Dekodowanie base64 przed sprawdzeniem rozmiaru
- **Status:** Naprawione – sprawdzanie estimatedSize przed Buffer.from

#### SEC-014: Development IP in Production Config ✅

- **Plik:** `next.config.js`
- **Problem:** `allowedDevOrigins: ['192.168.1.111']`
- **Status:** Naprawione – usunięto; dodano security headers

#### SEC-015: Error Messages Expose Internal Details ✅

- **Plik:** `pages/api/admin/files/move.ts`
- **Problem:** `error: 'Invalid PHP response: ' + text.substring(0, 200)`
- **Status:** Naprawione – logowanie szczegółów, odpowiedź generyczna

---

### 1.4 NISKIE (P3)

#### SEC-016: Console.error Logging Sensitive Data

- **Pliki:** Multiple API handlers
- **Problem:** Błędy mogą zawierać wrażliwe dane
- **Rozwiązanie:** Użyć structured logging bez danych wrażliwych

#### SEC-017: Hardcoded URLs

- **Plik:** `src/utils/fileToken.ts`
- **Linie:** 21-23, 80-81
- **Problem:** Hardcoded `conceptfab.com` URLs
- **Rozwiązanie:** Przenieść do environment variables

#### SEC-018: Email Injection Risk ✅

- **Plik:** `pages/api/bug-report.ts`
- **Status:** Walidacja formatu email (EMAIL_REGEX) przy userEmail

#### SEC-019: Unused Emergency Code Attempts Logging ✅

- **Plik:** `pages/api/auth/admin/verify-code.ts`
- **Status:** Logowanie użycia emergency code oraz nieudanych prób (invalid code, no active code)

#### SEC-020: Code Injection via Regex .exec()

- **Pliki:** decorConverter.ts, projectsStorage.ts
- **Problem:** Regex exec w pętlach bez null check w niektórych miejscach
- **Rozwiązanie:** Dodać explicit null checks

---

## 2. Optymalizacja Wydajności

### 2.1 WYSOKIE (P1)

#### PERF-001: N+1 Cache Status API Calls ✅

- **Plik:** `src/components/ImageGrid.tsx`, Gallery, folder-status-batch
- **Status:** API folder-status-batch, Gallery fetches batch i przekazuje cacheStatusFromParent do ImageGrid

```typescript
// Dla każdego folderu osobno:
fetch(
  `/api/admin/cache/folder-status?folder=${encodeURIComponent(currentFolder)}`
);
```

- **Wpływ:** 100 folderów = 100 requestów
- **Rozwiązanie:**

```typescript
// Batch API call:
const response = await fetch('/api/admin/cache/folder-status-batch', {
  method: 'POST',
  body: JSON.stringify({ folders: folderPaths }),
});
```

#### PERF-002: Re-render Storm on Folder Open ✅

- **Plik:** `src/components/ImageGrid.tsx`
- **Problem:** Async loop z state update dla każdego obrazu – naprawione (Promise.all, jeden setState)

```typescript
for (const image of images) {
  const highlighted = await decorConverter.highlightKeywordsInDisplayName(
    name,
    src
  );
  setHighlightedNames((prev) => ({ ...prev, [name]: highlighted })); // RE-RENDER!
}
```

- **Wpływ:** 100 obrazów = 100 re-renderów
- **Rozwiązanie:**

```typescript
// Batch update:
const results: Record<string, string> = {};
await Promise.all(
  images.map(async (image) => {
    const highlighted = await decorConverter.highlightKeywordsInDisplayName(
      name,
      src
    );
    results[name] = highlighted;
  })
);
setHighlightedNames((prev) => ({ ...prev, ...results })); // JEDEN RE-RENDER
```

#### PERF-003: Global State Memory Leak ✅

- **Plik:** `src/utils/imageUtils.ts`, ThumbnailCacheContext
- **Status:** clearThumbnailCache(), ThumbnailCacheProvider wywołuje init + cleanup przy unmount

```typescript
let thumbnailCacheEnabled = false;
let thumbnailConfig: ThumbnailCacheConfig | null = null;
// Nigdy nie resetowane przy nawigacji
```

- **Rozwiązanie:** Przenieść do React Context z cleanup:

```typescript
// src/contexts/ThumbnailCacheContext.tsx
const ThumbnailCacheContext = createContext<ThumbnailCacheState>(null);

export function ThumbnailCacheProvider({ children }) {
  const [config, setConfig] = useState<ThumbnailCacheConfig | null>(null);

  useEffect(() => {
    return () => setConfig(null); // Cleanup przy unmount
  }, []);

  return (
    <ThumbnailCacheContext.Provider value={{ config, setConfig }}>
      {children}
    </ThumbnailCacheContext.Provider>
  );
}
```

#### PERF-004: Regex Recompilation Per Render ✅

- **Plik:** `src/utils/galleryUtils.ts`
- **Status:** Stała LINK_REGEX na górze pliku, lastIndex = 0 przed użyciem

```typescript
// Na górze pliku:
const LINK_REGEX = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
const IMG_REGEX = /<img[^>]*src=["']([^"']*)["'][^>]*>/gi;

// W funkcjach - reset lastIndex przed użyciem:
LINK_REGEX.lastIndex = 0;
```

---

### 2.2 ŚREDNIE (P2)

#### PERF-005: Complex Memo Comparator ✅

- **Plik:** `src/components/Gallery.tsx`
- **Status:** Usunięto referential checks (prev.folder === next.folder, prev.allFolders === next.allFolders)

```typescript
const FolderSection = memo(
  FolderSectionInner,
  (prev, next) =>
    prev.folder.path === next.folder.path &&
    prev.folder === next.folder && // Referential equality - zawsze false
    prev.allFolders === next.allFolders // Array reference - zawsze false
);
```

- **Rozwiązanie:** Usunąć referential checks lub useMemo na props

#### PERF-006: No srcset for Responsive Images ✅

- **Plik:** `src/components/ImageGrid.tsx`
- **Status:** Dodano srcSet (1x) i sizes="(max-width: 768px) 150px, 300px"

```tsx
<img
  src={thumbnailSrc}
  srcSet={`${thumbnailSrc}?w=150 150w, ${thumbnailSrc}?w=300 300w`}
  sizes="(max-width: 768px) 150px, 300px"
  loading="lazy"
/>
```

#### PERF-007: Set Copy Operations for Large Folders

- **Plik:** `src/components/Gallery.tsx`
- **Linie:** 54-66
- **Problem:** `new Set(globalCollapsedFolders)` przy każdym toggle
- **Rozwiązanie:** Dla 1000+ folderów rozważyć Map<string, boolean>

---

### 2.3 NISKIE (P3)

#### PERF-008: Multiple Axios Instances ✅

- **Plik:** `src/utils/galleryUtils.ts`
- **Status:** galleryAxios (axios.create) z timeout i User-Agent

#### PERF-009: Thumbnail Cache Fetch on Every Component ✅

- **Plik:** `src/utils/imageUtils.ts`, ThumbnailCacheContext, \_app.tsx
- **Status:** Jeden ThumbnailCacheProvider w \_app, init raz; Gallery nie wywołuje initThumbnailCache

---

## 3. Duplikacja Kodu

### DUP-001: getDisplayName Function (WYSOKIE) ✅

- **Plik 1:** `src/components/Gallery.tsx`
- **Plik 2:** `src/components/ImageGrid.tsx`
- **Status:** Wyekstrahowano do `src/utils/imageNameUtils.ts`

```typescript
// src/utils/imageNameUtils.ts
export function getDisplayName(src: string): string {
  const fileName = src.split('/').pop() || src;
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  return nameWithoutExt.replace(/_/g, ' ');
}
```

### DUP-002: User-Agent String (WYSOKIE) ✅

- **Lokalizacje:** galleryUtils i constants
- **Status:** Przeniesiono do `src/config/constants.ts` (DEFAULT_USER_AGENT, API_TIMEOUT)

```typescript
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
export const API_TIMEOUT = 30000;
export const API_TIMEOUT_LONG = 120000;
```

### DUP-003: Hover Preview Logic (ŚREDNIE)

- **Plik 1:** `src/components/Gallery.tsx` (linie 582-598)
- **Plik 2:** `src/components/ImageGrid.tsx` (linie 241-257)
- **Rozwiązanie:** Hook `src/hooks/useHoverPreview.ts`

### DUP-004: Download Handler (ŚREDNIE)

- **Plik 1:** `src/components/Gallery.tsx` (linie 608-621)
- **Plik 2:** `src/components/ImageGrid.tsx` (linie 274-290)
- **Rozwiązanie:** Hook `src/hooks/useDownloadHandler.ts`

### DUP-005: Touch Device Detection (ŚREDNIE) ✅

- **Plik 1:** `src/components/Gallery.tsx`
- **Plik 2:** `src/components/ImageGrid.tsx`
- **Status:** Hook `src/hooks/useTouchDevice.ts` utworzony i używany w obu komponentach

```typescript
// src/hooks/useTouchDevice.ts
export function useTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    setIsTouchDevice(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isTouchDevice;
}
```

---

## 4. Martwy Kod

### DEAD-001: Unused Parameter \_highlightKeywordsEnabled ✅

- **Plik:** `src/components/ImageGrid.tsx`
- **Status:** Usunięto z ImageItemProps i wywołań

### DEAD-002: Empty JSX Comments ✅

- **Plik 1:** `src/components/Gallery.tsx`
- **Plik 2:** `src/components/ImageGrid.tsx`
- **Status:** Usunięto puste `{}` z JSX

### DEAD-003: Unused \_error Variables ✅

- **Plik:** `src/utils/galleryUtils.ts`
- **Status:** Zmieniono na `catch {}`

### DEAD-004: Potentially Unused decorConverter Methods

- **Plik:** `src/utils/decorConverter.ts`
- **Problem:** Niektóre metody mogą nie być używane
- **Akcja:** Przeprowadzić audit i usunąć nieużywane

---

## 5. Over-Engineering

### OVER-001: 60+ Path Helper Functions (WYSOKIE) ✅

- **Plik:** `src/utils/cacheStorage.ts`
- **Status:** CACHE_PATHS (config, historyDir, currentFile, dailyHistory); getCacheDataDir pozostaje async

```typescript
async function getCacheDataDir() { ... }
async function getConfigFilePath() { ... }
async function getHistoryDir() { ... }
async function getDailyHistoryPath(dateStr) { ... }
// ... i więcej
```

- **Rozwiązanie:** Skonsolidować do 2-3 funkcji lub obiektu konfiguracji:

```typescript
const PATHS = {
  cacheData: () => path.join(DATA_DIR, 'cache'),
  config: () => path.join(DATA_DIR, 'cache-config.json'),
  history: (date?: string) =>
    path.join(DATA_DIR, 'history', date || 'current.json'),
};
```

### OVER-002: 2-Level Thumbnail Abstraction (ŚREDNIE)

- **Pliki:** `src/utils/imageUtils.ts` + `src/utils/thumbnailStoragePath.ts`
- **Problem:** Dwa pliki dla podobnej logiki
- **Rozwiązanie:** Skonsolidować w jednym pliku

### OVER-003: Complex Keyword Regex in decorConverter (ŚREDNIE) ✅

- **Plik:** `src/utils/decorConverter.ts`
- **Status:** Cache skompilowanych regexów (keywordRegexCache, getKeywordRegexes)

### OVER-004: Types in Storage File (ŚREDNIE) ✅

- **Plik:** `src/utils/projectsStorage.ts`
- **Status:** Interfejsy `Revision` i `Project` przeniesione do `src/types/projects.ts`, re-export w projectsStorage

### OVER-005: Multiple Config Sources (NISKIE)

- **Pliki:** `src/config/constants.ts`, `.env`, `next.config.js`
- **Problem:** Konfiguracja rozproszona
- **Rozwiązanie:** Skonsolidować w jednym miejscu

### OVER-006: Redundant URL Building (NISKIE)

- **Pliki:** `src/utils/galleryUtils.ts`, `src/utils/imageUtils.ts`
- **Problem:** `extractPathFromUrl` + URL construction powtarzane
- **Rozwiązanie:** Jedna funkcja utility

---

## 6. Plan Naprawczy

### Faza 1: Bezpieczeństwo Krytyczne (Natychmiast)

1. [ ] Zrotować wszystkie API keys
2. [ ] Usunąć sekrety z historii git
3. [x] Naprawić path traversal w `pathValidation.ts`
4. [x] Dodać auth do `/api/admin/files/list`
5. [x] Naprawić empty secret default w `fileToken.ts`

### Faza 2: Bezpieczeństwo Wysokie (Tydzień 1)

1. [x] Poprawić DOMPurify config
2. [x] Dodać HttpOnly do cookie
3. [x] Naprawić IP spoofing w rate limiter
4. [x] Zamienić regex HTML parsing na bibliotekę (cheerio w galleryUtils)

### Faza 3: Wydajność Krytyczna (Tydzień 2)

1. [x] Zbatchować cache status API calls (folder-status-batch + Gallery/ImageGrid)
2. [x] Naprawić re-render storm w ImageGrid
3. [x] Przenieść thumbnail cache do Context (ThumbnailCacheProvider + clearThumbnailCache)
4. [x] Cache regex patterns

### Faza 4: Refaktoryzacja (Tydzień 3-4)

1. [x] Wyekstrahować `getDisplayName` do utils
2. [x] useTouchDevice; [ ] useHoverPreview, useDownloadHandler
3. [x] Przenieść constants (User-Agent, timeouts)
4. [x] Usunąć martwy kod

### Faza 5: Bezpieczeństwo Średnie (Tydzień 4+)

1. [x] Dodać security headers
2. [x] Implementować timeouts na fetch (fetchWithTimeout.ts, API_TIMEOUT w cacheStatusService)
3. [ ] Rozważyć CSRF tokens
4. [ ] Audit remaining issues

---

## 7. Pozostałe do realizacji (weryfikacja)

Poniżej **tylko** te punkty, które **nie** zostały zaimplementowane w kodzie:

### Wymagają działań ręcznych / infrastruktury (nie w kodzie)

- **SEC-001** – Zrotować API keys, przenieść sekrety do Railway/Vercel, usunąć z historii git
- **SEC-002** – Usunąć lub zmienić mechanizm emergency code (obecnie jest logowanie – SEC-019 ✅)

### Bezpieczeństwo – do rozważenia

- **SEC-010** – CSRF (SameSite=Strict już jest; pełne tokeny CSRF – opcjonalnie)
- **SEC-016** – Structured logging zamiast console.error (unikać wrażliwych danych w logach)
- **SEC-017** – URL-e w fileToken: już z env + fallback; w produkcji ustawić env (bez fallbacku)
- **SEC-020** – Regex .exec(): w decorConverter i projectsStorage są null checki; ewentualny audyt innych plików

### Wydajność / refaktoryzacja

- **PERF-007** – Dla 1000+ folderów: rozważyć Map zamiast `new Set(globalCollapsedFolders)` przy toggle

### Duplikacja – opcjonalne hooki

- **DUP-003** – useHoverPreview (logika hover w Gallery i ImageGrid)
- **DUP-004** – useDownloadHandler (logika pobierania w Gallery i ImageGrid)

### Martwy kod

- **DEAD-004** – Audyt metod w decorConverter i usunięcie nieużywanych

### Over-engineering (niski priorytet)

- **OVER-002** – Skonsolidować imageUtils + thumbnailStoragePath w jeden plik
- **OVER-005** – Skonsolidować źródła konfiguracji (constants, .env, next.config.js)
- **OVER-006** – Jedna funkcja utility dla extractPathFromUrl + budowania URL

---

## Załączniki

### A. Pliki do Modyfikacji (Priorytet)

| Plik                            | Problemy                    | Priorytet |
| ------------------------------- | --------------------------- | --------- |
| `.env`                          | SEC-001, SEC-002            | KRYTYCZNY |
| `src/utils/pathValidation.ts`   | SEC-003                     | KRYTYCZNY |
| `src/utils/fileToken.ts`        | SEC-005                     | KRYTYCZNY |
| `pages/api/admin/files/list.ts` | SEC-004                     | KRYTYCZNY |
| `src/components/ImageGrid.tsx`  | SEC-006, PERF-001, PERF-002 | WYSOKI    |
| `src/utils/rateLimiter.ts`      | SEC-008                     | WYSOKI    |
| `pages/api/auth/verify-code.ts` | SEC-009                     | WYSOKI    |
| `src/utils/galleryUtils.ts`     | SEC-007, PERF-004           | WYSOKI    |
| `src/components/Gallery.tsx`    | PERF-005, DUP-001           | ŚREDNI    |
| `src/utils/imageUtils.ts`       | PERF-003                    | ŚREDNI    |
| `next.config.js`                | SEC-011, SEC-014            | ŚREDNI    |

### B. Nowe Pliki do Utworzenia

1. `src/utils/imageNameUtils.ts` - getDisplayName ✅
2. `src/hooks/useTouchDevice.ts` - detekcja touch ✅
3. `src/hooks/useHoverPreview.ts` - (opcjonalnie)
4. `src/hooks/useDownloadHandler.ts` - (opcjonalnie)
5. `src/contexts/ThumbnailCacheContext.tsx` - thumbnail cache state ✅
6. `src/utils/fetchWithTimeout.ts` - fetch z timeout ✅
7. `src/services/cacheStatusService.ts` - getFolderCacheStatus (folder-status + batch) ✅

### C. Komendy Weryfikacji

```bash
# Build
npm run build

# Lint
npm run lint

# Type check
npx tsc --noEmit

# Security headers check
curl -I https://your-domain.com | grep -E "X-Frame|X-Content|Referrer"
```

---

_Raport wygenerowany: 2026-02-04_
