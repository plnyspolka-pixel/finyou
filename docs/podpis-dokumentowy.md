# Podpis dokumentowy (e-podpis w formie dokumentowej)

Moduł pozwala wysłać dowolny dokument PDF do podpisu — tak jak Autenti — i
zebrać podpisy **w formie dokumentowej** (art. 77² KC) od osób, które nie mają
konta w systemie (klienci) oraz od inwestorów (z konta). Każdy podpisujący
potwierdza tożsamość przez **Didit** (dokument tożsamości + test żywotności +
porównanie twarzy), wpisuje **kod jednorazowy** (SMS/e-mail) i klika
„Podpisuję”. Po ostatnim podpisie system buduje plik końcowy: na **każdej
stronie** znacznik (ID dokumentu, adres weryfikacji, numer strony, kto i kiedy
podpisał), a na końcu **Kartę podpisów** z pełnym śladem audytowym. Plik trafia
e-mailem do wszystkich stron (trwały nośnik), a jego autentyczność można
sprawdzić publicznie pod `/weryfikacja/<kod>`.

Panele nadawcy: `/admin/podpisy`, `/operator/podpisy`, `/inwestor/podpisy`
(w menu inwestora pozycja **„E-podpis”**, zaraz po „Moje oferty”).
Panel klienta pożyczkowego: `/klient/podpisy` (dokumenty do podpisu i podpisane).
Strona podpisującego: `/podpis/<token>` (bez logowania).

## 1. Podstawa prawna i jak moduł ją realizuje

| Wymóg | Źródło | Realizacja w module |
|---|---|---|
| Oświadczenie woli **w postaci dokumentu** — nośnik umożliwiający zapoznanie się z treścią | art. 77³ KC | Dokument to niezmieniany plik PDF (skrót SHA-256 liczony przy wgraniu). Podpisujący widzi go w całości przed podpisem (podgląd + pobranie). Plik końcowy i źródłowy są przechowywane w prywatnym buckecie `podpisy`. |
| Złożenie oświadczenia **w sposób umożliwiający ustalenie osoby** | art. 77² KC | (1) Osobisty link (token 256-bit, w bazie tylko SHA-256) na wskazany e-mail; (2) zdalna weryfikacja tożsamości **Didit** — OCR dokumentu, liveness, porównanie twarzy; nazwisko z dokumentu porównywane z danymi wskazanymi przez nadawcę (niezgodność blokuje podpis do decyzji nadawcy); (3) **kod jednorazowy** na telefon/e-mail (wyłączna kontrola kanału). Snapshot tożsamości (imię, nazwisko, typ i zamaskowany numer dokumentu, data urodzenia, kraj, ID sesji) trafia do Karty podpisów. |
| Podpis elektroniczny — dane dołączone/logicznie powiązane z danymi podpisywanymi | art. 3 pkt 10 eIDAS | Rekord podpisu: czas (UTC), IP, przeglądarka, oświadczenia, tożsamość, reprezentacja i `signature_hash` = SHA-256 nad (koperta, skrót dokumentu, podpisujący, czas, tożsamość, reprezentacja, e-mail). |
| Zakaz dyskryminacji podpisu elektronicznego jako dowodu | art. 25 ust. 1 eIDAS | Informacja prawna w Karcie podpisów, na stronie podpisu i stronie weryfikacji. |
| Integralność / wykrywalność zmian | art. 26 lit. d eIDAS (standard zaawansowanego podpisu — stosowany jako dobra praktyka) | SHA-256 pliku źródłowego (na każdej stronie i w Karcie) oraz SHA-256 pliku podpisanego (na stronie weryfikacji; porównanie lokalne w przeglądarce). Dziennik zdarzeń jest tylko-do-dopisywania (trigger w DB) z łańcuchem SHA-256 (każde zdarzenie wiąże poprzednie); strona weryfikacji pokazuje spójność łańcucha. |
| Trwały nośnik / doręczenie | art. 77² KC w zw. z zasadami konsumenckimi | Podpisany PDF wysyłany każdemu podpisującemu i nadawcy jako załącznik (do 8 MB; powyżej — link). |
| Umocowanie przy podpisie „w imieniu” podmiotu | art. 38, 95–96 KC (reprezentacja, pełnomocnictwo) | Nadawca wskazuje podmiot (klient zewnętrzny) albo inwestor **wybiera przy podpisie**: we własnym imieniu czy w imieniu spółki z profilu (JDG / osoba prawna, dane z GUS/KRS). Dodatkowe oświadczenie o umocowaniu; snapshot podmiotu (nazwa, NIP, KRS, funkcja) w Karcie podpisów. Moduł **nie weryfikuje** samodzielnie umocowania w KRS — to nadal obowiązek stron (jak w Autenti). |
| Zgody nie mogą być domyślnie zaznaczone | art. 7 RODO, § 15 ust. 7 Umowy ramowej | Wszystkie checkboxy startują puste; serwer odrzuca podpis bez kompletu oświadczeń. |

### Do czego forma dokumentowa wystarcza, a do czego nie

Forma dokumentowa jest właściwa m.in. dla: **umowy pożyczki** (art. 720 § 2 KC —
ad probationem powyżej 1000 zł), umów o świadczenie usług / pośrednictwa /
zlecenia (brak formy szczególnej), porozumień, oświadczeń, zgód, aneksów do
umów zawartych w formie dokumentowej (art. 77 § 2 KC), wypowiedzeń tam, gdzie
umowa nie zastrzega formy pisemnej pod rygorem nieważności.

**Nie wystarcza** (ustawa wymaga formy szczególnej pod rygorem nieważności):
poręczenie (art. 876 § 2 KC — pisemna), przeniesienie własności nieruchomości
i ustanowienie hipoteki (akt notarialny / oświadczenie właściciela w formie
aktu), weksel, umowa spółki, umowa o pracę (pisemna ad probationem),
cesja wierzytelności stwierdzonej pismem (art. 511 KC — pisemna ad
probationem), przelew zabezpieczający w niektórych konstrukcjach.
Do tych czynności potrzebny jest **kwalifikowany podpis elektroniczny**
(art. 78¹ KC, równoważny formie pisemnej) albo notariusz. Moduł wprost
informuje o tym w Karcie podpisów (pkt 5).

## 2. Jak działa Autenti i co z tego przejęliśmy

Autenti: nadawca wgrywa PDF, wskazuje odbiorców (e-mail, opcjonalnie SMS),
odbiorca otwiera link bez konta, czyta dokument, klika „Podpisz”; identyfikacja
to adres e-mail + ewentualnie kod SMS, a wyższy poziom pewności dają metody
dodatkowe (mojeID, dokument). Produkt: PDF z paskiem na każdej stronie
(ID dokumentu, „Dokument podpisany elektronicznie”, numer strony) i dołączoną
**Kartą Podpisów** (ID, nazwa pliku, hash, lista podpisujących z czasem, metodą
uwierzytelnienia, IP), całość opieczętowana kwalifikowaną pieczęcią Autenti
z kwalifikowanym znacznikiem czasu; weryfikacja po ID dokumentu. „Historia
dokumentu” to audit trail (utworzony, wysłany, otwarty, podpisany…).

Przejęte wprost: koperta → osobiste linki → podpis bez konta → pasek na każdej
stronie → Karta podpisów → historia dokumentu → strona weryfikacji.
Wzmocnione: zamiast samego e-maila/SMS — **obowiązkowa weryfikacja tożsamości
Didit** przed każdym podpisem (ustalenie osoby wprost z dokumentu tożsamości,
a nie z „posiadania skrzynki”). Znacznik na stronie zawiera też informację jak
w podpisie zaufanym: *kto podpisał, w czyim imieniu, kiedy, jak potwierdzono
tożsamość*.

**Czego nie ma (świadomie):** kwalifikowanej pieczęci elektronicznej i
kwalifikowanego znacznika czasu dostawcy zaufania (TSP). To płatna usługa
(np. Certum, KIR, EuroCert); integralność zapewniamy skrótami SHA-256,
łańcuchem zdarzeń i niezależną publikacją skrótu pliku na stronie
weryfikacji. Dołożenie pieczęci kwalifikowanej (PAdES-B-LT) do pliku
końcowego jest naturalnym następnym krokiem — punkt zaczepienia:
`finalizeEnvelope()` po `stampSignedPdf()`.

## 3. Przebieg

1. **Nadawca** (admin/operator/inwestor) w panelu: tytuł, PDF (≤ 15 MB, bez
   hasła), tryb (równolegle / kolejno), termin (3–90 dni), podpisujący:
   - *osoba spoza systemu* (klient): imię i nazwisko jak w dokumencie
     tożsamości, e-mail, telefon (kod SMS), rola, czy podpisuje w imieniu
     firmy (nazwa, NIP, KRS, funkcja);
   - *inwestor z systemu* (tylko personel): wyszukiwarka po nazwisku /
     firmie / e-mailu / NIP; jeśli w profilu jest spółka — inwestor wybierze
     przy podpisie, czy podpisuje jako osoba, czy w imieniu spółki;
   - *ja*: nadawca sam jako strona (inwestor — z danymi z profilu).
2. **Zaproszenie e-mailem** z osobistym linkiem `/podpis/<token>`; w trybie
   „kolejno” kolejne osoby dostają link po poprzednim podpisie.
3. **Podpisujący**: podgląd/pobranie dokumentu → **Didit** (jeśli inwestor ma
   zatwierdzone KYC z pipeline'u — tożsamość przejmowana automatycznie; w
   innym razie nowa sesja, powrót pod `?didit=return`, wynik z webhooka albo
   odpytania) → porównanie nazwiska (niezgodność: nadawca akceptuje różnicę
   albo poprawia dane) → wybór reprezentacji (inwestor) → oświadczenia →
   kod jednorazowy (SMS, gdy jest telefon i Twilio; inaczej e-mail; 6 cyfr,
   10 minut, 5 prób) → **„Podpisuję”**.
4. **Finalizacja** po ostatnim podpisie: `stampSignedPdf` (znaczniki + Karta
   podpisów), zapis `koperty/<id>/<FY-SIGN-…>-podpisany.pdf`, SHA-256,
   doręczenie e-mailem wszystkim stronom, zdarzenia `zakonczona`,
   `doreczenie`.
5. **Weryfikacja**: `/weryfikacja/<kod>` — status, podpisujący, czasy,
   skróty, spójność łańcucha zdarzeń i lokalne porównanie posiadanego pliku.

Odmowa podpisu zamyka kopertę (status „odrzucona”) i powiadamia nadawcę.
Anulowanie przez nadawcę unieważnia linki. Po terminie koperta wygasa.

## 3a. Dowolna osoba bez konta

Domyślny rodzaj podpisującego to **„Dowolna osoba (bez konta w systemie)”**:
wystarczą imię i nazwisko (jak w dokumencie tożsamości) i e-mail, opcjonalnie
telefon (kod SMS) oraz firma, w imieniu której podpisuje. Osoba nie zakłada
konta — dostaje osobisty link e-mailem, a nadawca może też w szczegółach
koperty użyć **„Kopiuj link do podpisu”** i przekazać link SMS-em albo
komunikatorem (generowany jest nowy token, poprzedni przestaje działać;
zdarzenie `link_skopiowany` trafia do Historii dokumentu). Wymogi
identyfikacji są takie same jak dla wszystkich: Didit + kod jednorazowy.
E-mail pozostaje obowiązkowy, bo na niego doręczamy podpisany plik (trwały
nośnik).

## 3b. Klient pożyczkowy — wysyłka umowy i panel klienta

**Wysyłka do klienta.** W kreatorze koperty podpisujący typu *Klient
pożyczkowy (z systemu)*: wyszukiwarka po nazwisku, firmie, e-mailu, telefonie
albo NIP (personel widzi wszystkich klientów; inwestor — klientów z wniosków,
na które złożył ofertę, oraz z własnych wcześniejszych kopert). Po wybraniu
klienta dane (imię i nazwisko, e-mail, telefon, firma/NIP) wypełniają się
same; nadawca decyduje, czy klient podpisuje we własnym imieniu, czy w
imieniu firmy (prefill z `clients.company_name`/`nip`/`krs`). Przyciski
„Wyślij (umowę) do e-podpisu” na karcie wniosku (`/admin/wnioski/<id>`,
`/inwestor/wniosek/<id>`) otwierają kreator z klientem i wnioskiem
(`?nowa=1&klient=<clients.id>&wniosek=<loan_applications.id>`).

**Źródło dokumentu.** Podpisywany jest zawsze plik PDF: wgrany plik albo
umowa z kreatora/agenta (`generated_documents`; widoczność wg RLS: personel —
wszystkie, inwestor — własne). Gotowy PDF (`pdf_path`) idzie bez zmian; umowa
w DOCX jest zamieniana na PDF tą samą drukarką, co pakiet dokumentów inwestora
(`tekstZDocx` → `pdfZTekstu`): treść bez zmian, układ uproszczony (tabele
spłaszczone do wierszy), w stopce SHA-256 tekstu. Gdy liczy się układ 1:1 —
lepiej wgrać PDF zapisany z Worda. Z karty wniosku domyślnie podpowiadana jest
ostatnia wygenerowana umowa.

**Panel klienta.** `/klient/podpisy` pokazuje dokumenty do podpisu („Otwórz i
podpisz” — nowy osobisty link, bez szukania e-maila), podpisane (pobranie PDF
z Kartą podpisów, link weryfikacji) oraz zamknięte bez podpisu; na pulpicie
`/klient` pojawia się baner, gdy coś czeka. Dopasowanie dokumentów do konta:
po `esign_signers.user_id`, po `client_id` (`clients.user_id` = konto) albo po
adresie e-mail konta — taki wiersz jest przejmowany (`user_id` = konto).
Klient bez konta podpisuje wyłącznie z linku w e-mailu. Klient przechodzi
weryfikację Didit przy każdej kopercie (brak reużycia tożsamości — zgodnie z
założeniem „podpis po weryfikacji Didit”).

Koperta zapamiętuje powiązania: `esign_envelopes.client_id`,
`loan_application_id`, `generated_document_id` (migracja 0027).

## 4. Plik końcowy (co widać na każdej stronie)

- Strony oryginału są **osadzone w całości** (tekst pozostaje zaznaczalny),
  pomniejszone o ok. 7%, żeby zwolnić górny pasek (38 pt) i dolną stopkę —
  znaczniki nie zasłaniają treści.
- **Pasek górny**: znak FY, „Podpisano elektronicznie w Finance You”,
  `ID dokumentu: FY-SIGN-000012 · Weryfikacja: app.financeyou.pl/weryfikacja/KOD
  · SHA-256 oryginału: …`, po prawej „Strona n z N” i „Podpis dokumentowy ·
  art. 77² KC · eIDAS art. 25”.
- **Stopka**: dla każdego podpisującego (do 2; powyżej — zbiorczo z odesłaniem
  do Karty) zielony znacznik ✓ + `Imię Nazwisko — podpisano 05.10.2026 14:22
  CEST · tożsamość: Didit (Dowód osobisty *****4321)`; przy podpisie w imieniu
  spółki: `Spółka (NIP …, KRS …) — reprezentowana przez: Imię Nazwisko,
  funkcja — podpisano …`.
- **Karta podpisów** (A4, dołączana na końcu): Dokument (ID, tytuł, plik,
  SHA-256, nadawca, daty, tryb, adres weryfikacji) → Podpisujący (reprezentacja,
  e-mail, telefon, opis weryfikacji Didit z ID sesji, kanał kodu, czas w CET
  i UTC, IP, przeglądarka, oświadczenia, identyfikator podpisu) → Historia
  dokumentu (tabela) → Informacje prawne i weryfikacja.
- Metadane PDF: tytuł z ID, temat ze skrótem oryginału, język pl-PL.

Podgląd: `src/lib/esign/esign-pdf.test.ts` (test generuje przykładowy plik);
w razie zmian w wyglądzie uruchom test i obejrzyj wynik (`pdftoppm`).

## 5. Dane

Migracje `drizzle/migrations/0026_podpis_dokumentowy.sql` i
`0027_podpis_klient_pozyczkowy.sql` (kopie w `supabase/migrations/`):

- `esign_envelopes` — koperta: `public_id` (`FY-SIGN-000001`, generowane z
  sekwencji), `verify_code` (10 znaków, alfabet bez O/0/I/1), status
  (`szkic` → `wyslana` → `zakonczona` | `odrzucona` | `anulowana` |
  `wygasla`), tryb, nadawca, plik źródłowy (ścieżka, nazwa, SHA-256, rozmiar,
  liczba stron), plik końcowy, terminy, `context` (powiązania: wniosek,
  oferta — luźno).
- `esign_signers` — podpisujący: kolejność, rola, dane, `user_id`/`investor_id`
  (konto), `signer_kind`, `capacity_mode` (`osoba` | `firma` | `wybor`),
  `company`, `signed_capacity`, `token_hash` (SHA-256 tokenu), status
  (`oczekuje` → `otwarty` → `weryfikacja` → `zweryfikowany` | `niezgodnosc`
  → `podpisany` | `odrzucony`), Didit (`didit_session_id`, `didit_status`,
  `identity` snapshot), OTP (hash, kanał, cel zamaskowany, ważność, próby),
  podpis (`signed_at`, IP, UA, `statements`, `signature_hash`).
- `esign_events` — historia: typ, aktor, IP, UA, payload, `prev_hash`,
  `hash`; trigger zabrania UPDATE/DELETE.
- Bucket Storage `podpisy` (prywatny): `koperty/<id>/zrodlo.pdf`,
  `koperty/<id>/<public_id>-podpisany.pdf`.
- Sesje Didit podpisujących: `didit_verifications` z `vendor_data =
  esign:<signer_id>` (webhook `didit-webhook` aktualizuje po `session_id` —
  bez zmian po jego stronie); `user_id` = nadawca koperty.

RLS: odczyt dla nadawcy, podpisującego z kontem i personelu; zapis wyłącznie
`service_role` (server functions). Po wdrożeniu migracji zregeneruj typy
`Database` (tabele są dziś używane przez luźny klient `db()`).

## 6. Kod

| Element | Ścieżka |
|---|---|
| Logika czysta (dopasowanie nazwisk, łańcuch hashy, maskowanie, statusy, oświadczenia) | `src/lib/esign/esign-core.ts` (+ test) |
| Plik końcowy: znaczniki na stronach + Karta podpisów | `src/lib/esign/esign-pdf.ts` (+ test) |
| Warstwa serwerowa: DB, dziennik, pliki, tożsamość z Didit, finalizacja, e-maile | `src/lib/esign/esign.server.ts` |
| Schematy wejścia (zod, bezpieczne dla klienta) | `src/lib/esign/esign-schemas.ts` |
| Server functions nadawcy (cienkie opakowania) + implementacja | `src/lib/esign/esign-owner.functions.ts`, `src/lib/esign/esign-owner.server.ts` |
| Server functions podpisującego (bez logowania, po tokenie) + weryfikacja + implementacja | `src/lib/esign/esign-public.functions.ts`, `src/lib/esign/esign-public.server.ts` |
| Strona podpisującego | `src/components/esign/signing-page.tsx`, `src/routes/podpis.$token.tsx` |
| Strona weryfikacji | `src/components/esign/verification-page.tsx`, `src/routes/weryfikacja.$code.tsx` |
| Panel nadawcy | `src/components/esign/esign-panel.tsx`, `src/routes/{admin,operator,inwestor}.podpisy.tsx` |
| Panel klienta pożyczkowego (+ baner na pulpicie) | `src/components/esign/client-esign-panel.tsx`, `src/routes/klient.podpisy.tsx` |

Konwencja: pliki `*.functions.ts` są importowane przez komponenty, więc nie
mogą statycznie importować kodu serwerowego (Didit używa `node:crypto`,
Storage/Resend — sekretów). Implementacje żyją w `*.server.ts` i są ładowane
w handlerze przez `await import(...)`.

## 7. Konfiguracja

Wykorzystywane są istniejące sekrety: `DIDIT_API_KEY` (lub `DIDIT_API_KEY_NEW`),
`DIDIT_WORKFLOW_ID_KYC` (darmowy workflow „Free KYC”: OCR + LIVENESS +
FACE_MATCH + IP_ANALYSIS), `DIDIT_WEBHOOK_SECRET` (Edge Function),
`RESEND_API_KEY` + `LOVABLE_API_KEY` (e-maile), `TWILIO_API_KEY` + `sms_from`
(kody SMS; bez Twilio kod idzie e-mailem), `APP_URL`/`PUBLIC_BASE_URL`
(adresy w linkach i na pasku; domyślnie `https://app.financeyou.pl`).

Koszt: sesja Didit „Free KYC” mieści się w darmowym limicie 500/mies.
Inwestor z zatwierdzonym KYC z pipeline'u nie generuje nowej sesji.

## 8. Bezpieczeństwo i ograniczenia

- Token linku nigdy nie jest przechowywany jawnie; ponowne zaproszenie
  generuje nowy token (stary przestaje działać). Zalogowany inwestor otwiera
  swój link z panelu bez e-maila (`openMySigningLink`).
- Kod OTP: hash w bazie, 10 minut, 5 prób, limit ponownej wysyłki 45 s.
- Podpis to jedna atomowa zmiana statusu `zweryfikowany → podpisany`
  (brak podwójnych podpisów); finalizacja zabezpieczona blokadą optymistyczną
  `wyslana → zakonczona`.
- Treść dokumentu nie jest dostępna publicznie — strona weryfikacji pokazuje
  wyłącznie fakt podpisania, podpisujących, czasy i skróty.
- Numer dokumentu tożsamości jest maskowany (ostatnie 4 znaki); pełna decyzja
  Didit zostaje w `didit_verifications` (RLS: nadawca/personel).
- Brak kwalifikowanej pieczęci/znacznika czasu (patrz § 2). Czas podpisu
  pochodzi z zegara serwera (UTC) — w Karcie podany w CET/CEST i UTC.
- Weryfikacja umocowania do reprezentacji spółki pozostaje po stronie stron
  (dane z KRS/GUS są podpowiadane, nie certyfikowane).
- Równoległe zapisy do dziennika mogą w skrajnym przypadku rozwidlić łańcuch
  hashy (brak blokady doradczej w DB); weryfikacja łańcucha wykryje taki
  przypadek i oznaczy go na stronie weryfikacji.

## 9. Do zrobienia po wdrożeniu (Ty)

1. Zastosuj migracje `0026_podpis_dokumentowy.sql` i
   `0027_podpis_klient_pozyczkowy.sql` (bucket `podpisy` tworzy się w
   migracji; `uploadEnsuringBucket` dotworzy go w razie braku).
2. Upewnij się, że sekrety Didit/Resend/Twilio są ustawione na produkcji.
3. Wyślij testową kopertę do siebie: sprawdź e-mail, Didit, kod, podpisany
   PDF i stronę weryfikacji.
4. Opcjonalnie: zregeneruj `src/integrations/supabase/types.ts`, żeby zdjąć
   luźne typowanie tabel `esign_*`.
