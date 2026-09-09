-- Wątki pytań instytucja ↔ klient: rozdzielenie znaczników czasu, ślad po
-- nieudanych wysyłkach i pytania kierowane do biura.
--
-- Dotąd `last_client_message_at` pełniło DWIE role naraz: limit „raz na dobę"
-- i granicę czytania odpowiedzi klienta. Wysyłka nowej paczki pytań
-- przesuwała tę granicę i kasowała nieprzekazaną jeszcze odpowiedź klienta.
-- Rozdzielamy je na `last_sent_to_client_at` (limit) i `answers_read_until`
-- (granica czytania odpowiedzi, przesuwana wyłącznie po przetworzeniu).

alter table public.institution_qa_threads
  add column if not exists last_sent_to_client_at timestamptz,
  add column if not exists answers_read_until timestamptz,
  add column if not exists blocked_reason text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists client_lead_id uuid,
  -- [{text, key, from: [...], distribution_ids: [...], created_at, handled_at}]
  add column if not exists office_questions jsonb not null default '[]'::jsonb,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid;

-- Backfill: dotychczasowa kolumna niosła obie role naraz.
update public.institution_qa_threads
   set last_sent_to_client_at = coalesce(last_sent_to_client_at, last_client_message_at),
       answers_read_until = coalesce(answers_read_until, last_client_message_at)
 where last_client_message_at is not null;

comment on column public.institution_qa_threads.last_client_message_at is
  'Historyczne. Utrzymywane jako kopia last_sent_to_client_at — logika używa nowych kolumn.';
comment on column public.institution_qa_threads.blocked_reason is
  'Powód, dla którego pytania nie poszły do klienta (brak leada, brak kanału, błąd wysyłki). NULL = brak blokady.';

create index if not exists institution_qa_threads_status_idx
  on public.institution_qa_threads (status, created_at desc);
