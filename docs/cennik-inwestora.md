# Cennik inwestora i jeden pipeline onboardingu

Wdrożenie z 21 września 2026 r. Zastępuje dotychczasowy cennik inwestora
(999 zł / 30 dni i 5 999 zł / 365 dni — produkty `investor_access_30d`
i `investor_access_365d` zostały dezaktywowane, rekordy zostają dla
historycznych płatności i faktur).

## Pakiety

| Pakiet | Opłata stała | Opłata zmienna | Kod produktu |
| --- | --- | --- | --- |
| Podstawowy | 0 zł | 1 500 zł brutto za odblokowanie jednej okazji | `investor_okazja_unlock` (`kind = 'unlock'`) |
| PRO | 3 000 zł brutto / 180 dni | 5% kwoty udzielonej pożyczki | `investor_pro_180d` (`tier = 'pro'`, `success_fee_bps = 500`) |

Zakres pakietów jest opisany w jednym miejscu — `src/lib/investor-plan/plans.ts`
(`TIER_FEATURES`, `TIER_PRESENTATION`). Panel, strona `/dla-inwestora`
i bramki serwerowe czytają stamtąd, a ceny zawsze z katalogu `access_products`.

**Podstawowy** — pełny pipeline, składanie Zleceń, a po znalezieniu projektu
zakup okazji na wyłączność: zdecydowany klient, raport o inwestycji,
harmonogram zaakceptowany przez pożyczkobiorcę, dane kontaktowe, plus
generator umowy pożyczki.

**PRO** — to samo bez opłat jednostkowych, dodatkowo Akademia inwestora,
kalkulator compliance, moduł AML, moduł windykacji AI, nielimitowana liczba
pełnych raportów oraz pierwszeństwo wyboru ofert.

## Egzekwowanie (trzy warstwy)

1. **Routing** — `src/routes/inwestor.tsx`: `basicGroups` / `proGroups`
   i lista `BASIC_PATHS`. Moduły PRO (Akademia, kalkulator compliance, AML,
   windykacja) nie mają wejścia w nawigacji Podstawowego i przekierowują
   na `/inwestor/abonament`.
2. **Server functions** — middleware `requireInvestorPro`
   (`src/lib/investor-plan/pro-middleware.ts`) wpięte we wszystkie funkcje
   modułów AML i windykacji zamiast `requireSupabaseAuth`. Personel wewnętrzny
   przechodzi, bo SQL `investor_tier` zwraca dla niego `pro`.
3. **SQL** — `investor_tier(_user_id)`, `investor_can_open_match(_user_id,
   _match_id)` oraz istniejące polityki RLS oparte o `investor_has_full_access`
   (Akademia, `training-videos`).

## Zakup okazji (Podstawowy)

Produkt `kind = 'unlock'` nie ma `duration_days` i nie przedłuża
`access_entitlements`. Przepływ:

1. `createAccessCheckout` z `matchId` — serwer sprawdza, że Dopasowanie należy
   do Zlecenia kupującego, że nie jest zamknięte i że nie zostało już
   odblokowane; zapisuje `access_payments.unlock_match_id`.
2. Webhook Tpay → `process_access_payment_paid` wykrywa `kind = 'unlock'`
   i wstawia wiersz do `investor_opportunity_unlocks` (unikalny po `match_id`),
   zamiast przedłużać dostęp.
3. `requestDisclosure` (Ujawnienie Identyfikujące) sprawdza
   `investor_can_open_match` i bez odblokowania zwraca błąd `UNLOCK_REQUIRED`.
   W PRO warunek jest spełniony z automatu.

Faktura, e-mail potwierdzenia i zdarzenie afiliacyjne działają jak dla
pozostałych płatności; treść potwierdzenia rozróżnia zakup okazji od dostępu
czasowego.

## Opłata sukcesu PRO (5%)

Naliczana przy potwierdzeniu Załącznika nr 6 (`confirmZal6`), na podstawie
kwoty wypłaty: `registerSuccessFee` w `src/lib/investor-plan/plan.functions.ts`
→ tabela `investor_success_fees` (unikalna po `match_id`).

> **Bramka prawna.** Rekord powstaje ze statusem `wstrzymana`, dopóki aktywna
> wersja Umowy ramowej nie ma `legal_documents.allows_investor_fees = true`.
> Wersja v5 tego **nie** dopuszcza — § 7 stanowi wprost, że usługa jest dla
> Inwestora nieodpłatna, a § 4 zakazuje ustanawiania prowizji transakcyjnej
> należnej od Inwestora. `setSuccessFeeStatus` odmawia przejścia na
> `naliczona`/`zafakturowana`/`oplacona`, dopóki aktywna umowa na to nie
> pozwala. Rejestr i bramka są widoczne w `/admin/umowy-inwestorow`.

## Umowa ramowa v6

Migracja `20260921130000_umowa_ramowa_v6_oplaty_inwestora.sql` wprowadza wersję
v6 tego samego dokumentu (`code = 'umowa_ramowa'`) z modelem odpłatności:

- nowe definicje w § 1: Pakiet, Cennik, Pakiet Podstawowy, Pakiet PRO, Opłata
  za Udostępnienie Okazji, Opłata Abonamentowa, Kwota Udzielona, Opłata
  Sukcesu,
- § 2 i § 5: usługa odpłatna według Pakietu; Ujawnienie w Podstawowym po
  zapłacie Opłaty za Udostępnienie Okazji,
- § 7 („Opłaty Inwestora i zabezpieczenie Prowizji Klientowskiej"): wysokość,
  wymagalność i sposób obliczenia każdej Opłaty; Opłata Sukcesu 5% Kwoty
  Udzielonej wymagalna w 7 dni od zawarcia umowy Finansowania,
- § 15: zasady zwrotu przy odstąpieniu Konsumenta (Opłata za Okazję — zwrot
  w całości przed Ujawnieniem, Abonament — proporcjonalnie, Opłata Sukcesu —
  nienależna bez zawartej Transakcji); wobec Konsumenta Opłata Sukcesu wymaga
  uprzedniego, wyraźnego uzgodnienia z przykładem kwotowym,
- nowy **Załącznik nr 8 — Cennik Pakietów** z łączną ceną Opłat i trybem
  zmiany cennika (14 dni wyprzedzenia, wobec Konsumenta wymagana akceptacja).

Bez zmian: Prowizja Klientowska 7% / min 5 000 zł obciążająca **Klienta**,
Mechanizm Zabezpieczenia Prowizji, Kara Obejściowa 5% Sumy Hipotecznej
i pięcioletni Okres Ochronny.

Dokument wchodzi do rejestru jako **nowa wersja**, więc akceptacje v5 nie są
dziedziczone — `investor_legal_pack_complete` porównuje wersję i SHA-256, a
inwestorzy akceptują v6 ponownie. Flaga `active` nie jest zmieniana przez
migrację: pakiet pozostaje uśpiony do przeglądu kancelarii i aktywuje go
administrator w `/admin/umowy-inwestorow`.

Plik kanoniczny i skrót: `docs/legal/paczka-inwestor-v6/`.

> **Do przeglądu kancelarii przed aktywacją v6**: zgodność Opłaty Sukcesu
> z ustawą o kredycie konsumenckim i przepisami o pośrednictwie, relacja
> Opłaty Sukcesu do Prowizji Klientowskiej przy tej samej transakcji, VAT od
> Opłat oraz dopuszczalność Opłaty Sukcesu wobec Inwestora-Konsumenta.

## Jeden pipeline inwestora

Kolejność kroków liczy `computeInvestorPipeline`
(`src/lib/investor-plan/pipeline.ts`) — ta sama funkcja zasila kolorowy
stepper w `/inwestor/umowy` i bramki serwerowe.

| # | Krok | Skąd stan | Bramka |
| --- | --- | --- | --- |
| 1 | Dane pożyczkodawcy | `investors.lender_data_completed_at` | `saveLenderData` (walidacja PESEL/NIP/reprezentacji) |
| 2 | Rachunek do spłaty | `investors.bank_account_confirmed_at` | `saveRepaymentAccount` (NRB/IBAN + suma kontrolna) |
| 3 | KYC Didit | `didit_verifications` (`investor:<userId>`) | `startInvestorSelfVerification` |
| 4 | Screening list sankcyjnych | `investors.screening_result` | `runMySanctionsScreening` (Dilisense) |
| 5 | Doręczenie pakietu | `legal_deliveries` | `deliverLegalPack` |
| 6–8 | Umowa ramowa → NDA → RODO | `investor_agreement_acceptances` | `acceptLegalDocument` |
| 9 | Zlecenie | `investor_orders` | `submitInvestorOrder` → SQL `investor_pipeline_complete` |

Kroki 1–4 działają także przy uśpionym pakiecie prawnym; kroki 5–9 czekają na
aktywację. Konsument nie zaakceptuje Umowy ramowej przed doręczeniem
informacji przedumownych na trwałym nośniku (§ 15 ust. 1).

Dane firmy w kroku 1 pobiera `CompanyLookupInline` (GUS BIR → KRS → CRBR) po
NIP, REGON albo KRS. Komparycję umów system wypełnia zweryfikowanymi danymi
i pokazuje ją inwestorowi nad treścią dokumentu; protokół akceptacji
(wersja, SHA-256, czas, metoda uwierzytelnienia, IP, urządzenie, snapshot
danych i rachunku) zostaje przy koncie inwestora w
`investor_agreement_acceptances` oraz w potwierdzeniu e-mail.

Screening sankcyjny jest osobnym badaniem niż KYC — korzysta z dostawcy
Dilisense (`DILISENSE_API_KEY`), a potwierdzenie trafienia sankcyjnego jest
zawsze decyzją człowieka: automat klasyfikuje najwyżej do analizy.
