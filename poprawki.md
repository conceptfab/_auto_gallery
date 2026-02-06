# Raport poprawek - Content Browser v2

**Data:** 2026-02-06
**Wersja:** b 0.33 (branch: version_0.3)
**Projekt:** Next.js 15.5.9 + React 19 + TypeScript + PHP backend

---

## Spis tresci

1. [Usuwanie osieroconych plikow (KRYTYCZNE)](#1-usuwanie-osieroconych-plikow-krytyczne)
2. [Bezpieczenstwo (KRYTYCZNE)](#2-bezpieczenstwo-krytyczne)
3. [Pliki graficzne - sciezki zapisu](#3-pliki-graficzne---sciezki-zapisu)
4. [Czytelnosc linkow w pasku adresu](#4-czytelnosc-linkow-w-pasku-adresu)
5. [Logika i poprawnosc](#5-logika-i-poprawnosc)
6. [Martwy kod](#6-martwy-kod)
7. [Duplikacja kodu](#7-duplikacja-kodu)
8. [Optymalizacja](#8-optymalizacja)
9. [Over-engineering](#9-over-engineering)
10. [Autoryzacja - przeplyw i ocena](#10-autoryzacja---przeplyw-i-ocena)
11. [Podsumowanie priorytetow](#11-podsumowanie-priorytetow)

---

## 1. Usuwanie osieroconych plikow (KRYTYCZNE)

> Glowny problem zgloszony przez uzytkownika: skrypty usuwajace osierocone pliki usuwaja za duzo.

### CLEANUP-K01: Race condition - pliki uploadowane podczas skanowania sa usuwane
- **Plik:** `pages/api/admin/cleanup-orphaned-files.ts:91-127`
- **Problem:** Cleanup odczytuje `projects.json` (linia 92), potem skanuje filesystem. Jesli plik zostanie uploadowany PO odczycie JSON ale PRZED porownaniem, zostanie oznaczony jako osierocony i usuniety.
- **Scenariusz:**
  1. `scanOrphanedFiles()` wywoluje `getProjects()` -> snapshot JSON
  2. W miedzyczasie: upload zapisuje obraz na dysk + aktualizuje JSON
  3. Scan widzi nowy plik na dysku, ale w swoim snapshocie JSON go nie ma
  4. Plik oznaczony jako orphan -> usuniety
- **Brak zabezpieczen:** zero file-lockingu, zero grace period, zero filtrowania po dacie modyfikacji
- **Poprawka:** Dodac filtr `mtime` - pomijac pliki mlodsze niz 60 minut:
  ```typescript
  const stat = await fsp.stat(fullPath);
  const ageMinutes = (Date.now() - stat.mtimeMs) / 1000 / 60;
  if (ageMinutes < 60) continue; // pomijaj swiezo dodane pliki
  ```

### CLEANUP-K02: Brak trybu dry-run - natychmiastowe usuwanie
- **Plik:** `pages/api/admin/cleanup-orphaned-files.ts:236-250`
- **Problem:** Endpoint `DELETE` **re-skanuje** filesystem niezaleznie od `GET`. Admin widzi liste X plikow (GET), klika DELETE - ale DELETE skanuje ponownie i moze znalezc INNE pliki (stan sie zmienil).
- **Rezultat:** Usuwane sa pliki ktore admin nie widzial w podgladzie.
- **Poprawka:** Dodac parametr `?dryRun=true` do DELETE + wymuszac potwierdzenie na podstawie listy z GET (np. przez token/hash listy).

### CLEANUP-K03: Brak jakiegokolwiek logowania usunietych plikow
- **Plik:** `pages/api/admin/cleanup-orphaned-files.ts:179-219`
- **Problem:** Petla usuwania nie loguje NICZEGO - ani sciezek, ani rozmiarow, ani bledow. Bledy sa calkowicie wyciszane (catch puste).
- **Konsekwencje:**
  - Brak audit trail -> nie wiadomo co zostalo usuniete
  - Brak diagnozy -> nie mozna ustalic przyczyny
  - Brak odzysku -> nie ma listy plikow do przywrocenia
- **Poprawka:**
  ```typescript
  console.log(`[CLEANUP] Usuwanie ${file.type}: ${file.path} (${file.size} B)`);
  await fsp.unlink(fullPath);
  // + zapis logu do /data-storage/cleanup-logs/cleanup-YYYY-MM-DD.json
  ```

### CLEANUP-K04: Ciche usuwanie pustych folderow nadrzednych
- **Plik:** `pages/api/admin/cleanup-orphaned-files.ts:206-215`
- **Problem:** Po usunieciu pliku kod sprawdza czy folder rodzic jest pusty i cicho go usuwa. Bez logowania.
- **Konsekwencja:** Cale drzewo katalogow znika bez sladu.
- **Poprawka:** Logowac usuwanie folderow.

### CLEANUP-K05: deleteProject() nie usuwa plikow fizycznych - tworzy sieroty
- **Plik:** `src/utils/projectsStorage.ts:427-437`
- **Problem:** Usuwanie projektu kasuje TYLKO wpis z JSON. Pliki na dysku zostaja:
  - Miniaturki: `design-revision/{projectId}/*.webp`
  - Galeria: `design-gallery/{projectId}/**/*`
- **Wynik:** Nastepny scan poprawnie oznacza te pliki jako osierocone -> cleanup je usuwa.
- **Z perspektywy admina:** "Usunalem projekt, czemu cleanup znajduje sieroty?"
- **Poprawka:** Dodac kaskadowe usuwanie plikow w `deleteProject()`:
  ```typescript
  for (const rev of project.revisions || []) {
    await deleteThumbnailFile(project.id, rev.id);
    const galleryDir = path.join(await getDesignGalleryDir(), project.id, rev.id);
    await fsp.rm(galleryDir, { recursive: true, force: true });
  }
  ```

### CLEANUP-K06: deleteProjectRevision() nie usuwa galerii - tworzy sieroty
- **Plik:** `src/utils/projectsStorage.ts:406-425`
- **Problem:** Analogicznie jak K05 - miniaturka jest usuwana (linia 410), ale pliki galerii (`galleryPaths`) NIE.
- **Wynik:** Caly folder `design-gallery/{projectId}/{revisionId}/` zostaje na dysku.
- **Poprawka:**
  ```typescript
  // Przed splice - przeczytaj galleryPaths z rewizji
  const galleryDir = path.join(await getDesignGalleryDir(), projectId, revisionId);
  await fsp.rm(galleryDir, { recursive: true, force: true });
  ```

### Weryfikacja - co cleanup POPRAWNIE sprawdza

Logika porownania jest prawidlowa (linie 91-159):
- Odczytuje liste projektow -> zbiera `thumbnailPath` i `galleryPaths` z kazdej rewizji
- Odczytuje indeks moodboardow -> zbiera `imagePath` z kazdego boardu
- Skanuje katalogi: `design-revision/`, `design-gallery/`, `moodboard/images/`
- Pliki nie obecne w zbiorach "uzywanych" = osierocone

**Problem nie lezy w logice porownania, ale w:**
1. Braku zabezpieczen czasowych (race condition, nowe pliki)
2. Niekompletnym kaskadowym usuwaniu (projekt/rewizja nie czysci plikow)
3. Braku logowania i podgladu

---

## 2. Bezpieczenstwo (KRYTYCZNE)

### SEC-K01: Niezabezpieczone endpointy admin - brak auth
- **Pliki:**
  - `pages/api/admin/cache/status.ts` - brak `withAdminAuth`
  - `pages/api/admin/cache/diagnostics.ts` - brak `withAdminAuth`
  - `pages/api/admin/cache/history.ts` - brak `withAdminAuth`
  - `pages/api/admin/stats/overview.ts` - brak `withAdminAuth`
  - `pages/api/admin/volume/files.ts` - brak `withAdminAuth`
  - `pages/api/admin/volume/download.ts` - brak `withAdminAuth`
  - `pages/api/admin/volume/delete.ts` - brak `withAdminAuth`
- **Problem:** Endpointy pod `/api/admin/` ale BEZ ochrony. Middleware chroni tylko sciezki z matchera (`/admin`, `/api/admin/:path*`, `/api/auth/admin/:path*`), ale wewnatrz handlera brak podwojnego sprawdzenia.
- **UWAGA:** Middleware w Next.js Edge Runtime poprawnie blokuje te sciezki (matcher linia 52-56). Jednak endpointy nie maja `withAdminAuth` jako dodatkowej warstwy ochrony - gdyby middleware zostal blednie zmodyfikowany, endpointy bylyby odkryte.
- **Poprawka:** Dodac `withAdminAuth()` wrapper do kazdego endpointu admin jako defense-in-depth.

### SEC-K02: Hardcoded SECRET_KEY w public/config.php
- **Plik:** `public/config.php:11`
- **Problem:** Klucz HMAC zahardkodowany w katalogu `public/`. Widoczny gdyby PHP nie bylo skonfigurowane.
- **Poprawka:** `getenv('SECRET_KEY')` na serwerze PHP.

### SEC-K03: CORS Wildcard na endpointach PHP
- **Pliki:** Wszystkie 7 plikow PHP w `public/`
- **Problem:** `Access-Control-Allow-Origin: *` na endpointach modyfikujacych (upload, delete, rename, move, mkdir).
- **Poprawka:** Ograniczyc do `https://app.conceptfab.com`.

### SEC-K04: Slaba ochrona Path Traversal w PHP
- **Pliki:** Wszystkie pliki PHP
- **Problem:** `str_replace(['..', "\0"], '', $path)` nie obsluguje `%2e%2e`, `....//`, podwojnego kodowania.
- **Poprawka:**
  ```php
  $realPath = realpath($fullPath);
  if ($realPath === false || strpos($realPath, PRIVATE_FILES_PATH) !== 0) {
      http_response_code(403); die('Access denied');
  }
  ```

### SEC-K05: Cookie auth_email niepodpisane kryptograficznie
- **Plik:** `src/utils/auth.ts:26-29`
- **Problem:** Cookie to zwykly tekst (email). Atakujacy moze ustawic cookie na dowolny email z whitelist.
- **Poprawka:** Podpisywac HMAC lub uzyc session ID (crypto.randomUUID).

### SEC-W01: Backdoor - ADMIN_EMERGENCY_CODE=MASTER123
- **Plik:** `.env:17`, `pages/api/auth/admin/verify-code.ts:38-44`
- **Problem:** Emergency code omija weryfikacje emailowa. Kod `MASTER123` jest slaby i widoczny w .env.
- **Brak:** rate limitingu na emergency code, brak powiadomienia email, brak ograniczenia IP.
- **Poprawka:** Uzyc kodu min 16 znakow, dodac rate limit (3/godz globalnie), wyslac alert email przy uzyciu, rozwazyc calkowite usuniecie tej funkcji.

### SEC-W02: CSP z unsafe-eval i unsafe-inline
- **Plik:** `next.config.js:3`
- **Problem:** `unsafe-eval` i `unsafe-inline` efektywnie wylaczaja ochrone XSS przez CSP.
- **Poprawka:** Usunac `unsafe-eval`, zastapic `unsafe-inline` nonce-based.

### SEC-W03: Brak naglowkow bezpieczenstwa
- **Plik:** `next.config.js`
- **Brakujace headery:**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security` (HSTS)
- **Poprawka:** Dodac w `next.config.js` -> `headers()`.

### SEC-W04: Content-Disposition bez sanityzacji
- **Plik:** `public/file-proxy.php:74`
- **Poprawka:** `rawurlencode(basename($file))` + `filename*=UTF-8''...`.

### SEC-W05: Brak walidacji boardId/imageId w moodboard upload
- **Plik:** `pages/api/moodboard/upload.ts:35-44`
- **Problem:** boardId i imageId nie sa walidowane pod katem path traversal w `saveMoodboardImage`.
- **Poprawka:** Dodac walidacje analogicznie do `getMoodboardImageAbsolutePath`.

### SEC-W06: Brak rate limitu na /api/auth/status
- **Plik:** `pages/api/auth/status.ts`
- **Problem:** Endpoint bez limitu pozwala na email enumeration i session probing.
- **Poprawka:** `withRateLimit(60, 60000)`.

### SEC-W07: Timing attack na email enumeration
- **Plik:** `pages/api/auth/request-code.ts:42-92`
- **Problem:** Rozne czasy odpowiedzi zdradzaja status emaila (blacklist ~10ms, whitelist ~500ms, pending ~1000ms).
- **Poprawka:** Normalizowac czas odpowiedzi do stalej wartosci (~1s) i zwracac generyczna wiadomosc.

### SEC-I01: loginAdmin/logoutAdmin/isAdminLoggedIn - brak normalizacji email
- **Plik:** `src/utils/storage.ts:679-698`
- **Problem:** W przeciwienstwie do `loginUser` (linia 590), funkcje admin NIE normalizuja email do lowercase.
- **Poprawka:** Dodac `email.trim().toLowerCase()`.

---

## 3. Pliki graficzne - sciezki zapisu

### STORAGE-OK: Wszystkie pliki graficzne na /data-storage (ZGODNE)
- Moodboard images: `/data-storage/moodboard/images/{boardId}/{imageId}.{ext}` -- OK
- Project thumbnails: `/data-storage/thumbnails/design-revision/{projectId}/{revisionId}.webp` -- OK
- Gallery images: `/data-storage/thumbnails/design-gallery/{projectId}/{revisionId}/{uuid}.{ext}` -- OK
- Cache thumbnails: `/data-storage/thumbnails/{folder}/{filename}` -- OK

### STORAGE-01: Zduplikowana getDataDir() - 4 kopie
- **Pliki:** `moodboardStorage.ts:4`, `projectsStorage.ts:39`, `storage.ts:50`, `cacheStorage.ts:73`
- **Problem:** Identyczna logika (sprawdz `/data-storage`, fallback do `process.cwd()/data`) x4.
- **Dodatkowy problem:** `constants.ts:53` ma INNY fallback (`./tmp/data-storage` vs `data/`).
- **Poprawka:** Wspolny modul `src/utils/dataDir.ts`.

### STORAGE-02: Architektura dwu-serwerowa (informacja)
- PHP zapisuje na hostingu (`/home/.../conceptfab.com/content_browser/`)
- Next.js (Railway) zapisuje na volume `/data-storage`
- **Status:** Swiadomy design, warto udokumentowac.

---

## 4. Czytelnosc linkow w pasku adresu

### URL-01: Mieszanka jezykow w URL-ach
- `/projekty` i `/projekty/[slug]` - po polsku
- `/design`, `/moodboard`, `/folders`, `/admin-login` - po angielsku
- **Poprawka:** Wybrac jeden jezyk konsekwentnie.

### URL-02: Duplikacja stron /design i /projekty
- strona pages/design.tsx` do usunięcia!!!
- `pages/design.tsx` vs `pages/projekty.tsx` - identyczna funkcjonalnosc
- `pages/design/[id].tsx` vs `pages/projekty/[id].tsx` - ~1100 linii zduplikowanych
- **Poprawka:** Jedna sciezka + redirect z drugiej.

### URL-03: Strona /folders pusta/niedokonczona
- **Plik:** `pages/folders.tsx`
- Renderuje puste divy, cala logika danych martwa.
- **Poprawka:** Usunac lub dokonczyc.

### URL-04: groupId w query params
- `/?groupId=grp_abc123` - eksponuje wewnetrzne ID.
- **Poprawka:** Uzyc czytelnych segmentow URL: `/preview/[clientName]`.

### URL-05: Slug w projektach (OK)
- `/projekty/moj-projekt` - poprawnie zaimplementowany slug z obsluga polskich znakow.

---

## 5. Logika i poprawnosc

### LOGIC-01: deleteProject() brak kaskadowego usuwania plikow
- Patrz CLEANUP-K05. Projekt kasowany z JSON, pliki na dysku zostaja.

### LOGIC-02: deleteProjectRevision() brak usuwania galerii
- Patrz CLEANUP-K06. Miniaturka kasowana, galeria nie.

### LOGIC-03: loginAdmin/logoutAdmin/isAdminLoggedIn - brak normalizacji email
- Patrz SEC-I01. Case-sensitive porownanie moze zablokowac logout.

### LOGIC-04: generateGroupId() uzywa Math.random
- **Plik:** `src/utils/storage.ts:719-721`
- **Poprawka:** Uzyc `crypto.randomUUID()`.

### LOGIC-05: getProjects() uruchamia migracje przy kazdym wywolaniu
- **Plik:** `src/utils/projectsStorage.ts:228-238`
- `migrateThumbnailsToFiles()` i `migrateSlugs()` za kazdym razem.
- **Poprawka:** Flaga `migrationDone` lub jednorazowy skrypt.

### LOGIC-06: thumbnailStoragePath.ts - fallback moze zwrocic zly katalog
- **Plik:** `src/utils/thumbnailStoragePath.ts:22-33`
- `getDesignRevisionThumbnailsDir()` sprawdza `fsp.access(designDir)` - jesli nie istnieje, zwraca base. Moze powodowac zapis miniaturek w zlym katalogu jesli `design-revision/` nie zostal jeszcze utworzony.
- **Poprawka:** Tworzyc katalog zamiast fallbackowac: `await fsp.mkdir(designDir, { recursive: true })`.

---

## 6. Martwy kod

### DEAD-01: useDebounce.ts - 0 importow w calym kodzie
- **Plik:** `src/hooks/useDebounce.ts` (37 linii)
- Grep potwierdza: nigdzie nie importowany.
- **Akcja:** Usunac.

### DEAD-02: Strona /folders - caly plik martwy
- **Plik:** `pages/folders.tsx` (125 linii)
- Zmienne `_data`, `_loading`, `_error`, `_getThumbnailUrl` zdefiniowane ale nieuzywane.
- **Akcja:** Usunac.

### DEAD-03: decodeDataUrlToBuffer zduplikowana 3x
- **Pliki:** `moodboardStorage.ts:20`, `projectsStorage.ts:161`, `upload-gallery.ts:9`
- **Poprawka:** Zostawic jedna (eksportowana z moodboardStorage), importowac w reszcie.

### DEAD-04: Interfejs _PendingFile nieuzywany
- **Plik:** `src/utils/storage.ts:102`
- **Akcja:** Usunac.

### DEAD-05: Pole screenshotDataUrl - legacy po migracji
- **Pliki:** `projectsStorage.ts:319,369`, `design/[id].tsx:15`, `projekty/[id].tsx:15`
- **Akcja:** Usunac po pelnej migracji.

### DEAD-06: Zbedny rewrite w next.config.js
- **Plik:** `next.config.js:50-53`
- Mapuje `/api/gallery/:path*` na siebie - no-op.
- **Akcja:** Usunac.

### DEAD-07: Puste getServerSideProps na 6 stronach
- **Pliki:** `index.tsx`, `login.tsx`, `admin.tsx`, `projekty.tsx`, `design.tsx`, `moodboard.tsx`
- **Problem:** `getServerSideProps() { return { props: {} } }` wymusza SSR bez powodu.
- **Poprawka:** Usunac (auth sprawdzany client-side).

### DEAD-08: Komentarze o usunietych funkcjach
- **Plik:** `src/utils/storage.ts:59,168`
- Komentarze `// saveData() usuniete`, `// loadData() usuniete`.
- **Akcja:** Usunac.

---

## 7. Duplikacja kodu

### DUP-01: KRYTYCZNA - design/[id].tsx vs projekty/[id].tsx (~1050 linii)
- **Pliki:** `pages/design/[id].tsx` (1102) vs `pages/projekty/[id].tsx` (1090)
- ~99% identyczny kod. Roznica: breadcrumbs.
- **Poprawka:** Wspolny `ProjectDetailPage` z parametrem `basePath`.

### DUP-02: design.tsx vs projekty.tsx (~100 linii)
- Identyczny kod poza URL nawigacji.
- **Poprawka:** Wspolny `ProjectsListPage`.

### DUP-03: getDataDir() - 4 kopie
- Patrz STORAGE-01.

### DUP-04: decodeDataUrlToBuffer - 3 kopie
- Patrz DEAD-03.

### DUP-05: Wzorzec load/save w storage.ts (~200 linii)
- **Plik:** `src/utils/storage.ts`
- Identyczny wzorzec `loadX()`/`saveX()` powtorzony 6x (whitelist, blacklist, groups, pending, codes, settings).
- **Poprawka:** Generyczna `loadJsonFile<T>()`/`saveJsonFile<T>()`.

### DUP-06: Zduplikowany wzorzec fetch projectow na 4 stronach
- **Pliki:** `projekty.tsx`, `projekty/[id].tsx`, `design.tsx`, `design/[id].tsx`
- Identyczny pattern: fetch `/api/projects`, filtruj, ustaw state.
- **Poprawka:** Hook `useProjects()` / `useProject(id)`.

---

## 8. Optymalizacja

### OPT-01: Gallery upload jako base64 w JSON body (+33% rozmiar)
- **Pliki:** `upload-gallery.ts`, `design/[id].tsx:265-287`, `projekty/[id].tsx:265-287`
- Obrazy konwertowane client-side do Data URL -> JSON -> POST.
- **Porownanie:** `upload-thumbnail.ts` poprawnie uzywa multipart/form-data.
- **Poprawka:** Przejsc na multipart/form-data.

### OPT-02: Brak memoizacji w komponentach projektow
- **Pliki:** `design/[id].tsx`, `projekty/[id].tsx`
- `getRevisionThumbnail()` i `isEmbedUrlAllowed()` uruchamiane przy kazdym renderze.
- Drag-drop przelicza wszystkie miniaturki.
- **Poprawka:** `useMemo` na liscie miniaturek i wynikach walidacji URL.

### OPT-03: Konwersja obrazow blokuje UI thread
- **Pliki:** Obie strony projektow (linie 266-287)
- Canvas conversion dla wielu obrazow synchronicznie - zamraza UI.
- **Poprawka:** Web Workers lub server-side conversion.

### OPT-04: image-proxy.ts robi redirect zamiast proxy
- **Plik:** `pages/api/image-proxy.ts:40`
- Endpoint "proxy" robi redirect 301 z `immutable` cache.
- **Poprawka:** Zmienic nazwe lub zaimplementowac proxy.

### OPT-05: In-memory cache bez synchronizacji
- **Pliki:** `storage.ts:426`, `cacheStorage.ts:135`
- Wspoldzielony `cachedData` bez lockowania -> mozliwy race condition.
- **Poprawka:** File-locking dla persistent server.

---

## 9. Over-engineering

### OVER-01: Migracje runtime zamiast jednorazowych skryptow
- **Pliki:** `projectsStorage.ts:191-226` (migrateThumbnailsToFiles, migrateSlugs)
- Uruchamiane przy kazdym `getProjects()`.
- **Poprawka:** Jednorazowy skrypt + flaga.

### OVER-02: cacheStatusService.ts - zbedna warstwa abstrakcji
- **Plik:** `src/services/cacheStatusService.ts` (134 linii)
- Cienki wrapper nad `thumbnailService.ts`, uzywany w 2 routach.
- **Poprawka:** Usunac, wolac thumbnailService bezposrednio.

### OVER-03: Cache regexow w decorConverter.ts
- **Plik:** `src/utils/decorConverter.ts:13-44`
- Cache 4 wariantow regex na keyword. Lista slow jest mala (~50), kompilacja regex to mikrosekundy.
- **Poprawka:** Usunac cache, kompilowac inline.

### OVER-04: Komentarze etapow migracji w storage.ts
- Relikty przyrostowej migracji ("Etap 1", "Etap 5").
- **Poprawka:** Wyczyscic.

---

## 10. Autoryzacja - przeplyw i ocena

### Przeplyw uzytkownika (ocena: 8/10 - dobrze)
1. Uzytkownik wpisuje email -> `/api/auth/request-code`
2. Jesli na whitelist: natychmiast wysylany kod (bezszwowe)
3. Jesli nowy: admin dostaje powiadomienie, zatwierdzenie -> kod
4. Weryfikacja kodu -> cookie HttpOnly (12h sesja)
5. **Niewidzialnosc:** Po zalogowaniu uzytkownik nie widzi zadnych dodatkowych krokow auth. OK.

### Przeplyw admina (ocena: 6/10 - wymaga poprawek)
1. Email + kod lub emergency code
2. **Problemy:**
   - Emergency code `MASTER123` - za slaby
   - Brak powiadomien o uzyciu emergency code
   - Brak IP whitelisting
   - Cookie niepodpisane

### Macierz autoryzacji endpointow

| Endpoint | Chroniony? | Sposob |
|----------|-----------|--------|
| `/api/auth/request-code` | Rate limit | `withRateLimit(5, 15min)` |
| `/api/auth/verify-code` | Rate limit | `withRateLimit(5, 1min)` |
| `/api/auth/status` | **BRAK** | Brak rate limit |
| `/api/moodboard/upload` | Cookie | `getEmailFromCookie` |
| `/api/moodboard/images/*` | Cookie | `getEmailFromCookie` |
| `/api/projects/gallery/*` | Cookie | `getEmailFromCookie` |
| `/api/projects/thumbnail/*` | Cookie | `getEmailFromCookie` |
| `/api/admin/settings` GET | **Publiczny** | Swiadomy design |
| `/api/admin/settings` POST | Admin | `withAdminAuth` |
| `/api/admin/files/*` | Admin | `withAdminAuth` |
| `/api/admin/projects/*` | Admin | `withAdminAuth` |
| `/api/admin/cache/status` | **Middleware** | Brak `withAdminAuth` |
| `/api/admin/cache/trigger` | Admin | `withAdminAuth` |
| `/api/admin/volume/*` | **Middleware** | Brak `withAdminAuth` |
| `/api/admin/stats/*` | **Middleware** | Brak `withAdminAuth` |
| `/api/cron/*` | CRON_SECRET | Header check |

**Legenda:** "Middleware" = chroniony przez Edge middleware (matcher), ale brak defense-in-depth w samym handlerze.

---

## 11. Podsumowanie priorytetow

### KRYTYCZNE (naprawic natychmiast)

| ID | Opis | Plik | Trudnosc |
|----|------|------|----------|
| CLEANUP-K01 | Race condition w cleanup - filtr mtime | cleanup-orphaned-files.ts | Latwa |
| CLEANUP-K02 | Brak dry-run w DELETE | cleanup-orphaned-files.ts | Latwa |
| CLEANUP-K03 | Brak logowania usunietych plikow | cleanup-orphaned-files.ts | Latwa |
| CLEANUP-K05 | deleteProject() brak kaskadowego usuwania | projectsStorage.ts | Srednia |
| CLEANUP-K06 | deleteProjectRevision() brak usuwania galerii | projectsStorage.ts | Latwa |
| SEC-K05 | Niepodpisane cookie auth | auth.ts | Srednia |

### WYSOKIE (naprawic w tym tygodniu)

| ID | Opis | Plik | Trudnosc |
|----|------|------|----------|
| SEC-K01 | Endpointy admin bez withAdminAuth | 7 plikow | Latwa |
| SEC-K02 | Hardcoded SECRET_KEY w PHP | config.php | Latwa |
| SEC-K03 | CORS Wildcard na PHP | 7 plikow PHP | Latwa |
| SEC-K04 | Path Traversal PHP | 7 plikow PHP | Srednia |
| SEC-W01 | Emergency code MASTER123 | verify-code.ts | Srednia |
| SEC-W02 | CSP unsafe-eval/inline | next.config.js | Srednia |
| SEC-W03 | Brak naglowkow bezpieczenstwa | next.config.js | Latwa |
| DUP-01 | design/[id] vs projekty/[id] 1050 linii | 2 pliki | Srednia |

### SREDNIE (naprawic w tym miesiacu)

| ID | Opis | Plik | Trudnosc |
|----|------|------|----------|
| CLEANUP-K04 | Ciche usuwanie folderow | cleanup-orphaned-files.ts | Latwa |
| SEC-W05 | boardId/imageId bez walidacji traversal | moodboard/upload.ts | Latwa |
| SEC-W06 | Brak rate limit na auth/status | auth/status.ts | Latwa |
| SEC-W07 | Timing attack email enumeration | request-code.ts | Srednia |
| OPT-01 | Base64 zamiast multipart gallery upload | upload-gallery.ts | Srednia |
| OPT-02 | Brak memoizacji w komponentach | design/[id].tsx | Latwa |
| STORAGE-01 | Zduplikowana getDataDir (4x) | 4 pliki | Latwa |
| LOGIC-04 | Math.random w generateGroupId | storage.ts | Latwa |
| LOGIC-05 | Runtime migracje | projectsStorage.ts | Srednia |

### NISKIE (przy okazji)

| ID | Opis | Plik | Trudnosc |
|----|------|------|----------|
| DEAD-01 | useDebounce.ts nieuzywany | useDebounce.ts | Latwa |
| DEAD-02 | /folders martwa strona | folders.tsx | Latwa |
| DEAD-06 | Zbedny rewrite next.config | next.config.js | Latwa |
| DEAD-07 | Puste getServerSideProps x6 | 6 stron | Latwa |
| DUP-02 | design.tsx vs projekty.tsx | 2 pliki | Latwa |
| DUP-05 | Wzorzec load/save w storage (6x) | storage.ts | Srednia |
| URL-01 | Mieszanka jezykow w URL | routing | Latwa |
| OVER-01 | Runtime migrations | projectsStorage.ts | Srednia |
| OVER-02 | cacheStatusService zbedna warstwa | cacheStatusService.ts | Latwa |
| OPT-04 | image-proxy robi redirect | image-proxy.ts | Latwa |

---

## Statystyka laczna

| Kategoria | Krytyczne | Wysokie | Srednie | Niskie | Razem |
|-----------|-----------|---------|---------|--------|-------|
| Cleanup/sieroty | 6 | - | 1 | - | **7** |
| Bezpieczenstwo | 1 | 7 | 3 | - | **11** |
| Storage/sciezki | - | - | 1 | - | **1** |
| URL/czytelnosc | - | - | - | 2 | **2** |
| Logika | - | - | 3 | 1 | **4** |
| Martwy kod | - | - | - | 5 | **5** |
| Duplikacja | - | 1 | 1 | 3 | **5** |
| Optymalizacja | - | - | 2 | 1 | **3** |
| Over-engineering | - | - | - | 3 | **3** |
| **RAZEM** | **7** | **8** | **11** | **15** | **41** |

---

## Kolejnosc naprawy

### Faza 1 - NATYCHMIAST (1-2 dni): Cleanup + security critical
1. CLEANUP-K01: Dodaj filtr mtime do cleanup scan
2. CLEANUP-K03: Dodaj logowanie usuniec
3. CLEANUP-K02: Dodaj dry-run mode
4. CLEANUP-K05: Kaskadowe usuwanie w deleteProject()
5. CLEANUP-K06: Usuwanie galerii w deleteProjectRevision()
6. SEC-K01: Dodaj withAdminAuth do 7 endpointow

### Faza 2 - TEN TYDZIEN (3-5 dni): Security hardening
7. SEC-K02-K04: Poprawki PHP (secret, CORS, path traversal)
8. SEC-K05: Podpisywanie cookie
9. SEC-W01: Wzmocnienie emergency code
10. SEC-W02-W03: CSP + security headers
11. DUP-01: Merge stron design/projekty

### Faza 3 - TEN MIESIAC: Optymalizacja i czyszczenie
12. OPT-01: Multipart upload galerii
13. STORAGE-01: Wspolny getDataDir
14. DEAD-*: Usuwanie martwego kodu
15. OVER-*: Uproszczenie abstrakcji

---

_Raport wygenerowany: 2026-02-06 | Audyt: 4 rownolegla agenty analizujace ~80 plikow_
