# Plan migracji storage na asynchroniczne I/O

**Status wdrożenia:** migracja zakończona (Fazy 0–4). Build przechodzi. Do wykonania: testy manualne.

---

## 1. Cel i zakres

**Cel:** Zamiana synchronicznego odczytu/zapisu pliku `storage.json` (`fs.readFileSync` / `fs.writeFileSync`) na asynchroniczne (`fs.promises.readFile` / `fs.promises.writeFile`), aby nie blokować event loopu w Node.js i ujednolicić API z resztą stosu (handlery API są już async).

**Zakres:**

- `src/utils/storage.ts` – wewnętrzne I/O oraz wszystkie eksportowane funkcje
- `src/utils/auth.ts` – funkcje korzystające ze storage (loginUser, logoutUser, isUserLoggedIn; re-eksport / użycie `isAdminLoggedIn`)
- `src/utils/adminMiddleware.ts` – wywołanie `isAdminLoggedIn`
- Wszystkie handlery API w `pages/api/`, które importują ze `storage` lub z `auth` funkcje oparte o storage

**Poza zakresem (bez zmian):**

- `admin-login.tsx` / `admin.tsx` – używają wyłącznie odpowiedzi z API (`isAdminLoggedIn` w JSON), nie wywołują storage bezpośrednio
- `FileManager.tsx` – `e.dataTransfer.getData('text/plain')` to API przeglądarki, nie storage projektu

---

## 2. Strategia API storage

**Opcja przyjęta:** wprowadzenie w `storage.ts` asynchronicznych wersji funkcji o sygnaturach:

- `getData(): Promise<StorageData>` → w dokumencie oznaczane jako `getDataAsync()` dla jasności planu; w kodzie można zachować nazwę `getData` i zmienić zwracany typ na `Promise<StorageData>`.
- `updateData(updater: (data: StorageData) => void): Promise<void>` → w kodzie `updateDataAsync` lub zmiana sygnatury na `updateData(updater): Promise<void>`.

**Rekomendacja:**  
Dla czytelności i bezpieczeństwa migracji w jednym kroku:

1. Dodać w `storage.ts` **nowe** funkcje: `getDataAsync()` i `updateDataAsync(updater)`.
2. Wewnętrznie: `loadData` → `loadDataAsync`, `saveData` → `saveDataAsync`; cache obsługiwany w async (np. przy pierwszym wywołaniu `getDataAsync` ładowanie, przy `updateDataAsync` zapis + aktualizacja cache).
3. Dla każdej eksportowanej funkcji pomocniczej (np. `getPendingEmails`, `addToWhitelist`) dodać wersję async, np. `getPendingEmailsAsync()`, i tak dalej – **albo** (prościej) zmienić sygnaturę istniejącej funkcji na async (np. `getPendingEmails(): Promise<...>`) i wewnątrz używać `await getDataAsync()` / `await updateDataAsync(...)`.

**W dokumencie** zakładamy **zamianę sygnatur** istniejących funkcji na async (bez równoległego utrzymywania wersji sync), żeby uniknąć duplikacji i pomyłek. Kolejność wdrożenia poniżej.

---

## 3. Kolejność wdrożenia (fazy)

### Faza 0: Przygotowanie (opcjonalne) ✅ ZAKOŃCZONE

- [x] Zrzut/backup `data/storage.json` lub `/data-storage/storage.json` przed zmianami → utworzono `data/storage.json.backup-pre-async-migration`
- Upewnienie się, że testy (jeśli są) przechodzą przed migracją.

### Faza 1: `src/utils/storage.ts` ✅ ZAKOŃCZONE

1. **I/O**
   - Zamienić `import fs from 'fs'` na użycie `import fs from 'fs/promises'` (lub `const fs = require('fs').promises` tylko jeśli bez zmiany importów; w projekcie TS lepiej `fs.promises` lub osobny import z `'fs/promises'`).
   - `loadData(): StorageData` → `async loadData(): Promise<StorageData>`, wewnątrz `await fs.readFile(DATA_FILE, 'utf8')` (+ `fs.access` lub `try/catch` zamiast `existsSync`).
   - `saveData(data: StorageData): void` → `async saveData(data: StorageData): Promise<void>`, wewnątrz `await fs.mkdir(..., { recursive: true })` oraz `await fs.writeFile(...)`.

2. **Cache i podstawowe API**
   - `getData(): StorageData` → `async getData(): Promise<StorageData>`: przy braku cache wywołanie `cachedData = await loadData()`, zwrot cache.
   - `updateData(updater): void` → `async updateData(updater): Promise<void>`: `const data = await getData()`, `updater(data)`, `cachedData = data`, `await saveData(data)`.

3. **Funkcje używające tylko getData**
   Zamienić na `async` i wewnątrz `await getData()`:
   - `getPendingEmails` → `Promise<PendingEmail[]>`
   - `getWhitelist` → `Promise<string[]>`
   - `getBlacklist` → `Promise<string[]>`
   - `getActiveCode(email)` → `Promise<LoginCode | undefined>`
   - `isUserLoggedIn(email)` → `Promise<boolean>`
   - `getAdminCode(email)` → `Promise<LoginCode | undefined>`
   - `isAdminLoggedIn(email)` → `Promise<boolean>`
   - `getGroups` → `Promise<UserGroup[]>`
   - `getGroupById(id)` – zależy od `getGroups()` → `Promise<UserGroup | undefined>`
   - `getUserGroup(email)` – zależy od `getGroups()` → `Promise<UserGroup | null>`

4. **Funkcje używające updateData (i ewentualnie getData)**
   Zamienić na `async` i wewnątrz używać `await updateData(...)` (oraz w razie potrzeby `await getData()`):
   - `addPendingEmail(email, ip)`
   - `removePendingEmail(email)`
   - `addToWhitelist(email)`
   - `addToBlacklist(email)`
   - `removeFromWhitelist(email)`
   - `removeFromBlacklist(email)`
   - `addActiveCode(email, loginCode)`
   - `removeActiveCode(email)`
   - `loginUser(email)`
   - `logoutUser(email)`
   - `cleanupExpiredCodes()` → zwraca `Promise<number>`
   - `cleanupOldRequests()` → zwraca `Promise<number>`
   - `addAdminCode(email, loginCode)`
   - `removeAdminCode(email)`
   - `loginAdmin(email)`
   - `logoutAdmin(email)`
   - `cleanupExpiredAdminCodes()` → zwraca `Promise<number>`
   - `createGroup(...)` → `Promise<UserGroup>`
   - `updateGroup(...)` → `Promise<UserGroup | null>`
   - `deleteGroup(id)` → `Promise<boolean>`
   - `addUserToGroup(groupId, email)` → `Promise<boolean>`
   - `removeUserFromGroup(groupId, email)` → `Promise<boolean>`

5. **Sprawdzenie `DATA_FILE`**
   - `fs.existsSync` w definicji `DATA_FILE` można zostawić na starcie (sync, raz) albo przenieść inicjalizację ścieżki do pierwszej operacji async i wtedy użyć `fs.access`.

Po Fazie 1: `storage.ts` eksportuje tylko async API. Kompilacja się wysypie wszędzie tam, gdzie wywoływane są te funkcje bez `await` – to expected i naprawiamy w kolejnych fazach.

---

### Faza 2: `src/utils/auth.ts` ✅ ZAKOŃCZONE

Funkcje wywołujące storage muszą stać się async i przekazywać `await` w dół:

| Funkcja           | Obecne wywołanie                  | Zmiana                                                                                                                                                                           |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loginUser`       | `storageLogin(email)`             | `await storageLogin(email)`; sygnatura `async loginUser(email)`                                                                                                                  |
| `logoutUser`      | `storageLogout(email)`            | `await storageLogout(email)`; `async logoutUser(email)`                                                                                                                          |
| `isUserLoggedIn`  | `return storageIsLoggedIn(email)` | `return await storageIsLoggedIn(email)`; `async isUserLoggedIn(email)`                                                                                                           |
| (isAdminLoggedIn) | Re-eksport ze storage             | W storage już async → w auth albo async re-eksport, albo pozostawić import ze storage w API. Nie trzeba duplikować w auth, jeśli call sites i tak importują ze storage lub auth. |

**Uwaga:** W pliku `auth.ts` jest `import { isAdminLoggedIn } from './storage'`. Jeśli ktoś importuje `isAdminLoggedIn` z `auth.ts`, to auth musi re-eksportować async wersję (np. `export { isAdminLoggedIn } from './storage'`), a wszystkie wywołania `isAdminLoggedIn` i tak muszą używać `await`, bo źródło jest w storage.

Sprawdzić w projekcie, skąd jest używane `isAdminLoggedIn`: czy z `auth` czy ze `storage`. Na podstawie grep: `adminMiddleware` i `pages/api/auth/admin/status.ts` importują ze `storage`; `auth.ts` importuje ze storage i re-eksportuje. Call sites (middleware, status) mogą dalej importować ze storage i wywoływać `await isAdminLoggedIn(email)`.

W Fazie 2 wystarczy:

- w `auth.ts`: `loginUser`, `logoutUser`, `isUserLoggedIn` jako `async` i wewnątrz `await` do odpowiednich funkcji ze storage.

---

### Faza 3: `src/utils/adminMiddleware.ts` ✅ ZAKOŃCZONE

- `isAdminLoggedIn(email)` jest wywoływane synchronicznie.
- Zmiana: w środku funkcji przekazanej do `withAdminAuth` dodać `await`:
  - `if (email !== ADMIN_EMAIL || !(await isAdminLoggedIn(email))) { ... }`
- Funkcja owijająca handler i tak jest `async (req, res) => { ... }`, więc async/await jest zgodne.

Plik do edycji: `src/utils/adminMiddleware.ts` – jedno miejsce, zamiana na `await isAdminLoggedIn(email)`.

---

### Faza 4: Endpointy API – lista plików i zmian ✅ ZAKOŃCZONE

Wszystkie handlery są już `async`, więc wystarczy przy każdym wywołaniu funkcji ze storage lub z auth dodać `await`. Poniżej dla każdego pliku: jakie funkcje są wywoływane i że trzeba je poprzedzić `await`. Wszystkie wymienione endpointy zaktualizowano.

| Plik                                         | Funkcje ze storage/auth                                                                                              | Zmiany                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/api/admin/settings.ts`                | `getData`, `updateData`, `isAdminLoggedIn`                                                                           | `const data = await getData()`; `await updateData(...)`; `if (!(await isAdminLoggedIn(adminEmail)))`; `const updatedData = await getData()` |
| `pages/api/auth/status.ts`                   | `getUserGroup`                                                                                                       | `const userGroup = await getUserGroup(email)`                                                                                               |
| `pages/api/auth/verify-code.ts`              | `cleanupExpiredCodes`, `getActiveCode`, `removeActiveCode` + z auth `loginUser`                                      | `await cleanupExpiredCodes()`; `const loginCode = await getActiveCode(email)`; `await removeActiveCode(email)`; `await loginUser(email)`    |
| `pages/api/auth/request-code.ts`             | `cleanupExpiredCodes`, `getBlacklist`, `getWhitelist`, `addActiveCode`, `getPendingEmails`, `addPendingEmail`        | Wszystkie wywołania tych funkcji poprzedzić `await`                                                                                         |
| `pages/api/auth/logout.ts`                   | Przez auth: `logoutUser`                                                                                             | `await logoutUser(email)`                                                                                                                   |
| `pages/api/auth/cleanup.ts`                  | `cleanupExpiredCodes`, `cleanupOldRequests`, `getPendingEmails`                                                      | `await cleanupExpiredCodes()`, `await cleanupOldRequests()`, `await getPendingEmails()`                                                     |
| `pages/api/auth/admin/status.ts`             | `isAdminLoggedIn`                                                                                                    | `const isLoggedIn = await isAdminLoggedIn(email)`                                                                                           |
| `pages/api/auth/admin/verify-code.ts`        | `cleanupExpiredAdminCodes`, `getAdminCode`, `removeAdminCode`, `loginAdmin`                                          | Wszystkie wywołania z `await`                                                                                                               |
| `pages/api/auth/admin/request-access.ts`     | `addAdminCode`, `cleanupExpiredAdminCodes`                                                                           | `await cleanupExpiredAdminCodes()`, `await addAdminCode(...)`                                                                               |
| `pages/api/auth/admin/pending-emails.ts`     | `getPendingEmails`, `getWhitelist`, `getBlacklist`                                                                   | `await getPendingEmails()`, `await getWhitelist()`, `await getBlacklist()`                                                                  |
| `pages/api/auth/admin/manage-email.ts`       | `cleanupExpiredCodes`, `getPendingEmails`, `addToWhitelist`, `addActiveCode`, `removePendingEmail`, `addToBlacklist` | Wszystkie wywołania z `await`                                                                                                               |
| `pages/api/auth/admin/remove-from-list.ts`   | `getWhitelist`, `removeFromWhitelist`, `getBlacklist`, `removeFromBlacklist`                                         | Wszystkie z `await`                                                                                                                         |
| `pages/api/auth/admin/logout.ts`             | `logoutAdmin`                                                                                                        | `await logoutAdmin(email)`                                                                                                                  |
| `pages/api/auth/admin/groups/list.ts`        | `getGroups`                                                                                                          | `const groups = await getGroups()`                                                                                                          |
| `pages/api/auth/admin/groups/create.ts`      | `createGroup`                                                                                                        | `const group = await createGroup(...)`                                                                                                      |
| `pages/api/auth/admin/groups/update.ts`      | `updateGroup`                                                                                                        | `const group = await updateGroup(...)`                                                                                                      |
| `pages/api/auth/admin/groups/delete.ts`      | `deleteGroup`                                                                                                        | `const deleted = await deleteGroup(id)`                                                                                                     |
| `pages/api/auth/admin/groups/assign-user.ts` | `addUserToGroup`, `removeUserFromGroup`                                                                              | `await removeUserFromGroup(...)`, `await addUserToGroup(...)`                                                                               |
| `pages/api/gallery.ts`                       | `getUserGroup`, `getGroupById`                                                                                       | Wszystkie wywołania (w handlerze) z `await getUserGroup(...)`, `await getGroupById(...)`                                                    |
| `pages/api/folders.ts`                       | `getUserGroup`, `getGroupById`                                                                                       | Wszystkie wywołania z `await`                                                                                                               |

---

## 4. Szczegóły techniczne w storage.ts

### 4.1 Odczyt pliku (zamiast existsSync + readFileSync)

```ts
import fsp from 'fs/promises';

async function loadData(): Promise<StorageData> {
  try {
    await fsp.access(DATA_FILE); // rzuci, jeśli nie ma pliku
  } catch {
    return { ...defaultData };
  }
  const raw = await fsp.readFile(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  return { ...defaultData, ...data };
}
```

Alternatywa: `try { const raw = await fsp.readFile(DATA_FILE, 'utf8'); ... } catch { return { ...defaultData }; }` (bez osobnego `access`).

### 4.2 Zapis pliku

```ts
async function saveData(data: StorageData): Promise<void> {
  const dir = path.dirname(DATA_FILE);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}
```

### 4.3 Inicjalizacja DATA_FILE

- `fs.existsSync` w definicji zmiennej na górze pliku można zostawić (uruchamiane raz przy ładowaniu modułu).
- Jeśli całość ma być bez sync: ścieżkę można ustalić w osobnej sync funkcji używającej `process.cwd()` i stałych, a `existsSync` wykonać tylko w `loadData` przez `fsp.access(...).then(...).catch(...)` i wybór ścieżki – w praktyce wystarczy jedna stała ścieżka jak dziś i tylko zamiana wewnętrznego I/O na async.

---

## 5. Weryfikacja po każdej fazie

- **Po Fazie 1:** `tsc --noEmit` (lub build) – oczekiwane błędy w miejscach wywołań storage/auth bez `await`; lista plików z błędami = dokładna lista do przeróbki w Fazach 2–4.
- **Po Fazie 2:** błędy w wywołaniach `loginUser`/`logoutUser`/`isUserLoggedIn` – do poprawy w API (Faza 4).
- **Po Fazie 3:** brak nowych błędów w adminMiddleware, jeśli wcześniej poprawiono import i typ.
- **Po Fazie 4:** `tsc --noEmit` / build przechodzi; manualnie: logowanie użytkownika, logowanie admina, wylogowanie, wnioski, whitelist/blacklist, grupy, ustawienia, galeria i foldery – podstawowe ścieżki działają.

---

## 6. Checklist wdrożenia

- [x] **Faza 0:** backup storage.json → `data/storage.json.backup-pre-async-migration`
- [x] **Faza 1:** storage.ts – fs.promises, loadData/saveData/getData/updateData async, wszystkie eksporty async
- [x] **Faza 2:** auth.ts – loginUser, logoutUser, isUserLoggedIn async + await do storage
- [x] **Faza 3:** adminMiddleware.ts – await isAdminLoggedIn(email)
- [x] **Faza 4:** wszystkie endpointy z tabeli (admin/settings, auth/_, auth/admin/_, gallery, folders) – await przy każdym wywołaniu storage/auth
- [x] **Build bez błędów** – `npm run build` zakończony powodzeniem
- [ ] **Testy manualne:** logowanie/wylogowanie user i admin, pending/whitelist/blacklist, grupy, ustawienia, galeria (do wykonania przez użytkownika)

---

## 7. Ryzyka i uwagi

- **Concurrency:** przy wielu równoległych żądaniach zapisującym ten sam plik możliwy jest „last write wins”. Obecny sync model miał to samo; dla silnej spójności w przyszłości można rozważyć kolejkowanie zapisów lub blokadę pliku (np. `fs.flock` na Linuksie lub osobna kolejka w Node).
- **Cache:** po migracji cache w pamięci nadal ma sens; przy `getData`/`updateData` async cache jest współdzielony – warto zachować zapis „w jednym wątku” przez jedną instancję aplikacji. Brak zmian architektury cache w tym planie.
- **Czas realizacji:** Faza 1 to ~30–45 min, Fazy 2–3 po kilka minut, Faza 4 to ok. 20 plików po 1–5 linii – łącznie ok. 1–2 h robocze przy ostrożnym podejściu i testach.

Koniec dokumentu.
