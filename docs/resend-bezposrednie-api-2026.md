# Bezpośrednie API Resend Receiving dla Finance You

## Cel

Czytać i synchronizować prawdziwą skrzynkę kontakt@financeyou.pl i odpowiedzi na adresy oferta+<uuid>@financeyou.pl **bez Lovable Connector Gateway**. Usługa jest tylko do odbierania: nie wysyła ani nie inicjuje wiadomości, nie tworzy leadów i nie uruchamia botów.

Resend oficjalnie udostępnia:
- GET https://api.resend.com/emails/receiving — lista odebranych e-maili z paginacją;
- GET https://api.resend.com/emails/receiving/{id}?html_format=cid — pełna wiadomość i nagłówki;
- osobne API załączników, które w tej pierwszej wersji pozostają dostępne w Resend (zapisujemy tylko ich metadane, nie kopiujemy plików).

Źródła: https://resend.com/docs/api-reference/emails/list-received-emails oraz https://resend.com/docs/api-reference/emails/retrieve-received-email

## Sekret

W środowisku serwera aplikacji ustaw **RESEND_READ_API_KEY** z możliwością odczytu odebranych e-maili. Kod ma awaryjny fallback do istniejącego RESEND_API_KEY, ale jeśli ten klucz ma zakres wyłącznie wysyłania, API odpowie o braku uprawnień. Klucza NIE należy umieszczać w frontendzie, repozytorium, query stringu ani czacie.

Nie potrzeba LOVABLE_API_KEY. Wykorzystywany jest bezpośrednio oficjalny Resend API; klucz uwierzytelniający użytkownika panelu pozostaje w nagłówku Authorization.

## Endpointy HTTP (tylko administrator/operator)

Base URL: https://app.financeyou.pl/api/admin/resend-inbox

Wymagany nagłówek: Authorization: Bearer <token dostępu Supabase zalogowanego pracownika Finance You>. Autoryzacja wymaga poprawnego tokenu użytkownika i wewnętrznej roli personelu. Publiczny klucz anon i CRON_SECRET **nie** dają dostępu.

1. **Lista**: GET ?mode=list&limit=30&after=<id>, wynik: data, has_more. Poza pierwszą stroną użyj id ostatniej pozycji jako after.
2. **Pobierz treść**: GET ?mode=read&id=<uuid>; wynik: email (nadawca, odbiorca, temat, data, tekst, HTML, nagłówki, metadane załączników).
3. **Synchronizacja**: POST z JSON:

    {
      "pageSize": 20,
      "maxPages": 1,
      "senderFilter": "funduszkorona.pl",
      "after": null
    }

   Wynik: scanned, matchedFilter, imported, enriched, skipped, offerLinked, errors, relevant, nextAfter, hasMore. Kontynuuj z after=nextAfter, dopóki hasMore=true. Filtr nadawcy jest opcjonalny (pominięty oznacza wszystkie maile Finance You). Dry-run: "dryRun":true.

Żaden endpoint nie akceptuje anonimowej autoryzacji ani nie obsługuje POST wysyłającego e-mail.

## Panel

W /admin/skrzynka są dwa przyciski: **Resend: Korona** i **Resend: wszystkie**. Po każdym przebiegu pojawia się raport oraz przycisk **Pobierz kolejną stronę**. Na górze wyświetlane są też fragmenty wiadomości zawierających wzmianki o Koronie, Mango, partnerze lub przekierowaniu. Reszta trafi do zwykłej listy odebranych.

Dla Korony zacznij od filtra funduszkorona.pl i kontynuuj strony aż do końca archiwum. Szukamy dowolnej nazwy wskazanego partnera, nie tylko „Mango”.

## Zasady importu

- Tylko adresy domeny financeyou.pl i jej subdomen, także aliasy oferta+uuid.
- Import respektuje oryginalne created_at, RFC Message-ID, nagłówki wątku i pełne dostępne body.
- Istniejące wiadomości z metadata.email_id lub znanym RFC Message-ID nie są ponownie dodawane; brakujące/ucięte treści są uzupełniane.
- Odpowiedzi na znany alias oferta+uuid są również dopisywane do offer_distribution_messages, o ile nie ma ich tam według Message-ID.
- Import jest pasywny: **bez nowych leadów, bez maili wychodzących, bez agenta AI, bez powiadomień operatora**.
- Załączniki zapisują się wyłącznie jako lista metadanych w metadata.received_attachments. Oryginalne załączniki pozostają w Resend; przyszła opcja to ich osobny import do prywatnego bucketu.
- Istniejąca baza zawiera historyczne duplikaty email_id — nie wykonujemy destrukcyjnego dedupe. Kolejne uruchomienia importu pomijają już zapisane wiadomości. Synchronizację uruchamia pojedyncza osoba i nie należy startować jej równolegle z kilku przeglądarek.
- Resend może udostępniać ograniczony historyczny zakres przechowywania wiadomości. Nie gwarantujemy odtworzenia e-maili, których Resend już nie przechowuje.

## Aktywacja

1. Dodać/zweryfikować RESEND_READ_API_KEY z prawami odczytu.
2. Uruchomić testy i typecheck aplikacji na PR.
3. Zmergować PR i opublikować aplikację; nowa trasa wymaga przebudowania routeTree przez TanStack.
4. Otworzyć /admin/skrzynka i rozpocząć od Resend: Korona, potem Resend: wszystkie.
5. Odczytać wyniki i zidentyfikować instytucję przekazaną przez Koronę.
6. Nie modyfikować automatycznej dystrybucji ani parametrów inwestorów na podstawie samego importu.

**Stan w momencie utworzenia PR:** kod został dodany na gałęzi, ale bez dostępu do serwerowego klucza nie wykonano żadnego zapytania do prywatnej poczty Resend ani importu produkcyjnego.
