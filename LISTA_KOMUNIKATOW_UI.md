# Lista komunikatów UI dla użytkownika/admina

## 1. System powiadomień globalnych (GlobalNotification)

### Success (✅)
- `Wylogowano pomyślnie` - po pomyślnym wylogowaniu

### Error (❌)
- `Błąd podczas wylogowywania` - tytuł: "Błąd" - gdy wystąpi błąd podczas wylogowywania

### Warning (⚠️)
- (Brak konkretnych przykładów w kodzie, ale funkcja dostępna)

### Info (ℹ️)
- (Brak konkretnych przykładów w kodzie, ale funkcja dostępna)

---

## 2. Strona logowania użytkownika (login.tsx)

### Komunikaty sukcesu (zielone)
- `Wniosek został wysłany do administratora. Sprawdź swoją skrzynkę email po otrzymaniu zatwierdzenia.`
- `Logowanie pomyślne! Przekierowywanie...`

### Komunikaty błędów (czerwone)
- `Wystąpił błąd` - domyślny komunikat błędu z API
- `Błąd połączenia z serwerem`

### Teksty formularzy
- `Wprowadź swój email` - nagłówek formularza
- `Adres email:` - label
- `twoj.email@example.com` - placeholder
- `Wysyłanie...` - stan ładowania przy wysyłaniu
- `Wyślij email` - przycisk
- `Wprowadź kod z emaila` - nagłówek formularza kodu
- `Email:` - wyświetlany email
- `Kod dostępu (6 znaków):` - label
- `ABC123` - placeholder
- `Weryfikacja...` - stan ładowania przy weryfikacji
- `Zaloguj się` - przycisk
- `Zmień adres email` - link powrotu

### Instrukcje
- `Jak to działa:`
  - `1. Wprowadź swój adres email`
  - `2. Administrator otrzyma powiadomienie i zatwierdzi Twój dostęp`
  - `3. Otrzymasz kod na email (ważny 15 minut)`
  - `4. Wprowadź kod aby się zalogować`

---

## 3. Strona logowania administratora (admin-login.tsx)

### Komunikaty sukcesu (zielone)
- `Serwer email niedostępny. Użyj kodu awaryjnego MASTER123` - tryb awaryjny
- `Kod dostępu został wysłany na Twój email administratora.`
- `Logowanie administratora pomyślne! Przekierowywanie...`

### Komunikaty błędów (czerwone)
- `Wystąpił błąd` - domyślny komunikat błędu z API
- `Błąd połączenia z serwerem`

### Komunikaty ostrzegawcze (żółte)
- `⚠️ Tryb awaryjny:` - `Użyj kodu MASTER123`

### Teksty formularzy
- `👑 Panel Administratora` - tytuł
- `Dostęp tylko dla administratora` - podtytuł
- `Autoryzacja administratora` - nagłówek formularza
- `Kliknij aby otrzymać kod dostępu na email administratora.` - instrukcja
- `Wysyłanie...` - stan ładowania
- `Wyślij kod dostępu` - przycisk
- `Wprowadź kod z emaila` - nagłówek formularza kodu
- `Kod dostępu administratora:` - label
- `ABC123` - placeholder
- `Weryfikacja...` - stan ładowania
- `Zaloguj jako admin` - przycisk
- `Wyślij kod ponownie` - link

---

## 4. Panel administratora (admin.tsx)

### Komunikaty alertów
- `Wszystkie pola są wymagane` - przy tworzeniu grupy
- `Błąd: {error.error}` - błędy z API (tworzenie, usuwanie, aktualizacja grupy, przypisywanie użytkownika, usuwanie użytkownika)
- `Błąd tworzenia grupy`
- `Błąd usuwania grupy`
- `Błąd aktualizacji grupy`
- `Błąd przypisywania użytkownika`
- `Błąd usuwania użytkownika z grupy`
- `Error: {error.error}` - błędy z API (zarządzanie emailami)
- `Error processing request`
- `Error removing email`
- `Czy na pewno chcesz usunąć tę grupę?` - potwierdzenie usunięcia grupy
- `Czy na pewno chcesz usunąć {email} z {białej/czarnej} listy?` - potwierdzenie usunięcia z listy

### Komunikaty stanu
- `Sprawdzanie autoryzacji administratora...` - podczas sprawdzania autoryzacji
- `Ładowanie...` - podczas ładowania danych
- `Przetwarzanie...` - podczas przetwarzania akcji
- `Tworzenie...` - podczas tworzenia grupy

### Nagłówki sekcji
- `👑 Panel Administracyjny` - główny tytuł
- `Zalogowany: {email}` - informacja o zalogowanym adminie
- `Wyloguj admina` - przycisk wylogowania
- `Oczekujące wnioski ({liczba})` - nagłówek sekcji
- `Brak oczekujących wniosków` - gdy brak wniosków
- `Biała lista ({liczba})` - nagłówek sekcji
- `Brak emaili na białej liście` - gdy brak emaili
- `Czarna lista ({liczba})` - nagłówek sekcji
- `Brak emaili na czarnej liście` - gdy brak emaili
- `Grupy użytkowników ({liczba})` - nagłówek sekcji
- `Brak grup` - gdy brak grup

### Przyciski akcji
- `Zatwierdź` - zatwierdzenie wniosku
- `Odrzuć` - odrzucenie wniosku
- `Usuń` - usunięcie z listy
- `Utwórz` - utworzenie grupy
- `Zapisz` - zapisanie zmian w grupie
- `Anuluj` - anulowanie edycji
- `Podgląd` - podgląd galerii grupy
- `Edytuj` - edycja grupy
- `Usuń` - usunięcie grupy
- `Odśwież dane` - odświeżenie danych

### Etykiety i pola
- `Nazwa grupy` - placeholder
- `Nazwa klienta` - placeholder
- `Folder galerii (np. klient1/)` - placeholder
- `Klient:` - etykieta
- `Folder:` - etykieta
- `✓ {foldersCount} folderów, {filesCount} plików` - status folderu (istnieje)
- `✗ Folder nie istnieje` - status folderu (nie istnieje)
- `Użytkownicy ({liczba}):` - nagłówek listy użytkowników
- `Brak` - gdy brak użytkowników
- `+ Dodaj użytkownika...` - opcja w select

---

## 5. Menedżer plików (FileManager.tsx)

### Komunikaty alertów
- `Błąd uploadu {file.name}: {result.error}` - błąd uploadu konkretnego pliku
- `Błąd uploadu {file.name}` - ogólny błąd uploadu
- `Czy na pewno chcesz usunąć ten {folder/plik}?\n{path}` - potwierdzenie usunięcia
- `Błąd: {result.error}` - błąd usuwania
- `Błąd usuwania` - ogólny błąd usuwania
- `Czy na pewno chcesz usunąć {liczba} elementów?` - potwierdzenie usunięcia wielu elementów
- `Błąd: {result.error}` - błąd zmiany nazwy
- `Błąd zmiany nazwy` - ogólny błąd zmiany nazwy
- `Błąd: {result.error || JSON.stringify(result)}` - błąd tworzenia folderu
- `Błąd tworzenia folderu` - ogólny błąd tworzenia folderu
- `Błąd przenoszenia {path}: {result.error}` - błąd przenoszenia

### Nagłówki i etykiety
- `📁 Menedżer plików` - nagłówek sekcji
- `Uploading... {uploadProgress}%` - stan uploadu
- `⬆️ Upload` - przycisk uploadu
- `📁 Nowy folder` - przycisk tworzenia folderu
- `🗑️ Usuń ({liczba})` - przycisk usuwania zaznaczonych
- `🔄 Odśwież` - przycisk odświeżenia
- `Przeciągnij pliki na stronę aby uploadować` - instrukcja
- `Nazwa folderu` - placeholder
- `Utwórz` - przycisk utworzenia
- `Anuluj` - przycisk anulowania
- `Root` - nazwa folderu głównego
- `Ładowanie...` - stan ładowania
- `{error}` - komunikat błędu
- `Zaznaczono: {liczba}` - informacja o zaznaczonych elementach
- `Zaznacz wszystko` - opcja zaznaczenia wszystkich
- `⬆️` - ikona folderu nadrzędnego
- `..` - folder nadrzędny
- `Konwertuj →WebP` - przycisk konwersji
- `Zmień nazwę` - przycisk zmiany nazwy
- `Usuń` - przycisk usunięcia
- `Folder jest pusty` - komunikat pustego folderu
- `Przeciągnij pliki tutaj lub kliknij "Upload"` - instrukcja

---

## 6. Konwerter folderów (FolderConverter.tsx)

### Komunikaty i etykiety
- `Usuń oryginalne pliki po konwersji` - checkbox
- `Konwertuj do WebP` - przycisk konwersji
- `Potwierdzenie konwersji` - nagłówek dialogu
- `Czy chcesz skonwertować folder {folderName} do formatu WebP?` - pytanie potwierdzające
- `⚠️ Uwaga:` - `Oryginalne pliki zostaną usunięte po konwersji!` - ostrzeżenie
- `Tak, konwertuj` - przycisk potwierdzenia
- `Anuluj` - przycisk anulowania
- `Konwersja folderu: {folderName}` - nagłówek postępu
- `Skanowanie folderu...` - etap skanowania
- `Konwertowanie...` - etap konwersji
- `Usuwanie oryginałów...` - etap usuwania
- `Zakończono` - etap zakończenia
- `Błąd` - etap błędu
- `{current} / {total} ({percentage}%)` - postęp konwersji
- `Obrazów` - etykieta statystyki
- `Skonwertowane` - etykieta statystyki
- `Błędy` - etykieta statystyki
- `Pozostało` - etykieta statystyki
- `Ostatnio skonwertowane:` - nagłówek listy
- `+{liczba} więcej...` - więcej plików
- `Błędy: {liczba}` - nagłówek błędów
- `Pokaż błędy` - rozwijanie listy błędów
- `🎉 Konwersja zakończona!` - komunikat sukcesu
- `Wszystkie obrazy zostały pomyślnie skonwertowane do formatu WebP` - opis sukcesu
- `Oszczędność miejsca` - etykieta statystyki
- `~60-80%` - wartość oszczędności
- `Skonwertowane` - etykieta statystyki
- `Błędy` - etykieta statystyki (w sekcji zakończenia)
- `❌ Konwersja przerwana` - komunikat błędu
- `Wystąpił problem podczas przetwarzania plików` - opis błędu
- `Conversion failed` - błąd połączenia
- `Connection error: {error}` - szczegóły błędu połączenia

---

## 7. Strona główna (index.tsx)

### Komunikaty stanu
- `Sprawdzanie autoryzacji...` - podczas sprawdzania statusu logowania użytkownika

---

## 8. Galeria (Gallery.tsx)

### Komunikaty stanu
- `Odświeżanie galerii - czyszczenie cache...` - podczas wymuszonego odświeżenia
- `Ładowanie galerii...` - podczas normalnego ładowania
- `Błąd: {error}` - komunikat błędu
- `Timeout - API nie odpowiada` - błąd timeoutu (30 sekund)
- `Błąd połączenia: {error.message}` - błąd połączenia
- `Brak danych w galerii` - gdy brak danych z API
- `Spróbuj ponownie` - przycisk ponownej próby
- `Nie znaleziono obrazów w galerii` - gdy brak obrazów w galerii

### Etykiety przycisków
- `Pobierz plik` - tooltip przycisku pobierania w modalu obrazu

---

## 9. Optymalizacja cache (CacheProgress.tsx)

### Komunikaty nagłówka
- `Optymalizacja galerii` - tytuł modala
- `Aktualizowanie cache obrazów WebP...` - opis procesu

### Komunikaty etapów
- `Pobieranie obrazów...` - etap 'fetching'
- `Konwersja do WebP...` - etap 'converting'
- `Zakończono!` - etap 'complete'
- `Przetwarzanie...` - domyślny tekst dla innych etapów

### Komunikaty postępu
- `{current} / {total}` - licznik postępu (np. "5 / 10")
- `Przetwarzanie: {currentFile}` - aktualnie przetwarzany plik

### Komunikaty błędów
- `Błąd procesu cache` - ogólny błąd procesu cache

---

## 10. Siatka obrazów (ImageGrid.tsx)

### Tooltips i etykiety
- `Pobierz plik` - tooltip przycisku pobierania obrazu

### Zachowania (bez widocznych komunikatów)
- Obrazy z błędem ładowania są automatycznie ukrywane (bez komunikatu dla użytkownika)
- Lazy loading obrazów (atrybut `loading="lazy"`)

---

## 11. Metadane obrazów (ImageMetadata.tsx)

### Formatowanie danych (nie są to komunikaty, ale wyświetlane wartości)
- `{width}×{height}` - rozdzielczość obrazu (np. "1920×1080")
- `{bytes} B` - rozmiar pliku w bajtach (dla plików < 1KB)
- `{KB} KB` - rozmiar pliku w kilobajtach (dla plików < 1MB)
- `{MB} MB` - rozmiar pliku w megabajtach (dla plików >= 1MB)
- `{data}` - data modyfikacji w formacie DD.MM.YYYY (polski format daty)

### Uwagi
- Komponenty nie wyświetlają komunikatów błędów dla użytkownika (tylko logi w konsoli)
- Jeśli brak metadanych, komponent nie renderuje niczego

---

## 12. Komunikaty systemowe (teksty statyczne w UI)

### TopMenuBar
- `CONCEPTFAB Content Browser` - tytuł aplikacji
- `{versionInfo?.message} {versionInfo?.date}` - informacja o wersji
- `Odśwież` - tooltip przycisku odświeżenia
- `Panel admina` - tooltip przycisku panelu admina
- `Galeria` - tooltip przycisku galerii
- `Wyloguj` - tooltip przycisku wylogowania

---

## Podsumowanie kategorii komunikatów

### Typy komunikatów:
1. **Powiadomienia globalne** (GlobalNotification) - success, error, warning, info
2. **Alerty przeglądarki** (alert/confirm) - potwierdzenia i błędy
3. **Komunikaty formularzy** - walidacja, stany ładowania
4. **Komunikaty stanu** - ładowanie, przetwarzanie, sukces, błąd
5. **Instrukcje** - pomoc dla użytkownika
6. **Etykiety i placeholdery** - teksty w formularzach
7. **Nagłówki sekcji** - tytuły sekcji w panelu admina
8. **Statusy** - informacje o stanie (np. status folderu)

### Lokalizacja:
- Wszystkie komunikaty są obecnie w języku polskim
- Niektóre komunikaty błędów z API mogą być w języku angielskim (np. "Error processing request")

### Uwagi:
- Niektóre komunikaty są wyświetlane tylko w konsoli przeglądarki (np. błędy ładowania obrazów w ImageGrid)
- Komunikaty związane z cache są wyświetlane w overlay modal (CacheProgress)
- Komunikaty ładowania galerii są wyświetlane jako główny stan strony
- Wszystkie komunikaty błędów powinny być widoczne dla użytkownika (nie tylko w konsoli)
