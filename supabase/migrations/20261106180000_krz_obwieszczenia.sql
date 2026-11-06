-- PoC: obwieszczenia z tablicy Krajowego Rejestru Zadłużonych (krz.ms.gov.pl)
-- pobierane lokalnym skryptem `scripts/krz-tablica.ts` i analizowane przez AI.
--
-- Dane osobowe: tabela przechowuje imię/nazwisko dłużników-konsumentów
-- (publiczne w KRZ), ale NIGDY PESEL — parser go pomija, a treść jest
-- maskowana. Zapis wyłącznie przez service role; klienci nie mają dostępu.
-- Retencja: wiersze osób fizycznych nieprowadzących działalności są usuwane
-- po 90 dniach funkcją `krz_obwieszczenia_prune()`.
create table if not exists public.krz_obwieszczenia (
  id_zewnetrzny uuid primary key,
  numer_obwieszczenia text not null,
  data_obwieszczenia date not null,
  rodzaj_sprawy text not null check (rodzaj_sprawy in ('U','R','Z')),
  grupa text not null,
  kategoria text not null,
  podkategoria text not null,
  sygnatura text,
  sad text,
  wydzial text,
  podmiot_rodzaj text not null check (podmiot_rodzaj in ('osoba_fizyczna','podmiot','nieznany')),
  podmiot_nazwa text,
  podmiot_krs text,
  podmiot_nip text,
  podmiot_miejscowosc text,
  prowadzi_dzialalnosc boolean,
  tresc text,
  szczegoly jsonb not null,
  pobrano_at timestamptz not null default now(),
  analiza jsonb,
  analiza_model text,
  analiza_at timestamptz,
  analiza_blad text
);

create index if not exists krz_obwieszczenia_data_idx on public.krz_obwieszczenia (data_obwieszczenia desc);
create index if not exists krz_obwieszczenia_krs_idx on public.krz_obwieszczenia (podmiot_krs) where podmiot_krs is not null;
create index if not exists krz_obwieszczenia_nip_idx on public.krz_obwieszczenia (podmiot_nip) where podmiot_nip is not null;
create index if not exists krz_obwieszczenia_do_analizy_idx on public.krz_obwieszczenia (pobrano_at) where analiza is null and analiza_blad is null;

alter table public.krz_obwieszczenia enable row level security;
-- Brak polityk: tylko service role (skrypt, server functions) czyta i pisze.

create or replace function public.krz_obwieszczenia_prune()
returns integer
language sql
security definer
set search_path = public
as $$
  with del as (
    delete from public.krz_obwieszczenia
    where podmiot_rodzaj = 'osoba_fizyczna'
      and coalesce(prowadzi_dzialalnosc, false) = false
      and data_obwieszczenia < current_date - interval '90 days'
    returning 1
  )
  select count(*)::integer from del;
$$;

revoke all on function public.krz_obwieszczenia_prune() from public, anon, authenticated;
