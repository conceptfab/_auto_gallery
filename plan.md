# Plan poprawy UI/UX – Content Browser

## 1. Nawigacja Content – Design – Moodboard (skoki UI)

**Problem:** Przełączanie między zakładkami to pełna nawigacja między stronami (`/`, `/design`, `/moodboard`). Cała treść pod paskiem się wymienia → skoki layoutu, różna wysokość, wrażenie „przeładowania”.

**Kierunki rozwiązania (do wyboru / łączenia):**

- **1a. Wspólny szkielet treści**  
  Jedna stała struktura `<main>` pod TopMenuBar (np. `.app-main`), wewnątrz tylko zamiana panelu (Content / Design / Moodboard). Ten sam kontener = brak skoku obrysu.

- **1b. Zakładki w jednej stronie (SPA-style)**  
  Jedna strona z lokalnym stanem `activeTab: 'content' | 'design' | 'moodboard'` i warunkowym renderem. Nawigacja w menu tylko zmienia stan, bez `router.push` na inne trasy. Opcjonalnie: zachowanie URL-i (`/`, `/design`, `/moodboard`) przez `router.replace` / query przy zmianie zakładki.

- **1c. Łagodzenie przy obecnej architekturze**  
  Jeśli zostają osobne strony: wspólna klasa `main` (np. `.app-main`), stała minimalna wysokość obszaru treści i/lub krótka animacja (fade) przy przejściu, żeby skok był mniej widoczny.

**Priorytet:** wysoki (bezpośrednio z TODO).

---



## 3. Spójność wizualna i layout

- **Wspólny layout stron**  
  Content, Design, Moodboard: ten sam typ kontenera (np. `.app-main`), spójne paddingi i max-width, żeby przejścia między sekcjami nie zmieniały „szerokości” strony.

- **Spójne nagłówki**  
  Decyzja: albo wszędzie krótki nagłówek sekcji (np. „Content” / „Design” / „Moodboard”) w jednym stylu, albo brak nagłówka we wszystkich (jak teraz na Content). Obecnie Design ma `<h1>Design</h1>`, Content nie – to wzmacnia wrażenie skoku.

- **Stany ładowania**  
  Jednolity wzorzec: np. skeleton lub ten sam komponent `LoadingOverlay` z tą samą wysokością/min-height, żeby przy sprawdzaniu auth lub ładowaniu danych ekran się nie „zapadał”.

---

## 4. Dostępność i czytelność

- **Kontrast i rozmiary**  
  Sprawdzenie WCAG (tekst, przyciski, linki) i ewentualne poprawki kolorów/czcionek.

- **Focus i klawiatura**  
  Nawigacja Tab po TopMenuBar i po głównej treści bez „znikających” elementów; widoczny focus (outline) na przyciskach Content/Design/Moodboard.

- **Komunikaty błędów i sukcesu**  
  Spójne miejsce (np. pod paskiem lub jako toast) i forma (np. `GlobalNotification`) dla błędów moodboarda, auth, API.

---

## 5. Mobile / responsywność

- **TopMenuBar na małych ekranach**  
  Czy przyciski Content / Design / Moodboard są zawsze czytelne i klikalne (rozmiar, odstępy); ewentualnie hamburger lub zwinięcie do ikon z tooltipami.

- **Moodboard na touch**  
  Przeciąganie obrazków i komentarzy, powiększanie – wygodne na dotyk; unikanie konfliktów dwukliku z zoomem/gestami.

- **Stały pasek vs przewijanie**  
  Decyzja, czy TopMenuBar ma być sticky; jeśli tak – zapewnienie, że nie zasłania treści (np. padding-top głównego obszaru).

---

## 6. Drobne poprawki (quick wins)

- **TODO.md:** literówki: „Contetn” → „Content”, „przełaczanie” → „przełączanie”.
- **Tooltipy** przy ikonach w TopMenuBar (Content, Design, Moodboard) – już są `title`, można ujednolicić z resztą aplikacji.
- **Breadcrumbs / kontekst** na Design (lista → projekt → rewizja) – użytkownik wie, „gdzie jest”.

---

## Kolejność realizacji (propozycja)

1. **Faza 1 – skoki UI (nawigacja)**  
   Wdrożenie 1a lub 1b (wspólny szkielet lub zakładki w jednej stronie) + ewentualnie 1c (min-height / animacja), żeby przełączanie Content – Design – Moodboard nie skakało.

2. **Faza 2 – Moodboard (komentarze)**  
   Rozstrzygnięcie 2a/2b/2c i implementacja (np. przycisk „+ Komentarz” + opcjonalnie tooltip przy dwukliku).

3. **Faza 3 – spójność**  
   Wspólny layout (pkt 3), spójne nagłówki i stany ładowania.

4. **Faza 4 – dostępność i mobile**  
   Punkty 4 i 5 (audyt i poprawki).

5. **Faza 5 – quick wins**  
   Literówki w TODO, breadcrumbs, tooltipy (pkt 6).

---

_Dokument można uzupełniać o konkretne taski (np. w formie checklist) po wyborze wariantów z sekcji 1 i 2._
