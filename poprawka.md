# Raport Optymalizacji i Bezpieczeństwa - Content Browser

**Data:** 2026-02-05
**Wersja:** b 0.31
**Status:** Audit Uzpełniający (po zmianach z 2026-02-04)

---

## 1. Podsumowanie Analizy

| Kategoria | Status | Główne Znaleziska |
| :--- | :--- | :--- |
| **Optymalizacja** | Średni | N+1 w statystykach, render loop w Moodboard, regexy |
| **Martwy Kod** | Niski | Pozostałości po migracji storage, redundantne metody |
| **Over-engineering** | Niski | Hybrydowy system storage (legacy + nowe pliki) |
| **Bezpieczeństwo** | Średni | Brak CSP, fallbacki do hardcoded URLs |

---

## 2. Optymalizacja Wydajności






---

## 3. Martwy Kod i Redundancja



---

## 4. Over-Engineering

### OVER-007: Hybrydowy System Zapisu
- **Plik:** `src/utils/storage.ts`
- **Problem:** System utrzymuje skomplikowaną logikę rozdzielania danych na małe pliki JSON (Etap 1-5).
- **Analiza:** Choć rozdzielenie plików jest dobre dla wydajności, ilość boilerplate'u (osobne load/save dla każdego typu danych) jest duża.
- **Rozwiązanie:** Rozważyć użycie prostej bazy K-V (np. SQLite lokalnie lub Upstash Redis, który jest już w `package.json`) dla danych konfiguracyjnych i sesji, zamiast ręcznego zarządzania dziesiątkami plików JSON.

---

## 5. Bezpieczeństwo



---

## 6. Proponowane Zmiany (Plan Naprawczy)

1. **Stats Storage:** Dodać domyślny `limit` dni do funkcji aggregation (Priority: High).
2. **Moodboard:** Zastosować `useMemo` dla list elementów w `Canvas.tsx` (Priority: Medium).
3. **DecorConverter:** Usunąć redundantną metodę `highlightKeywords` (Priority: Low).
4. **Security:** Dodać CSP do `next.config.js` (Priority: High).
5. **Storage:** Przygotować plan usunięcia kodu migracyjnego z `storage.ts` (Priority: Low).
