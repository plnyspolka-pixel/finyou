-- =====================================================================
-- ETAP 4 — JEDEN ZESTAW STATUSÓW WNIOSKU (sprzątanie spójności 2026-09)
--
-- Jeden zestaw statusów (enum loan_status ma już wszystkie wartości):
--   nowy_lead → w_trakcie_uzupelniania → braki_w_dokumentach → do_kontaktu →
--   w_follow_upie → wniosek_kompletny → do_analizy → rokuje/nie_rokuje →
--   wyslany_do_inwestorow → oferta_od_inwestora → oferta_przekazana_klientowi →
--   zaakceptowany_przez_klienta → do_umowy → oczekuje_podpisania_umowy →
--   umowa_podpisana → oczekuje_ustanowienia_zabezpieczen →
--   zabezpieczenia_ustanowione → dokumenty_dostarczone_do_inwestora →
--   oczekuje_wyplaty → wyplacony → zamkniety → archiwalny;
--   plus wniosek_odrzucony, brak_kontaktu.
--
-- 1. Mapowanie starych wartości (dane historyczne w loan_status_history
--    zostają nietknięte — etykiety normalizują je w UI).
-- 2. Decyzja nadrzędna nr 11: statusy ODRZUCAJĄCE (nie_rokuje,
--    wniosek_odrzucony) nigdy nie są nadawane automatycznie — automat
--    zapisuje PROPOZYCJĘ (suggested_status + powód), operator zatwierdza.
--    Trigger BEFORE UPDATE wymaga dla nich auth.uid() (sesja operatora)
--    albo jawnego status_decided_by (server function z kontekstem operatora).
-- 3. Bramka B2B: przejście do wyslany_do_inwestorow wymaga oświadczenia
--    o celu gospodarczym (business_purpose_declared).
-- =====================================================================

-- 0. Nowe kolumny.
alter table public.loan_applications
  add column if not exists suggested_status public.loan_status,
  add column if not exists suggested_status_reason text,
  add column if not exists suggested_at timestamptz,
  add column if not exists suggested_by text,
  add column if not exists status_decided_by uuid,
  add column if not exists business_purpose_declared boolean not null default false,
  add column if not exists business_purpose_declared_at timestamptz;

comment on column public.loan_applications.suggested_status is
  'Propozycja statusu od automatu (ocena ryzyka, auto-status, auto-dystrybucja). Statusy odrzucające nigdy nie są nadawane automatycznie — operator zatwierdza w panelu.';
comment on column public.loan_applications.business_purpose_declared is
  'Oświadczenie klienta: finansowanie na cel związany z działalnością gospodarczą (B2B). Bez niego wniosek nie przechodzi do wyslany_do_inwestorow.';

-- 1. Mapowanie danych: stare → nowe. Trigger guard jeszcze nie istnieje,
--    trigger historii zapisze wpis (changed_by = null, migracja).
update public.loan_applications set status = 'do_kontaktu' where status = 'kontakt';
update public.loan_applications set status = 'braki_w_dokumentach'
 where status in ('kompletowanie_danych','brak_kw','brak_zdjec_dokumentow','brak_kwoty');
update public.loan_applications set status = 'wyslany_do_inwestorow' where status = 'szukamy_inwestora';
update public.loan_applications set status = 'zaakceptowany_przez_klienta' where status = 'warunki_zaakceptowane';
update public.loan_applications set status = 'do_umowy' where status = 'dokumenty_przygotowanie_umowy';
update public.loan_applications set status = 'oczekuje_ustanowienia_zabezpieczen' where status = 'notariusz';
update public.loan_applications set status = 'zamkniety' where status = 'zamkniete';

-- Wnioski już wysłane do inwestorów przed bramką B2B: oświadczenie uznajemy
-- za złożone historycznie (data migracji), żeby nie blokować obsługi spraw.
update public.loan_applications
   set business_purpose_declared = true,
       business_purpose_declared_at = coalesce(business_purpose_declared_at, now())
 where status in (
   'wyslany_do_inwestorow','oferta_od_inwestora','oferta_przekazana_klientowi',
   'zaakceptowany_przez_klienta','do_umowy','oczekuje_podpisania_umowy','umowa_podpisana',
   'oczekuje_ustanowienia_zabezpieczen','zabezpieczenia_ustanowione',
   'dokumenty_dostarczone_do_inwestora','oczekuje_wyplaty','wyplacony')
   and business_purpose_declared = false;

-- 2. Automat: compute_loan_auto_status — tylko etap kompletowania; nigdy
--    dalej niż wniosek_kompletny, nigdy statusów odrzucających.
create or replace function public.compute_loan_auto_status(_loan_id uuid)
 returns loan_status
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  la public.loan_applications%rowtype;
  ld public.leads%rowtype;
  cl public.clients%rowtype;
  has_first boolean; has_last boolean; has_phone boolean; has_email boolean;
  has_amount boolean; has_kw boolean; has_media boolean;
  cur text;
begin
  select * into la from public.loan_applications where id = _loan_id;
  if not found then return null; end if;

  cur := la.status::text;
  -- Automat działa wyłącznie na etapie kompletowania. Od wniosek_kompletny
  -- wzwyż (analiza, decyzje, dystrybucja, umowa, wypłata) statusem steruje
  -- operator / proces — automat niczego nie cofa ani nie odrzuca.
  if cur not in ('nowy_lead','brak_kontaktu','w_trakcie_uzupelniania','braki_w_dokumentach',
                 'do_kontaktu','w_follow_upie','wniosek_kompletny') then
    return null;
  end if;

  select * into ld from public.leads
   where loan_application_id = _loan_id
   order by created_at desc limit 1;

  if la.client_id is not null then
    select * into cl from public.clients where id = la.client_id;
  end if;

  has_first := coalesce(nullif(btrim(ld.first_name), ''), nullif(btrim(cl.first_name), '')) is not null;
  has_last  := coalesce(nullif(btrim(ld.last_name), ''),  nullif(btrim(cl.last_name), ''))  is not null;
  has_phone := coalesce(nullif(btrim(ld.phone_normalized), ''), nullif(btrim(ld.phone_raw), ''), nullif(btrim(cl.phone), '')) is not null;
  has_email := coalesce(nullif(btrim(ld.email), ''), nullif(btrim(cl.email), '')) is not null;

  has_amount := coalesce(la.loan_amount, 0) > 0
    or coalesce((nullif(btrim(ld.application_data ->> 'loan_amount'), ''))::numeric, 0) > 0;

  has_kw := exists (
      select 1 from public.properties p
       where p.loan_application_id = _loan_id
         and nullif(btrim(p.land_register_number), '') is not null
    )
    or nullif(btrim(ld.kw_number), '') is not null
    or nullif(btrim(ld.application_data ->> 'land_register_number'), '') is not null
    or nullif(btrim(ld.application_data ->> 'kw_number'), '') is not null;

  has_media := exists (
      select 1 from public.properties p
       where p.loan_application_id = _loan_id
         and coalesce(array_length(p.photos, 1), 0) > 0
    )
    or exists (select 1 from public.documents d where d.loan_application_id = _loan_id);

  if not (has_first and has_last and has_phone and has_email) then
    if not (has_first or has_last or has_phone or has_email) then
      return 'nowy_lead'::public.loan_status;
    end if;
    return 'brak_kontaktu'::public.loan_status;
  end if;

  -- Operator ręcznie ustawił do_kontaktu / w_follow_upie — automat nie
  -- cofa tych statusów, dopóki komplet nie jest gotowy.
  if not (has_amount and has_kw and has_media) then
    if cur in ('do_kontaktu','w_follow_upie') then
      return null;
    end if;
    return 'braki_w_dokumentach'::public.loan_status;
  end if;

  return 'wniosek_kompletny'::public.loan_status;
end;
$function$;

-- apply_loan_auto_status: wynik odrzucający (gdyby kiedyś powstał) trafia do
-- propozycji, nigdy do statusu.
create or replace function public.apply_loan_auto_status(_loan_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare new_status public.loan_status;
begin
  if _loan_id is null then return; end if;
  new_status := public.compute_loan_auto_status(_loan_id);
  if new_status is null then return; end if;
  if new_status in ('nie_rokuje','wniosek_odrzucony') then
    update public.loan_applications
       set suggested_status = new_status,
           suggested_status_reason = 'Propozycja automatu (auto-status)',
           suggested_at = now(),
           suggested_by = 'apply_loan_auto_status'
     where id = _loan_id
       and status is distinct from new_status
       and suggested_status is distinct from new_status;
    return;
  end if;
  update public.loan_applications
     set status = new_status
   where id = _loan_id
     and status is distinct from new_status;
end; $fn$;

-- 3. Trigger guard: decyzje odrzucające tylko z ręki operatora; bramka B2B.
create or replace function public.loan_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('nie_rokuje','wniosek_odrzucony') then
      if auth.uid() is null and new.status_decided_by is null then
        raise exception 'Decyzja odrzucająca (%) wymaga kliknięcia operatora — automat może ją tylko zaproponować (suggested_status).', new.status
          using errcode = 'P0001';
      end if;
      if new.status_decided_by is null then
        new.status_decided_by := auth.uid();
      end if;
    end if;
    if new.status = 'wyslany_do_inwestorow' and coalesce(new.business_purpose_declared, false) = false then
      raise exception 'Wniosek nie może trafić do inwestorów bez oświadczenia o celu gospodarczym (business_purpose_declared).'
        using errcode = 'P0001';
    end if;
    -- Zatwierdzona lub odrzucona propozycja automatu przestaje być aktualna.
    if new.suggested_status is not null and new.suggested_status = new.status then
      new.suggested_status := null;
      new.suggested_status_reason := null;
      new.suggested_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_loan_status_guard on public.loan_applications;
create trigger trg_loan_status_guard
  before update of status on public.loan_applications
  for each row execute function public.loan_status_guard();

-- 4. Widoczność dla inwestorów wg nowych statusów.
create or replace function public.sync_available_to_investors()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'wyslany_do_inwestorow' then
    new.available_to_investors := true;
  elsif new.status in ('archiwalny','brak_kontaktu','braki_w_dokumentach','w_trakcie_uzupelniania',
                       'nie_rokuje','wniosek_odrzucony','zamkniety','nowy_lead') then
    new.available_to_investors := false;
  end if;
  return new;
end;
$$;

-- 5. dedup_loan_applications: lista statusów końcowych (nowe kody; stare
--    zostają dla historii).
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'dedup_loan_applications';
  if src is not null and position('''zamkniete'',''zamkniety'',''wniosek_odrzucony''' in src) > 0 then
    execute replace(src,
      '''archiwalny'',''wyplacony'',''zamkniete'',''zamkniety'',''wniosek_odrzucony'',',
      '''archiwalny'',''wyplacony'',''zamkniete'',''zamkniety'',''wniosek_odrzucony'',''nie_rokuje'',');
  end if;
end $$;

revoke execute on function public.loan_status_guard() from public, anon;

notify pgrst, 'reload schema';
