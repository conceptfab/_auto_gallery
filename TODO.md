chce w tym projkecie poprawic UX doswiadzenie uzytkownika. Od deliaktnych animacji UI po sposób ładowania plików w galerii. Oczekuje od ciebie propozycji.md  
 jak to zrobić. Aplikacja pracuje z plikami 4K więc może warto zrobić jakiś mechanizm weryfikacji czy w folderach galerii coś się zmieniło, jeśli nie to warto  
 by wykorzystać jakiś cache, buffor. Chce by pliki w galerii ładowały się miękko od lewego w górnym rzędzie, do prawego w dolnym rzędzie. Teraz jest to losowo.  
 Ale skoro mozna pobrac wczesniej ilość plików, ułożyć je w odpowiedniej kolejności, pobierać w tle, pobierać na początku te najważniejsze, to potem można to  
 fajnie, miękko wyświetlić w galerii.




Chce wprowadzić następująca funkcje do serwisu - co jakiś ustalony w panelu admina specjalny proces będzie sprawdzał za pomocą xxHash dla kazdego serwera czy zaszły zmiany w plikach/folderach -porównywał aktualny hash z historią to jest jedna funkcja. Druga to system cache/buforowania dla miniaturek. Inny proces przygotuje zestaw - wymaganych wielkosci miniaturek na dla serwisu. Serwis ma sprawdzac przy starcie czy jest zestaw miaturek i wczytywać z niego wszystkie wymagane pliki w odpowiedniej zooptymalizowanej wielkosc (będzie potrzebnych ich pewnie kilka), jesli z jakis powodów nie bedzie cache dostepny to wczyta oryginały. miejsce magazynowania ma być do wyboru, np: aktualny serwer hostujacy oryginały w dedykowanym folderze, albo dysk railway. W panelu admina musi byc specjalna zakładka umożliwiająca kontrolę całego procesu, jego monitorowanie, ustawianie częstotliwości sprawdzania zmian np w godzianch 9-17 co pół godziny, a 17-9 tylko raz albo wcale. Przeanalizuj kod i przygotuj dokument wdrozenie.md z precyzyjną instrukcją jak wprowadzić te zmiany. Jeśli masz jakieś sugestię to wal śmiało