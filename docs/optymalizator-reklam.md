# Optymalizator reklam click-to-Messenger + pętla poprawy bota

Domyka pętlę **reklama → rozmowa → jakość leada → decyzja budżetowa** po naszej
stronie i mierzy, gdzie bot traci klientów.

## Dlaczego po naszej stronie

W EOG Meta blokuje CAPI Business Messaging i optymalizację kampanii messaging
pod konwersje (ePrivacy). Istniejący `lead-quality.server.ts` nadal wysyła
eventy na pixel (`system_generated`), ale ten sygnał **nie steruje** kampaniami
messaging. Dlatego decyzje podejmujemy sami:

```
webhook referral(ad_id) → PSID → lead → tier A/B → CPQL per reklama
    → pauza / skalowanie / flaga zmęczenia (Graph API)
```

Równolegle: kroki lejka rozmowy → drop-off → sędzia LLM → A/B wariantów promptu.

## Architektura

| Element                          | Plik                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| Atrybucja reklama→PSID           | `src/lib/messenger-attribution.server.ts`                          |
| Insights ad-level (spend/dzień)  | `src/lib/meta-ads-insights.server.ts`                              |
| Silnik reguł (pauzy/skalowanie)  | `src/lib/ad-optimizer.server.ts`                                   |
| Lejek bota + warianty promptu    | `src/lib/bot-funnel.server.ts`                                     |
| Sędzia LLM rozmów                | `src/lib/bot-judge.server.ts`                                      |
| Cron: insights + hierarchia      | `src/routes/api/public/hooks/meta-insights-sync-tick.ts`           |
| Cron: optymalizator              | `src/routes/api/public/hooks/ad-optimizer-tick.ts`                 |
| Cron: sędzia LLM                 | `src/routes/api/public/hooks/bot-judge-tick.ts`                    |
| Setup subskrypcji webhooka       | `src/routes/api/public/hooks/meta-subscribe-webhook-fields.ts`     |
| Migracja (tabele, widok, crony)  | `supabase/migrations/20260807120000_ad_optimizer_bot_funnel.sql`   |

Tabele: `messenger_ad_attributions` (psid→ad_id, last-touch + historia
re-klików), `meta_ad_insights_daily` (spend/impresje/frequency per reklama per
dzień), `ad_optimizer_config` (singleton progów), `ad_optimizer_actions` (audyt
decyzji), `bot_funnel_events`, `bot_prompt_variants`, `bot_prompt_assignments`,
`bot_conversation_evals`. Widok `v_ad_cpql` (security_invoker) liczy koszt
kwalifikowanego leada per reklama w oknie 7 dni.

Crony pg_cron: `meta-insights-sync-tick` (co godzinę), `ad-optimizer-tick`
(co 6 h), `bot-judge-tick` (raz dziennie, 3:15).

## Wpięcia w istniejący kod

- `meta-messaging.server.ts` — `captureReferralFromEvent()` w pętli po
  `entry[].messaging[]`, **przed** obsługą wiadomości. Zdarzenie `referral`
  przychodzi też bez `message` (klik w reklamę przed pierwszą wiadomością),
  a `handleMessagingEvent` takie zdarzenia pomija.
- `elevenlabs-text-agent.server.ts` — wariant promptu A/B doklejany do system
  promptu (tylko wariant `klient`), kroki lejka `greeting`,
  `application_link_sent` oraz mapowanie patcha z `update_lead_data`.
- `lead-quality.server.ts` — krok `qualified` przy tierze A/B (mianownik CPQL).

## Reguły optymalizatora

| Reguła | Warunek                                                        | Akcja                          |
| ------ | -------------------------------------------------------------- | ------------------------------ |
| A      | `spend ≥ min_spend_pln` i (0 kwalifikowanych **lub** CPQL > `max_cpql_pln`) | pauza reklamy      |
| B      | `frequency > max_frequency`                                     | flaga zmęczenia (bez pauzy)    |
| C      | `CPQL < target_cpql_pln` i ≥2 kwalifikowane                     | +`scale_step_pct`% budżetu adsetu |

Bezpieczniki: `dry_run` (start włączony), pauza dopiero po `min_spend_pln`,
skalowanie tylko adsetów bez CBO (mają własny `daily_budget`), sufit
`max_budget_pln`, maks. jedno podbicie budżetu per adset na przebieg, każda
decyzja z metrykami w `ad_optimizer_actions`.

## Kolejność wdrożenia

1. Migracja SQL (tworzy tabele, widok i crony — ten sam `base_url`/`apikey`
   co `20260707120000_schedule_automation_crons.sql`).
2. Deploy kodu.
3. **Subskrypcja pól webhooka** — bez panelu Meta: po deployu wywołaj raz
   `GET /api/public/hooks/meta-subscribe-webhook-fields` (nagłówek
   `apikey`/`x-cron-secret` jak inne hooki; dla IG dodatkowo
   `?platform=instagram`). Endpoint czyta obecne pola, dokłada
   `messaging_referrals` + `messaging_postbacks` i zwraca before/after oraz
   `ok_referrals: true`. Bez tego Meta nie wyśle referrali i atrybucja
   zostanie pusta. Błąd „#100 nonexisting field" = token w env jest userowy,
   nie strony.
4. **Optymalizator startuje w `dry_run=true`** — przez 7–14 dni tylko loguje
   decyzje do `ad_optimizer_actions`. Gdy log wygląda sensownie:
   `UPDATE ad_optimizer_config SET dry_run=false WHERE id=1;`
5. Progi (`max_cpql_pln` 300 zł, cel 150 zł, min spend 150 zł, frequency 3.5)
   to placeholdery — skalibruj po pierwszym tygodniu danych z `v_ad_cpql`.
6. A/B promptów: dodawaj warianty do `bot_prompt_variants` (baseline już jest);
   wyniki przez `variantResults()`. Nie promuj zwycięzcy poniżej ~200 leadów
   per wariant — wcześniej to szum.

## Uprawnienia tokenu

`META_ACCESS_TOKEN` musi mieć `ads_management` (pauzowanie i budżety) — obecny
sync w `meta-ads.functions.ts` wymagał tylko `ads_read`. Bez `ads_management`
optymalizator działa w dry_run, a przy realnych akcjach zapisze błąd 403 do
`ad_optimizer_actions.error`.

## Świadomie pominięte

- Panel admina (CPQL, log akcji, wyniki A/B, oceny sędziego) — dane są
  w tabelach, UI to osobny krok.
- Recurring Notifications (re-engagement po >24 h ciszy) — wymaga opt-in flow.
- Automatyczna promocja zwycięskiego wariantu promptu — najpierw wolumen.
