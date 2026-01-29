# System Logowania z 6-znakowym Kodem

## Opis systemu

System umożliwia bezpieczne logowanie użytkowników za pomocą 6-znakowego kodu wysyłanego na email po zatwierdzeniu przez administratora.

## Jak działa

1. **Wniosek o dostęp** - Użytkownik wprowadza swój email na stronie `/login`
2. **Powiadomienie administratora** - Administrator otrzymuje email z wnioskiem na adres `michal@conceptfab.com`
3. **Zatwierdzenie/Odrzucenie** - Administrator w panelu `/admin` zatwierdza lub odrzuca wniosek
4. **Wysyłanie kodu** - Po zatwierdzeniu, 6-znakowy kod jest wysyłany na email użytkownika
5. **Logowanie** - Użytkownik ma 15 minut na zalogowanie się kodem

## Endpoints API

### POST `/api/auth/request-code`
Wysyła wniosek o kod dostępu
```json
{
  "email": "user@example.com"
}
```

### POST `/api/auth/verify-code`
Weryfikuje kod i loguje użytkownika
```json
{
  "email": "user@example.com",
  "code": "ABC123"
}
```

### POST `/api/auth/admin/manage-email`
Zatwierdza lub odrzuca wniosek (panel admina)
```json
{
  "email": "user@example.com",
  "action": "approve" // lub "reject"
}
```

### GET `/api/auth/admin/pending-emails`
Pobiera listę oczekujących wniosków, whitelisty i blacklisty

### POST `/api/auth/cleanup`
Czyści wygasłe kody i stare wnioski

## Strony

- `/login` - Strona logowania dla użytkowników
- `/admin` - Panel administracyjny do zarządzania wnioskami

## Konfiguracja SMTP

Skopiuj `.env.example` do `.env` i skonfiguruj:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
NEXT_PUBLIC_BASE_URL=http://localhost:3000
ADMIN_EMAIL=michal@conceptfab.com
```

## Bezpieczeństwo

- Kody wygasają po 15 minutach
- Ograniczenie wysyłania wniosków (5 minut między wnioskami z tego samego emaila)
- Automatyczne czyszczenie wygasłych kodów
- Whitelist/blacklist emaili
- Powiadomienia administratora

## Struktura plików

```
pages/
├── api/
│   └── auth/
│       ├── request-code.ts      # Wniosek o kod
│       ├── verify-code.ts       # Weryfikacja kodu
│       ├── cleanup.ts           # Czyszczenie wygasłych
│       └── admin/
│           ├── manage-email.ts  # Zarządzanie wnioskami
│           └── pending-emails.ts # Lista wniosków
├── login.tsx                    # Strona logowania
└── admin.tsx                    # Panel administracyjny

src/
├── types/
│   └── auth.ts                  # Typy TypeScript
└── utils/
    └── email.ts                 # Funkcje wysyłania emaili
```

## Użycie

1. Uruchom aplikację: `npm run dev`
2. Skonfiguruj SMTP w pliku `.env`
3. Użytkownicy mogą się logować na `/login`
4. Administrator zarządza wnioskami na `/admin`