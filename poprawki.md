# Raport poprawek - Content Browser v2

**Data:** 2026-02-06
**Wersja:** b 0.33 (branch: version_0.3)
**Projekt:** Next.js 15.5.9 + React 19 + TypeScript + PHP backend

---

## Spis tresci

1. [Bezpieczenstwo (KRYTYCZNE)](#1-bezpieczenstwo-krytyczne)
2. [Pliki graficzne - sciezki zapisu](#2-pliki-graficzne---sciezki-zapisu)
3. [Czytelnosc linkow w pasku adresu](#3-czytelnosc-linkow-w-pasku-adresu)
4. [Martwy kod](#4-martwy-kod)
5. [Duplikacja kodu](#5-duplikacja-kodu)
6. [Optymalizacja](#6-optymalizacja)
7. [Logika i poprawnosc](#7-logika-i-poprawnosc)
8. [Over-engineering](#8-over-engineering)
9. [Inline styles](#9-inline-styles)
10. [Podsumowanie priorytetow](#10-podsumowanie-priorytetow)

---

## 1. Bezpieczenstwo (KRYTYCZNE)

### SEC-K01: Hardcoded SECRET_KEY w public/config.php
- **Plik:** `public/config.php:11`
- **Problem:** Klucz HMAC `SECRET_KEY` jest zahardkodowany bezposrednio w pliku PHP w katalogu `public/`. Klucz jest widoczny w repozytorium git.
- **Ryzyko:** Kazdy z dostepem do repo moze wygenerowac wlasne tokeny do operacji plikowych (upload, delete, rename, move, mkdir).
- **Poprawka:** Przeniesc SECRET_KEY do zmiennej srodowiskowej na serwerze PHP. W pliku config.php czytac z `getenv('SECRET_KEY')`.

### SEC-K02: CORS Wildcard na endpointach PHP
- **Pliki:** `public/file-upload.php:8`, `public/file-proxy.php:8`, `public/file-list.php:8`, `public/file-delete.php:8`, `public/file-move.php:8`, `public/file-rename.php:8`, `public/file-mkdir.php:8`
- **Problem:** Wszystkie 7 endpointow PHP uzywa `Access-Control-Allow-Origin: *`.
- **Ryzyko:** Zlsliwa strona moze wyslac zapytania do tych endpointow w imieniu uzytkownika (CSRF/cross-origin).
- **Poprawka:** Ograniczyc do `https://app.conceptfab.com`.

### SEC-K03: Slaba ochrona Path Traversal w PHP
- **Pliki:** Wszystkie pliki PHP (file-proxy.php:36, file-upload.php:75, file-list.php:33, file-delete.php:52, file-move.php:53, file-rename.php:53, file-mkdir.php:53)
- **Problem:** `str_replace(['..', "\0"], '', $path)` nie obsluguje zakodowanych sekwencji (`%2e%2e`, `....//`, podwojne kodowanie).
- **Poprawka:** Uzyc `realpath()` + sprawdzenie prefixu PRIVATE_FILES_PATH:
  ```php
  $realPath = realpath($fullPath);
  if ($realPath === false || strpos($realPath, PRIVATE_FILES_PATH) !== 0) {
      http_response_code(403);
      die('Access denied');
  }
  ```

### SEC-K04: Cookie auth_email nie jest podpisane kryptograficznie
- **Plik:** `src/utils/auth.ts:26-29`
- **Problem:** Cookie `auth_email` to zwykly tekst (email). Weryfikacja polega na sprawdzeniu czy email jest na liscie zalogowanych. Atakujacy moze ustawic cookie na dowolny email z whitelist.
- **Ryzyko:** Podszywanie sie pod innego uzytkownika, w tym admina (patrz adminMiddleware.ts:16-18).
- **Poprawka:** Podpisywac cookie kryptograficznie (HMAC) lub uzyc session ID z crypto.randomUUID().

### SEC-K05: CSP z unsafe-eval i unsafe-inline
- **Plik:** `next.config.js:3`
- **Problem:** `script-src 'self' 'unsafe-eval' 'unsafe-inline'` efektywnie wylaczy ochrone XSS z CSP.
- **Poprawka:** Usunac `unsafe-eval`. Zastapic `unsafe-inline` nonce-based lub hash-based approach.

### SEC-W01: Content-Disposition bez sanityzacji
- **Plik:** `public/file-proxy.php:74`
- **Problem:** `basename($file)` w headerze Content-Disposition bez escapowania. Nazwy z `"` moga zlamac header.
- **Poprawka:** Uzyc `rawurlencode(basename($file))` + format `filename*=UTF-8''...`.

### SEC-W02: Brak walidacji boardId/imageId w moodboard upload
- **Plik:** `pages/api/moodboard/upload.ts:35-44`, `src/utils/moodboardStorage.ts:38`
- **Problem:** `boardId` i `imageId` nie sa walidowane na format. `saveMoodboardImage` robi `path.join(baseDir, boardId)` bez sprawdzenia path traversal. Porownaj z `getMoodboardImageAbsolutePath` (linia 73) ktora MA taka walidacje.
- **Poprawka:** Dodac walidacje path traversal w `saveMoodboardImage` (analogicznie do getMoodboardImageAbsolutePath).

---

## 2. Pliki graficzne - sciezki zapisu

### STORAGE-01: Niespojny fallback dla katalogu danych w dev
- **Pliki:**
  - `src/utils/moodboardStorage.ts:9` -> fallback: `process.cwd()/data`
  - `src/utils/projectsStorage.ts:44` -> fallback: `process.cwd()/data`
  - `src/utils/storage.ts:55` -> fallback: `process.cwd()/data`
  - `src/utils/cacheStorage.ts:77` -> fallback: `process.cwd()/data`
  - `src/utils/thumbnailStoragePath.ts:16` -> fallback: `process.cwd()/data/thumbnails`
  - `src/config/constants.ts:53` -> VOLUME_ROOT: `./tmp/data-storage`
- **Problem:** W produkcji wszystko idzie na `/data-storage` (OK). Ale VOLUME_ROOT ma inny fallback (`./tmp/data-storage`) niz reszta modulow (`data/`).
- **Poprawka:** Wydzielic jedna funkcje `getDataDir()` do wspolnego modulu i uzyc we wszystkich plikach.

### STORAGE-02: Zduplikowana funkcja getDataDir() - 4 kopie
- **Pliki:** `moodboardStorage.ts:4`, `projectsStorage.ts:39`, `storage.ts:50`, `cacheStorage.ts:73`
- **Problem:** Identyczna logika (sprawdz `/data-storage`, fallback do `process.cwd()/data`) powtorzona 4 razy.
- **Poprawka:** Wydzielic do `src/utils/dataDir.ts` i importowac.

### STORAGE-03: Architektura dwu-serwerowa (informacja)
- PHP (`public/config.php:8`) zapisuje na hostingu (`/home/host372606/domains/conceptfab.com/content_browser/`)
- Next.js (Railway) zapisuje na volume `/data-storage`
- **To sa dwa rozne serwery/systemy plikow:**
  - Gallery content (katalogi z obrazami produktowymi) -> serwer PHP/hosting
  - Moodboard, Design thumbnails/gallery, projekty JSON, settings -> `/data-storage` (Railway volume)
- **Status:** Swiadomy design, ale warto udokumentowac w README.

---

## 3. Czytelnosc linkow w pasku adresu

### URL-01: Mieszanka jezykow w URL-ach
- `/projekty` i `/projekty/[slug]` - po polsku
- `/design`, `/moodboard`, `/folders`, `/admin-login` - po angielsku
- **Poprawka:** Zdecydowac sie na jeden jezyk (rekomendacja: angielski lub konsekwentnie polski).

### URL-02: Duplikacja stron /design i /projekty
- `pages/design.tsx` vs `pages/projekty.tsx` - identyczna funkcjonalnosc
- `pages/design/[id].tsx` vs `pages/projekty/[id].tsx` - identyczny kod (~1100 linii zduplikowanych)
- **Problem:** Dwa URL-e prowadza do tego samego. Uzytkownik moze sie pogubic.
- **Poprawka:** Usunac jedna ze sciezek lub zrobic redirect.

### URL-03: Strona /folders jest pusta/niedokonczona
- **Plik:** `pages/folders.tsx`
- Renderuje 9 pustych `<div>` elementow. Cala logika danych jest martwa (prefix `_`).
- **Poprawka:** Usunac strone lub dokonczyc.

### URL-04: Slug w URL-ach projektow (OK)
- `/design/moj-projekt` - slug generowany z nazwy z obsluga polskich znakow
- Breadcrumbs poprawnie nawiguja
- **Status:** Poprawnie zaimplementowane.

---

## 4. Martwy kod

### DEAD-01: Strona /folders - caly plik martwy
- **Plik:** `pages/folders.tsx` (125 linii)
- Zmienne `_data`, `_loading`, `_error`, `_getThumbnailUrl` sa zdefiniowane ale nigdy nie uzywane.
- Strona nie wyswietla zadnych danych uzytkownikowi.
- **Akcja:** Usunac plik.

### DEAD-02: decodeDataUrlToBuffer zduplikowana 3x
- **Pliki:** `src/utils/moodboardStorage.ts:20`, `src/utils/projectsStorage.ts:161`, `pages/api/admin/projects/upload-gallery.ts:9`
- **Poprawka:** Zostawic jedna wersje (juz eksportowana z moodboardStorage) i importowac w pozostalych.

### DEAD-03: Interfejs _PendingFile nieuzywany
- **Plik:** `src/utils/storage.ts:102`
- Interfejs z prefixem `_` - sluzy tylko jako komentarz.
- **Akcja:** Usunac lub zamienic na komentarz JSDoc.

### DEAD-04: Pole screenshotDataUrl - legacy
- **Pliki:** `src/utils/projectsStorage.ts:319,369-372`, `pages/design/[id].tsx:15`, `pages/projekty/[id].tsx:15`
- Po migracji do plikowych miniaturek pole nie jest ustawiane przez nowe flow.
- **Akcja:** Po pelnej migracji usunac z typu i kodu.

### DEAD-05: Zbedny rewrite w next.config.js
- **Plik:** `next.config.js:50-53`
- `rewrites()` mapuje `/api/gallery/:path*` na `/api/gallery/:path*` - no-op.
- **Akcja:** Usunac blok `rewrites()`.

### DEAD-06: Komentarze o usunietych funkcjach
- **Plik:** `src/utils/storage.ts:59,168`
- Komentarze typu `// saveData() usuniete` i `// loadData() usuniete` to relikty migracji.
- **Akcja:** Usunac.

---

## 5. Duplikacja kodu

### DUP-01: KRYTYCZNA - design/[id].tsx vs projekty/[id].tsx (~1050 linii)
- **Pliki:** `pages/design/[id].tsx` (1102 linie) vs `pages/projekty/[id].tsx` (1090 linii)
- ~99% identycznego kodu. Roznice: breadcrumbs, sciezka nawigacji.
- **Poprawka:** Wydzielic wspolny komponent `ProjectDetailPage` z parametrem `basePath`. Obie strony -> wrappery.

### DUP-02: design.tsx vs projekty.tsx (~100 linii)
- **Pliki:** `pages/design.tsx` (107 linii) vs `pages/projekty.tsx` (107 linii)
- Identyczny kod poza URL nawigacji i tytulem.
- **Poprawka:** Wspolny komponent `ProjectsListPage` z parametrem `basePath`.

### DUP-03: getDataDir() - 4 kopie
- Patrz STORAGE-02 powyzej.

### DUP-04: decodeDataUrlToBuffer - 3 kopie
- Patrz DEAD-02 powyzej.

### DUP-05: Wzorzec load/save w storage.ts (~200 linii)
- **Plik:** `src/utils/storage.ts`
- Identyczny wzorzec `loadX()`/`saveX()` powtorzony 6 razy (whitelist, blacklist, groups, pending, codes, settings).
- Kazda para ma ten sam error handling, tmp write + rename.
- **Poprawka:** Generyczna funkcja `loadJsonFile<T>()`/`saveJsonFile<T>()`.

---

## 6. Optymalizacja

### OPT-01: Galeria przesylana jako base64 w JSON body
- **Pliki:** `pages/api/admin/projects/upload-gallery.ts`, `pages/design/[id].tsx:265-287`, `pages/projekty/[id].tsx:265-287`
- Obrazy konwertowane do base64 Data URL -> JSON -> POST. Base64 zwieksza rozmiar o ~33%.
- Porownanie: `upload-thumbnail.ts` poprawnie uzywa `multipart/form-data`.
- **Poprawka:** Przejsc na multipart/form-data (jak upload-thumbnail).

### OPT-02: getProjects() uruchamia migracje przy kazdym wywolaniu
- **Plik:** `src/utils/projectsStorage.ts:228-238`
- `migrateThumbnailsToFiles()` i `migrateSlugs()` uruchamiane przy kazdym `getProjects()`.
- **Poprawka:** Dodac flage `migrationChecked` lub przeniesc do jednorazowego skryptu.

### OPT-03: image-proxy.ts robi redirect zamiast proxy
- **Plik:** `pages/api/image-proxy.ts:40`
- Endpoint o nazwie "image-proxy" nie proxuje - robi redirect 301 do oryginalnego URL.
- **Problem:** Redirect z `immutable` cache = zmiana URL wymaga zmiany sciezki. Jesli proxy jest potrzebne (CORS), dane nie sa proxowane.
- **Poprawka:** Zmienic nazwe na `image-redirect` lub zaimplementowac prawdziwe proxy.

### OPT-04: In-memory cache bez synchronizacji
- **Pliki:** `src/utils/storage.ts:426`, `src/utils/cacheStorage.ts:135`
- `cachedData` wspoldzielone w procesie. Przy rownoczesnych requestach mozliwy race condition.
- **Ryzyko:** Niskie w serverless (krotki lifecycle), wyzsze w persistent server.
- **Poprawka:** Dla persistent server dodac proste file-locking lub queue.

---

## 7. Logika i poprawnosc

### LOGIC-01: loginAdmin nie normalizuje email case-insensitive
- **Plik:** `src/utils/storage.ts:681`
- `loginAdmin` uzywa `!codes.loggedInAdmins.includes(email)` bez normalizacji lowercase.
- Porownaj z `loginUser` (linia 590) ktory poprawnie normalizuje.
- **Poprawka:** Dodac `email.trim().toLowerCase()`.

### LOGIC-02: logoutAdmin nie normalizuje email
- **Plik:** `src/utils/storage.ts:688-693`
- `u !== email` bez case normalization. Login jako `Admin@ex.com`, logout jako `admin@ex.com` -> sesja nie usunieta.
- **Poprawka:** Normalizowac.

### LOGIC-03: isAdminLoggedIn nie normalizuje email
- **Plik:** `src/utils/storage.ts:695-698`
- Analogicznie do LOGIC-01/02.

### LOGIC-04: generateGroupId uzywa Math.random
- **Plik:** `src/utils/storage.ts:719-721`
- `Math.random().toString(36)` nie jest kryptograficznie bezpieczne.
- Niespojne z reszta kodu (crypto.randomUUID()).
- **Poprawka:** Uzyc `crypto.randomUUID()`.

### LOGIC-05: deleteProjectRevision nie usuwa plikow galerii
- **Plik:** `src/utils/projectsStorage.ts:406-425`
- Usuwa miniaturke (`deleteThumbnailFile`), ale NIE usuwa plikow galerii (`galleryPaths`).
- Osierocone pliki w `/data-storage/thumbnails/design-gallery/`.
- **Poprawka:** Dodac usuwanie katalogu galerii rewizji.

### LOGIC-06: deleteProject nie usuwa miniaturek ani galerii
- **Plik:** `src/utils/projectsStorage.ts:427-437`
- Przy usuwaniu projektu nie sa usuwane pliki powiazanych rewizji (miniaturki, galerie).
- **Poprawka:** Iterowac po rewizjach i usunac pliki.

---

## 8. Over-engineering

### OVER-01: Migracje runtime zamiast jednorazowych skryptow
- **Pliki:** `src/utils/projectsStorage.ts:191-226` (migrateThumbnailsToFiles, migrateSlugs), `src/utils/cacheStorage.ts:204-255` (migrateLegacyToCurrent)
- Kod migracyjny sprawdzany przy kazdym uzyciu.
- **Poprawka:** Jednorazowe skrypty lub flaga "migration done".

### OVER-02: Komentarze etapow migracji w storage.ts
- **Plik:** `src/utils/storage.ts` (820 linii)
- "Etap 1", "Etap 2", "Etap 5" - relikty przyrostowej migracji. "saveData() usuniete" itp.
- **Poprawka:** Wyczyscic komentarze migracyjne.

---

## 9. Inline styles

### STYLE-01: Rozlegle inline styles w admin.tsx
- **Plik:** `pages/admin.tsx` - liczne `style={{...}}` na elementach (linie 442-873)
- Niespojne z reszta kodu (klasy CSS).
- **Poprawka:** Przeniesc do plikow CSS.

---

## 10. Podsumowanie priorytetow

| Priorytet | ID | Opis | Trudnosc |
|-----------|-----|------|----------|
| KRYTYCZNY | SEC-K01 | Hardcoded SECRET_KEY w PHP | Latwa |
| KRYTYCZNY | SEC-K02 | CORS Wildcard na PHP | Latwa |
| KRYTYCZNY | SEC-K03 | Slaba ochrona Path Traversal PHP | Srednia |
| KRYTYCZNY | SEC-K04 | Niepodpisane cookie auth | Srednia |
| WYSOKI | SEC-K05 | CSP unsafe-eval/inline | Srednia |
| WYSOKI | SEC-W01 | Content-Disposition bez sanityzacji | Latwa |
| WYSOKI | SEC-W02 | Brak walidacji boardId w moodboard | Latwa |
| WYSOKI | DUP-01 | design/[id] vs projekty/[id] (1050 linii) | Srednia |
| WYSOKI | DUP-02 | design.tsx vs projekty.tsx (100 linii) | Latwa |
| SREDNI | OPT-01 | Base64 zamiast multipart upload | Srednia |
| SREDNI | LOGIC-01 | Admin login case-insensitive (3 funkcje) | Latwa |
| SREDNI | LOGIC-05 | Brak usuwania plikow galerii przy delete | Latwa |
| SREDNI | LOGIC-06 | Brak usuwania plikow projektu przy delete | Latwa |
| SREDNI | STORAGE-01 | Niespojny fallback dataDir | Latwa |
| SREDNI | STORAGE-02 | Zduplikowana getDataDir (4x) | Latwa |
| NISKI | DEAD-01 | Strona /folders martwa | Latwa |
| NISKI | DEAD-02 | decodeDataUrlToBuffer (3 kopie) | Latwa |
| NISKI | DEAD-05 | Zbedny rewrite w next.config.js | Latwa |
| NISKI | URL-01 | Mieszanka jezykow w URL-ach | Latwa |
| NISKI | OVER-01 | Runtime migrations | Srednia |
| NISKI | STYLE-01 | Inline styles w admin | Srednia |
| NISKI | LOGIC-04 | Math.random zamiast crypto w groupId | Latwa |
| NISKI | OPT-03 | image-proxy robi redirect nie proxy | Latwa |

---

## Laczna statystyka

| Kategoria | Krytyczne | Wysokie | Srednie | Niskie | Razem |
|-----------|-----------|---------|---------|--------|-------|
| Bezpieczenstwo | 4 | 3 | - | - | **7** |
| Storage/sciezki | - | - | 2 | - | **2** |
| URL/czytelnosc | - | - | - | 3 | **3** |
| Martwy kod | - | - | - | 5 | **5** |
| Duplikacja | - | 2 | - | 2 | **4** |
| Optymalizacja | - | - | 1 | 2 | **3** |
| Logika | - | - | 4 | 1 | **5** |
| Over-engineering | - | - | - | 2 | **2** |
| Style | - | - | - | 1 | **1** |
| **RAZEM** | **4** | **5** | **7** | **16** | **32** |

---

_Raport wygenerowany: 2026-02-06_
