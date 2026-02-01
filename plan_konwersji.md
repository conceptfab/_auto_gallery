# Plan konwersji systemu danych

Cel: rozbicie monolitów (`storage.json`, `cache-config.json`) na osobne pliki z podziałem po typie danych i trybem 24h (jeden plik na dzień), aby uprościć usuwanie historii i zmniejszyć ryzyko uszkodzenia danych.

---

## Stan obecny

| Źródło              | Zawartość                                                                                                                                                                                                                      | Lokalizacja                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `storage.json`      | whitelist, blacklist, groups, pendingEmails, activeCodes, adminCodes, loggedInUsers, loggedInAdmins, settings, **stats** (logins, sessions, viewEvents, downloadEvents)                                                        | `/data-storage/storage.json` lub `data/storage.json`           |
| `cache-config.json` | schedulerConfig, thumbnailConfig, **fileHashes**, **changeHistory**, **history**, lastSchedulerRun, lastScanChanges, lastScanDuration, emailNotificationConfig, lastRebuiltFolder, historyCleanupConfig, **folderHashRecords** | `/data-storage/cache-config.json` lub `data/cache-config.json` |

---

## Docelowa struktura plików

```
/data-storage/   (lub data/ gdy brak volume)
├── lists/
│   ├── whitelist.json          # string[] – białe listy
│   └── blacklist.json          # string[] – czarne listy
├── groups/
│   └── groups.json             # UserGroup[] – grupy/projekty
├── core/
│   ├── pending.json            # pendingEmails
│   ├── codes.json              # activeCodes, adminCodes, loggedInUsers, loggedInAdmins
│   └── settings.json           # settings (UI/UX, autoCleanup itd.)
├── users/                      # dane 24h – jeden plik na dzień
│   ├── stats-2026-02-01.json
│   ├── stats-2026-02-02.json
│   └── ...
└── history/                    # historia 24h – jeden plik na dzień
    ├── cache-2026-02-01.json   # fileHashes, changeHistory, history, folderHashRecords, lastSchedulerRun, lastScan* dla danego dnia
    ├── cache-2026-02-02.json
    └── ...
```

Uwaga: **Konfiguracja** (scheduler, thumbnails, email notifications) może zostać w jednym pliku dziennym razem z „snapshotem” stanu z danego dnia albo w osobnym pliku `config.json` – do ustalenia w etapie 4.

---

## Etap 1: Osobne pliki dla białej i czarnej listy

**Cel:** Białe i czarne listy w `lists/whitelist.json` i `lists/blacklist.json`.

**Zakres:**

1. Dodać ścieżki i helpery:
   - `getDataDir()` → `/data-storage` lub `data`
   - `getListsDir()` → `getDataDir()/lists`
   - `getWhitelistPath()`, `getBlacklistPath()`
2. Nowe moduły (lub rozszerzenie `storage.ts`):
   - `loadWhitelist()`, `saveWhitelist()`, `loadBlacklist()`, `saveBlacklist()`
3. Zamienić w `storage.ts` użycia `data.whitelist` / `data.blacklist` na odczyt/zapis z nowych plików.
4. Zachować API: `getWhitelist()`, `addToWhitelist()`, `removeFromWhitelist()`, `getBlacklist()`, `addToBlacklist()`, `removeFromBlacklist()` – bez zmian sygnatur.
5. Migracja jednorazowa: skrypt lub kod przy pierwszym uruchomieniu – jeśli istnieje `storage.json`, skopiować `whitelist` → `lists/whitelist.json`, `blacklist` → `lists/blacklist.json`; potem w `storage.json` (w pamięci/odczycie) te pola mogą być puste lub pomijane.

**Kryterium zakończenia:** Biała i czarna lista działają z nowych plików; panel admina i auth (add/remove z list) działają bez zmian w API.

---

## Etap 2: Osobny plik dla grup/projektów

**Cel:** Grupy w `groups/groups.json`.

**Zakres:**

1. Ścieżki: `getGroupsDir()`, `getGroupsPath()`.
2. Operacje: `loadGroups()`, `saveGroups()`; eksport funkcji `getGroups()`, `getGroupById()`, `createGroup()`, `updateGroup()`, `deleteGroup()`, `assignUserToGroup()` itd. – wewnętrznie czytają/zapisują `groups.json`.
3. W `storage.ts` (lub osobnym module) grupy nie są już częścią głównego obiektu z pliku `storage.json`; `loadData()` nie ładuje grup z tego pliku.
4. Migracja: przy pierwszym uruchomieniu skopiować `data.groups` z `storage.json` do `groups/groups.json`.

**Kryterium zakończenia:** CRUD grup w panelu admina działa z `groups/groups.json`; API grup bez zmian sygnatur.

---

## Etap 3: Dane użytkowników (stats) w trybie 24h

**Cel:** Statystyki użytkowników (logins, sessions, viewEvents, downloadEvents) w plikach dziennych `users/stats-YYYY-MM-DD.json`.

**Zakres:**

1. Konwencja: data w nazwie pliku w strefie czasu aplikacji (np. Europe/Warsaw); format `stats-YYYY-MM-DD.json`.
2. Helper: `getStatsPathForDate(date: Date)` → `users/stats-YYYY-MM-DD.json`.
3. Przy zapisie zdarzenia (login, session, view, download): określić „dzisiejszą” datę, załadować lub utworzyć plik na ten dzień, dopisać zdarzenie, zapisać.
4. Przy odczycie (historia, overview, user-details): agregacja z wielu plików (np. ostatnie N dni) – iteracja po plikach `users/stats-*.json` w zakresie dat, wczytanie i połączenie tablic.
5. `statsStorage.ts`: refaktor tak, aby wewnętrznie używał plików dziennych zamiast `data.stats` z `storage.json`.
6. Migracja: istniejące `data.stats` z `storage.json` rozpisać na pliki dzienne według `timestamp` każdego zdarzenia (np. logins → pliki według dnia logowania).

**Kryterium zakończenia:** Zdarzenia zapisują się do plików dziennych; raporty i czyszczenie (cleanup) działają na zbiorze plików; retencja = usuwanie plików starszych niż X dni.

---

## Etap 4: Historia cache (skanowanie, foldery, hashe) w trybie 24h

**Cel:** Historia skanowania, changeHistory, fileHashes, folderHashRecords w plikach dziennych `history/cache-YYYY-MM-DD.json`.

**Zakres:**

1. Rozdzielić w cache:
   - **Konfiguracja** (schedulerConfig, thumbnailConfig, emailNotificationConfig, historyCleanupConfig) – do jednego pliku, np. `core/cache-config.json` (tylko config), żeby nie mieszać z historią.
   - **Stan „na dziś”** (fileHashes, lastSchedulerRun, lastScanChanges, lastScanDuration) – może być w pliku dziennym lub w osobnym pliku „current” (np. `history/current.json`), z zapisem snapshotu do pliku dziennego o północy lub przy każdym skanie.
2. Konwencja plików dziennych: `history/cache-YYYY-MM-DD.json` – np. tablica wpisów historii (history, changeHistory) z danego dnia + opcjonalnie snapshot fileHashes/folderHashRecords na koniec dnia.
3. `cacheStorage.ts`: odczyt konfiguracji z `core/cache-config.json`; zapis zdarzeń historii do pliku dziennego; odczyt „aktualnego” fileHashes i lastSchedulerRun z jednego pliku (np. `history/current.json` lub ostatni plik dzienny).
4. Scheduler i hashService: zapis wyników skanu do pliku dziennego + aktualizacja pliku „current”.
5. Migracja: istniejące `cache-config.json` – config do `core/cache-config.json`; history/changeHistory/fileHashes rozpisać na pliki dzienne według timestampów (lub jeden duży import do „ostatniego” pliku dziennego, a potem tylko nowe dni).

**Kryterium zakończenia:** Skanowanie zapisuje wpisy do plików dziennych; konfiguracja cache w jednym miejscu; usuwanie starych plików historii = usuwanie plików `history/cache-*.json` starszych niż X dni.

---

## Etap 5: Plik core (pending, codes, settings) i odłączenie od storage.json

**Cel:** Reszta danych z `storage.json` (pendingEmails, activeCodes, adminCodes, loggedInUsers, loggedInAdmins, settings) w osobnych plikach w `core/`; żaden kod nie czyta już `storage.json` w całości.

**Zakres:**

1. Pliki: `core/pending.json`, `core/codes.json`, `core/settings.json`.
2. `storage.ts`: `loadData()` składa dane z wielu plików (lists, groups, core, opcjonalnie ostatni plik users) lub każda funkcja czyta tylko swój plik; `updateData()` zostaje tylko tam, gdzie trzeba atomowo aktualizować kilka pól w core.
3. Migracja: jednorazowe rozpakowanie `storage.json` do `lists/`, `groups/`, `core/` i plików dziennych users (etap 3).
4. Po weryfikacji: usunięcie odczytu/zapisu całego `storage.json`; opcjonalnie pozostawienie pliku tylko do jednorazowego odczytu przy migracji.

**Kryterium zakończenia:** Aplikacja nie używa już monolitowego `storage.json`; logowanie, admin, pending, ustawienia działają z nowych plików.

---

## Etap 6: Retencja i usuwanie starych plików

**Cel:** Jedna polityka: pliki dzienne starsze niż X dni są usuwane (users, history).

**Zakres:**

1. Konfiguracja retencji: np. w `core/settings.json` lub w ustawieniach UI (już jest autoCleanupDays dla stats) – osobno dla `users/` i `history/` (np. `usersRetentionDays`, `historyRetentionDays`).
2. Zadanie okresowe (cron lub scheduler): co dzień przejście po `users/stats-*.json` i `history/cache-*.json`, usunięcie plików z datą w nazwie starszą niż X.
3. Dokumentacja: w README lub konfiguracji opis, po ilu dniach pliki są usuwane.

**Kryterium zakończenia:** Stare pliki dzienne są automatycznie usuwane; nie rośnie w nieskończoność liczba plików.

---

## Kolejność wykonania (zalecana)

| Etap | Opis                                                  | Zależności                                                                                                                                    |
| ---- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Biała i czarna lista – osobne pliki                   | Brak                                                                                                                                          |
| 2    | Grupy – osobny plik                                   | Brak                                                                                                                                          |
| 3    | Stats użytkowników – pliki 24h                        | Etap 5 (core) można zrobić przed lub równolegle – stats mogą najpierw pisać do plików dziennych, a stary `storage.json` nadal trzymać resztę) |
| 4    | Historia cache – pliki 24h                            | Rozdzielenie config od historii                                                                                                               |
| 5    | Core (pending, codes, settings) i koniec storage.json | Etap 1, 2, 3 zakończone (lists, groups, users z plików); migracja jednym skokiem                                                              |
| 6    | Retencja i usuwanie starych plików                    | Etap 3, 4 wdrożone                                                                                                                            |

Możliwa uproszczona kolejność: **1 → 2 → 5** (rozbić storage.json na listy, grupy, core), potem **3 → 4** (pliki 24h dla users i history), na końcu **6**.

---

## Punkty uwagi

- **Atomowość:** Przy zapisie do pojedynczego pliku pisać do pliku tymczasowego i rename (np. `file.json.tmp` → `file.json`), żeby uniknąć uszkodzenia przy crashu.
- **Kompatybilność wstecz:** Przy pierwszym uruchomieniu po deployu sprawdzać, czy istnieje stary `storage.json` / `cache-config.json`; jeśli tak – uruchomić migrację (np. funkcja `migrateFromLegacyStorage()`), potem normalna praca z nowymi plikami.
- **Testy:** Po każdym etapie: logowanie, panel admina (listy, grupy, ustawienia), skanowanie cache, raporty stats – ręcznie lub automatycznie.
- **Backup:** Przed migracją na produkcji zrobić kopię `/data-storage` (lub `data/`).

---

## Pliki do modyfikacji (orientacyjnie)

- `src/utils/storage.ts` – główny refaktor, rozgałęzienie na listy/grupy/core i pliki dzienne.
- `src/utils/statsStorage.ts` – przejście na pliki dzienne w `users/`.
- `src/utils/cacheStorage.ts` – rozdzielenie config vs historia, pliki dzienne w `history/`.
- `src/services/schedulerService.ts`, `src/services/hashService.ts` – zapis do plików dziennych / current.
- API w `pages/api/auth/admin/*`, `pages/api/admin/*`, `pages/api/stats/*` – bez zmian sygnatur, ewentualnie tylko wywołania nowych helperów pod spodem.
- Nowe: `src/utils/storagePaths.ts` (lub w storage.ts) – ścieżki do listy, groups, core, users, history; opcjonalnie `src/utils/migrateLegacyStorage.ts` – skrypt migracji.

---

_Dokument: plan_konwersji.md – wersja 1.0_
