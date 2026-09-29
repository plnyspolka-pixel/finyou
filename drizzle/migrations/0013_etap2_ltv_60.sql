-- =====================================================================
-- ETAP 2 — JEDEN LIMIT LTV 60 % (sprzątanie spójności prawnej 2026-09)
--
-- Decyzja nadrzędna nr 6: jeden limit LTV w całym systemie = 60 %.
-- Ustawienia modułu projektów: max_ltv_percent 80 → 60, przedziały LTV
-- (ltv_bands) domykają się na 60. Kod (src/lib/contract-engine/fees.ts,
-- LTV_MAX) i UI czytają tę wartość z ustawień, a walidacja zapisu
-- (admin.functions.ts) nie pozwala wpisać więcej niż 60.
-- =====================================================================

update public.project_module_settings
   set max_ltv_percent = 60,
       ltv_bands = jsonb_build_object('conservative', 35, 'acceptable', 50, 'elevated', 60),
       updated_at = now()
 where id = 1
   and (max_ltv_percent is distinct from 60
        or (ltv_bands->>'elevated')::numeric is distinct from 60);

alter table public.project_module_settings
  drop constraint if exists project_module_settings_max_ltv_60_chk;
alter table public.project_module_settings
  add constraint project_module_settings_max_ltv_60_chk
  check (max_ltv_percent between 1 and 60);

comment on column public.project_module_settings.max_ltv_percent is
  'Jeden limit LTV w całym systemie (decyzja 2026-09): maksymalnie 60 %.';
