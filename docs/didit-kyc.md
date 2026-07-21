# Weryfikacja tożsamości Didit (KYC / KYB)

Integracja Didit uzupełnia moduł AML o **realną weryfikację tożsamości**:
dokument + liveness + face match + AML dla osoby fizycznej (KYC) oraz
weryfikację firmy (KYB). Screening Dilisense odpowiada „czy podmiot jest na
listach", a Didit — „czy to naprawdę ta osoba/firma". Weryfikacja jest dostępna
z ekranu **Klienci i weryfikacje** (`/inwestor/aml/klienci`) po wybraniu
klienta.

## Przepływ

1. Inwestor otwiera kartę klienta AML i klika **Rozpocznij weryfikację**.
2. Backend (`startDiditVerification`) tworzy sesję Didt dla wybranego workflow
   (osoba → KYC, firma → KYB), z `vendor_data = aml_customers.id`, i zwraca link.
3. Link otwiera się w nowej karcie — klient przechodzi weryfikację.
4. Didit wysyła webhook (`status.updated`, `data.updated`) na Edge Function
   `didit-webhook`, która weryfikuje podpis HMAC i zapisuje wynik w
   `didit_verifications`.
5. UI pokazuje status (Zatwierdzona / Odrzucona / W przeglądzie / …). Można też
   ręcznie odświeżyć decyzję (`refreshDiditDecision` → API Didit).

## Komponenty w repo

| Element | Ścieżka |
|---|---|
| Klient REST + podpis HMAC + wybór workflow | `src/lib/didit.server.ts` |
| Stałe współdzielone (etykiety/kolory statusów) | `src/lib/didit-shared.ts` |
| Server functions (start / list / refresh) | `src/lib/didit.functions.ts` |
| Webhook (weryfikacja podpisu, zapis decyzji) | `supabase/functions/didit-webhook/index.ts` |
| Panel UI weryfikacji | `src/components/aml/didit-kyc-panel.tsx` |
| Tabela + RLS | `supabase/migrations/20260721120000_didit_kyc.sql` |

`didit_verifications` ma RLS jak tabele `aml_*` (właściciel `user_id = auth.uid()`
lub personel wewnętrzny). Zapis z webhooka idzie `service_role` (omija RLS).

## Konfiguracja (sekrety środowiska)

Backend nie woła Didit, dopóki nie ma `DIDIT_API_KEY` — wtedy UI pokazuje
instrukcję zamiast błędu (`status: "not_configured"`).

| Sekret | Opis |
|---|---|
| `DIDIT_API_KEY` | Klucz API z konsoli Didit (aplikacja Sandbox lub produkcyjna). Tylko backend. |
| `DIDIT_WORKFLOW_ID_KYC` | Workflow dla osób fizycznych. |
| `DIDIT_WORKFLOW_ID_KYB` | Workflow dla firm. |
| `DIDIT_WEBHOOK_SECRET` | Klucz podpisujący webhook (z konsoli Didit) — ustaw też na Edge Function. |
| `DIDIT_API_BASE` | (opcjonalnie) nadpisanie bazy API, domyślnie `https://verification.didit.me`. |
| `DIDIT_APP_URL` | (opcjonalnie) publiczny adres aplikacji dla callbacku, domyślnie `https://app.financeyou.pl`. |
| `DIDIT_WORKFLOW_ID` | (opcjonalnie) wspólny fallback, gdy nie podano KYC/KYB. |

### Zasoby już utworzone w koncie „Finance You sp z oo" (Sandbox)

Workflowy opublikowane, webhook utworzony (podpis dostępny w konsoli Didit):

- KYC + AML (`OCR + LIVENESS + FACE_MATCH + AML + IP_ANALYSIS`):
  `DIDIT_WORKFLOW_ID_KYC = d762fc3c-cb77-4392-aff3-4964a01776e8`
- KYB (`KYB_REGISTRY + AML + KYB_DOCUMENTS + KYB_KEY_PEOPLE`):
  `DIDIT_WORKFLOW_ID_KYB = 5c40f306-00fa-427b-9816-aa07debcccb9`
- Webhook → `https://jqvepxhulxdnbwbogkhe.supabase.co/functions/v1/didit-webhook`
  (v2, `status.updated` + `data.updated`).

Odpowiedniki produkcyjne (aplikacja „My Application") istnieją jako *draft* —
przed wejściem na produkcję trzeba je opublikować i użyć ich ID:
`1612939d-f7e3-4fe1-bba2-d0274b23a0fb` (KYC), `c7f1dde1-35ae-4190-8c4b-939239fa367c` (KYB).

## Do zrobienia po stronie wdrożenia (Ty)

1. Ustaw sekrety powyżej (Lovable Cloud / Supabase → Edge Functions secrets).
   `DIDIT_WEBHOOK_SECRET` skopiuj z konsoli Didit (Webhooks → utworzony wpis).
2. Wdróż Edge Function `didit-webhook` (`supabase functions deploy didit-webhook`
   albo panel) — musi widzieć `DIDIT_WEBHOOK_SECRET` oraz standardowe
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
3. Zastosuj migrację `20260721120000_didit_kyc.sql` (`supabase db push` / panel)
   i zregeneruj typy `Database` (`src/integrations/supabase/types.ts`) — potem
   można usunąć luźny `any` (`loose`) w `didit.functions.ts`.

## Bezpieczeństwo

- Klucz API i klucz webhooka wyłącznie po stronie backendu/Edge Function; nigdy
  we frontendzie.
- Webhook weryfikuje HMAC-SHA256 surowego ciała (`x-signature` / `x-signature-v2`)
  oraz okno czasowe `x-timestamp` (±5 min, anty-replay); bez poprawnego podpisu
  zwraca 401.
- `vendor_data` to `aml_customers.id` — wiąże sesję Didt z klientem bez
  przekazywania danych wrażliwych w URL.
