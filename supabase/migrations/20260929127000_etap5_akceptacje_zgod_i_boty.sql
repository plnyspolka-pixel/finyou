-- =====================================================================
-- ETAP 5 — AKCEPTACJE ZGÓD v2, KLAUZULA u08, ZASADY OPŁAT W BOTACH
--
-- 1. consent_acceptances: dziennik akceptacji dokumentów z consent_documents
--    (regulamin klienta, polityka prywatności) — wersja, czas, IP, urządzenie.
--    Insert-only (zapis przez server function z rolą serwisową po
--    uwierzytelnieniu). Panel klienta i inwestora wymaga akceptacji
--    aktywnej wersji przy następnym wejściu (ConsentGate).
-- 2. document_templates u08 (klauzula RODO pożyczkodawcy): bez pola
--    „IMIĘ I NAZWISKO IOD” — IOD nie jest wyznaczany; kreator dokumentów
--    wypełnia takie pole wartością „nie wyznaczono”. Plik .docx w Storage
--    wymaga podmiany przez człowieka (raport).
-- 3. text_agent_settings: koszt w prompcie klienta (1,79–4% miesięcznie)
--    przekraczał odsetki maksymalne — zastąpiony zasadami opłat i B2B;
--    dołączony blok „ZASADY OPŁAT I B2B” (idempotentnie).
-- =====================================================================

-- 1. Akceptacje zgód.
create table if not exists public.consent_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind public.consent_kind not null,
  version int not null,
  document_id uuid references public.consent_documents(id),
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  unique (user_id, kind, version)
);
create index if not exists consent_acceptances_user_idx
  on public.consent_acceptances (user_id, accepted_at desc);

comment on table public.consent_acceptances is
  'Akceptacje dokumentów z consent_documents (regulamin klienta, polityka prywatności): wersja, czas, IP, urządzenie. Insert-only; nowa wersja dokumentu = nowa akceptacja.';

alter table public.consent_acceptances enable row level security;

drop policy if exists consent_acceptances_own_read on public.consent_acceptances;
create policy consent_acceptances_own_read on public.consent_acceptances
  for select to authenticated
  using (user_id = auth.uid() or public.is_internal_staff(auth.uid()));

revoke all on public.consent_acceptances from public, anon;
grant select on public.consent_acceptances to authenticated;
grant all on public.consent_acceptances to service_role;

-- 2. Szablon u08 — bez pola IOD.
update public.document_templates
   set placeholders = placeholders - 'IMIĘ I NAZWISKO IOD'
 where slug = 'u08-klauzula-informacyjna-rodo'
   and placeholders ? 'IMIĘ I NAZWISKO IOD';

-- 3. Prompty botów.
-- 3a. Bot klienta (id = 1): koszt zgodny z odsetkami maksymalnymi, cel B2B.
update public.text_agent_settings
   set system_prompt = replace(
         system_prompt,
         $old$Orientacyjny koszt: od około 1,79% do około 3–4% miesięcznie.

Podawaj tę informację wprost, gdy klient pyta o cenę — nie unikaj. Zaznacz, że koszt zależy od LTV i okresu, a dokładną ratę poda analityk po sprawdzeniu materiałów.$old$,
         $new$Oprocentowanie nie przekracza odsetek maksymalnych (obecnie 14,5% w skali roku). Jedyną opłatą dla Finance You jest prowizja 7% kwoty pożyczki, nie mniej niż 5 000 zł, bez VAT, potrącana z wypłaty (przykład: 100 000 zł → 7 000 zł prowizji, 93 000 zł na konto). Inwestor może mieć własną prowizję rozłożoną w ratach — pełny koszt klient zobaczy w ofercie.

Podawaj te informacje wprost, gdy klient pyta o cenę — nie unikaj. Nie podawaj stawek miesięcznych. Dokładną ratę poda analityk po sprawdzeniu materiałów.$new$),
       updated_at = now()
 where id = 1;

update public.text_agent_settings
   set system_prompt = replace(
         system_prompt,
         $old$cel pożyczki może być dowolny, zapisz go jako `purpose`.$old$,
         $new$cel pożyczki musi być związany z działalnością gospodarczą (sekcja „ZASADY OPŁAT I B2B”); zapisz go jako `purpose`.$new$),
       updated_at = now()
 where id = 1;

update public.text_agent_settings
   set system_prompt = system_prompt || $blk$


## ZASADY OPŁAT I B2B (nadrzędne wobec innych sekcji)

- Finansujemy wyłącznie cel związany z działalnością gospodarczą (B2B). Zapytaj naturalnie o cel pożyczki i o to, czy klient prowadzi działalność (NIP) albo reprezentuje firmę. Cel konsumpcyjny albo prywatne potrzeby mieszkaniowe → grzecznie wyjaśnij, że w tym nie pomożemy, nie zbieraj dalszych danych i nie wysyłaj linku.
- Jedyna opłata dla Finance You: prowizja 7% kwoty pożyczki, nie mniej niż 5 000 zł, bez VAT, potrącana z wypłaty. Przykład: 100 000 zł → 7 000 zł prowizji, 93 000 zł trafia na konto klienta. Nigdy nie mów „netto” ani „brutto”.
- Oprocentowanie nie przekracza odsetek maksymalnych (obecnie 14,5% w skali roku). Nie podawaj stawek miesięcznych.
- O odrzuceniu wniosku decyduje wyłącznie pracownik Finance You. Nigdy nie informuj klienta, że wniosek jest odrzucony albo „nie rokuje”.
$blk$,
       updated_at = now()
 where id = 1
   and position('ZASADY OPŁAT I B2B' in system_prompt) = 0;

-- 3b. Boty inwestorskie (id = 2, 3), jeżeli istnieją.
update public.text_agent_settings
   set system_prompt = system_prompt || $blk$


## ZASADY OPŁAT I B2B (nadrzędne wobec innych sekcji)

- Inwestor nie płaci Finance You żadnych opłat: nie ma abonamentu, pakietu PRO, opłaty za udostępnienie projektu ani opłaty sukcesu. Nie wspominaj o takich opłatach.
- Jedyną opłatą w transakcji jest prowizja Finance You płacona przez klienta: 7% kwoty udzielonej, nie mniej niż 5 000 zł, bez VAT, potrącana z wypłaty. Inwestor przekazuje ją Finance You z kwoty pożyczki, a resztę wypłaca klientowi (przykład: 100 000 zł → 7 000 zł dla Finance You, 93 000 zł dla klienta).
- Finansowanie wyłącznie na cel związany z działalnością gospodarczą klienta (B2B). Oprocentowanie nie może przekroczyć odsetek maksymalnych (obecnie 14,5% w skali roku); prowizja inwestora jest osobnym polem, rozłożonym w ratach. LTV maksymalnie 60%.
- Projekty są widoczne tylko w ramach przyjętego Zlecenia; limity: 5 aktywnych Zleceń, rezerwacja 24 h + 12 h, maksymalnie 2 przedłużone rezerwacje, Zlecenie wygasa po 5 odrzuceniach. Okres ochronny: 5 lat.
$blk$,
       updated_at = now()
 where id in (2, 3)
   and length(btrim(system_prompt)) > 0
   and position('ZASADY OPŁAT I B2B' in system_prompt) = 0;

notify pgrst, 'reload schema';
