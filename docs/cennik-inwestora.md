# Cennik inwestora: abonament miesięczny albo roczny, jeden pipeline onboardingu

Stan od 30 września 2026 r. Zastępuje model „usługa nieodpłatna" z 29 września
2026 r. (Umowa ramowa v7), cennik Podstawowy/PRO z 21 września 2026 r. oraz
wcześniejsze produkty czasowe.

## Zasada

**Inwestor płaci abonament za dostęp do systemu:**

| Okres       | Cena     | Dni | Kod produktu (`access_products`) |
| ----------- | -------- | --- | -------------------------------- |
| miesięcznie | 1 500 zł | 30  | `investor_access_30d`            |
| rocznie     | 7 000 zł | 365 | `investor_access_365d`           |

Rok płacony co miesiąc to 18 000 zł, więc płatność roczna oszczędza 11 000 zł —
**61 % rabatu** (zaokrąglone w dół), ok. 583 zł miesięcznie. Płatność
jednorazowa za wybrany okres przez Tpay (przelew, BLIK) — **bez konieczności
podpinania karty kredytowej** i bez automatycznego odnawiania. Ceny prezentujemy
jako brutto. Nie ma Pakietu PRO, Opłaty Sukcesu ani opłaty za pojedynczy Projekt.

**Klient nadal płaci Prowizję Klientowską Finance You**: 7 % Kwoty Udzielonej
(kwoty pożyczki z umowy), nie mniej niż 5 000 zł, bez VAT (zwolnienie — do
potwierdzenia z księgową), **potrącaną z wypłaty**: inwestor przelewa 7 % na
rachunek Finance You, resztę Klientowi (Zał. 6 do Umowy ramowej — dwie części
przelewu). Przykład: 100 000 zł → 7 000 zł do Finance You, 93 000 zł dla
Klienta. Matematyka: `src/lib/contract-engine/fees.ts`.

Ceny, rabat i zdania o płatności liczy jedno miejsce —
`src/lib/investor-plan/plans.ts` (`SUBSCRIPTION_*`, `SUBSCRIPTION_OPTIONS`,
`SUBSCRIPTION_PRICE_SENTENCE`, `SUBSCRIPTION_PAYMENT_SENTENCE`). Strona
`/dla-inwestora` (cennik z suwakiem Miesięcznie / Rocznie, FAQ, meta),
panel `/inwestor/abonament` i baner w `/inwestor/umowy` czytają stamtąd.

## Pobieranie abonamentu — włączone

Podstawą jest Umowa ramowa v7 § 7 (Opłata Abonamentowa; `allows_investor_fees =
true`). 30 września 2026 r. — przed pierwszą akceptacją v7 (w bazie zero
akceptacji) — zapis o nieodpłatności zastąpiono Opłatą Abonamentową w
generatorze `src/lib/legal/pakiet-v7.ts`; pakiet zregenerowano skryptem.
Pierwotna treść v7 była już wgrana migracją `20260929155000` (drizzle `0016`),
której nie zmieniamy — nową treść wgrywa UPDATE w migracji
`20260930140000_abonament_inwestora.sql`. Kwoty są brutto; dopóki Finance You
nie dolicza VAT, netto = brutto.

Uwaga dla nowych migracji: drizzle wgrywa tylko wpisy z `_journal.json`
o znaczniku `when` późniejszym niż ostatnio wgrany — nowy wpis musi mieć
`when` większy od poprzedniego (pilnuje tego test lustra migracji).

- **Katalog**: migracja `20260930140000_abonament_inwestora.sql` (lustro
  drizzle `0023`) aktywuje `investor_access_30d` (150 000 gr, 30 dni) i
  `investor_access_365d` (700 000 gr, 365 dni); PRO i odblokowanie okazji
  zostają nieaktywne. Przed migracją nie było żadnej płatności inwestora,
  więc kody można było zachować.
- **Zakup**: `/inwestor/abonament` — karty 30 / 365 dni i formularz Tpay.
  `createAccessCheckout` przyjmuje z kodów `investor_*` tylko te dwa i wymaga
  akceptacji aktywnej Umowy ramowej (`investorAcceptedActiveFramework`).
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
Opłata za Udostępnienie Okazji i Zał. 8; § 2/§ 7 — Inwestor płaci wyłącznie
**Opłatę Abonamentową** (1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto
za 365 dni; zmiana z 2026-09-30, przed pierwszą akceptacją); Prowizja Klientowska 7 % Kwoty
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
