# Plan Wdrożenia Poprawek (Roadmapa Techniczna)

Dokument ten definiuje szczegółowy plan naprawczy dla aplikacji, oparty na audycie kodu (`poprawki.md`) oraz weryfikacji stanu faktycznego repozytorium.

## 🎯 Cel Główny
Poprawa bezpieczeństwa, stabilności i utrzymywalności aplikacji poprzez eliminację długu technologicznego ("reinventing the wheel") oraz uszczelnienie luk bezpieczeństwa.

## 📅 Harmonogram Wdrożenia (Priorytety)

Implementacja została podzielona na 4 fazy, od zmian krytycznych do optymalizacyjnych.

### Faza 1: Bezpieczeństwo (Critical / High) 🛡️
*Czas realizacji: 1-2 dni*
Te zmiany muszą zostać wdrożone natychmiast, aby zablokować potencjalne wektory ataku.

1.  **Uszczelnienie `image-proxy.ts` (SSRF Prevention)**
    *   **Problem:** Obecna walidacja `endsWith` pozwala na obejście (np. `evil-conceptfab.com`).
    *   **Rozwiązanie:** Wdrożenie ścisłego sprawdzania `hostname` względem białej listy domen (`conceptfab.com`, `cdn.conceptfab.com`).
    *   **Zadanie:** Przepisanie logiki walidacji w `pages/api/image-proxy.ts`.

2.  **Poprawa walidacji ścieżek `pathValidation.ts`**
    *   **Problem:** Regex blokuje polskie znaki (ą, ę, ś...) i jest zbyt restrykcyjny.
    *   **Rozwiązanie:** Zaktualizowanie wyrażeń regularnych o obsługę Unicode (`\p{L}`) oraz użycie standardowych metod `path.normalize()` zamiast ręcznego parsowania.
    *   **Zadanie:** Aktualizacja `src/utils/pathValidation.ts` i dodanie testów jednostkowych dla polskich nazw plików.

3.  **Centralizacja Autoryzacji (`middleware.ts`)**
    *   **Problem:** Autoryzacja opiera się na wrapperze `withAdminAuth` w każdym handlerze. Łatwo o pomyłkę (pominięcie wrappera).
    *   **Rozwiązanie:** Wdrożenie natywnego `middleware.ts` z Next.js, który globalnie chroni ścieżki `/admin/*` oraz `/api/auth/admin/*`.
    *   **Zadanie:** Utworzenie pliku `middleware.ts` w katalogu głównym i usunięcie ręcznych wrapperów z handlerów API.

---

### Faza 2: Baza Danych i Stabilność (High) 💾
*Czas realizacji: 3-5 dni*
Eliminacja niestandardowego silnika JSON na rzecz standardów przemysłowych.

1.  **Migracja z `storage.ts` na Prisma (SQLite/Postgres)**
    *   **Problem:** `storage.ts` (850+ linii) to niestandardowa, plikowa baza danych podatna na wyścigi (race conditions).
    *   **Rozwiązanie:** Wdrożenie ORM Prisma.
        *   Proponowana baza: **SQLite** (dla zachowania prostoty i kompatybilności z obecnym modelem plikowym - Railway Volume) LUB **PostgreSQL** (zalecane dla Railway).
    *   **Kroki:**
        1.  Instalacja Prisma: `npm install prisma @prisma/client`.
        2.  Definicja schematu (`schema.prisma`) odwzorowującego obecne struktury: `UserGroup`, `LoginCode`, `PendingEmail`, `Settings`.
        3.  Przygotowanie skryptu migracyjnego: Import danych z plików JSON do nowej bazy.
        4.  Przepisanie metod w `src/utils/storage.ts` (lub utworzenie nowego serwisu) aby używały klienta Prisma.

2.  **Ujednolicenie Cache (Redis)**
    *   **Problem:** Dwa systemy cache (`cacheStorage.ts` - pliki, `galleryCache.ts` - Redis).
    *   **Rozwiązanie:** Migracja całej warstwy cache do Redis (Upstash na Railway).
    *   **Zadanie:** Usunięcie `cacheStorage.ts` i przekierowanie odwołań do ujednoliconego klienta Redis.

---

### Faza 3: Refaktoryzacja Frontend (Medium) 🎨
*Czas realizacji: 2-3 dni*
Poprawa czytelności i wydajności panelu administratora.

1.  **Dekompozycja `pages/admin.tsx`**
    *   **Problem:** Plik >1500 linii. "God Object" obsługujący wszystko.
    *   **Rozwiązanie:** Wydzielenie komponentów domenowych do `src/components/admin/`:
        *   `GroupsManager.tsx`
        *   `UserLists.tsx` (Whitelist/Blacklist)
        *   `DashboardStats.tsx`
    *   **Logic Extraction:** Wydzielenie logiki pobierania danych do hooków `useAdminGroups`, `useAdminStats`.

2.  **Optymalizacja Bundle'a**
    *   **Problem:** Importowanie całych bibliotek ikon.
    *   **Rozwiązanie:** Weryfikacja importów FontAwesome pod kątem Tree Shakingu (importowanie tylko używanych ikon).

---

### Faza 4: Sprzątanie (Low) 🧹
*Czas realizacji: 1 dzień*

1.  **Usunięcie Martwego Kodu**
    *   Usunięcie starego `storage.ts` po migracji.
    *   Usunięcie `cacheStorage.ts`.
    *   Przejrzenie folderu `src/utils` i `TODO.md`.

## 🛠️ Szczegóły Techniczne Implementacji

### 1. Walidacja Domen (Poprawka)
```typescript
// pages/api/image-proxy.ts
// ZAMIAST: endsWith(domain)
const isValidDomain = ALLOWED_DOMAINS.some(domain => 
  parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
);
```

### 2. Regex dla Polskich Znaków
```typescript
// src/utils/pathValidation.ts
// ZAMIAST: /^[a-zA-Z0-9\/_\-\.\s]+$/
// UŻYJ: Unicode property escapes (wymaga ES2018+) lub zakresów
const SAFE_PATH_REGEX = /^[\p{L}0-9\/_\-\.\s]+$/u; 
```

### 3. Schemat Prisma (Propozycja)
```prisma
model UserGroup {
  id            String   @id @default(uuid())
  name          String
  clientName    String
  galleryFolder String
  users         String[] // Lub relacja do tabeli User jeśli istnieje
}

model PendingEmail {
  email     String   @id
  timestamp DateTime @default(now())
  ip        String
}
```

## ✅ Kryteria Akceptacji

1.  **Bezpieczeństwo:** Próba użycia proxy dla `evil-conceptfab.com` zwraca 403.
2.  **Internacjonalizacja:** Można wgrać plik o nazwie `zażółć_gęślą_jaźń.jpg` i system go poprawnie obsługuje.
3.  **Wydajność:** Endpointy admina nie ładują i nie parsują megabajtów JSON przy każdym zapytaniu.
4.  **Architektura:** Brak plików `.tmp` i logiki `rename` w kodzie produkcyjnym. Baza danych zarządza spójnością.

## 📝 Notatka dla Dewelopera
Projekt hostowany jest na **Railway**.
- Przy wyborze **Prisma + SQLite**: Należy pamiętać o skonfigurowaniu wolumenu (Volume), aby dane przetrwały restart aplikacji. Plik bazy SQLite musi znajdować się na zamontowanym wolumenie.
- Przy wyborze **Redis**: Wykorzystać zmienne środowiskowe `REDIS_URL` istniejące w projekcie.
