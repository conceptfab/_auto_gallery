### Przeanalizuj dokładnie kod pod kątem optymalizacji, martwego kodu, over-engineeringu, bezpieczeństwa. Przygotuj szczegółowy raport poprawki.md

sprawdz cały kod pod kątem:
- czy wszystkie pliki graficzne (moodboard, projekty/rewizje) są zapisywane na /data-storege, inne rozwiązanie nie jest dopuszczalne
- skrypty które usuwaja niepotrzebne/osierocone grafiki nie działają dobrze, mam wrażenie ze usuwaja zadużo. trzeba dodac weryfikacje -> lista projektów/lista rewizji/miniaturki i galerie => trzeba dodać szczegółową weryfikację czy plik faktycznie nie jest potrzebny!
- linki widoczne w pasku adresu muszą byc czytelne
- sprawdz poprawność i logikę poszczegolnych rozwiązań
- zastanów się nad optymalziacją
- poszukaj martwego kodu
- zbadaj kod pod kątem over-engineeringu
- zrób audyt bezpieczeństwa, pliki php nie są widoczne w repozytorium, plik .env jest lokalny-do testów
- zweryfikuj proces autryzacji, ma być skuteczny, ale niewidoczny dla użytkownika
 Przygotuj szczegółowy raport poprawki.md



  Propozycje nazw

  Kierunek 1: Prezentacja + portal kliencki

  - DesignPortal - jasne, opisowe, profesjonalne
  - StudioShare - dzielenie się pracą studia
  - DesignShowroom - showroom na projekty

  Kierunek 2: Krótkie, brandowalne

  - Folio - od "portfolio", krótkie, eleganckie
  - Prezent - gra słów: PL "prezent" (gift) + EN "present" (prezentować)
  - Vitrine - witryna/gablota, kojarzy się z eksponowaniem

  Kierunek 3: Nawiązanie do ConceptFab

  - ConceptView - oglądanie konceptów, spójne z marką

  
  - FabView / FabPortal - bezpośrednie nawiązanie

  Kierunek 4: Funkcjonalne, opisowe

  - DesignDeck - jak talia kart/prezentacja z projektami
  - ClientCanvas - przestrzeń klienta (nawiązanie do moodboardu)
  - DesignStage - scena, na której prezentujesz pracę

  ---
  Moja rekomendacja

  DesignDeck albo Folio - bo:
  - DesignDeck: oddaje ideę prezentacji (deck), zawiera "design", jest krótkie i łatwe do zapamiętania. Pasuje do tego, że klient
  "przegląda talię" projektów, rewizji, moodboardów.
  - Folio: minimalistyczne, eleganckie, kojarzy się z portfolio i profesjonalną prezentacją prac. Jedno słowo, łatwe w każdym języku.     

  Jeśli zależy Ci na spójności z marką ConceptFab - ConceptView jest naturalnym wyborem.

  Co najbardziej rezonuje z Twoją wizją produktu?