# Cennik inwestora: usługa nieodpłatna, jeden pipeline onboardingu

Stan od 29 września 2026 r. (Umowa ramowa v7, pakiet `FY-LEGAL-2026-09-29`).
Zastępuje cennik Podstawowy/PRO z 21 września 2026 r. oraz wcześniejsze
produkty czasowe (30/365 dni).

## Zasada

**Inwestor nie płaci Finance You nic.** Nie ma abonamentu, Opłaty Sukcesu ani
opłaty za udostępnienie pojedynczego Projektu. Jedyną opłatą w systemie jest
**Prowizja Klientowska Finance You**: 7 % Kwoty Udzielonej (kwoty pożyczki z
umowy), nie mniej niż 5 000 zł, bez VAT (zwolnienie — do potwierdzenia z
księgową), **potrącana z wypłaty**: inwestor przelewa 7 % na rachunek Finance
You, resztę Klientowi (Zał. 6 do Umowy ramowej — dwie części przelewu).
Przykład: 100 000 zł → 7 000 zł do Finance You, 93 000 zł dla Klienta.
Matematyka: `src/lib/contract-engine/fees.ts`.

## Jeden pakiet — „Dostęp inwestora" (0 zł)

Zakres opisuje jedno miejsce — `src/lib/investor-plan/plans.ts`
(`ACCESS_PRESENTATION`, `ALL_FEATURES`). Panel, strona `/dla-inwestora`
i bramki serwerowe czytają stamtąd.

- pełny pipeline: dane pożyczkodawcy, rachunek spłaty, KYC (Didit), screening
  sankcyjny, akceptacja pakietu umów online,
- składanie Zleceń poszukiwania Projektów (Zał. 7),
- Projekty dopasowane do przyjętego Zlecenia: teaser, Karta Leada, raport o
  inwestycji, harmonogram zaakceptowany przez Klienta, dane kontaktowe,
- generator umowy pożyczki, analityka (KW, właściciele, ryzyko), Akademia,
  kalkulator compliance, moduł AML, moduł windykacji AI, raporty bez limitu.

## Infrastruktura płatności (zostaje, nieaktywna dla inwestora)

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

**Abonament za dostęp do systemu — w przyszłości.** Wymaga nowej wersji Umowy
ramowej (doręczenie na trwałym nośniku, wyraźna akceptacja) i ponownej
aktywacji produktu w katalogu. Do tego czasu `/inwestor/abonament` jest stroną
informacyjną bez checkoutu.

## Opłaty sukcesu — rejestr historyczny

Tabela `investor_success_fees` zostaje wyłącznie jako historia (rekordy sprzed
v7). `confirmZal6` nie nalicza niczego inwestorowi; w
`/admin/umowy-inwestorow` sekcja jest oznaczona „nieaktywne" i pozwala
jedynie anulować stare rekordy. `investor_opportunity_unlocks` — analogicznie.

## Umowa ramowa v7

Migracja `20260929125000_etap5_pakiet_inwestor_v7.sql` (patrz
`docs/legal/paczka-inwestor-v7/`): usunięte Pakiety, Cennik, Opłata Sukcesu,
Opłata Abonamentowa, Opłata za Udostępnienie Okazji i Zał. 8; § 2/§ 7 —
usługa dla Inwestora **nieodpłatna**; Prowizja Klientowska 7 % Kwoty
Udzielonej, min 5 000 zł, bez VAT, potrącana z wypłaty; § 5 — maks. 5
przyjętych Zleceń, wygaśnięcie po 5 odrzuceniach, rezerwacja 24 h + 12 h,
maks. 2 przedłużone naraz; Kara Obejściowa 5 % Sumy Hipotecznej i pięcioletni
Okres Ochronny bez zmian. `allows_investor_fees = false`. Pakiet wchodzi do
rejestru uśpiony (`active = false`) — aktywację wszystkich trzech dokumentów
(umowa v7, NDA v6, RODO v5) wykonuje administrator w
`/admin/umowy-inwestorow` po przeglądzie kancelarii.

## Jeden pipeline inwestora

Kolejność kroków liczy `computeInvestorPipeline`
(`src/lib/investor-plan/pipeline.ts`) — ta sama funkcja zasila stepper
w `/inwestor/umowy` i bramki serwerowe: dane pożyczkodawcy → rachunek spłaty →
KYC → screening → doręczenie pakietu (Konsument) → NDA → Umowa ramowa → RODO →
Zlecenie. Limity Zleceń i rezerwacji pochodzą z `project_module_settings`
(`docs/projekty-inwestycyjne.md`).
