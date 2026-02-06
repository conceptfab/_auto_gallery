# Plan implementacji: uporządkowanie zapisu galerii i moodboardów na /data-storage

## 1. Cel i zakres

- Wszystkie dane galerii i moodboardów mają być zapisywane wyłącznie w **jednym korzeniu**: `/data-storage` (produkcja) lub odpowiednik lokalny (np. `./data` lub `./tmp/data-storage`).
- **Moodboardy** – folder `moodboard/`.
- **Projekty** – folder `projects/`, rewizje w `projects/{projekt}/rewizje/`.
- W panelu admina – **nowa zakładka** do zarządzania danymi: hierarchia projektów i moodboardów, backup (i ewentualnie przywracanie).
- **Skrypt migracji** – konwersja istniejących danych do nowego formatu bez utraty danych.

---

## 2. Stan obecny (do migracji)

### 2.1 Źródło prawdy ścieżek

- **Produkcja:** `getDataDir()` → `/data-storage`; `VOLUME_ROOT` (constants) → `/data-storage`.
- **Lokalnie:** `getDataDir()` → `./data`; `VOLUME_ROOT` → `./tmp/data-storage` (niespójność).

### 2.2 Obecna struktura plików

| Zasób | Lokalizacja | Uwagi |
|-------|-------------|--------|
| Moodboard – indeks i boardy | `dataDir/moodboard/index.json`, `dataDir/moodboard/{boardId}.json` | Już pod „data” |
| Moodboard – obrazy | `dataDir/moodboard/images/{boardId}/{imageId}.webp` | |
| Projekty – metadane | `dataDir/projects.json` | Jeden plik, tablica projektów z zagnieżdżonymi rewizjami |
| Miniatury rewizji | `dataDir/thumbnails/design-revision/{projectId}/{revisionId}.webp` | |
| Galeria rewizji | `dataDir/thumbnails/design-gallery/{projectId}/{revisionId}/{uuid}.webp` | |

W rewizji w `projects.json` przechowywane są: `thumbnailPath` (względna do design-revision), `galleryPaths` (tablica ścieżek względnych do design-gallery).

---

## 3. Docelowa struktura na /data-storage

Jeden wspólny korzeń danych (w prod: `/data-storage`). Lokalnie: ten sam korzeń co dziś używany przez aplikację (proponowane: `getDataDir()` jako jedyne źródło prawdy).

```
/data-storage/
├── moodboard/
│   ├── index.json
│   ├── {boardId}.json
│   └── images/
│       └── {boardId}/
│           └── *.webp, *.jpg, ...
├── projects/
│   ├── index.json                    # opcjonalnie: lista id/slug projektów (do szybkiego listowania)
│   └── {projectId}/                  # katalog per projekt (ID dla stabilności)
│       ├── project.json              # metadane projektu (id, name, slug, description, createdAt)
│       └── rewizje/
│           └── {revisionId}/
│               ├── revision.json     # metadane rewizji (id, label, description, embedUrl, createdAt, galleryPaths względne)
│               ├── thumbnail.webp
│               └── gallery/
│                   └── *.webp
```

- **Moodboard** – bez zmiany struktury; tylko upewnienie się, że zapis/odczyt zawsze idzie przez `getDataDir()/moodboard/`.
- **Projekty** – przejście z jednego `projects.json` + płaskich katalogów `thumbnails/design-*` na strukturę katalogową pod `projects/{projectId}/` i `projects/{projectId}/rewizje/{revisionId}/`.

Ścieżki w `revision.json`:
- `thumbnailPath` – np. `thumbnail.webp` (plik obok `revision.json`) lub pomijane (zawsze `thumbnail.webp`).
- `galleryPaths` – nazwy plików w `gallery/`, np. `gallery/uuid.webp` lub same `uuid.webp` (odczytywać z katalogu `gallery/`).

---

## 4. Kroki implementacji

### Faza 1: Ujednolicenie korzenia danych

1. **Jedno źródło prawdy**
   - Zdecydować: wszystkie moduły (storage, volume API) używają **getDataDir()** (albo jednej stałej eksportowanej z `dataDir.ts`), tak aby lokalnie nie było rozjazdu między `./data` a `./tmp/data-storage`.
   - Opcjonalnie: w constants zostawić tylko `VOLUME_ROOT` dla zmiennych środowiskowych, a w kodzie zawsze budować ścieżki od `await getDataDir()`.

2. **Weryfikacja moodboard**
   - Upewnić się, że `getMoodboardDir()` i `getMoodboardImagesDir()` używają wyłącznie `getDataDir()` i że docelowa ścieżka to `{dataDir}/moodboard/` oraz `{dataDir}/moodboard/images/`. Brak rozproszenia po innych katalogach.

---

### Faza 2: Nowy format projektów i rewizji

3. **Nowe ścieżki i helpery**
   - Plik: `src/utils/projectsStoragePath.ts` (lub rozszerzenie `thumbnailStoragePath.ts`):
     - `getProjectsBaseDir()` → `{dataDir}/projects`
     - `getProjectDir(projectId)` → `{dataDir}/projects/{projectId}`
     - `getProjectRevisionsDir(projectId)` → `{dataDir}/projects/{projectId}/rewizje`
     - `getRevisionDir(projectId, revisionId)` → `{dataDir}/projects/{projectId}/rewizje/{revisionId}`
     - `getRevisionGalleryDir(projectId, revisionId)` → `…/rewizje/{revisionId}/gallery`
   - Ścieżki zwracane do API (np. do serwowania obrazów) – względne do `projects/`, np. `{projectId}/rewizje/{revisionId}/gallery/{filename}`.

4. **Format plików**
   - `projects/{projectId}/project.json`:  
     `{ id, name, slug, description?, createdAt }`
   - `projects/{projectId}/rewizje/{revisionId}/revision.json`:  
     `{ id, label?, description?, embedUrl?, createdAt, thumbnailPath?, galleryPaths? }`  
     gdzie `thumbnailPath` to np. `thumbnail.webp`, `galleryPaths` to listy plików w `gallery/` (np. `["uuid1.webp","uuid2.webp"]`).

5. **Refaktor projectsStorage.ts**
   - **Odczyt:** zamiast jednego `projects.json` – czytać `projects/index.json` (jeśli ma listę id) lub skanować katalogi `projects/*/project.json`, dla każdego projektu ładować `rewizje/*/revision.json` i budować listę `Project[]`.
   - **Zapis projektu:** zapis/aktualizacja `projects/{projectId}/project.json` oraz ewentualnie `projects/index.json`.
   - **Zapis rewizji:** zapis `projects/{projectId}/rewizje/{revisionId}/revision.json`, plik `thumbnail.webp` w tym samym katalogu, pliki galerii w `…/rewizje/{revisionId}/gallery/`.
   - Zachować obecne funkcje API: `getProjects()`, `addProject()`, `updateProject()`, `addProjectRevision()`, `updateProjectRevision()`, `reorderProjectRevisions()`, `deleteProjectRevision()`, `deleteProject()`, `saveThumbnailFile()`, `saveGalleryFile()`, `appendRevisionGalleryPaths()`, `getThumbnailFilePath()`, `getGalleryFilePath()` – wewnętrznie przełączyć na nowe ścieżki i pliki.

6. **API serwowania plików**
   - Endpoint galerii (np. `/api/projects/gallery/[...path].ts`) – zmiana bazowego katalogu z `getDesignGalleryDir()` na `getRevisionGalleryDir()` z parsowaniem path: `projectId/rewizje/revisionId/gallery/filename`.
   - Endpoint miniaturki rewizji – serwowanie z `projects/{projectId}/rewizje/{revisionId}/thumbnail.webp`.

7. **Cleanup osieroconych plików**
   - `cleanup-orphaned-files.ts`: po migracji skanować tylko pod `projects/*/rewizje/*/` (gallery + thumbnail) oraz `moodboard/images/`; usunąć odniesienia do starych ścieżek `thumbnails/design-revision` i `thumbnails/design-gallery`.

---

### Faza 3: Skrypt migracji

8. **Skrypt konwersji (np. `scripts/migrate-to-data-storage.ts` lub `.js`)**
   - Uruchamiany ręcznie (np. `npx ts-node scripts/migrate-to-data-storage.ts` lub przez osobny endpoint admina „Uruchom migrację”).
   - Kroki:
     1. Odczyt obecnego `dataDir/projects.json` (jeśli brak – koniec dla projektów).
     2. Dla każdego projektu:
        - Utworzenie `projects/{projectId}/` i zapis `project.json`.
        - Dla każdej rewizji:
          - Utworzenie `projects/{projectId}/rewizje/{revisionId}/`.
          - Skopiowanie (lub przeniesienie) `thumbnails/design-revision/{projectId}/{revisionId}.webp` → `projects/{projectId}/rewizje/{revisionId}/thumbnail.webp`.
          - Skopiowanie plików z `thumbnails/design-gallery/{projectId}/{revisionId}/*` → `projects/{projectId}/rewizje/{revisionId}/gallery/`.
          - Zapis `revision.json` z zaktualizowanymi `thumbnailPath` i `galleryPaths` (względne do folderu rewizji).
     3. Zapis `projects/index.json` (lista id projektów), jeśli używane.
     4. Przełączenie aplikacji na nowy format (np. flaga w env lub po jednorazowym uruchomieniu migracji).
   - **Bezpieczeństwo:** nie usuwać starych plików w tej samej operacji; opcjonalnie drugi krok „usuń stare po weryfikacji” lub zostawić usuwanie adminowi / osobnemu skryptowi.

9. **Moodboard**
   - Jeśli obecnie moodboard jest już pod `dataDir/moodboard/`, migracja moodboardu może ograniczyć się do: sprawdzenia, że katalog jest we właściwym miejscu, ewentualnie przeniesienia z innej lokalizacji (jeśli kiedyś były zapisy poza dataDir).

---

### Faza 4: Zakładka admina „Dane” / „Storage”

10. **Nowa zakładka w panelu admin**
    - W `pages/admin.tsx`: dodać do `ADMIN_TABS` pozycję np. `{ id: 'data', label: 'Dane', icon: 'la-database' }`.
    - Sekcja widoczna tylko gdy `activeTab === 'data'`.

11. **Komponent zarządzania danymi (np. `DataStorageSection` lub `StorageHierarchySection`)**
    - **Widok hierarchii:**
      - Korzeń: `data-storage` (lub nazwa „Dane aplikacji”).
      - Poziom 1: **Moodboard** (folder `moodboard/`) – rozwijalna lista: index.json, lista boardów (np. z index.json), podkatalog `images/` z podziałem na boardId.
      - Poziom 1: **Projekty** (folder `projects/`) – drzewo: projekt → rewizje → dla każdej rewizji: revision.json, thumbnail, gallery (liczba plików).
    - Dane do drzewa: nowe API admina, np. `GET /api/admin/data-storage/tree` zwracające strukturę:
      - `{ moodboard: { boards: [...], imagesCountByBoard: {...} }, projects: [ { id, name, slug, revisions: [ { id, label, thumbnailPresent, galleryCount } ] } ] }`
    - Implementacja: backend czyta `getDataDir()`, moodboard z `moodboard/index.json` + listowanie `moodboard/images/`, projekty z listy `projects/*/project.json` + dla każdego `projects/{id}/rewizje/*/revision.json` + stat plików w gallery.

12. **Backup**
    - Przycisk „Pobierz backup” (np. „Wszystko”, „Tylko moodboard”, „Tylko projekty”).
    - Endpoint `GET /api/admin/data-storage/backup?scope=all|moodboard|projects`:
      - Archiwum ZIP na bieżąco (np. `archiver` lub `jszip`): zawartość `moodboard/` i/lub `projects/` z `getDataDir()`.
      - Zwrot: `Content-Disposition: attachment; filename="conceptview-data-YYYY-MM-DD.zip"`.
    - W UI: wybór scope, po kliknięciu pobranie pliku.

13. **Ewentualne rozszerzenia (opcjonalnie w planie, bez obowiązku w pierwszej iteracji)**
    - Przywracanie z backupu (upload ZIP + rozpakowanie w wybrany podkatalog) – osobny endpoint i UI.
    - Podgląd rozmiarów (suma bajtów per projekt / moodboard) w drzewie.

---

## 5. Kolejność wdrożenia (rekomendowana)

1. Faza 1 (ujednolicenie korzenia + weryfikacja moodboard).
2. Faza 2: punkty 3–4 (helpery ścieżek, format plików).
3. Faza 3: skrypt migracji (punkt 8) – uruchamiany w suchym środowisku / na kopii; weryfikacja, że nowa struktura jest kompletna.
4. Faza 2: punkty 5–7 (refaktor projectsStorage, API serwowania, cleanup) z **przełączeniem na nowy format** (np. po udanej migracji lub feature flag).
5. Faza 4: zakładka admina (punkty 10–12).

---

## 6. Pliki do utworzenia / zmiany (podsumowanie)

| Akcja | Plik / element |
|-------|-----------------|
| Nowy | `src/utils/projectsStoragePath.ts` (lub w `thumbnailStoragePath.ts`) – ścieżki `projects/`, `rewizje/`, `gallery` |
| Modyfikacja | `src/utils/projectsStorage.ts` – odczyt/zapis z plików katalogowych zamiast jednego JSON |
| Modyfikacja | `src/utils/dataDir.ts` / `constants.ts` – ewentualne ujednolicenie z VOLUME_ROOT |
| Modyfikacja | `pages/api/projects/gallery/[...path].ts` – serwowanie z nowego katalogu galerii |
| Modyfikacja | `pages/api/projects/thumbnail/[projectId]/[revisionId].ts` – serwowanie z `projects/.../rewizje/.../thumbnail.webp` |
| Modyfikacja | `pages/api/admin/cleanup-orphaned-files.ts` – ścieżki tylko do nowej struktury (+ moodboard) |
| Nowy | `scripts/migrate-to-data-storage.ts` (lub .js) – skrypt migracji |
| Nowy | `pages/api/admin/data-storage/tree.ts` – API drzewa dla admina |
| Nowy | `pages/api/admin/data-storage/backup.ts` – API backupu ZIP |
| Nowy | `src/components/admin/DataStorageSection.tsx` – hierarchia + przyciski backup |
| Modyfikacja | `pages/admin.tsx` – nowa zakładka „Dane”, render `DataStorageSection` |

---

## 7. Ryzyka i uwagi

- **Rollback:** dopóki stary format nie jest usuwany od razu, możliwy powrót do odczytu z `projects.json` i starych katalogów (flaga lub drugi branch kodu).
- **Dostęp równoległy:** podczas migracji aplikacja nie powinna zapisywać projektów; najlepiej migrację uruchomić w oknie konserwacji lub z wyłączonym zapisem.
- **Uprawnienia:** katalogi `projects/` i `moodboard/` muszą mieć takie same uprawnienia jak obecny `dataDir` (zapisy przez aplikację).
- **Wielkość backupu:** duże galerie mogą generować duże ZIP; rozważyć streamowanie i limit rozmiaru lub ostrzeżenie w UI.

---

## 8. Kryteria ukończenia

- [ ] Wszystkie dane moodboardów i projektów (w tym galerie i miniatury) znajdują się wyłącznie pod katalogiem zwracanym przez `getDataDir()` (w prod: `/data-storage`).
- [ ] Struktura katalogów: `moodboard/`, `projects/{projectId}/`, `projects/{projectId}/rewizje/{revisionId}/` z opisanymi plikami JSON i plikami binarnymi.
- [ ] Skrypt migracji przenosi istniejące dane do nowej struktury bez utraty plików.
- [ ] W panelu admina zakładka „Dane” pokazuje hierarchię projektów i moodboardów oraz umożliwia pobranie backupu (ZIP).
- [ ] Cleanup osieroconych plików i API serwowania galerii/miniaturek działają na nowych ścieżkach.
