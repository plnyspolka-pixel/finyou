## Cel
Panel klienta ma być jednym miejscem, w którym klient:
1. Wypełnia/edytuje ten sam wniosek co na landingu.
2. Widzi podsumowanie warunków i harmonogram spłat.
3. Uzupełnia dane osobowe i firmowe z autouzupełnianiem z rejestrów państwowych (GUS/CEIDG/KRS).
4. Ma stały pasek boczny nawigacji.
5. Może wyciszyć przypomnienia SMS/e-mail.
6. Widzi prosto: co już mamy ✅ i czego jeszcze brakuje ⏳.

## Nowa struktura nawigacji (stały sidebar)
Lewy sidebar (collapsible="icon", zawsze widoczny, na mobile drawer):
- **Pulpit** — status, „następny krok", checklist „mamy / brakuje"
- **Mój wniosek** — embed `LinearLoanApplication` (ten sam z landingu) + podsumowanie + harmonogram
- **Profil** — dane osobowe + firmowe (autouzupełnianie GUS/KRS/CEIDG)
- **Dokumenty** — upload KW, MPZP, zdjęcia
- **Powiadomienia** — wyciszanie SMS/e-mail/przypomnień
- Stopka: wyloguj

`klient.tsx` przerabiam na `SidebarProvider` + `Sidebar` z shadcn (zamiast obecnego `<aside>`), z `SidebarTrigger` w nagłówku — działa na mobile.

## Pulpit (klient.index.tsx) — uproszczony
- Karta „Status wniosku" (badge) + pasek postępu %.
- `NextStepCard` — jedna konkretna rzecz do zrobienia teraz.
- `ProgressChecklist` rozszerzony o trzy widoczne kolumny/sekcje:
  - ✅ **Co już mamy** (zielone) — odhaczone pozycje.
  - ⏳ **Czego brakuje** (bursztynowe) — z CTA „Uzupełnij".
  - Każdy CTA prowadzi do właściwej zakładki sidebar.

## Mój wniosek (klient.wniosek.tsx) — przebudowa
Trzy sekcje pod sobą:
1. **Wniosek** — `<LinearLoanApplication embedded mode="edit" />` (ten sam komponent co na landingu, prefill z bazy, zapis do `loan_applications` klienta).
2. **Podsumowanie warunków** — karta z: kwota, okres, miesięczna rata maks., typ zabezpieczenia, adres nieruchomości, cel pożyczki.
3. **Harmonogram spłat** — `buildDirectorSchedule` z `client-profile-math.ts`. Tabela: nr raty, data, rata, kapitał, odsetki, opłata za ryzyko, pozostały kapitał + wiersz „Balon". Pod tabelą: suma zobowiązania, oprocentowanie roczne. Jeśli brak danych oferty → placeholder „Harmonogram pojawi się po wycenie przez inwestora".

`LinearLoanApplication` już ma prop `embedded` — dodam tryb prefill z istniejącego `loan_applications` rekordu klienta (server fn: `getMyLoanApplication`, `updateMyLoanApplication`).

## Profil (klient.profil.tsx) — rozbudowa
Obecna wersja już ma GUS+KRS — dokładam:
- **Dane osobowe**: imię, nazwisko, PESEL, dokument tożsamości (typ + numer), adres zamieszkania, adres korespondencyjny, telefon, e-mail.
- **Dane firmowe** (jeśli prowadzi działalność): NIP/REGON/KRS + przycisk **„Pobierz z rejestrów"** → GUS-BIR → jeśli spółka, dociągamy KRS; dla JDG dociągamy CEIDG (`ceidgLookup` — sprawdzę czy istnieje, jeśli nie — dodam stub server fn z TODO i obecny GUS jako wystarczający).
- Każde pole pobrane z rejestru ma badge „GUS" / „KRS" / „CEIDG" (kolumna `fieldSources`).
- Przycisk „Odśwież z rejestrów" dla zaktualizowania.

## Powiadomienia — nowa zakładka `klient.powiadomienia.tsx`
Wyciągam istniejący blok z `klient.profil.tsx` (Switche SMS/e-mail — `do_not_disturb_sms`, `do_not_disturb_email`) na osobny ekran z opisami:
- Wycisz przypomnienia SMS o uzupełnieniu wniosku
- Wycisz przypomnienia e-mail
- Wycisz wszystko (master switch)
- Info: „Nadal otrzymasz wiadomości krytyczne (oferta, umowa)".

## Co już mamy w kodzie (wykorzystuję)
- `LinearLoanApplication` z `embedded` — gotowe.
- `buildDirectorSchedule` + `ScheduleData` — gotowe.
- `getMyLoanProgress`, `enrichLoanProgress`, `NextStepCard`, `ProgressChecklist` — gotowe, lekko rozszerzę.
- `gusCompanyLookup`, `krsCompanyLookup` — gotowe.
- Tabele: `loan_applications`, `clients` (z `do_not_disturb_*`), `profiles`.

## Pliki do zmiany / utworzenia
- **edycja** `src/routes/klient.tsx` — sidebar shadcn (SidebarProvider/Sidebar), nowy item „Powiadomienia".
- **edycja** `src/routes/klient.index.tsx` — czytelniejszy układ „mamy / brakuje".
- **edycja** `src/components/client/ProgressChecklist.tsx` — kolory zielony/bursztyn, sekcja „Co już mamy".
- **edycja** `src/routes/klient.wniosek.tsx` — osadzenie `LinearLoanApplication` + podsumowanie + harmonogram (`buildDirectorSchedule`).
- **edycja** `src/components/loan-application-variants.tsx` — dodać prefill z `loan_applications` po id klienta (nowy prop `initialApplicationId`) oraz wariant zapisu do istniejącego rekordu.
- **edycja** `src/routes/klient.profil.tsx` — wyciąć blok powiadomień, dodać badge źródła pól + przycisk „Odśwież z rejestrów".
- **nowy** `src/routes/klient.powiadomienia.tsx` — zakładka wyciszania.
- **nowy** ewentualnie `src/lib/my-loan.functions.ts` — `getMyLoanApplication`, `updateMyLoanApplication` (jeśli brak; sprawdzę istniejący plik przed implementacją).

## Bez zmian w bazie
Nie tworzę nowych tabel — wszystkie potrzebne pola (`do_not_disturb_sms`, `do_not_disturb_email`, dane firmowe, oferta) już są w `clients` / `loan_applications`.

## Akceptacja
- Logowanie jako klient → sidebar stały, 5 zakładek.
- „Mój wniosek" pokazuje ten sam UI co landing, edytowalny, zapis działa.
- Pod wnioskiem widać podsumowanie i harmonogram (gdy oferta gotowa).
- W profilu: NIP → „Pobierz z rejestrów" → pola wypełnione, badge źródła.
- W „Powiadomieniach": wyłączenie SMS faktycznie ustawia flagę w `clients`.
- Pulpit: dwie wyraźne kolumny „Mamy" / „Brakuje".
