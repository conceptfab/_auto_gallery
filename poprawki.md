# Audyt kodu – poprawki (optymalizacja, martwy kod, bezpieczeństwo, wydajność)

Data audytu: 2025-02-02

---

## 1. BEZPIECZEŃSTWO

### 1.1 Brak rate limit na `/api/auth/request-code.ts`

- **Problem:** Endpoint nie używa `withRateLimit`. Można spamować żądaniami (wysyłka kodów, powiadomień do admina, wyczerpanie zasobów).
- **Rekomendacja:** Dodać `withRateLimit`, np. 5 żądań na 15 minut na IP (lub podobnie jak verify-code).

### 1.2 Brak rate limit na `/api/bug-report.ts`

- **Problem:** Brak ograniczenia liczby żądań – możliwy spam raportów i nadużycie emaila.
- **Rekomendacja:** Dodać `withRateLimit` (np. 3–5 raportów na minutę na IP).

### 1.3 Generowanie kodu logowania – słaby PRNG

- **Plik:** `src/utils/auth.ts`, funkcja `generateCode()`.
- **Problem:** Użycie `Math.random().toString(36).substring(2, 8)` – nie jest kryptograficznie bezpieczne.
- **Rekomendacja:** Użyć `crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)` lub `crypto.randomInt` dla 6-znakowego kodu.

### 1.4 Domyślny pusty `FILE_PROXY_SECRET` w `src/utils/fileToken.ts`

- **Problem:** `const SECRET_KEY = process.env.FILE_PROXY_SECRET || ''`. Gdy zmienna nie jest ustawiona, HMAC jest generowany z pustym sekretem – tokeny są przewidywalne.
- **Rekomendacja:** W trybie z włączoną ochroną plików wymuszać ustawienie `FILE_PROXY_SECRET` (np. przy starcie lub w pierwszym użyciu zwracać błąd / logować ostrzeżenie i nie wystawiać tokenów).

### 1.5 Brak walidacji parametru `folder` w `/api/admin/files/upload.ts`

- **Problem:** `const { folder = '' } = req.query` – wartość przekazywana do `generateUploadToken(folderPath)` bez walidacji. Teoretycznie możliwa ścieżka z `..` lub niedozwolonymi znakami.
- **Rekomendacja:** Użyć `validateFilePath(folderPath)` (lub `validateFolderPathDetailed` dla folderu) i zwrócić 400 przy nieprawidłowej ścieżce.

### 1.6 Path traversal w `/api/thumbnails/[...path].ts`

- **Problem:** Sprawdzane jest tylko `relativePath.includes('..') || relativePath.includes('~')`. Po `path.join(cachePath, relativePath)` nie ma weryfikacji, że wynikowy plik faktycznie leży _wewnątrz_ `cachePath` (np. przy symbolicznych linkach lub dziwnych systemach plików).
- **Rekomendacja:** Po wyznaczeniu `fullPath` wywołać `await fsp.realpath(fullPath)` i sprawdzić, że wynik zaczyna się od `await fsp.realpath(cachePath)` (lub użyć `path.relative(realCachePath, realFullPath)` i sprawdzić, że nie zaczyna się od `..`).

### 1.7 Ciasteczka bez flagi `Secure`

- **Pliki:** `src/utils/auth.ts` (setAuthCookie, clearAuthCookie), `pages/api/auth/verify-code.ts`, `pages/api/auth/admin/verify-code.ts`, `pages/api/auth/admin/logout.ts`.
- **Problem:** Ustawiane ciasteczka nie mają atrybutu `Secure`. W środowisku produkcyjnym (HTTPS) ciasteczka powinny być wysyłane tylko przez HTTPS.
- **Rekomendacja:** W production dodać `; Secure` do odpowiednich `Set-Cookie` (np. `process.env.NODE_ENV === 'production'`).

### 1.8 Endpoint cron `/api/cron/wake.ts` bez wymaganego sekretu

- **Problem:** Gdy `CRON_SECRET` nie jest ustawiony, każdy może wywołać GET i „obudzić” scheduler.
- **Rekomendacja:** Udokumentować w kodzie/README, że przy pustym `CRON_SECRET` endpoint jest publiczny; albo wymagać ustawienia `CRON_SECRET` i wtedy zawsze sprawdzać nagłówek.

### 1.9 Walidacja nazwy pliku w załącznikach bug-report

- **Plik:** `pages/api/bug-report.ts`.
- **Problem:** `a.filename` z body jest używane bez walidacji (np. `../../../etc/passwd` lub znaki specjalne) – głównie ryzyko przy zapisie na dysk lub w treści emaila.
- **Rekomendacja:** Ograniczyć do bezpiecznej nazwy (np. tylko znaki alfanumeryczne, kropka, myślnik, podkreślenie) i długości (np. max 100 znaków); ewentualnie użyć `path.basename()` i odrzucić ścieżki.

### 1.10 Spójność middleware admina

- **Plik:** `src/utils/adminMiddleware.ts`.
- **Problem:** Używa `getEmailFromCookie(req)` i ręcznego sprawdzenia `email !== ADMIN_EMAIL`. Pozostałe endpointy admina używają `getAdminEmailFromCookie(req)`.
- **Rekomendacja:** W middleware użyć `getAdminEmailFromCookie(req)` i sprawdzać tylko `!email || !(await isAdminLoggedIn(email))` – mniej duplikacji i spójna semantyka.

---

## 2. MARTWY KOD

### 2.1 Nieużywana zmienna w `pages/api/gallery.ts`

- **Lokalizacja:** Funkcja `attachDecorsAsKolorystyka`, ok. linia 133.
- **Problem:** `const _existingKolorystyka = folders.find(...)` – zmienna jest przypisana, ale nigdzie nieużywana. Komentarz mówi o idempotentności, ale logika idempotentności realizowana jest przez `filter((f) => f.name.toLowerCase() !== 'kolorystyka')` i dopisanie nowej „Kolorystyki”.
- **Rekomendacja:** Usunąć deklarację `_existingKolorystyka` (i ewentualnie skrócić komentarz, jeśli nadal ma sens).

### 2.2 Nieużywane stałe w `src/config/constants.ts`

- **Stałe:** `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `LOADING_PROGRESS_START`, `LOADING_PROGRESS_FINAL`.
- **Problem:** Eksportowane, ale nigdzie w projekcie nie importowane ani nie używane.
- **Rekomendacja:** Albo użyć ich w odpowiednich miejscach (np. rate limit w jednym wspólnym miejscu konfiguracji), albo usunąć eksporty, żeby nie zaśmiecać API konfiguracji.

---

## 3. WYDAJNOŚĆ I OPTYMALIZACJA

### 3.1 Rate limiter – czyszczenie mapy

- **Plik:** `src/utils/rateLimiter.ts`.
- **Problem:** Przy każdym `checkRateLimit` wywoływane jest `requests.forEach((entry, key) => { ... })` – pełna iteracja po mapie. Przy bardzo dużej liczbie klientów może to być odczuwalne.
- **Rekomendacja:** Ograniczyć rozmiar mapy (np. max 10 000 wpisów) lub czyścić wygasłe wpisy co N żądań / co jakiś czas zamiast przy każdym.

### 3.2 Wywołania `logger.debug` w pętlach (galeria)

- **Plik:** `pages/api/gallery.ts` – np. `collectDecorsImages` i `attachDecorsAsKolorystyka` wywołują `logger.debug` dla wielu folderów/obrazów. W production logger.debug to noop, ale same wywołania i budowanie argumentów (np. tablice) nadal się wykonują.
- **Rekomendacja:** Opcjonalnie opakować bloki debugowe w `if (logger.debug !== noop)` lub pozostawić jak jest (koszt mały, czytelność dobra).

### 3.3 Cache Redis – ujednolicenie logowania błędów

- **Plik:** `src/utils/galleryCache.ts`.
- **Problem:** Użycie `console.error` zamiast `logger.error` – niespójne z resztą projektu.
- **Rekomendacja:** Importować `logger` i używać `logger.error(...)` zamiast `console.error`.

---

## 4. JAKOŚĆ KODU I SPÓJNOŚĆ

### 4.1 Użycie `console.error` / `console.log` zamiast loggera

- **Lokalizacje:** Wiele plików w `pages/api/` oraz w `src/utils/` (storage, statsStorage, email, downloadUtils, instrumentation, schedulerService, hooks, komponenty).
- **Problem:** Część błędów/komunikatów jest logowana przez `console.error`/`console.log`, zamiast przez wspólny `logger` (np. `logger.error`). Utrudnia to centralne zarządzanie poziomem logów i formatem.
- **Rekomendacja:** Stopniowo zastępować `console.error`/`console.log` wywołaniami `logger.error`/`logger.info`/`logger.warn` tam, gdzie to możliwe (szczególnie w API i utils), z zachowaniem sensu (np. w cronie czasem celowo zostawia się console dla widoczności w logach Railway).

### 4.2 Walidacja ścieżki w thumbnails

- **Plik:** `pages/api/thumbnails/[...path].ts`.
- **Problem:** Własna logika (`..`, `~`) zamiast wspólnej `validateFilePath` z `pathValidation.ts`.
- **Rekomendacja:** Po ewentualnym dopasowaniu regexu do wymagań (np. dozwolone znaki) użyć `validateFilePath(relativePath)` dla spójności i jednego miejsca zmian przy path traversal.

---

## 5. PODSUMOWANIE PRIORYTETÓW

| Priorytet | Kategoria      | Opis                                                                                   |
| --------- | -------------- | -------------------------------------------------------------------------------------- |
| Wysoki    | Bezpieczeństwo | Rate limit na request-code i bug-report (1.1, 1.2)                                     |
| Wysoki    | Bezpieczeństwo | Crypto-safe kod logowania – generateCode (1.3)                                         |
| Wysoki    | Bezpieczeństwo | Wymuszenie FILE_PROXY_SECRET lub ostrzeżenie (1.4)                                     |
| Średni    | Bezpieczeństwo | Walidacja folder w upload (1.5), path traversal thumbnails (1.6), Secure cookies (1.7) |
| Średni    | Jakość         | adminMiddleware – getAdminEmailFromCookie (1.10)                                       |
| Niski     | Martwy kod     | Usunięcie \_existingKolorystyka (2.1), nieużywane stałe (2.2)                          |
| Niski     | Wydajność      | Rate limiter cleanup (3.1)                                                             |
| Niski     | Spójność       | Logger zamiast console (3.3, 4.1), pathValidation w thumbnails (4.2)                   |

---

_Po wdrożeniu poprawek warto uruchomić testy i ponownie przejrzeć zmiany (szczególnie auth, cookie i path validation)._
