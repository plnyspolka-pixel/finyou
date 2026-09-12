-- Indeks pod skrzynki Messengera i czatu — koniec ze `statement timeout`.
--
-- Objaw: seria „canceling statement due to statement timeout" w logach Postgresa
-- i 57014 z PostgREST, a w ślad za tym 504 na POST /token (baza pod obciążeniem,
-- logowanie się nie wyrabia).
--
-- Przyczyna: obie skrzynki (`messenger-inbox`, `chat-inbox`) odpytują
-- `lead_communications` co 15 sekund zapytaniem
--   WHERE channel = ... ORDER BY created_at DESC LIMIT 2000
-- a jedyny pasujący indeks to `idx_leadcomm_channel(channel)` — bez `created_at`.
-- Planner musiał więc wyciągnąć WSZYSTKIE wiersze danego kanału i posortować je
-- w całości, żeby oddać 2000 najnowszych. Przy rosnącej tabeli koszt rośnie
-- liniowo, aż zapytanie przestaje się mieścić w limicie czasu.
--
-- Indeks złożony pozwala zejść po indeksie i przerwać po 2000 wierszach —
-- koszt przestaje zależeć od rozmiaru tabeli.

CREATE INDEX IF NOT EXISTS idx_leadcomm_channel_created
  ON public.lead_communications (channel, created_at DESC);

-- `idx_leadcomm_channel(channel)` jest teraz prefiksem powyższego, więc tylko
-- dokłada pracy przy każdym INSERT/UPDATE, nic nie wnosząc do odczytów.
DROP INDEX IF EXISTS public.idx_leadcomm_channel;

ANALYZE public.lead_communications;
