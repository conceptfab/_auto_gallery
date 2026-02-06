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