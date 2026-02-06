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

### DEAD-04: Interfejs \_PendingFile nieuzywany

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

| Endpoint                    | Chroniony?     | Sposob                    |
| --------------------------- | -------------- | ------------------------- |
| `/api/auth/request-code`    | Rate limit     | `withRateLimit(5, 15min)` |
| `/api/auth/verify-code`     | Rate limit     | `withRateLimit(5, 1min)`  |
| `/api/auth/status`          | **BRAK**       | Brak rate limit           |
| `/api/moodboard/upload`     | Cookie         | `getEmailFromCookie`      |
| `/api/moodboard/images/*`   | Cookie         | `getEmailFromCookie`      |
| `/api/projects/gallery/*`   | Cookie         | `getEmailFromCookie`      |
| `/api/projects/thumbnail/*` | Cookie         | `getEmailFromCookie`      |
| `/api/admin/settings` GET   | **Publiczny**  | Swiadomy design           |
| `/api/admin/settings` POST  | Admin          | `withAdminAuth`           |
| `/api/admin/files/*`        | Admin          | `withAdminAuth`           |
| `/api/admin/projects/*`     | Admin          | `withAdminAuth`           |
| `/api/admin/cache/status`   | **Middleware** | Brak `withAdminAuth`      |
| `/api/admin/cache/trigger`  | Admin          | `withAdminAuth`           |
| `/api/admin/volume/*`       | **Middleware** | Brak `withAdminAuth`      |
| `/api/admin/stats/*`        | **Middleware** | Brak `withAdminAuth`      |
| `/api/cron/*`               | CRON_SECRET    | Header check              |

**Legenda:** "Middleware" = chroniony przez Edge middleware (matcher), ale brak defense-in-depth w samym handlerze.

---

## 11. Podsumowanie priorytetow

### KRYTYCZNE (naprawic natychmiast)

| ID          | Opis                                          | Plik                      | Trudnosc |
| ----------- | --------------------------------------------- | ------------------------- | -------- |
| CLEANUP-K01 | Race condition w cleanup - filtr mtime        | cleanup-orphaned-files.ts | Latwa    |
| CLEANUP-K02 | Brak dry-run w DELETE                         | cleanup-orphaned-files.ts | Latwa    |
| CLEANUP-K03 | Brak logowania usunietych plikow              | cleanup-orphaned-files.ts | Latwa    |
| CLEANUP-K05 | deleteProject() brak kaskadowego usuwania     | projectsStorage.ts        | Srednia  |
| CLEANUP-K06 | deleteProjectRevision() brak usuwania galerii | projectsStorage.ts        | Latwa    |
| SEC-K05     | Niepodpisane cookie auth                      | auth.ts                   | Srednia  |

### WYSOKIE (naprawic w tym tygodniu)

| ID      | Opis                                    | Plik           | Trudnosc |
| ------- | --------------------------------------- | -------------- | -------- |
| SEC-K01 | Endpointy admin bez withAdminAuth       | 7 plikow       | Latwa    |
| SEC-K02 | Hardcoded SECRET_KEY w PHP              | config.php     | Latwa    |
| SEC-K03 | CORS Wildcard na PHP                    | 7 plikow PHP   | Latwa    |
| SEC-K04 | Path Traversal PHP                      | 7 plikow PHP   | Srednia  |
| SEC-W01 | Emergency code MASTER123                | verify-code.ts | Srednia  |
| SEC-W02 | CSP unsafe-eval/inline                  | next.config.js | Srednia  |
| SEC-W03 | Brak naglowkow bezpieczenstwa           | next.config.js | Latwa    |
| DUP-01  | design/[id] vs projekty/[id] 1050 linii | 2 pliki        | Srednia  |

### SREDNIE (naprawic w tym miesiacu)

| ID          | Opis                                    | Plik                      | Trudnosc |
| ----------- | --------------------------------------- | ------------------------- | -------- |
| CLEANUP-K04 | Ciche usuwanie folderow                 | cleanup-orphaned-files.ts | Latwa    |
| SEC-W05     | boardId/imageId bez walidacji traversal | moodboard/upload.ts       | Latwa    |
| SEC-W06     | Brak rate limit na auth/status          | auth/status.ts            | Latwa    |
| SEC-W07     | Timing attack email enumeration         | request-code.ts           | Srednia  |
| OPT-01      | Base64 zamiast multipart gallery upload | upload-gallery.ts         | Srednia  |
| OPT-02      | Brak memoizacji w komponentach          | design/[id].tsx           | Latwa    |
| STORAGE-01  | Zduplikowana getDataDir (4x)            | 4 pliki                   | Latwa    |
| LOGIC-04    | Math.random w generateGroupId           | storage.ts                | Latwa    |
| LOGIC-05    | Runtime migracje                        | projectsStorage.ts        | Srednia  |

### NISKIE (przy okazji)

| ID      | Opis                              | Plik                  | Trudnosc |
| ------- | --------------------------------- | --------------------- | -------- |
| DEAD-01 | useDebounce.ts nieuzywany         | useDebounce.ts        | Latwa    |
| DEAD-02 | /folders martwa strona            | folders.tsx           | Latwa    |
| DEAD-06 | Zbedny rewrite next.config        | next.config.js        | Latwa    |
| DEAD-07 | Puste getServerSideProps x6       | 6 stron               | Latwa    |
| DUP-02  | design.tsx vs projekty.tsx        | 2 pliki               | Latwa    |
| DUP-05  | Wzorzec load/save w storage (6x)  | storage.ts            | Srednia  |
| URL-01  | Mieszanka jezykow w URL           | routing               | Latwa    |
| OVER-01 | Runtime migrations                | projectsStorage.ts    | Srednia  |
| OVER-02 | cacheStatusService zbedna warstwa | cacheStatusService.ts | Latwa    |
| OPT-04  | image-proxy robi redirect         | image-proxy.ts        | Latwa    |

---

## Statystyka laczna

| Kategoria        | Krytyczne | Wysokie | Srednie | Niskie | Razem  |
| ---------------- | --------- | ------- | ------- | ------ | ------ |
| Cleanup/sieroty  | 6         | -       | 1       | -      | **7**  |
| Bezpieczenstwo   | 1         | 7       | 3       | -      | **11** |
| Storage/sciezki  | -         | -       | 1       | -      | **1**  |
| URL/czytelnosc   | -         | -       | -       | 2      | **2**  |
| Logika           | -         | -       | 3       | 1      | **4**  |
| Martwy kod       | -         | -       | -       | 5      | **5**  |
| Duplikacja       | -         | 1       | 1       | 3      | **5**  |
| Optymalizacja    | -         | -       | 2       | 1      | **3**  |
| Over-engineering | -         | -       | -       | 3      | **3**  |
| **RAZEM**        | **7**     | **8**   | **11**  | **15** | **41** |

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
14. DEAD-\*: Usuwanie martwego kodu
15. OVER-\*: Uproszczenie abstrakcji

---

_Raport wygenerowany: 2026-02-06 | Audyt: 4 rownolegla agenty analizujace ~80 plikow_
