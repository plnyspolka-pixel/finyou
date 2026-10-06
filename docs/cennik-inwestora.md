# Cennik inwestora: abonament roczny, jeden pipeline onboardingu

Stan od 6 października 2026 r. (abonament miesięczny wycofany ze sprzedaży;
od 30 września do 6 października 2026 r. był też wariant 30 dni za 1 500 zł).
Zastępuje model „usługa nieodpłatna" z 29 września
2026 r. (Umowa ramowa v7), cennik Podstawowy/PRO z 21 września 2026 r. oraz
wcześniejsze produkty czasowe.

## Zasada

**Inwestor płaci abonament za dostęp do systemu:**

| Okres   | Cena     | Dni | Kod produktu (`access_products`) |
| ------- | -------- | --- | -------------------------------- |
| rocznie | 7 000 zł | 365 | `investor_access_365d`           |

Innego okresu nie ma. `investor_access_30d` (1 500 zł / 30 dni) jest
nieaktywny (migracja `20261006190000_wycofanie_pakietow_30d.sql`, lustro
drizzle `0028`) i zablokowany w kodzie (`RETIRED_PRODUCT_CODES` w
`src/lib/access/core.ts`) — webhook rozlicza jedynie transakcje rozpoczęte
wcześniej. Płatność jednorazowa za rok przez Tpay (przelew, BLIK) — **bez konieczności
podpinania karty kredytowej** i bez automatycznego odnawiania. Ceny prezentujemy
jako brutto. Nie ma Pakietu PRO, Opłaty Sukcesu ani opłaty za pojedynczy Projekt.

**Klient nadal płaci Prowizję od Pożyczkobiorcy**: 5 % Kwoty Udzielonej
(kwoty pożyczki z umowy), nie mniej niż 5 000 zł, bez VAT (zwolnienie — do
potwierdzenia z księgową), **potrącaną z wypłaty**: inwestor przelewa 5 % na
rachunek Finance You, resztę Klientowi (Zał. 6 do Umowy ramowej — dwie części
przelewu). Przykład: 100 000 zł → 5 000 zł do Finance You, 95 000 zł dla
Klienta. Matematyka: `src/lib/contract-engine/fees.ts`.

Cenę i zdania o płatności liczy jedno miejsce —
`src/lib/investor-plan/plans.ts` (`SUBSCRIPTION_YEARLY_PLN`, `SUBSCRIPTION_OPTION`,
`SUBSCRIPTION_PRICE_SENTENCE`, `SUBSCRIPTION_PAYMENT_SENTENCE`). Strona
`/dla-inwestora` (cennik, FAQ, meta), checkout `/abonament-inwestora`,
panel `/inwestor/abonament` i baner w `/inwestor/umowy` czytają stamtąd.

## Pobieranie abonamentu — włączone

Podstawą płatności jest **Regulamin Abonamentu Inwestora**
(`src/lib/legal/regulamin-abonamentu.ts`, strona `/regulamin-inwestora`,
kopia `docs/legal/inwestor/`), akceptowany przy płatności — jego wersja trafia
do `access_payments.consents.termsVersion`. Sprzedawcą Abonamentu i wystawcą
faktur jest **Fundacja Krzewienia Edukacji Finansowej im. Pieczaka** (KRS
0001140846, NIP 9462747637, zwolnienie z VAT art. 113 ust. 1 — netto = brutto;
domyślny podmiot w `accounting_entities`). Umowę ramową v7, NDA i RODO
inwestor akceptuje dopiero, gdy chce dostępu do Klientów i Projektów; Umowa
ramowa nie przewiduje wynagrodzenia Finance You od Inwestora (§ 7 odsyła do
Regulaminu Abonamentu; `allows_investor_fees = false`). Historia: 30 września
2026 r. umowa v7 dostała najpierw Opłatę Abonamentową pobieraną przez Finance
You (migracja `20260930140000`, drizzle `0023`), a tego samego dnia, nadal
przed pierwszą akceptacją, model z Fundacją i regulaminem (migracja
`20260930190000`, drizzle `0024`).

Uwaga dla nowych migracji: drizzle wgrywa tylko wpisy z `_journal.json`
o znaczniku `when` późniejszym niż ostatnio wgrany — nowy wpis musi mieć
`when` większy od poprzedniego (pilnuje tego test lustra migracji).

- **Katalog**: migracja `20260930140000_abonament_inwestora.sql` (lustro
  drizzle `0023`) aktywowała `investor_access_30d` (150 000 gr, 30 dni) i
  `investor_access_365d` (700 000 gr, 365 dni); PRO i odblokowanie okazji
  zostają nieaktywne. Migracja `20261006190000_wycofanie_pakietow_30d.sql`
  (lustro `0028`) wyłącza `investor_access_30d` i `broker_access_30d`.
- **Zakup**: `/inwestor/abonament` — karta 365 dni i formularz Tpay.
  `createAccessCheckout` przyjmuje z kodów `investor_*` tylko `investor_access_365d`; inwestor
  akceptuje przy płatności Regulamin Abonamentu Inwestora (bez wcześniejszej
  akceptacji umów).
- **Kolejność panelu**: abonament (pierwsza bramka) → akceptacja Umowy
  ramowej, NDA i RODO → moduł ofert (RLS: `investor_can_view_application`
  wymaga `investor_legal_pack_complete`, migracja `0024`).
- **Dostęp**: SQL `investor_has_full_access` = personel albo inwestor z
  aktywnym abonamentem (z płatności albo nadanym ręcznie przez zespół —
  `admin_adjust_access` w `/admin/platnosci-dostep`). Z tej
  funkcji korzystają RLS danych inwestycyjnych, `requireInvestorPro` (AML,
  windykacja), `assertInvestorPro` i `submitInvestorOrder` (Zlecenie wymaga
  abonamentu). W panelu `InvestorSubscriptionGate` pokazuje kartę zakupu w
  modułach poza pipeline'em, `/inwestor/abonament`, płatnościami, profilem i
  odstąpieniem.
- **Konsument**: odstąpienie w 14 dni — zwrot Opłaty Abonamentowej, a przy
  żądaniu wcześniejszego rozpoczęcia pomniejszonej o wykorzystany okres
  (§ 15 ust. 4).

## Jeden abonament — zakres

Zakres opisuje `src/lib/investor-plan/plans.ts` (`ACCESS_PRESENTATION`,
`ALL_FEATURES`).

- pełny pipeline: dane pożyczkodawcy, rachunek spłaty, KYC (Didit), screening
  sankcyjny, akceptacja pakietu umów online,
- składanie Zleceń poszukiwania Projektów (Zał. 7),
- Projekty dopasowane do przyjętego Zlecenia: teaser, Karta Leada, raport o
  inwestycji, harmonogram zaakceptowany przez Klienta, dane kontaktowe,
- generator umowy pożyczki, analityka (KW, właściciele, ryzyko), Akademia,
  kalkulator compliance, moduł AML, moduł windykacji AI, raporty bez limitu.

## Infrastruktura płatności

Tabele `access_products`, `access_entitlements`, `access_payments` i webhook
Tpay obsługują abonament inwestora, pakiety pośrednika i historyczne
rozliczenia. Produkty `investor_pro_180d` i `investor_okazja_unlock` mają
`active = false` (rekordy zostają).

- `investor_tier(_user_id)` zwraca zawsze `'podstawowy'` (jeden poziom),
- `investor_can_open_match(_user_id, _match_id)` zwraca `true` dla właściciela
  Dopasowania (Ujawnienie po akceptacji Karty Leada — bez opłaty za Projekt),
- `investor_has_full_access(_user_id)` — aktywny abonament albo personel,
- `requireInvestorPro` (`src/lib/investor-plan/pro-middleware.ts`) wymaga
  `investor_has_full_access`.

## Opłaty sukcesu — rejestr historyczny

Tabela `investor_success_fees` zostaje wyłącznie jako historia (rekordy sprzed
v7). `confirmZal6` nie nalicza niczego inwestorowi; w
`/admin/umowy-inwestorow` sekcja jest oznaczona „nieaktywne" i pozwala
jedynie anulować stare rekordy. `investor_opportunity_unlocks` — analogicznie.

## Umowa ramowa v7

Migracja `20260929155000_etap5_pakiet_inwestor_v7.sql` (patrz
`docs/legal/paczka-inwestor-v7/`): usunięte Pakiety, Cennik, Opłata Sukcesu,
Opłata za Udostępnienie Okazji i Zał. 8; § 2/§ 7 — Finance You nie pobiera od
Inwestora wynagrodzenia, a dostęp do systemu wymaga **Abonamentu** kupowanego
od Fundacji na podstawie Regulaminu Abonamentu Inwestora (w treści v7:
„obecnie 1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni” —
brzmienie zamrożone, bo v7 została zaakceptowana 2026-10-01; od Regulaminu v3
z 2026-10-06 sprzedawany jest wyłącznie okres 365 dni); Prowizja od Pożyczkobiorcy 5 % Kwoty
Udzielonej, min 5 000 zł, bez VAT, potrącana z wypłaty; § 5 — maks. 5
przyjętych Zleceń, wygaśnięcie po 5 odrzuceniach, rezerwacja 24 h + 12 h,
maks. 2 przedłużone naraz; Kara Obejściowa 5 % Sumy Hipotecznej i pięcioletni
Okres Ochronny bez zmian. `allows_investor_fees = true` dla umowy ramowej
(false dla NDA i RODO). Pakiet wchodzi do
rejestru jako aktywny (`active = true`) — aktywację wszystkich trzech
dokumentów (umowa v7, NDA v6, RODO v5) zatwierdził właściciel 2026-09-29.
Wyłączenie pakietu: `/admin/umowy-inwestorow`.

## Jeden pipeline inwestora

Kolejność kroków liczy `computeInvestorPipeline`
(`src/lib/investor-plan/pipeline.ts`) — ta sama funkcja zasila stepper
w `/inwestor/umowy` i bramki serwerowe: dane pożyczkodawcy → rachunek spłaty →
KYC → screening → doręczenie pakietu (Konsument) → NDA → Umowa ramowa → RODO →
Zlecenie. Limity Zleceń i rezerwacji pochodzą z `project_module_settings`
(`docs/projekty-inwestycyjne.md`).
