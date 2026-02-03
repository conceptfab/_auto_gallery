<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# buduje aplikację w next.js. chciałbym zrobić stronę która działa jak moodboard, - uzytkownicy moga wrzucac obrazki drag and drop na canvas - moga je skalować, przesuwac - aplikacja zachowuje ten stan. Dodatkowo można dodawac komentarze - z kolorowym tłem i fontem. Canvas ma miec tło z delikatnym szarym gridem. Przygotuj mi prompt.md dla modelu który to zrealizuje.

Oto kompletny `prompt.md` dla modelu AI, który zrealizuje twoją aplikację moodboard w Next.js:

```markdown
# Prompt: Aplikacja Moodboard w Next.js

## Cel projektu
Stwórz w pełni funkcjonalną aplikację moodboard w Next.js 14+ z App Router, która umożliwia tworzenie interaktywnych tablic nastrojów z obrazkami i komentarzami.

## Wymagania funkcjonalne

### Canvas z gridem
- Stwórz nieskończony canvas z delikatnym szarym gridem w tle (grid o rozmiarze 20-30px)
- Grid powinien być stworzony w CSS za pomocą `background-image` z `linear-gradient`
- Canvas powinien zajmować całą dostępną przestrzeń viewport
- Opcjonalnie: dodaj możliwość panowania/przesuwania całego canvas (pan functionality)

### Obrazki - drag & drop
- Umożliw wrzucanie obrazków przez drag & drop z systemu plików na canvas
- Każdy obrazek powinien być niezależnym elementem z następującymi funkcjami:
  - **Przesuwanie**: drag & drop w obrębie canvas
  - **Skalowanie**: za pomocą uchwytów w rogach lub scroll/pinch gesture
  - **Pozycjonowanie**: swobodne pozycjonowanie w dowolnym miejscu canvas
- Zapisuj pozycję (x, y), rozmiar (width, height) oraz rotation (opcjonalnie) każdego obrazka

### Komentarze/notatki
- Możliwość dodawania komentarzy tekstowych na canvas (np. double-click lub przycisk "Dodaj komentarz")
- Każdy komentarz powinien mieć:
  - **Kolorowe tło**: możliwość wyboru koloru (palette: żółty, różowy, niebieski, zielony, itp.)
  - **Edytowalny tekst**: inline editing po kliknięciu
  - **Font**: wybór z 2-3 fontów lub jeden czytelny sans-serif
  - Takie same możliwości jak obrazki: przesuwanie, skalowanie, pozycjonowanie

### Persystencja stanu
- Zapisuj kompletny stan canvas do localStorage lub bazy danych (np. Vercel Postgres, Supabase)
- Stan powinien zawierać:
  - Wszystkie obrazki: id, url/base64, pozycja x/y, rozmiar width/height, rotation
  - Wszystkie komentarze: id, tekst, kolor tła, font, pozycja, rozmiar
- Automatyczne zapisywanie co X sekund lub po każdej zmianie (debounced)
- Ładowanie stanu przy inicjalizacji aplikacji

## Stack technologiczny

### Podstawowy stack
- **Framework**: Next.js 14+ z App Router
- **Język**: TypeScript
- **Styling**: Tailwind CSS lub CSS Modules

### Biblioteki do implementacji
Użyj jednej z poniższych bibliotek dla funkcjonalności canvas:

**Opcja 1: react-konva** [web:10]
- Biblioteka do canvas rendering w React
- Built-in drag & drop support
- Łatwe skalowanie i transformacje

**Opcja 2: react-dnd lub dnd-kit**
- Lżejsze rozwiązanie dla drag & drop
- Wymaga własnej implementacji canvas positioning

**Opcja 3: Fabric.js lub Konva.js (vanilla)**
- Pełnowymiarowe canvas libraries
- Wrapper w React components

### Zarządzanie stanem
- **Zustand** lub **React Context** do globalnego stanu canvas
- Stan powinien zawierać array obiektów (images i comments)

### Upload obrazków
- Obsługa `<input type="file">` z drag & drop zone
- Konwersja do base64 lub upload do storage (Vercel Blob, Cloudinary)

## Struktura projektu

```

/app
/page.tsx           \# Główna strona z canvas
/api
/moodboard
/route.ts       \# API endpoint do zapisywania stanu (opcjonalnie)
/components
/Canvas.tsx         \# Główny komponent canvas z gridem
/ImageItem.tsx      \# Komponent pojedynczego obrazka
/CommentItem.tsx    \# Komponent komentarza
/Toolbar.tsx        \# Toolbar z przyciskami (dodaj komentarz, export, itp.)
/lib
/store.ts           \# Zustand store lub context
/types.ts           \# TypeScript types
/styles
/globals.css        \# Grid background i globalne style

```

## Wymagania UI/UX

### Grid background (CSS)
```css
.canvas {
  background-color: #fafafa;
  background-image: 
    linear-gradient(rgba(150, 150, 150, 0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(150, 150, 150, 0.15) 1px, transparent 1px);
  background-size: 20px 20px;
}
```


### Interakcje

- Hover state na obrazkach/komentarzach (pokazuj border lub shadow)
- Selection state (wybór aktywnego elementu)
- Resize handles w rogach wybranego elementu
- Delete button (X) w rogu elementu po najechaniu


### Responsywność

- Aplikacja powinna działać na desktop (mobile opcjonalnie)
- Touch events dla urządzeń dotykowych (opcjonalnie)


## Dodatkowe funkcjonalności (opcjonalne)

- Export canvas do PNG/JPG (html2canvas lub canvas.toBlob)
- Undo/Redo functionality
- Warstwy (layers) z możliwością zmiany z-index
- Grupowanie elementów
- Sharing/collaboration (real-time przez WebSocket)


## Kryteria akceptacji

1. ✅ Canvas z delikatnym szarym gridem
2. ✅ Drag \& drop obrazków z systemu plików
3. ✅ Przesuwanie i skalowanie obrazków
4. ✅ Dodawanie komentarzy z kolorowym tłem
5. ✅ Persystencja stanu (localStorage minimum)
6. ✅ TypeScript + Next.js App Router
7. ✅ Responsywny UI z Tailwind CSS

## Wytyczne implementacyjne

- Użyj server components gdzie to możliwe, client components dla interaktywności
- Optymalizuj obrazki (Next.js Image component jeśli możliwe)
- Debounce zapisywanie stanu (max 1 zapis na 2-3 sekundy)
- Waliduj rozmiar uploadowanych plików (max 5-10MB)
- Obsłuż edge cases: brak obrazków, pusty canvas, błędy uploadów


## Przykładowy flow użytkownika

1. Użytkownik otwiera aplikację → widzi pusty canvas z gridem
2. Przeciąga obrazki na canvas → obrazki pojawiają się w miejscu drop
3. Klika i przeciąga obrazek → zmienia pozycję
4. Klika uchwyty w rogach → skaluje obrazek
5. Klika "Dodaj komentarz" → pojawia się komentarz z edytowalnym tekstem
6. Wybiera kolor tła komentarza z palety
7. Zapisuje zmiany → stan persystuje automatycznie
8. Odświeża stronę → wszystko wraca w tym samym miejscu

---

Zbuduj tę aplikację krok po kroku, zaczynając od podstawowego canvas z gridem, następnie dodając drag \& drop, a na końcu persystencję.

```

Ten prompt zawiera wszystkie kluczowe wymagania dla twojej aplikacji moodboard, bazując na najlepszych praktykach z Next.js  oraz sprawdzonych rozwiązaniach dla drag & drop w React. Grid CSS jest zaimplementowany zgodnie z prostymi technikami linear-gradient.[^1][^2][^3][^4]
<span style="display:none">[^10][^5][^6][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: https://studiokalmus.com/jak-zaczac-z-next-js-w-2025-kompletny-poradnik-krok-po-kroku
[^2]: https://github.com/imarjunshrma/DragnDropNextApp
[^3]: https://www.stefanjudis.com/blog/a-css-based-background-grid-generator/
[^4]: https://konvajs.org/docs/react/Drag_And_Drop.html
[^5]: https://www.reddit.com/r/nextjs/comments/nnjyr0/next_js_and_responsive_how_to_do_it/
[^6]: https://www.youtube.com/watch?v=Xgiv8IPITw0
[^7]: https://bulldogjob.pl/readme/twoja-pierwsza-aplikacja-w-next-js
[^8]: https://www.asttero.com/blog/post/optymalizacje-next-js-jak-przyspieszyc-swoja-strone
[^9]: https://www.canva.com/create/mood-boards/
[^10]: https://www.youtube.com/watch?v=mjXcFRZzB0g```

