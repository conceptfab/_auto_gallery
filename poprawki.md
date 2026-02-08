# Raport poprawek ConceptDesk

> Analiza: optymalizacja, martwy kod, over-engineering, bezpieczenstwo, logika usuwania
> Data: 2026-02-09

---

## SPIS TRESCI

1. [KRYTYCZNE: Bledy logiki usuwania](#1-krytyczne-bledy-logiki-usuwania) — ZREALIZOWANE
2. [BEZPIECZENSTWO](#2-bezpieczenstwo) — ZREALIZOWANE
3. [KOD MIGRACYJNY DO USUNIECIA](#3-kod-migracyjny-do-usuniecia) — do realizacji
4. [MARTWY KOD I NIEUZYWANE EKSPORTY](#4-martwy-kod-i-nieuzywane-eksporty) — do realizacji
5. [OVER-ENGINEERING](#5-over-engineering) — do realizacji
6. [OPTYMALIZACJA WYDAJNOSCI](#6-optymalizacja-wydajnosci) — do realizacji
7. [PLAN WDROZENIA](#7-plan-wdrozenia)

---

## 1. KRYTYCZNE: BLEDY LOGIKI USUWANIA [ZREALIZOWANE]

### BUG-1: Fire-and-forget usuwanie obrazow moodboard [ZREALIZOWANE]

**Plik:** `src/contexts/MoodboardContext.tsx:456-489`

**Problem:** Funkcja `removeImage` odpala `fetch` DELETE bez `await`. Stan lokalny aktualizuje sie natychmiast, ale serwer moze nie usunac pliku. Bledy sa cicho ignorowane w `.catch(() => {})`.

```typescript
// Linia 464 - brak await!
fetch('/api/moodboard/delete-image', {
  method: 'POST',
  ...
}).catch(() => {
  // Ignoruj bledy usuwania pliku  <-- PROBLEM
});
```

**Skutek:** Obraz znika z UI, ale plik zostaje na dysku. Po odswiezeniu strony obraz wraca. Uzytkownik musi powtarzac usuwanie.

**Wykonane zmiany w `src/contexts/MoodboardContext.tsx`:**
- Funkcja `removeImage` zmieniona na `async`
- Dane do usuwania (boardId, imageToRemove) odczytywane z `appState` PRZED aktualizacja stanu
- Dodany `await` na `fetch('/api/moodboard/delete-image')`
- Dodane sprawdzenie `res.ok` z logowaniem bledu
- Dodany `try/catch` z logowaniem bledu sieci
- Stan lokalny (`setAppState`) aktualizowany DOPIERO po zakonczeniu requestu serwera
- Dodany `appState` do tablicy zaleznosci `useCallback`

---

### BUG-2: deleteGroup() nie usuwa folderu danych grupy [ZREALIZOWANE]

**Plik:** `src/utils/storage.ts:767-775`

**Problem:** Funkcja usuwa grupe tylko z `groups.json`, ale NIE kasuje folderu `/data-storage/groups/{groupId}/` z projektami i moodboardami.

```typescript
export async function deleteGroup(id: string): Promise<boolean> {
  const groups = await loadGroups();
  const index = groups.findIndex((g) => g.id === id);
  if (index === -1) return false;
  groups.splice(index, 1);
  await saveGroups(groups);
  // BRAK: usuwanie folderu /data-storage/groups/{id}/
  return true;
}
```

**Skutek:** Dane grupy (projekty, moodboardy, obrazy) zostaja na dysku jako osierocone pliki. Wyciek przestrzeni dyskowej.

**Wykonane zmiany w `src/utils/storage.ts`:**
- Dodany import `getGroupsBaseDir` z `projectsStoragePath`
- Sygnatura zmieniona na `deleteGroup(id: string, deleteData = true)` — domyslnie usuwa dane
- Po usunieciu z `groups.json` dodany blok usuwajacy folder `/data-storage/groups/{id}/` przez `fsp.rm(groupDir, { recursive: true, force: true })`
- Bledy usuwania folderu logowane przez `console.error` (nie przerywaja operacji)

---

### BUG-3: deleteProjectRevision() - operacja dwufazowa bez transakcji [ZREALIZOWANE]

**Plik:** `src/utils/projectsStorage.ts:680-709`

**Problem:** Najpierw kasuje folder rewizji, potem aktualizuje `project.json`. Jesli faza 2 padnie (odczyt/zapis project.json), rewizja jest fizycznie skasowana ale nadal figuruje w liscie `revisionIds`.

```typescript
// Faza 1: kasuj folder
await fsp.rm(revDir, { recursive: true, force: true });
// Faza 2: aktualizuj project.json - moze padnac!
raw = await fsp.readFile(projectPath, 'utf8');
meta.revisionIds = meta.revisionIds.filter(id => id !== revisionId);
await fsp.writeFile(projectPath, ...);
```

**Skutek:** Rewizja znika z dysku ale pokazuje sie w UI. Klikniecie w nia daje blad "not found".

**Wykonane zmiany w `src/utils/projectsStorage.ts` (deleteProjectRevision):**
- Odwrocona kolejnosc operacji: najpierw aktualizacja `project.json` (odwracalna), potem usuwanie folderu rewizji (nieodwracalne)
- Dodane `logger.error` przy bledzie odczytu/parsowania `project.json` (z kontekstem projectId, groupId)
- Dodane `logger.error` przy bledzie usuwania folderu rewizji (z kontekstem projectId, revisionId)

---

### BUG-4: deleteProject() glota bledy bez logowania [ZREALIZOWANE]

**Plik:** `src/utils/projectsStorage.ts:711-719`

**Problem:** Caly blok `catch` zwraca `false` bez jakiegokolwiek logowania bledu. Nie wiadomo czy projekt nie istnieje, czy jest blokada pliku (Windows), czy brak uprawnien.

```typescript
export async function deleteProject(id: string, groupId?: string): Promise<boolean> {
  try {
    await fsp.rm(projectDir, { recursive: true, force: true });
    return true;
  } catch {
    return false; // <-- zero informacji diagnostycznych
  }
}
```

**Wykonane zmiany w `src/utils/projectsStorage.ts` (deleteProject):**
- Pusty `catch` zamieniony na `catch (err)` z `logger.error('[deleteProject] Blad usuwania projektu', { id, groupId, projectDir, error: err })`
- Logowany pelny kontekst: ID projektu, groupId, sciezka na dysku, tresc bledu

---

### BUG-5: Batch delete w FileManager nie sprawdza response.ok [ZREALIZOWANE]

**Plik:** `src/components/FileManager.tsx:283-302`

**Problem:** Petla `for...of` wykonuje DELETE request ale nie sprawdza `response.ok`. Jesli serwer zwroci 404/500, kod kontynuuje bez informowania uzytkownika o czesciowym niepowodzeniu.

```typescript
for (const path of selectedItems) {
  try {
    await fetch('/api/admin/files/delete', { ... });
    // BRAK: sprawdzenia response.ok
  } catch (err) {
    logger.error('Delete error (batch)', { path, error: err });
    // Kontynuuje bez informowania uzytkownika
  }
}
```

**Wykonane zmiany w `src/components/FileManager.tsx` (handleDeleteSelected):**
- Dodana tablica `failed: string[]` do sledzenia nieudanych operacji
- Zmienna petli `path` przemianowana na `filePath` (unikniecie shadowing `path` z importu)
- Dodane sprawdzenie `res.ok` — przy bledzie serwera sciezka dodawana do `failed`
- Bledy sieci (catch) rowniez dodaja sciezke do `failed`
- Po zakonczeniu petli: jesli `failed.length > 0`, wyswietlany alert z liczba nieudanych usuniec
- Dodane logowanie `logger.error('Delete failed (batch)', { path, status })` przy bledach

---

### BUG-6: Brak kaskadowego czyszczenia przy usuwaniu projektu [DO ZREALIZOWANIA POZNIEJ]

**Plik:** `src/utils/projectsStorage.ts:711-719`

**Problem:** `deleteProject()` usuwa tylko folder projektu. Nie czysci:
- Wpisow w cache (thumbnails)
- Referencji w moodboardach
- Danych statystyk

**Naprawa:** Dodac funkcje kaskadowego czyszczenia lub cykliczny job sprzatajacy.

---

### BUG-7: Brak groupId w frontend delete call z ProjectsSection [ZREALIZOWANE]

**Plik:** `src/components/admin/ProjectsSection.tsx:183-187`

**Problem:** Frontend nie wysyla `groupId` przy usuwaniu projektu. Backend musi przeszukac WSZYSTKIE grupy przez `findProjectById()`.

```typescript
body: JSON.stringify({ id }), // brak groupId
```

**Skutek:** Dodatkowe operacje dyskowe, potencjalny problem jesli sa duplikaty ID.

**Wykonane zmiany w `src/components/admin/ProjectsSection.tsx`:**
- Sygnatura `handleDelete` zmieniona z `(id: string)` na `(id: string, groupId?: string)`
- Payload requestu zmieniony z `{ id }` na `{ id, groupId }`
- Wywolanie w onClick zmienione z `handleDelete(p.id)` na `handleDelete(p.id, p.groupId)`
- Backend nie musi juz przeszukiwac wszystkich grup przez `findProjectById()`

---

## 2. BEZPIECZENSTWO [ZREALIZOWANE]

### SEC-1: Path traversal w admin files list [ZREALIZOWANE]

**Plik:** `pages/api/admin/files/list.ts:10-14`

**Problem:** Parametr `folder` z query string trafia do `generateListUrl()` bez walidacji sciezki. Admin moze odczytac dowolny katalog.

**Wykonane zmiany w `pages/api/admin/files/list.ts`:**
- Dodana walidacja `folderPath` przed przekazaniem do `generateListUrl()`
- Sprawdzenie `folderPath.includes('..')` — blokuje path traversal (`../../../etc`)
- Sprawdzenie `folderPath.includes('\0')` — blokuje null byte injection
- Przy nieprawidlowej sciezce zwracany status 400 z komunikatem bledu

---

### SEC-2: Zbyt permisywna autoryzacja galerii [ZREALIZOWANE]

**Plik:** `pages/api/projects/gallery/[...path].ts:47-62`

**Problem:** Sprawdzenie dostepu do obrazu uzywa `p.endsWith(`/${filename}`)` co moze dopasowac obrazy z innych projektow/rewizji.

```typescript
galleryPaths.some((p) => p.endsWith(`/${filename}`)); // zbyt szerokie dopasowanie
```

**Wykonane zmiany w `pages/api/projects/gallery/[...path].ts`:**
- Usuniety warunek `p.endsWith(`/${filename}`)` ktory mogl dopasowac obrazy z innych projektow
- Zastapiony scislym dopasowaniem: `p === `${project.id}/${revisionId}/${filename}``
- Uzywany `project.id` (resolved) zamiast `projectId` (z URL, moze byc slug)

---

### SEC-3: Backup/Restore pozwala na path traversal w ZIP [ZREALIZOWANE]

**Plik:** `pages/api/admin/data-storage/restore.ts:173-179`

**Problem:** Sprawdzenie `!rel.startsWith('../')` nie pokrywa wszystkich wektorow (URL encoding, sciezki Windows).

**Wykonane zmiany w `pages/api/admin/data-storage/restore.ts`:**
- Dodana funkcja `isSafePath(targetPath, allowedBase)` uzywajaca `path.resolve()` do weryfikacji
- Ekstrakcja grup: dodane `rel.includes('..')` check + `isSafePath(targetPath, groupsDir)`
- Ekstrakcja projektow: dodane `rel.includes('..')` check + `isSafePath(targetPath, targetProjectDir)`
- Ekstrakcja obrazow moodboard: dodane `rel.includes('..')` check + `isSafePath(targetPath, targetImagesDir)`
- Laczne 3 punkty ekstrakcji zabezpieczone przed path traversal

---

### SEC-4: Brak flagi Secure na cookies poza produkcja [POMINIETE]

**Plik:** `src/utils/auth.ts:10-11`

**Problem:** `cookieSecure` jest pustym stringiem w development, co pozwala na przechwycenie sesji przez HTTP.

**Status:** Pominiete - ustawienie Secure w dev bez HTTPS zlamaloby autentykacje. Obecne podejscie (Secure tylko w produkcji) jest standardowa praktyka.

---

### SEC-5: Rate limit auth endpointu moze byc niewystarczajacy [ZREALIZOWANE]

**Plik:** `pages/api/auth/request-code.ts:140`

**Problem:** 10 requestow / 15 min per IP. Brak limitu per email. Mozliwy email spam i enumeracja kont.

**Wykonane zmiany w `pages/api/auth/request-code.ts`:**
- Dodana in-memory mapa `emailRequests` (analogiczna do IP rate limiter)
- Dodana funkcja `checkEmailRateLimit(email)` — limit 3 żadania / 15 min per adres email
- Sprawdzenie wstawione PO normalizacji emaila, PRZED sprawdzeniem czarnej/bialej listy
- Przy przekroczeniu limitu zwracana generyczna odpowiedz 200 (bez zdradzania statusu)
- Istniejacy limit per IP (10/15min) dziala niezaleznie obok limitu per email

---

### SEC-6: XSS - atrybut style w DOMPurify [ZREALIZOWANE]

**Plik:** `src/components/ImageGrid.tsx:179-184`

**Problem:** `ALLOWED_ATTR: ['class', 'style']` - atrybut `style` moze byc uzwany do CSS injection.

**Wykonane zmiany w `src/components/ImageGrid.tsx`:**
- `ALLOWED_ATTR: ['class', 'style']` zmienione na `ALLOWED_ATTR: ['class']`
- Usuniety atrybut `style` eliminujacy mozliwosc CSS injection przez dane z decorConverter

---

### SEC-7: Walidacja typu pliku tylko po MIME [ZREALIZOWANE]

**Plik:** `pages/api/admin/projects/upload-gallery.ts:18,81-84`

**Problem:** Typ pliku sprawdzany tylko po `file.mimetype` z klienta, co mozna sfalsowac.

**Wykonane zmiany w `pages/api/admin/projects/upload-gallery.ts`:**
- Dodana walidacja `sharp(raw).metadata()` przed konwersja do webp
- Sprawdzenie `metadata.format` — akceptowane tylko: jpeg, png, webp, gif, tiff, svg
- Plik z nieznanym formatem jest pomijany (continue) nawet jesli MIME type z klienta byl prawidlowy
- Walidacja dziala na poziomie zawartosc pliku (magic bytes) a nie naglowkow HTTP

---

## 3. KOD MIGRACYJNY DO USUNIECIA

> Usunac po potwierdzeniu ze migracja zakonczona na produkcji.

### MIG-1: migrateToGroupFolders (caly plik)

**Pliki do usuniecia:**
- `src/utils/migrateToGroupFolders.ts` (222 linie)
- `pages/api/admin/migrate-to-group-folders.ts` (19 linii)

**Powiazane zmiany:**
- `src/components/admin/GroupsManager.tsx` - usunac: stany `migrating`/`migrationResult`, przycisk migracji i handler (linie ~45-51, ~223-260)

---

### MIG-2: migrateLegacyToFolderStructure

**Plik:** `src/utils/projectsStorage.ts:93-178, 241-264`

**Problem:** Migracja z jednego `projects.json` do struktury folderow. Uruchamiana przy kazdym `getProjects()` (chodziaz z flagow `legacyMigrationAttempted`).

**Do usuniecia:**
- Zmienna `legacyMigrationAttempted` (linia 93)
- Funkcja `migrateLegacyToFolderStructure` (linie 98-178)
- Blok migracyjny w `getProjects` (linie 241-264)

---

### MIG-3: migrateStatsToDailyFiles

**Plik:** `src/utils/statsStorage.ts:86-123`

**Problem:** Wywolywana na poczatku PRAWIE KAZDEJ funkcji w statsStorage (11 razy!). Sprawdza flage `migrationDone` ale i tak dodaje overhead do kazdego wywolania.

**Do usuniecia:**
- Zmienna `migrationDone` (linia 86)
- Funkcja `migrateStatsToDailyFiles` (linie 88-123)
- Wszystkie wywolania `await migrateStatsToDailyFiles()` (11 miejsc)

---

### MIG-4: migrateLegacyToCurrent (cache)

**Plik:** `src/utils/cacheStorage.ts:127, 195-246`

**Do usuniecia:**
- Zmienna `cacheMigrationDone`
- Funkcja `migrateLegacyToCurrent`
- Fallback w `loadCurrentFile` (linia 183)

---

### MIG-5: Fallback dla niepodpisanych cookies

**Plik:** `src/utils/auth.ts:71-81`

**Problem:** `extractVerifiedEmail()` akceptuje stare niepodpisane cookies jako fallback migracyjny. Po wystarczajacym czasie wszystkie sesje powinny miec podpisane cookies.

```typescript
// Fallback: stare niepodpisane cookie (email bez kropki-hex na koncu)
if (rawValue.includes('@') && !rawValue.includes('.', rawValue.lastIndexOf('@') + 4)) {
  return rawValue;
}
```

**Do usuniecia:** Caly blok fallback (linie 75-78).

---

**Szacowana redukcja kodu po usunieciu migracji: ~600-700 linii**

---

## 4. MARTWY KOD I NIEUZYWANE EKSPORTY

### DEAD-1: Nieuzywane stale w constants.ts

**Plik:** `src/config/constants.ts`

Nieuzywane nigdzie poza definicja:
- `API_TIMEOUT_SHORT` (linia 22) - uzyty jest tylko `API_TIMEOUT_LONG`
- `UI_DELAY_MEDIUM` (linia 27) - uzyty jest tylko `UI_DELAY_SHORT`

---

### DEAD-2: Wrappery auth bez dodatkowej logiki

**Plik:** `src/utils/auth.ts:33-43`

**Problem:** Trzy funkcje (`loginUser`, `logoutUser`, `isUserLoggedIn`) ktore jedynie przekierowuja do identycznych funkcji w `storage.ts` bez zadnej dodatkowej logiki:

```typescript
export async function loginUser(email: string): Promise<void> {
  await storageLogin(email);
}
```

**Uzywane w:** `verify-code.ts`, `logout.ts`

**Opcja:** Importowac bezposrednio z `storage.ts` w API routes i usunac wrappery. Alternatywnie zostawic jesli planowana jest dodatkowa logika (np. logowanie).

---

### DEAD-3: Zduplikowana funkcja copyDirRecursive

**Pliki:**
- `src/utils/projectsStorage.ts:797-810`
- `src/utils/migrateToGroupFolders.ts:209-221`

Identyczna implementacja w dwoch plikach. Po usunieciu migracji (MIG-1) duplikat zniknie. Jesli nie - wydzielic do `src/utils/fileUtils.ts`.

---

### DEAD-4: console.log w kodzie produkcyjnym

**Pliki z debug console.log:**
- `src/instrumentation.ts:10,13` - `console.log('[Instrumentation]...')`
- `src/utils/email.ts:218,280` - `console.log('[Email]...')`
- `src/services/schedulerService.ts:217,292` - `console.log(...)`
- `pages/api/admin/cleanup-orphaned-files.ts:252,282,290,298` - `console.log/error`
- `src/components/admin/DataStorageSection.tsx:680` - `console.log('[Restore]...')`
- `src/components/FolderConverter.tsx:74,80` - `console.error(...)`
- `src/utils/storage.ts:178` - `console.error(...)`
- `src/utils/statsStorage.ts:69` - `console.error(...)`
- `pages/api/auth/logout.ts:37` - `console.error(...)`

**Naprawa:** Zamienic na `logger.info()`/`logger.error()` lub usunac.

---

## 5. OVER-ENGINEERING

### OE-1: Redundantne typy ProjectMeta vs Project / RevisionMeta vs Revision

**Plik:** `src/utils/projectsStorage.ts:20-91`

**Problem:** Dwa zestawy prawie identycznych typow z dwoma funkcjami konwertujacymi (`revisionMetaToRevision`, `revisionToMeta`) ktore jedynie kopiuja pola 1:1. Parametr `_projectId` w `revisionMetaToRevision` jest nieuzywany.

**Naprawa:** Ujednolicic typy. Uzyc jednego typu `Revision` i jednego `Project`, serializowac bezposrednio. Jesli roznica w polach jest minimalna, uzyc `Omit<>` / `Pick<>`.

---

### OE-2: Nadmiarowe wrappery sciezkowe

**Plik:** `src/utils/projectsStoragePath.ts:13-76`

**Problem:** 5 malenkich async funkcji (`getProjectsBaseDir`, `getProjectDir`, `getProjectRevisionsDir`, `getRevisionDir`, `getRevisionGalleryDir`) ktore jedynie robia `path.join()` + `mkdir`.

**Naprawa:** Skondensowac do 1-2 funkcji z parametrami (opcjonalnie builder pattern).

---

### OE-3: Nadmiarowy logger ze specjalizowanymi metodami

**Plik:** `src/utils/logger.ts:20-54`

**Problem:** 10+ wyspecjalizowanych metod (`galleryStart`, `galleryComplete`, `cacheInfo`, `cacheUpdate` itd.) ktore moglyby byc zwyklymi wywolaniami `logger.info()` z odpowiednim komunikatem.

**Naprawa:** Zostawic standardowe metody (debug/info/warn/error), usunac specjalizowane.

---

### OE-4: errorUtils.ts - niepotrzebna abstrakcja

**Plik:** `src/utils/errorUtils.ts` (28 linii)

**Problem:** Dwie male funkcje `getErrorMessage()` i `isNodeError()` ktore mozna zastapic inline: `String(error)` lub `error instanceof Error ? error.message : 'Unknown'`.

**Naprawa:** Usunac plik, uzyc inline.

---

### OE-5: Upstash Redis dla 5-minutowego cache

**Plik:** `src/utils/galleryCache.ts`

**Problem:** Zewnetrzna usluga Redis (Upstash) uzyta do prostego cache z TTL 5 min. Aplikacja dziala poprawnie bez Redis (graceful fallback do null). Na tej skali wystarczy in-memory `Map` z TTL.

**Naprawa:** Zamienic na prosty in-memory cache z `Map` + `setTimeout` lub `node-cache`.

---

### OE-6: axios zamiast natywnego fetch

**Pliki uzywajace axios:**
- `src/services/cacheStatusService.ts:11`
- `src/services/hashService.ts:5`
- `src/services/thumbnailService.ts:6`
- `src/utils/galleryUtils.ts:1`

**Problem:** Next.js 15 / Node.js 18+ ma natywny `fetch`. axios dodaje ~400KB do bundle.

**Naprawa:** Zamienic na natywny `fetch` + istniejacy `fetchWithTimeout` wrapper. Usunac `axios` z `package.json`.

---

## 6. OPTYMALIZACJA WYDAJNOSCI

### PERF-1: N+1 pattern w getAllProjects()

**Plik:** `src/utils/projectsStorage.ts:271-302`

**Problem:** Sekwencyjna petla - dla kazdej grupy osobny `readProjectsFromDir()`. Kazdy `readProjectsFromDir` czyta folder, potem sekwencyjnie czyta kazdy `project.json` i kazdy `revision.json`.

**Naprawa:**
```typescript
const groupProjects = await Promise.all(
  groupDirs.map(dir => readProjectsFromDir(path.join(groupsBase, dir, 'projects'), dir))
);
all.push(...groupProjects.flat());
```

---

### PERF-2: Sekwencyjne odczyty plikow w readProjectsFromDir()

**Plik:** `src/utils/projectsStorage.ts:183-234`

**Problem:** Petla `for...of` z `await` dla kazdego projektu i kazdej rewizji. Na 50 projektach x 3 rewizji = 200 sekwencyjnych odczytow plikow.

**Naprawa:** Uzywac `Promise.all()` dla rownoleglych odczytow.

---

### PERF-3: Brak cachowania list dostepu

**Plik:** `src/utils/storage.ts`

**Problem:** `loadWhitelist()`, `loadBlacklist()`, `loadGroups()` zawsze czytaja z dysku. Brak cache z invalidacja przy zapisie.

**Naprawa:** Dodac cache w pamieci z invalidacja w `saveWhitelist()`, `saveBlacklist()`, `saveGroups()`.

---

### PERF-4: Tworzenie regex na kazdej iteracji w decorConverter

**Plik:** `src/utils/decorConverter.ts:20-29`

**Problem:** `buildKeywordRegexes()` tworzy 4 obiekty RegExp per keyword, wywolywana w petlach wielokrotnie.

**Naprawa:** Cache regexow w `Map<string, KeywordRegexes>`:
```typescript
const regexCache = new Map<string, KeywordRegexes>();
function getCachedRegexes(keyword: string): KeywordRegexes {
  if (!regexCache.has(keyword)) {
    regexCache.set(keyword, buildKeywordRegexes(keyword));
  }
  return regexCache.get(keyword)!;
}
```

---

### PERF-5: migrateStatsToDailyFiles() wywolywana 11 razy

**Plik:** `src/utils/statsStorage.ts`

**Problem:** Kazda publiczna funkcja w statsStorage zaczyna od `await migrateStatsToDailyFiles()`. Nawet z flaga `migrationDone`, to 11 sprawdzen async per operacje.

**Naprawa tymczasowa (przed usunieciem migracji):** Wywolac raz przy starcie aplikacji (w `instrumentation.ts`), usunac z poszczegolnych funkcji.

---

## 7. PLAN WDROZENIA

### Faza 1: Krytyczne bledy usuwania [ZREALIZOWANE]

| # | Zadanie | Plik | Status |
|---|---------|------|--------|
| 1 | Dodac await do removeImage moodboard | `MoodboardContext.tsx` | DONE |
| 2 | Dodac usuwanie folderu w deleteGroup | `storage.ts` | DONE |
| 3 | Odwrocic kolejnosc w deleteProjectRevision | `projectsStorage.ts` | DONE |
| 4 | Dodac logowanie bledow w deleteProject | `projectsStorage.ts` | DONE |
| 5 | Sprawdzac response.ok w batch delete | `FileManager.tsx` | DONE |
| 6 | Dodac groupId do delete call | `ProjectsSection.tsx` | DONE |

### Faza 2: Bezpieczenstwo [ZREALIZOWANE]

| # | Zadanie | Plik | Status |
|---|---------|------|--------|
| 1 | Walidacja path traversal w files/list | `pages/api/admin/files/list.ts` | DONE |
| 2 | Scislejsze dopasowanie galerii | `pages/api/projects/gallery/[...path].ts` | DONE |
| 3 | Walidacja sciezek w restore ZIP | `pages/api/admin/data-storage/restore.ts` | DONE |
| 4 | Rate limit per email | `pages/api/auth/request-code.ts` | DONE |
| 5 | Usunac style z DOMPurify ALLOWED_ATTR | `src/components/ImageGrid.tsx` | DONE |
| 6 | Walidacja magic bytes w upload-gallery | `pages/api/admin/projects/upload-gallery.ts` | DONE |
| 7 | Secure cookie flag w dev | `src/utils/auth.ts` | POMINIETE |

### Faza 3: Usuniecie kodu migracyjnego (PO POTWIERDZENIU MIGRACJI)

| # | Zadanie | Pliki | Szac. linii |
|---|---------|-------|-------------|
| 1 | Usunac migrateToGroupFolders | `migrateToGroupFolders.ts`, `migrate-to-group-folders.ts`, `GroupsManager.tsx` | ~280 |
| 2 | Usunac migrateLegacyToFolderStructure | `projectsStorage.ts` | ~100 |
| 3 | Usunac migrateStatsToDailyFiles | `statsStorage.ts` | ~50 |
| 4 | Usunac migrateLegacyToCurrent | `cacheStorage.ts` | ~60 |
| 5 | Usunac fallback niepodpisanych cookies | `auth.ts` | ~5 |

### Faza 4: Optymalizacja i czyszczenie

| # | Zadanie | Priorytet |
|---|---------|-----------|
| 1 | Zrownoleglenie odczytow w getAllProjects / readProjectsFromDir | Wysoki |
| 2 | Cache regexow w decorConverter | Sredni |
| 3 | Zamienic axios na natywny fetch (4 pliki) | Sredni |
| 4 | Usunac nieuzywane stale (API_TIMEOUT_SHORT, UI_DELAY_MEDIUM) | Niski |
| 5 | Zamienic console.log na logger (~15 miejsc) | Niski |
| 6 | Ujednolicic typy ProjectMeta/Project | Niski |
| 7 | Uproscic sciezki path helpers | Niski |

---

**Podsumowanie:**
- **7 bledow logiki usuwania** — 6 zrealizowanych, 1 odlozony (BUG-6 kaskadowe czyszczenie)
- **7 problemow bezpieczenstwa** — 6 zrealizowanych, 1 pominiete (SEC-4 cookie Secure w dev)
- **5 blokow kodu migracyjnego** do usuniecia (~500-700 linii) — do realizacji
- **6 przypadkow over-engineeringu** — do realizacji
- **5 optymalizacji wydajnosci** — do realizacji
- **~15 miejsc z debug console.log** — do realizacji

**Zrealizowane zmiany (12 plikow):**
1. `src/contexts/MoodboardContext.tsx` — async removeImage z await na fetch
2. `src/utils/storage.ts` — deleteGroup() usuwa folder danych grupy
3. `src/utils/projectsStorage.ts` — odwrocona kolejnosc w deleteProjectRevision + logowanie bledow w deleteProject
4. `src/components/FileManager.tsx` — batch delete sprawdza response.ok i informuje o bledach
5. `src/components/admin/ProjectsSection.tsx` — groupId w delete request
6. `pages/api/admin/files/list.ts` — walidacja path traversal
7. `pages/api/projects/gallery/[...path].ts` — scisle dopasowanie galerii
8. `pages/api/admin/data-storage/restore.ts` — isSafePath() w 3 punktach ekstrakcji ZIP
9. `pages/api/auth/request-code.ts` — rate limit per email (3/15min)
10. `src/components/ImageGrid.tsx` — usuniety style z DOMPurify
11. `pages/api/admin/projects/upload-gallery.ts` — walidacja sharp metadata
