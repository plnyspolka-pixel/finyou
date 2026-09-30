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

## Pobieranie abonamentu — jeszcze wyłączone

Cennik jest opublikowany, ale **system jeszcze nie pobiera opłat**: aktywna
Umowa ramowa v7 (`allows_investor_fees = false`) mówi, że usługa dla Inwestora
jest nieodpłatna. Konta na v7 mają dostęp bez opłat, a panel mówi o tym wprost.
Włączenie abonamentu wymaga:

1. nowej wersji Umowy ramowej (i ewentualnie Karty Leada) z abonamentem —
   doręczenie na trwałym nośniku i wyraźna akceptacja przez Inwestora,
2. aktywacji `investor_access_30d` / `investor_access_365d` w katalogu
   `access_products` z cenami `150000` / `700000` gr i liczbą dni 30 / 365
   (migracja),
3. zdjęcia blokady kodów `investor_*` w `createAccessCheckout`,
4. przywrócenia bramkowania (`investor_tier()`, `investor_has_full_access`,
   `requireInvestorPro`) z okresem przejściowym dla kont na v7.

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

## Infrastruktura płatności (gotowa, wyłączona dla inwestora do czasu nowej umowy)

Tabele `access_products`, `access_entitlements`, `access_payments` i webhook
Tpay pozostają — obsługują pośredników i historyczne rozliczenia. Produkty
inwestora (`investor_pro_180d`, `investor_okazja_unlock`,
`investor_access_30d`, `investor_access_365d`) mają `active = false`; rekordy,
płatności i faktury historyczne zostają. `createAccessCheckout` odrzuca kody
`investor_*`.

- `investor_tier(_user_id)` zwraca zawsze `'podstawowy'`,
- `investor_can_open_match(_user_id, _match_id)` zwraca `true` dla właściciela
  Dopasowania (Ujawnienie po akceptacji Karty Leada — bez płatności),
- `investor_has_full_access(_user_id)` zwraca `true` dla roli `inwestor`,
- `requireInvestorPro` (`src/lib/investor-plan/pro-middleware.ts`) przepuszcza
  każdego zalogowanego inwestora — zostaje jako jedno miejsce bramkowania na
  wypadek przyszłego abonamentu.

**Abonament — cennik opublikowany, pobieranie wyłączone.** Kroki włączenia:
sekcja „Pobieranie abonamentu" wyżej. Do tego czasu `/inwestor/abonament`
pokazuje cennik i informację, że konto na dotychczasowych warunkach nic nie
płaci — bez checkoutu.

## Opłaty sukcesu — rejestr historyczny

Tabela `investor_success_fees` zostaje wyłącznie jako historia (rekordy sprzed
v7). `confirmZal6` nie nalicza niczego inwestorowi; w
`/admin/umowy-inwestorow` sekcja jest oznaczona „nieaktywne" i pozwala
jedynie anulować stare rekordy. `investor_opportunity_unlocks` — analogicznie.

## Umowa ramowa v7

Migracja `20260929155000_etap5_pakiet_inwestor_v7.sql` (patrz
`docs/legal/paczka-inwestor-v7/`): usunięte Pakiety, Cennik, Opłata Sukcesu,
Opłata Abonamentowa, Opłata za Udostępnienie Okazji i Zał. 8; § 2/§ 7 —
usługa dla Inwestora **nieodpłatna**; Prowizja Klientowska 7 % Kwoty
Udzielonej, min 5 000 zł, bez VAT, potrącana z wypłaty; § 5 — maks. 5
przyjętych Zleceń, wygaśnięcie po 5 odrzuceniach, rezerwacja 24 h + 12 h,
maks. 2 przedłużone naraz; Kara Obejściowa 5 % Sumy Hipotecznej i pięcioletni
Okres Ochronny bez zmian. `allows_investor_fees = false`. Pakiet wchodzi do
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
