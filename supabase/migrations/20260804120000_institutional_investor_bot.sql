-- Bot dla inwestorów instytucjonalnych: drugi wariant agenta tekstowego.
-- id=1 → wariant "klient" (pożyczkobiorcy), id=2 → wariant "inwestor"
-- (inwestorzy instytucjonalni). Baza wiedzy RAG dostaje kolumnę audience,
-- żeby bot inwestorski nie odpowiadał fragmentami FAQ pożyczkobiorców.

-- 1) text_agent_settings: zamiast singletona dopuszczamy dwa wiersze.
ALTER TABLE public.text_agent_settings
  DROP CONSTRAINT IF EXISTS text_agent_settings_id_check;
ALTER TABLE public.text_agent_settings
  ADD CONSTRAINT text_agent_settings_id_check CHECK (id IN (1, 2));

INSERT INTO public.text_agent_settings (id, system_prompt)
VALUES (2, '')
ON CONFLICT DO NOTHING;

-- 2) Baza wiedzy: audience per wpis.
--    'klient'  — tylko bot pożyczkobiorców,
--    'inwestor' — tylko bot inwestorów instytucjonalnych,
--    'wspolna' — oba boty.
ALTER TABLE public.text_agent_knowledge
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'klient'
  CHECK (audience IN ('klient', 'inwestor', 'wspolna'));

-- 3) Retrieval z filtrem audience. NULL = bez filtra (zachowanie jak dotąd).
--    DROP + CREATE zamiast CREATE OR REPLACE, żeby nie zostawić dwóch
--    przeciążeń, między którymi PostgREST nie umiałby wybrać.
DROP FUNCTION IF EXISTS public.match_text_agent_knowledge(vector, int);

CREATE FUNCTION public.match_text_agent_knowledge(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  filter_audience text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  similarity float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.id, k.title, k.content, 1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.text_agent_knowledge k
  WHERE k.embedding IS NOT NULL
    AND (filter_audience IS NULL OR k.audience = filter_audience OR k.audience = 'wspolna')
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_text_agent_knowledge(vector, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_text_agent_knowledge(vector, int, text) TO authenticated, service_role;
