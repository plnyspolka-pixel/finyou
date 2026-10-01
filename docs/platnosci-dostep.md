# System płatnego dostępu (Tpay) — architektura

Jednorazowe płatności Tpay za czasowy dostęp do platformy. Bez automatycznych
odnowień, punktów i opłat za pojedynczą ofertę/lead.

## Katalog produktów (`access_products`)

| Kod | Odbiorca | Cena brutto | Dni | Rodzaj |
| --- | --- | --- | --- | --- |
| `broker_access_30d` | pośrednik | 499 zł (`49900` gr) | 30 | `access` |
| `broker_access_365d` | pośrednik | 2 999 zł (`299900` gr) | 365 | `access` |
| `investor_access_30d` | inwestor | 1 500 zł (`150000` gr) | 30 | `access` |
| `investor_access_365d` | inwestor | 7 000 zł (`700000` gr) | 365 | `access` |
| `investor_pro_180d`, `investor_okazja_unlock` | inwestor | — | — | **nieaktywne** (historia) |

**Inwestor — abonament 1 500 zł / mies. albo 7 000 zł / rok (61 % rabatu
przy płatności rocznej)**, opublikowany od 30 września 2026 r.
(`docs/cennik-inwestora.md`, ceny w `src/lib/investor-plan/plans.ts`,
podstawa: Regulamin Abonamentu Inwestora akceptowany przy płatności;
sprzedawca i wystawca faktur: Fundacja Krzewienia Edukacji Finansowej
im. Pieczaka, bez VAT). Katalog: migracja
`20260930140000_abonament_inwestora.sql`. `createAccessCheckout` przyjmuje
z kodów `investor_*` tylko abonament 30 / 365 dni; umów o dostęp do Klientów
nie wymaga (akceptowane później, otwierają moduł ofert).

Konto darmowe pośrednika (`broker_free`) nie jest produktem — wynika z roli
`posrednik` / aktywnego rekordu `affiliate_partners` i nie wygasa.
Stare plany (`investor_access_1d/1m/1y`) obsługuje wyłącznie webhook dla
transakcji rozpoczętych przed wdrożeniem.

## Przepływ zakupu

1. `createAccessCheckout` (src/lib/access/checkout.functions.ts): klient wysyła
   wyłącznie kod produktu + typ/dane nabywcy + zgody. Cena, waluta i liczba dni
   są czytane z katalogu na serwerze. Powstaje rekord `access_payments`
   (status `created` → `pending`), a w `crc` Tpay zapisujemy **UUID płatności**.
   Dla produktu `kind = 'unlock'` klient przesyła dodatkowo `matchId`;
   serwer weryfikuje, że Dopasowanie należy do Zlecenia kupującego, nie jest
   zamknięte i nie zostało już odblokowane, po czym zapisuje
   `access_payments.unlock_match_id`.
2. Webhook `/api/public/payments/tpay-webhook` → `handleTpayNotification`
   (src/lib/access/webhook-core.server.ts): pobiera transakcję z API Tpay
   (nie ufa powiadomieniu), po `status=correct` wywołuje SQL RPC
   `process_access_payment_paid` — **atomowo i idempotentnie** (FOR UPDATE na
   płatności i uprawnieniu, weryfikacja kwoty w groszach, przedłużenie od
   bieżącego `active_until` albo od teraz). Produkt `kind = 'unlock'` nie
   przedłuża uprawnienia — zamiast tego wstawia wiersz do
   `investor_opportunity_unlocks` (unikalny po `match_id`).
3. Post-processing (best-effort, nie cofa dostępu): e-mail potwierdzenia,
   automatyczna faktura (firma → z NIP; osoba prywatna → imienna z pełnym
   adresem, bez NIP) + e-mail z fakturą, zdarzenie programu partnerskiego
   (`investor_account_paid`/`broker_account_paid`, unikalne po
   `external_ref = tpay:<transactionId>`).
4. Powrót z Tpay: UI odpytuje `getAccessPaymentStatus` po `payment` (UUID) —
   parametr `?tpay=success` jest tylko wskazówką, nigdy potwierdzeniem.

## Źródło prawdy o dostępie

- `access_entitlements (user_id, audience)` — `active_until > now()` ⇒ dostęp.
- Funkcje SQL: `has_active_paid_access`, `get_access_state`,
  `investor_has_full_access`, `broker_has_paid_access`, `is_internal_staff`,
  `is_external_partner`.
- Stare pola `investors.subscription_*` są utrzymywane jako warstwa
  kompatybilności (aktualizowane przy płatności), ale nie są źródłem prawdy.

## Egzekwowanie (3 warstwy)

1. **Routing/UI** — `useAccessState` + ograniczona nawigacja i przekierowania.
2. **Server functions** — `src/lib/access/guards.server.ts`
   (`assertInvestorFullAccess`, `assertBrokerPremium`, `assertBrokerOrStaff`).
3. **RLS/Storage** — migracja `20260719106000_investor_paywall_rls.sql`
   wpina `investor_has_full_access` we wszystkie polityki danych
   inwestycyjnych (loan_applications, properties, documents, kw_*, analizy,
   oceny ryzyka, investor_offers, dystrybucje, czat, wind_*, generated_documents,
   Akademia, bucket `pliki-klienta` i `training-videos`).
   Partner zewnętrzny z historyczną rolą `operator` NIE dostaje bypassu
   personelu (`is_internal_staff` wyklucza aktywnych partnerów).

Teasery Projektów widzi WYŁĄCZNIE inwestor z przyjętym Zleceniem — funkcja
SQL `investor_offer_teasers()` i server function `listInvestorTeasers` budują
je z `investor_order_matches` dla `investor_orders.status = 'przyjete'`
wywołującego (bez opisu i zdjęć; `anon` bez EXECUTE). Widok
`public_loan_teasers` został usunięty. Publiczne osadzenia (`/embed/leady`,
`/dla-inwestora`, `/oferty`) pokazują wyłącznie wygenerowane „Przykładowe
projekty — ilustracja, nie oferta" (`src/lib/example-projects.ts`).

## Pośrednik

- Rola `posrednik` (nowa wartość enuma `app_role`): nadawana przy zatwierdzeniu
  partnera (`adminApprovePartner`), przy rejestracji (`handle_new_user`)
  i wyborze roli (`selectAccountRole`). Nowi partnerzy nie dostają `operator`.
- Autorstwo oferty: `loan_applications.created_by_partner_user_id`
  (niezmienne — trigger `protect_partner_author`), soft-delete
  `deleted_at`/`deleted_by` (RPC `broker_soft_delete_application`).
- Limit 5 nieusuniętych ofert na koncie darmowym: trigger
  `enforce_broker_offer_limit` z `pg_advisory_xact_lock` per autor
  (odporny na równoległe żądania); błąd `BROKER_OFFER_LIMIT` → modal w UI.
- Po wygaśnięciu pakietu konto wraca do wersji darmowej (nic nie jest
  usuwane; przy >5 ofertach można tylko usuwać do skutku).

## Panel administratora

`/admin/platnosci-dostep`: lista płatności (produkt, kwota, status, Tpay ID,
typ nabywcy, okres, faktura + KSeF, zdarzenie afiliacyjne, role użytkownika),
akcje: ponów fakturę, wyślij fakturę ponownie, ręczna zmiana dostępu
(SQL `admin_adjust_access` — audyt w `access_audit_logs`), oznacz do
wyjaśnienia, log webhooków (`access_webhook_logs`), lista partnerów z
historyczną rolą `operator` (widok `partner_operator_role_audit`).

## Przypomnienia

Cron `access-expiry-tick` (pg_cron, co godzinę) → 7/3/1 dni przed końcem i po
wygaśnięciu (dedup w `access_expiry_notifications`).

## Raty TubaPay (płatność podzielona)

Druga bramka obok Tpay — ta sama cena z katalogu, rozłożona przez TubaPay na
płatności miesięczne. Dostępna dla abonamentu inwestora i pakietów pośrednika
(nie dla `kind = 'unlock'`), wyłącznie dla **osoby prywatnej** (umowę
z TubaPay zawiera osoba fizyczna), w checkoucie zalogowanym i bez konta.
Przełącznik „Jednorazowo (Tpay) / W ratach (TubaPay)" pojawia się na
formularzu tylko wtedy, gdy TubaPay zwróci ofertę rat dla ceny produktu
(`getTubapayInstallmentOffer`).

Kontrakt API odtworzony z oficjalnej wtyczki WooCommerce `tubapay-v2`
(`src/lib/tubapay.server.ts`):

| Krok | Endpoint |
| --- | --- |
| Token | `POST /api/v1/partner/auth/token` (`PARTNER_CLIENT_CREDENTIALS`) |
| Oferta rat | `POST /api/v1/external/transaction/create-offer` |
| Umowa + link | `POST /api/v1/external/transaction/create` → `transactionLink` |
| Webhook | `POST` JSON na `order.callbackUrl`, `TRANSACTION_STATUS_CHANGED` |

Przepływ:

1. `startTubapayPayment` (`start-payment.server.ts`): rekord `access_payments`
   z `provider = 'tubapay'`, `provider_transaction_id = tubapay-<UUID>`;
   `externalRef` = UUID płatności. `callbackUrl` =
   `/api/public/payments/tubapay-webhook?payment=<UUID>&sig=<HMAC-SHA256>`
   (klucz: `TUBAPAY_API_KEY`).
2. Webhook → `handleTubapayNotification` (`webhook-core.server.ts`).
   **TubaPay nie podpisuje powiadomień i nie ma endpointu statusu**, więc
   zaufanie opiera się na naszym podpisie w URL + zgodności `externalRef`.
   Bez poprawnego podpisu: 400, brak zmian, płatność `needs_review`.
3. Statusy umowy (`agreementStatus`):
   - `accepted` → ta sama ścieżka co Tpay `correct` (`process_access_payment_paid`
     za pełną kwotę z katalogu, faktura, afiliacja, e-maile, konto gościa);
   - `rejected` / `canceled` → `cancelled`;
   - `withdrew` / `terminated*` po opłaceniu → `needs_review` (bez cofania
     dostępu — decyzja administratora);
   - `registered` / `signed` / `repaid` / `closed` → tylko log.
4. Afiliacja: `external_ref = tubapay:tubapay-<UUID>` (Tpay bez zmian:
   `tpay:<transactionId>`).

Panel TubaPay → „Dane do integracji": pole **Domyślny URL dla callback** może
zostać puste — adres z podpisem idzie w każdej transakcji. Powiadomienie bez
podpisu (np. na adres domyślny) nie przyzna dostępu; trafia do
`access_webhook_logs` (`invalid_signature`).

Migracja: `20261001090000_tubapay_platnosci.sql` (CHECK `provider IN
('tpay','tubapay')`).

## Zmienne środowiskowe

Wymagane (istniejące): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_PUBLISHABLE_KEY`, `TPAY_CLIENT_ID`, `TPAY_CLIENT_SECRET`,
(`TPAY_API_BASE`), `LOVABLE_API_KEY` + `RESEND_API_KEY` (e-maile), `CRON_SECRET`,
`BIR_API_KEY` (GUS), `TUBAPAY_PARTNER_ID` + `TUBAPAY_API_KEY` (raty TubaPay;
bez nich opcja rat się nie pokazuje; `TUBAPAY_API_BASE` — opcjonalnie
środowisko testowe `https://tubapay-test.bacca.pl`). Opcjonalne nowe: `APP_URL` — kanoniczna baza adresów
powrotu/notyfikacji Tpay (fallback: origin żądania z białej listy, potem
`https://app.financeyou.pl`). KSeF: `KSEF_TOKEN_FINANCE_YOU` itd. — bez nich
faktury mają uczciwy status `disabled`/`not_sent` (nigdy „wysłana", jeśli nie
została przyjęta).

## Wersje tekstów prawnych

`TERMS_VERSION` / `PRIVACY_VERSION` w `checkout.functions.ts` — podmień po
zatwierdzeniu treści przez obsługę prawną (zgody zapisywane w
`access_payments.consents` wraz z datą, IP i user-agentem).
