chce w tym projkecie poprawic UX doswiadzenie uzytkownika. Od deliaktnych animacji UI po sposób ładowania plików w galerii. Oczekuje od ciebie propozycji.md  
 jak to zrobić. Aplikacja pracuje z plikami 4K więc może warto zrobić jakiś mechanizm weryfikacji czy w folderach galerii coś się zmieniło, jeśli nie to warto  
 by wykorzystać jakiś cache, buffor. Chce by pliki w galerii ładowały się miękko od lewego w górnym rzędzie, do prawego w dolnym rzędzie. Teraz jest to losowo.  
 Ale skoro mozna pobrac wczesniej ilość plików, ułożyć je w odpowiedniej kolejności, pobierać w tle, pobierać na początku te najważniejsze, to potem można to  
 fajnie, miękko wyświetlić w galerii.




chce zbudować kolejną aplikację CB proxy ktora będzie buforowała tworzyła miniaturki dla tej galerii. też będzie hostowana na         railway. Priorytetm jest to by wyswietlane w galerii pliki były zawsze aktualne. Zakladam ze CB proxy powinien co jakis            
  okreslony czas sprawdzać czy na serwerze gdzie sa plik źródłowe są jakieś zmiany i automatycznie przygotowywał aktualna paczkę      
  miniaturek. Napisz czytelny prompt dla modelu który ma zbudować tą aplikacje z uwazględniem API i wszelkich zasad dla czystego,     
   optymalnego i bezpiecznego kodu. Trzeba rozważyć gdzie miniaturki powinna magazynowane, domyślnie to na start niech bedzie         
  railway, ale musi być możliwość modyfikacji konfiguracji - panel admina z wymaganymi opcjami i statystykami. Frontend musi być prosty, wyświetlający status, logi podstawowych operacji i objętość bufforowanych miniaturek. API musi uwzględniać awarię CB proxy - wtedy Content Browser musi pracować w trybie awaryjnym. Ważne jest, że wpliki download zawsze mają być oryginalne.