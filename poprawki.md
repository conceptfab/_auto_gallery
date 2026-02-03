# Raport Analizy Kodu (poprawki.md)

Poniżej znajduje się szczegółowa analiza projektu pod kątem over-engineeringu, bezpieczeństwa, optymalizacji oraz martwego kodu.

## 🚨 Podsumowanie Krytyczne
Głównym problemem projektu jest **"Reinventing the wheel" (wymyślanie koła na nowo)** w warstwie danych. Zamiast użyć lekkiej bazy danych (SQLite) lub w pełni wykorzystać Redis, zaimplementowano własny, skomplikowany system bazy danych opartej na plikach JSON (`storage.ts`, `cacheStorage.ts`), który jest trudny w utrzymaniu, podatny na błędy wyścigu (race conditions) i problemy z wydajnością przy większej skali.

---

## 🏗 Over-engineering (Nadmierne skomplikowanie)

### 1. Własny system bazodanowy (`src/utils/storage.ts`)
**Problem:** Plik ma ponad 850 linii i implementuje własny silnik bazy danych JSON.
- **Logika:** Obsługuje atomowe zapisy (plik `.tmp` -> rename), migracje schematów (etapy 1-5), podział na podkatalogi (`core`, `groups`, `lists`).
- **Ryzyko:** Przy większym ruchu obsługa plików JSON będzie blokować I/O. Ładowanie całego pliku do pamięci (`loadData`) to prosta droga do wycieków pamięci (OOM).
- **Zalecenie:** Zastąpić `storage.ts` prostą bazą SQLite (np. przez Prisma lub Kysely) lub wykorzystać istniejący Redis do przechowywania sesji/stanu. Kod skurczy się z 850 do ~100 linii.

### 2. Duplikacja mechanizmów cache (`cacheStorage.ts` vs `galleryCache.ts`)
**Problem:** Istnieją dwa niezależne systemy cache.
- `galleryCache.ts`: Używa Redis (Upstash).
- `cacheStorage.ts`: Implementuje własny cache na plikach JSON, własny scheduler, historię zmian i logikę "work hours".
- **Zalecenie:** Ujednolicić cache. Skoro Redis jest już w projekcie, należy go używać do wszystkiego (cache galerii, sesje, statusy). Usunąć skomplikowaną logikę schedulera z `cacheStorage.ts` na rzecz prostszych rozwiązań (np. Vercel Cron lub prosty `node-cron` jeśli to serwer VPS).

### 3. Monolityczny komponent `admin.tsx`
**Problem:** Plik `pages/admin.tsx` ma ponad 1500 linii i 53KB.
- **Logika:** Miesza logikę UI, pobierania danych, zarządzania stanem wielu sekcji (grupy, whitelist, blacklist, stats) w jednym pliku.
- **Zalecenie:** Rozbić na mniejsze komponenty (np. `GroupsManager`, `UserLists`, `SettingsPanel`) i przenieść logikę biznesową do custom hooków (np. `useAdminData`, `useGroups`).

---

## 🛡 Bezpieczeństwo

### 1. Walidacja ścieżek (`src/utils/pathValidation.ts`)
**Problem:** Własna implementacja walidacji ścieżek (`validateFilePath`) oparta na Regex.
- **Ryzyko:** Regex `^[a-zA-Z0-9\/_\-\.\s]+$` blokuje polskie znaki (ą, ę, ś, ć...), co może uniemożliwić obsługę plików o polskich nazwach. Jednocześnie ręczne sprawdzanie `..` jest podatne na błędy.
- **Zalecenie:** Używać standardowych bibliotek (np. `path.normalize`, `path.resolve`) i sprawdzać, czy wynikowa ścieżka zaczyna się od oczekiwanego katalogu root. Dodać obsługę Unicode w Regexach.

### 2. Proxy obrazów (`pages/api/image-proxy.ts`)
**Problem:** Walidacja domeny jest zbyt luźna.
- Kod: `parsedUrl.hostname.endsWith(domain)`
- **Luka:** Domena `evil-conceptfab.com` przejdzie walidację dla `conceptfab.com`.
- **Zalecenie:** Sprawdzać ściśle: `hostname === domain || hostname.endsWith('.' + domain)`.
- **Druga uwaga:** Endpoint robi tylko Redirect 301. Jeśli celem jest ukrycie oryginalnego URL, to nie działa (klient i tak widzi przekierowanie).

### 3. Middleware (`src/utils/adminMiddleware.ts`)
**Problem:** Plik istnieje w `utils`, ale nie znaleziono pliku `middleware.ts` w głównym katalogu ani w `src`.
- **Ryzyko:** Jeśli ten middleware nie jest nigdzie podpięty, to chronione trasy mogą być publicznie dostępne (chyba że sprawdzanie jest w każdym handlerze API, co jest "repetitive" i łatwe do przeoczenia).

---

## ⚡ Optymalizacja

### 1. Zarządzanie pamięcią (`storage.ts`)
**Problem:** `loadData` wczytuje wszystkie dane historyczne do pamięci RAM.
- **Skutek:** W miarę przybywania danych (logi, historia), aplikacja będzie zużywać coraz więcej RAMu przy każdym requeście (jeśli nie jest cache'owana instancja), co doprowadzi do awarii na produkcji.

### 2. Wielkość bundle'a
**Problem:** Importowanie pełnych bibliotek ikon (`@fortawesome/free-solid-svg-icons`) w komponentach klienckich może powodować duży rozmiar JS.
- **Zalecenie:** Upewnić się, że używany jest tree-shaking (importy konkretnych ikon).

---

## 🧹 Martwy kod / Clean Code

1.  **Nieużywane pliki:** Sprawdzić czy `src/utils/adminMiddleware.ts` jest w ogóle używany.
2.  **`TODO.md`:** Warto przejrzeć, czy nie zawiera starych, nieaktualnych zadań.
3.  **`src/Services` vs `src/utils`:** Niejasny podział odpowiedzialności. Niektóre serwisy są w `utils` (np. `email.ts`), inne mogą być w `services`.

## 📋 Plan Naprawczy (Priorytety)

1.  🔴 **HIGHEST:** Poprawić walidację w `image-proxy.ts` i `pathValidation.ts` (Bezpieczeństwo).
2.  🟠 **HIGH:** Przepisać `storage.ts` na SQLite lub Redis (Stabilność/Wydajność).
3.  🟡 **MEDIUM:** Refaktoryzacja `pages/admin.tsx` (Utrzymywalność).
4.  🔵 **LOW:** Usunięcie martwego kodu i ujednolicenie struktury folderów.
