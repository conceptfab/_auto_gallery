# Plan wdrożenia: Grupy jako kontener dla projektów i moodboardów

## 1. Obecny stan

### Co już istnieje
- **Grupy (UserGroup):** id, name, clientName, galleryFolder, color, users[] — zarządzane w `/data/groups/groups.json`
- **Projekty:** mają opcjonalne `groupId` (tylko do kolorowania w widoku admina), przechowywane w `/data/projects/{projectId}/`
- **Moodboardy:** mają opcjonalne `groupId` (tylko do kolorowania/konfiguracji rysowania), przechowywane w `/data/moodboard/` (wspólny folder — jeden index.json, pliki boardów)
- **Użytkownik** ma przypisaną grupę przez `getUserGroup(email)` — zwraca obiekt grupy z AuthContext
- **Brak filtrowania** — użytkownik widzi WSZYSTKIE projekty i WSZYSTKIE moodboardy niezależnie od grupy

### Problemy obecnego stanu
1. Brak izolacji danych — wszyscy użytkownicy widzą wszystko
2. Moodboardy i projekty nie są fizycznie rozdzielone per grupa na dysku
3. Brak API do przenoszenia/kopiowania zasobów między grupami
4. Brak walidacji dostępu na poziomie API (tylko auth, nie group-access)

---

## 2. Architektura docelowa

### 2.1 Nowa struktura folderów na `/data-storage`

```
/data-storage/
├── core/                    # (bez zmian)
├── lists/                   # (bez zmian)
├── groups/
│   ├── groups.json          # (bez zmian — definicje grup)
│   └── {groupId}/           # ← NOWY folder per grupa
│       ├── projects/        # Projekty tej grupy
│       │   └── {projectId}/
│       │       ├── project.json
│       │       └── rewizje/{revisionId}/
│       │           ├── revision.json
│       │           ├── thumbnail.webp
│       │           └── gallery/
│       └── moodboard/       # Moodboardy tej grupy
│           ├── index.json
│           ├── {boardId}.json
│           └── images/
│               └── {boardId}/
│                   └── {imageId}.webp
├── projects/                # ← zachowane dla projektów bez grupy (admin/globalne)
├── moodboard/               # ← zachowane dla moodboardów bez grupy (admin/globalne)
└── ...
```

**Zasada:** Każda grupa ma swój podfolder w `groups/{groupId}/`. Projekty i moodboardy grupy są fizycznie w tym folderze. Zasoby bez grupy pozostają w dotychczasowych lokalizacjach (tylko admin ma do nich dostęp).

### 2.2 Kontrola dostępu

| Rola | Widoczność |
|------|------------|
| **Zwykły user (w grupie)** | Tylko projekty i moodboardy swojej grupy |
| **Zwykły user (bez grupy)** | Nic (albo globalne — do ustalenia) |
| **Admin** | Wszystko — wszystkie grupy + globalne zasoby bez grupy |

### 2.3 Obowiązkowe `groupId`

- Przy tworzeniu projektu/moodboarda admin wybiera grupę (lub „brak grupy" = globalne)
- Użytkownik tworzący zasób automatycznie przypisuje go do swojej grupy

---

## 3. Plan implementacji — krok po kroku

### FAZA 1: Backend — Nowa struktura storage i ścieżki

#### 3.1.1 Rozszerzenie `projectsStoragePath.ts`
**Plik:** `src/utils/projectsStoragePath.ts`

- Dodanie wariantu ścieżek z groupId:
  ```
  getGroupProjectsBaseDir(groupId) → /data-storage/groups/{groupId}/projects/
  getGroupProjectDir(groupId, projectId) → .../projects/{projectId}/
  ```
- Istniejące funkcje (`getProjectsBaseDir`, `getProjectDir`, etc.) zachowane dla kompatybilności wstecznej (zasoby bez grupy)

#### 3.1.2 Refaktor `projectsStorage.ts`
**Plik:** `src/utils/projectsStorage.ts`

- `getProjects(groupId?: string)` — ładuje projekty z folderu grupy lub globalnego
- `getProjectsByGroup(groupId: string)` — ładuje projekty konkretnej grupy
- `getAllProjects()` — (admin) ładuje ze wszystkich grup + globalne
- `addProject(name, description, groupId?)` — tworzy w folderze odpowiedniej grupy
- `updateProject(id, updates, currentGroupId)` — aktualizacja z walidacją przynależności
- `deleteProject(id, groupId)` — usunięcie z walidacją
- `moveProject(projectId, fromGroupId, toGroupId)` — przeniesienie (kopiowanie plików + usunięcie ze starego)
- `copyProject(projectId, fromGroupId, toGroupId)` — kopia (deep copy plików)

#### 3.1.3 Nowy plik `src/utils/moodboardStoragePath.ts`
- Analogicznie do projektów:
  ```
  getGroupMoodboardDir(groupId) → /data-storage/groups/{groupId}/moodboard/
  getGroupMoodboardImagesDir(groupId) → .../moodboard/images/
  ```

#### 3.1.4 Refaktor `moodboardStorage.ts`
**Plik:** `src/utils/moodboardStorage.ts`

- `saveMoodboardImage(boardId, imageId, buffer, ext, groupId?)` — zapisuje w folderze grupy
- `deleteMoodboardImage(boardId, imageId, groupId?)` — kasowanie z folderu grupy
- `getMoodboardImageAbsolutePath(relativePath, groupId?)` — odczyt z grupy
- `deleteAllBoardImages(boardId, groupId?)` — usuwanie obrazów boardu z grupy

#### 3.1.5 Refaktor `pages/api/moodboard/state.ts`
- `getMoodboardDir(groupId?)` — zwraca folder moodboarda per grupa
- GET: ładuje state z folderu grupy użytkownika (lub globalnego dla admina)
- POST: zapisuje do folderu grupy
- Nowe: parametr `?groupId=xxx` (admin może przełączać grupy)

#### 3.1.6 Nowe API do przenoszenia/kopiowania
**Nowe pliki:**
- `pages/api/admin/projects/move.ts` — przeniesienie projektu między grupami
- `pages/api/admin/projects/copy.ts` — kopiowanie projektu do innej grupy
- `pages/api/admin/moodboard/move.ts` — przeniesienie moodboarda między grupami
- `pages/api/admin/moodboard/copy.ts` — kopiowanie moodboarda do innej grupy

Każde endpoint:
- Wymaga admin auth
- Przyjmuje: `{ resourceId, fromGroupId (opcjonalne), toGroupId }`
- Kopiuje/przenosi pliki na dysku
- Aktualizuje metadane (groupId w project.json / board JSON)
- Aktualizuje index.json (moodboard)

---

### FAZA 2: Backend — Kontrola dostępu (group-scoped access)

#### 3.2.1 Nowy middleware `groupAccessMiddleware.ts`
**Nowy plik:** `src/utils/groupAccessMiddleware.ts`

```typescript
withGroupAccess(handler, options?: { adminBypass?: boolean })
```

- Odczytuje email z cookie
- Pobiera grupę użytkownika (`getUserGroup(email)`)
- Admin: ma dostęp do wszystkiego (bypass)
- User bez grupy: zwraca 403
- User z grupą: `req.userGroupId = group.id` — dołącza do requesta
- Opcjonalnie: sprawdza czy żądany zasób należy do grupy użytkownika

#### 3.2.2 Aktualizacja `pages/api/projects.ts`
- Filtrowanie: user widzi tylko projekty swojej grupy
- Admin widzi wszystkie

#### 3.2.3 Aktualizacja `pages/api/moodboard/state.ts` (GET)
- User: ładuje moodboardy tylko ze swojej grupy
- Admin: ładuje z wybranej grupy lub wszystkie

#### 3.2.4 Aktualizacja endpointów admin/projects/*
- `add.ts` — wymaga `groupId` (opcjonalnie, admin może tworzyć globalne)
- `update.ts` — walidacja że projekt należy do wskazanej grupy
- `delete.ts` — walidacja przynależności
- `upload-thumbnail.ts`, `upload-gallery.ts` — ścieżki per grupa
- `list.ts` — filtrowanie per grupę (query param `?groupId=`)

#### 3.2.5 Aktualizacja endpointów moodboard/*
- `upload.ts` — zapisuje obraz w folderze grupy
- `delete-image.ts` — kasuje z folderu grupy
- `images/[...path].ts` — serwuje z folderu grupy
- `stream.ts`, `presence.ts` — scope per grupa

---

### FAZA 3: Migracja istniejących danych

#### 3.3.1 Skrypt migracyjny `src/utils/migrateToGroupFolders.ts`

Logika migracji:
1. Odczytaj wszystkie grupy z `groups.json`
2. Dla każdej grupy utwórz folder `groups/{groupId}/projects/` i `groups/{groupId}/moodboard/`
3. Przenieś projekty z `groupId` do odpowiedniego folderu grupy:
   - Czytaj `project.json` → sprawdź `meta.groupId`
   - Jeśli `groupId` jest ustawiony → przenieś cały folder projektu do `groups/{groupId}/projects/{projectId}/`
4. Przenieś moodboardy z `groupId`:
   - Czytaj każdy `{boardId}.json` → sprawdź `board.groupId`
   - Jeśli `groupId` jest ustawiony → przenieś plik i odpowiedni folder images do grupy
   - Zaktualizuj `index.json` grupy (utwórz nowy)
   - Usuń z globalnego `index.json`
5. Zasoby bez `groupId` pozostają w globalnych folderach

#### 3.3.2 Endpoint migracji (admin)
**Nowy plik:** `pages/api/admin/migrate-to-group-folders.ts`
- Wywołuje skrypt migracyjny
- Zwraca raport: ile projektów/moodboardów przeniesiono
- Idempotentny (można uruchomić wielokrotnie)

#### 3.3.3 Auto-migracja przy starcie
- W `getProjects()` i `loadAppStateFromFiles()` — sprawdź czy folder grupy istnieje
- Jeśli nie — uruchom migrację dla danej grupy (lazy migration)

---

### FAZA 4: Frontend — UI filtrowania i dostępu

#### 3.4.1 Aktualizacja `AuthContext.tsx`
- Już zwraca `group: UserGroupInfo | null` — bez zmian potrzebnych
- Ewentualnie: dodanie informacji czy user ma dostęp do zasobów (accessLevel)

#### 3.4.2 Aktualizacja `pages/projekty.tsx`
- User bez grupy: komunikat „Nie masz przypisanej grupy"
- User z grupą: widzi tylko projekty swojej grupy (API zwraca przefiltrowane)
- Admin: widzi wszystkie, może filtrować per grupa (dropdown)

#### 3.4.3 Aktualizacja `pages/moodboard.tsx`
- User: ładuje moodboardy swojej grupy
- Admin: może przełączać grupy w UI

#### 3.4.4 Aktualizacja `MoodboardContext.tsx`
- `API_STATE` endpoint z parametrem `?groupId=...`
- Context przechowuje `currentGroupId` — dla scoping
- Zapisywanie stanu do folderu grupy

#### 3.4.5 Aktualizacja `MoodboardTab.tsx`
- Zakładki moodboardów — tylko boardy danej grupy
- Admin: dropdown do zmiany aktywnej grupy

---

### FAZA 5: Frontend — UI przenoszenia/kopiowania zasobów

#### 3.5.1 Komponent `MoveResourceModal.tsx` (nowy)
**Nowy plik:** `src/components/admin/MoveResourceModal.tsx`

Modal wspólny dla przenoszenia i kopiowania:
- Props: `{ resourceType: 'project' | 'moodboard', resourceId, currentGroupId, mode: 'move' | 'copy' }`
- Lista dostępnych grup (dropdown/select)
- Przycisk „Przenieś" / „Kopiuj"
- Wywołuje odpowiedni endpoint API
- Po sukcesie: odświeża listę

#### 3.5.2 Integracja z listą projektów (admin)
**Plik:** `pages/projekty.tsx` i `pages/projekty/[id].tsx`

- Przy każdym projekcie (widok admina): ikonki „Przenieś do grupy" i „Kopiuj do grupy"
- Kliknięcie otwiera `MoveResourceModal`

#### 3.5.3 Integracja z moodboardami (admin)
**Plik:** `src/components/moodboard/MoodboardTab.tsx`

- Przy każdej zakładce moodboarda (admin): menu kontekstowe z opcjami „Przenieś" / „Kopiuj"
- Kliknięcie otwiera `MoveResourceModal`

#### 3.5.4 Panel admina — widok zasobów grup
**Plik:** `src/components/admin/GroupsManager.tsx`

- Rozszerzenie o widok zasobów grupy:
  - Lista projektów przypisanych do grupy
  - Lista moodboardów grupy
  - Akcje: przenieś/kopiuj/usuń
  - Tworzenie nowego projektu/moodboarda bezpośrednio w grupie

---

### FAZA 6: Aktualizacja funkcji administracyjnych

#### 3.6.1 Backup/Restore (`data-storage/backup`, `data-storage/restore`)
- Backup musi uwzględniać nową strukturę folderów grup
- Restore musi odtwarzać foldery grup

#### 3.6.2 Data-storage tree (`data-storage/tree`)
- Musi wyświetlać nową strukturę z folderami grup

#### 3.6.3 Verify/Repair (`data-storage/verify-repair`)
- Sprawdzenie spójności: czy projekty z `groupId` są w folderze grupy
- Naprawa: przeniesienie zagubionych projektów do właściwego folderu

#### 3.6.4 Cleanup orphaned files
- Skanowanie folderów grup oprócz globalnych

#### 3.6.5 File manager (admin/files)
- Uwzględnienie nowej struktury przy browse/upload/delete

#### 3.6.6 Cache management
- Bez istotnych zmian (cache dotyczy galerii zewnętrznej, nie projektów/moodboardów)

#### 3.6.7 Tworzenie grupy — auto-tworzenie folderów
**Plik:** `src/utils/storage.ts` → `createGroup()`
- Po utworzeniu grupy: automatycznie utwórz `groups/{groupId}/projects/` i `groups/{groupId}/moodboard/`

#### 3.6.8 Usuwanie grupy — obsługa zasobów
**Plik:** `src/utils/storage.ts` → `deleteGroup()`
- Przed usunięciem: sprawdź czy grupa ma projekty/moodboardy
- Opcja: przenieś zasoby do globalnych lub do innej grupy
- Odmów usunięcia jeśli są zasoby (i brak flagi force)

---

### FAZA 7: Przycisk „Dodaj do moodboardu" w modalu galerii

#### Kontekst obecny
- Galeria wyświetla obrazy z zewnętrznego źródła (`GALLERY_BASE_URL`) w folderach/kategoriach
- Kliknięcie obrazu otwiera modal (`Gallery.tsx:570-788`) z podglądem pełnoekranowym
- Modal ma dostęp do: `selectedImage` (`ImageFile`: name, path, url), `currentFolderPath` (ścieżka kategorii/folderu)
- Moodboardy mają API upload: `POST /api/moodboard/upload` (przyjmuje `boardId`, `imageId`, `dataUrl`)
- Moodboard state: `POST /api/moodboard/state` (zapisuje cały stan z nowymi obrazami)
- `ImageFile.path` zawiera pełną ścieżkę w galerii, np. `metro/Drzwi/obraz.jpg`
- `ImageFile.url` zawiera pełny URL do obrazu

#### 3.7.1 Nowy endpoint API: `pages/api/moodboard/add-from-gallery.ts`
**Nowy plik** — dedykowany endpoint do dodawania obrazu z galerii do moodboardu

Przyjmuje:
```typescript
{
  boardId: string;          // ID moodboardu docelowego
  imageUrl: string;         // URL obrazu z galerii (do pobrania)
  imageName: string;        // Nazwa obrazu (do wyświetlenia)
  categoryPath: string;     // Ścieżka kategorii (np. "metro/Drzwi")
  groupId?: string;         // Docelowa grupa (auto z kategorii lub jawna)
}
```

Logika:
1. Walidacja auth (user musi być zalogowany)
2. **Automatyczne mapowanie kategorii → grupa:**
   - Parsuje `categoryPath` — pierwszy segment to nazwa kategorii głównej (np. `metro`)
   - Porównuje z `galleryFolder` wszystkich grup (`getGroups()`)
   - Match: `group.galleryFolder` zawiera lub jest równy kategorii → `groupId = group.id`
   - Brak match: używa grupy użytkownika lub zwraca błąd
3. Pobiera obraz z `imageUrl` (fetch do zewnętrznego serwera galerii)
4. Konwertuje do buffera, zapisuje jako plik moodboardu w folderze grupy
5. Generuje `imageId` = UUID
6. Wywołuje `saveMoodboardImage(boardId, imageId, buffer, ext, groupId)`
7. Dodaje obraz do stanu moodboardu:
   - Ładuje board JSON z folderu grupy
   - Dodaje nowy `MoodboardImage` z `imagePath`, domyślną pozycją i rozmiarem
   - Nazwa obrazu w komentarzu/etykiecie: `{categoryName}/{imageName}`
8. Zapisuje zaktualizowany board JSON
9. Broadcast SSE: `board:updated`
10. Zwraca: `{ success: true, imageId, imagePath, groupId, groupName }`

#### 3.7.2 Nowy komponent: `src/components/AddToMoodboardButton.tsx`
**Nowy plik** — przycisk + dropdown wyboru moodboardu

Props:
```typescript
{
  imageUrl: string;         // URL obrazu z galerii
  imageName: string;        // Nazwa pliku
  categoryPath: string;     // Ścieżka folderu w galerii
  onSuccess?: () => void;   // Callback po sukcesie
}
```

Stany i logika:
1. **Stan zamknięty (domyślnie):** Ikona `la-plus-circle` obok przycisku download
2. **Kliknięcie → otwiera dropdown** z listą moodboardów:
   - Pobiera listę boardów: `GET /api/moodboard/state` → `boards[]`
   - Wyświetla: nazwa boardu + (nazwa grupy jeśli admin)
   - Automatycznie podświetla rekomendowany board (pasujący do kategorii/grupy)
3. **Wybór boarda → wysyła request** do `/api/moodboard/add-from-gallery`
4. **Feedback:** toast/notyfikacja „Dodano {imageName} do moodboardu {boardName}"
5. **Stany ładowania:** spinner podczas pobierania, disabled gdy operacja w toku
6. **Obsługa błędów:** komunikat jeśli brak pasującej grupy lub brak moodboardów

Szczegóły UI:
- Dropdown pozycjonowany nad/pod przyciskiem (jak context menu)
- Każdy wpis na liście: nazwa boarda, kolor grupy (pasek boczny), ikona
- Opcja „+ Nowy moodboard" na dole listy (tworzy nowy board i od razu dodaje)
- Zamykanie: click outside, Escape

#### 3.7.3 Integracja w modalu galerii
**Plik:** `src/components/Gallery.tsx`

Lokalizacja: `modal-bottom-actions` (linia ~615), obok istniejącego download button

Zmiany:
```tsx
{/* Obok istniejącego download button */}
<button className="modal-download-button" ...>
  <i className="las la-download" />
</button>

{/* NOWY: Dodaj do moodboardu */}
<AddToMoodboardButton
  imageUrl={selectedImage.url}
  imageName={selectedImage.name}
  categoryPath={currentFolderPath ?? ''}
/>
```

Również w sekcji `modal-mobile-actions` (linia ~745) — duplikat dla mobile:
```tsx
<button className="modal-mobile-moodboard-button" ...>
  <i className="las la-plus-circle" />
</button>
```

#### 3.7.4 Automatyczne mapowanie kategorii → grupa (szczegóły algorytmu)

Ścieżka obrazu w galerii: `metro/Drzwi/WewnetrzneDrzwi/obraz.jpg`

Algorytm rozwiązywania grupy:
```
1. categoryPath = "metro/Drzwi/WewnetrzneDrzwi"
2. Segmenty: ["metro", "Drzwi", "WewnetrzneDrzwi"]
3. Dla każdej grupy:
   - group.galleryFolder = "metro/" → normalize → "metro"
   - Porównaj z segmentami categoryPath (od lewej):
     a) "metro" === "metro" → MATCH → groupId = group.id
4. Jeśli brak match → użyj grupy zalogowanego użytkownika (fallback)
5. Jeśli user nie ma grupy → zwróć błąd
```

Efekt: obraz `metro/Drzwi/obraz.jpg` automatycznie trafia do moodboardu grupy "metro".

#### 3.7.5 CSS/Style
**Plik:** `styles/globals.css` (lub odpowiedni plik stylów)

Nowe klasy:
- `.modal-moodboard-button` — styl jak `.modal-download-button` ale z innym kolorem (np. zielony/niebieski)
- `.moodboard-dropdown` — pozycjonowanie absolutne, tło, shadow, border-radius
- `.moodboard-dropdown-item` — hover state, kolor grupy, ikona
- `.moodboard-dropdown-item--recommended` — podświetlenie rekomendowanego boarda
- `.modal-mobile-moodboard-button` — wariant mobilny

---

## 4. Kolejność wdrażania (priorytety)

| Kolejność | Faza | Opis | Zależności |
|-----------|------|------|------------|
| 1 | 1.1–1.4 | Nowe ścieżki storage + refaktor storage | Brak |
| 2 | 1.5 | Refaktor API moodboard/state | Faza 1 |
| 3 | 2.1–2.5 | Kontrola dostępu (middleware + filtrowanie API) | Faza 1 |
| 4 | 3.1–3.3 | Migracja istniejących danych | Faza 1+2 |
| 5 | 4.1–4.5 | UI filtrowania | Faza 2+3 |
| 6 | 1.6 + 5.1–5.4 | API + UI przenoszenia/kopiowania | Faza 1+4 |
| 7 | 6.1–6.8 | Aktualizacja funkcji admin | Faza 1+3 |
| 8 | 7.1–7.5 | Przycisk „Dodaj do moodboardu" w galerii | Faza 1+2+4 |

---

## 5. Pliki do zmodyfikowania

### Nowe pliki
| Plik | Opis |
|------|------|
| `src/utils/moodboardStoragePath.ts` | Ścieżki moodboard per grupa |
| `src/utils/groupAccessMiddleware.ts` | Middleware kontroli dostępu per grupa |
| `src/utils/migrateToGroupFolders.ts` | Skrypt migracji danych |
| `pages/api/admin/projects/move.ts` | API przenoszenia projektu |
| `pages/api/admin/projects/copy.ts` | API kopiowania projektu |
| `pages/api/admin/moodboard/move.ts` | API przenoszenia moodboarda |
| `pages/api/admin/moodboard/copy.ts` | API kopiowania moodboarda |
| `pages/api/admin/migrate-to-group-folders.ts` | API migracji (admin) |
| `src/components/admin/MoveResourceModal.tsx` | Modal przenoszenia/kopiowania |
| `pages/api/moodboard/add-from-gallery.ts` | API dodawania obrazu z galerii do moodboardu |
| `src/components/AddToMoodboardButton.tsx` | Przycisk + dropdown wyboru moodboardu w modalu galerii |

### Modyfikowane pliki
| Plik | Zakres zmian |
|------|-------------|
| `src/utils/projectsStoragePath.ts` | Nowe funkcje ścieżek per grupa |
| `src/utils/projectsStorage.ts` | Refaktor: group-scoped CRUD |
| `src/utils/moodboardStorage.ts` | Refaktor: group-scoped image storage |
| `src/utils/storage.ts` | createGroup → auto-mkdir; deleteGroup → walidacja zasobów |
| `pages/api/moodboard/state.ts` | Group-scoped GET/POST |
| `pages/api/moodboard/upload.ts` | Group-scoped upload |
| `pages/api/moodboard/delete-image.ts` | Group-scoped delete |
| `pages/api/moodboard/images/[...path].ts` | Group-scoped serving |
| `pages/api/projects.ts` | Filtrowanie per grupa |
| `pages/api/admin/projects/list.ts` | Filtrowanie per grupa (query param) |
| `pages/api/admin/projects/add.ts` | Parametr groupId |
| `pages/api/admin/projects/update.ts` | Walidacja przynależności |
| `pages/api/admin/projects/delete.ts` | Walidacja przynależności |
| `pages/api/admin/projects/upload-thumbnail.ts` | Ścieżki per grupa |
| `pages/api/admin/projects/upload-gallery.ts` | Ścieżki per grupa |
| `pages/projekty.tsx` | UI filtrowania, akcje move/copy |
| `pages/projekty/[id].tsx` | Walidacja dostępu, akcje admina |
| `pages/moodboard.tsx` | Group-scoped ładowanie |
| `src/contexts/MoodboardContext.tsx` | GroupId w API calls |
| `src/components/moodboard/MoodboardTab.tsx` | Menu kontekstowe move/copy |
| `src/components/admin/GroupsManager.tsx` | Widok zasobów grupy |
| `src/hooks/useProjects.ts` | Parametr groupId |
| `src/contexts/AuthContext.tsx` | (minimalne zmiany, jeśli potrzebne) |
| `src/components/Gallery.tsx` | Integracja AddToMoodboardButton w modalu (desktop + mobile) |
| `styles/globals.css` | Nowe klasy: modal-moodboard-button, moodboard-dropdown |

---

## 6. Ryzyka i decyzje do podjęcia

### Do ustalenia
1. **User bez grupy** — co widzi? Opcje:
   - a) Nic (wymaga przypisania do grupy) ← **rekomendowane**
   - b) Globalne zasoby (bez groupId)

2. **Admin a grupy** — czy admin musi być przypisany do grupy?
   - Rekomendacja: NIE — admin widzi wszystko, może przełączać się między grupami

3. **Moodboardy — jedna instancja per grupa czy user?**
   - Rekomendacja: per grupa (współdzielone w ramach grupy, jak obecnie ale scoped)

4. **Kopiowanie moodboarda** — deep copy obrazów?
   - Rekomendacja: TAK — pełna kopia plików (nie symlinki)

5. **Usuwanie grupy z zasobami** — co robić?
   - Rekomendacja: blokuj usunięcie, wymagaj najpierw przeniesienia/usunięcia zasobów

---

## 7. Testy

### Scenariusze do przetestowania
1. User z grupą A widzi tylko projekty/moodboardy grupy A
2. User z grupą A NIE widzi projektów/moodboardów grupy B
3. Admin widzi wszystkie projekty i moodboardy ze wszystkich grup
4. Tworzenie projektu → zapisuje się w folderze grupy
5. Tworzenie moodboarda → zapisuje się w folderze grupy
6. Przeniesienie projektu z grupy A do B → pliki przeniesione, stary folder czysty
7. Kopiowanie moodboarda z grupy A do B → osobna kopia plików
8. Usunięcie grupy z zasobami → blokada
9. Migracja: stare projekty z groupId → w folderze grupy
10. Migracja: stare projekty bez groupId → w folderze globalnym
11. Upload obrazów moodboard → w folderze grupy
12. Serwowanie obrazów moodboard → z folderu grupy
13. Backup/restore uwzględnia foldery grup
14. API zwraca 403 gdy user próbuje dostać zasób innej grupy
15. Przycisk „Dodaj do moodboardu" widoczny w modalu galerii (desktop i mobile)
16. Kliknięcie przycisku → dropdown z listą moodboardów
17. Automatyczne mapowanie: obraz z folderu `metro/Drzwi/` → trafia do grupy "metro"
18. Obraz dodany do moodboardu pojawia się na canvasie z poprawną pozycją
19. Nazwa obrazu w moodboardzie: `{kategoria}/{nazwa_pliku}`
20. Brak duplikatów: ponowne dodanie tego samego obrazu → ostrzeżenie lub nowa kopia
21. Obsługa braku grupy pasującej do kategorii → fallback na grupę użytkownika
22. Obraz zapisany fizycznie w folderze moodboard grupy (nie jako data URL)
