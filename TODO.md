- statystyka - ile miniaturek na plik jest generowane i jakie
- ikona refresh do usunięcia
- poprawka ikony cache - kolor czarny, normala widoczność gdy cache działa, szara-ledwie widoczna gdy cache nie działa, ikona ma i jej stany maja być widoczne dla wszystkich uzytkowników
- mail kontrolny do admina jeśli przevudowa się udała lub nie udała - prosty panel kontrolny dla maili w admin panel
- na drzewie folderów jesli system zauwazy zmianę musi być zaznaczone który folder został ostatnio przebudowany i powinien byc przycsik do recznego przebudowania
- czyszczenie historii przebudowy reczne i automatyczne np zostawia zmiany z ostatnich 24h reszte usuwa
- poprawki, optymalizacje - sprawdzenie czy kod za weryfikacje zmian działa - okno porównywania hashy dla każdego folderu - czy aktualny = się historyczny. zachowywany jest tylko ostatni hash


# TODO - Content Browser

## WDROŻONE (2024-01-31)

### System Hash Detection + Cache Miniaturek

**Status: GOTOWE DO TESTOWANIA**

#### Co zostało utworzone:

**Typy i konfiguracja:**
- `src/types/cache.ts` - typy dla cache, schedulera, hashów
- `src/utils/cacheStorage.ts` - storage dla konfiguracji cache
- `data/cache-config.json` - domyślna konfiguracja

**Serwisy:**
- `src/services/hashService.ts` - xxHash do wykrywania zmian plików
- `src/services/thumbnailService.ts` - generowanie miniaturek (Sharp)
- `src/services/schedulerService.ts` - automatyczny scheduler

**API Endpoints:**
- `GET /api/admin/cache/status` - status cache, schedulera, miniaturek
- `GET/POST /api/admin/cache/config` - konfiguracja schedulera i miniaturek
- `POST /api/admin/cache/trigger` - ręczne uruchomienie skanu/regeneracji
- `GET /api/admin/cache/history` - historia operacji
- `GET /api/thumbnails/[...path]` - serwowanie miniaturek

**UI Panel Admina:**
- `src/components/admin/CacheMonitorSection.tsx` - pełny panel kontrolny
- Nowa sekcja "Cache i Miniaturki" w panelu admina

**Zmodyfikowane pliki:**
- `pages/admin.tsx` - dodana sekcja cache
- `src/utils/imageUtils.ts` - obsługa cache miniaturek
- `src/components/Gallery.tsx` - inicjalizacja cache

#### Funkcje w panelu admina:
1. **Status** - podgląd schedulera, plików, miniaturek
2. **Konfiguracja** - harmonogram 9-17/poza godzinami, format miniaturek, storage
3. **Historia** - logi operacji z timestampami
4. **Zmiany plików** - wykryte zmiany (dodane/zmodyfikowane/usunięte)

#### Akcje:
- Skanuj zmiany (ręcznie)
- Regeneruj miniaturki
- Wyczyść cache

---

## DO ZROBIENIA

### Konfiguracja produkcyjna
- [ ] Dodać zmienne środowiskowe dla cron (CRON_SECRET)
- [ ] Skonfigurować Railway cron lub zewnętrzny cron service
- [ ] Przetestować na produkcji

### UX/Animacje (z pierwotnego TODO)
- [ ] Animacje UI (miękkie ładowanie)
- [ ] Sekwencyjne ładowanie obrazów (lewy-górny do prawy-dolny)
- [ ] Progressive loading dla galerii

### Inne
- [ ] Naprawić konfigurację ESLint (migracja do v9)
