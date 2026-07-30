# Rozdzielenie leadów od wniosków

## Zasada

- **Lead** to towar w puli sprzedażowej („Leady Finance You") — widzą go
  pośrednicy i operatorzy-partnerzy (za płatnym pakietem) oraz personel
  wewnętrzny.
- **Wniosek** zaczyna się w momencie, gdy klient realnie rozpoczął proces
  (rozmowa z botem na Messengerze/czacie, formularz, panel klienta). Od tej
  chwili sprawę widzi **wyłącznie personel wewnętrzny i sam klient** — lead
  znika z paneli pośredników i operatorów-partnerów (lista, szczegóły,
  komunikacja).

## Znacznik

Kolumny `leads.application_started_at` + `application_started_source`.
`NULL` = lead w otwartej puli; ustawiona data = rozpoczęty wniosek.

Źródła ustawiania (`application_started_source`):

| Źródło                  | Kiedy                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `bot:<kanał>`           | bot tekstowy zapisał merytorykę wniosku (kwota / KW / typ lub wartość nieruchomości / cel)   |
| `rozmowa_inbound`       | klient w toku dwustronnej rozmowy podał KW / kwotę / wartość (ekstrakcja z inbound)          |
| `status_wniosek`        | trigger DB — status leada zmienił się na `wniosek` (m.in. promocja `maybePromoteLeadToApplication`) |
| `panel_klienta`         | klient wszedł do panelu po linku powrotnym (`claimLoanApplication`)                          |
| `backfill:*`            | jednorazowa migracja historycznych leadów (status, konto klienta, krok formularza, dane wniosku) |

Sam **stub** `loan_application` (tworzony automatycznie przy otwarciu leada
przez personel — `ensureLoanApplicationForLead`) **nie** oznacza rozpoczęcia
wniosku. Podobnie pierwsza wiadomość powitalna z reklamy Meta (blok
formularza) nie zdejmuje leada z puli — wymagana jest dwustronna rozmowa.

## Egzekwowanie

1. **RLS** (`20260730170000_leads_wnioski_split.sql`):
   - `leads`: personel wewnętrzny (`is_internal_staff`) — pełny dostęp;
     partner (`is_external_partner`) — `SELECT` tylko przy
     `application_started_at IS NULL`. Dawna polityka „Admins manage leads"
     (wpuszczała każdego z rolą `operator`, także partnerów) usunięta.
   - `lead_communications`: analogicznie; partner dopisuje wyłącznie własne
     zdarzenia (`call` / `manual_note` / `reveal`) przy leadzie z puli.
2. **Serwer** (`leads-admin.functions.ts`): `listLeads` / `getLead` filtrują
   pulę dla nie-personelu także jawnie w zapytaniu (obrona w głąb, gdyby
   zapytanie przeszło kiedyś na service-role).

## Pliki

- `supabase/migrations/20260730170000_leads_wnioski_split.sql` — kolumny,
  trigger, backfill, RLS,
- `src/lib/leads-split.ts` — czysta logika (czy patch bota startuje wniosek),
- `src/lib/leads-split.server.ts` — zapis znacznika (service-role),
- punkty zaczepienia: `elevenlabs-text-agent.server.ts` (update_lead_data),
  `lead-enrichment.server.ts` (inbound + promocja), `my-loan.functions.ts`
  (claim w panelu klienta).
