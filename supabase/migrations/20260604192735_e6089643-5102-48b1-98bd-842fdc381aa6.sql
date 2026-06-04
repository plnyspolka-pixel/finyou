
create extension if not exists vector;

CREATE TABLE public.text_agent_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_agent_knowledge TO authenticated;
GRANT ALL ON public.text_agent_knowledge TO service_role;

ALTER TABLE public.text_agent_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage knowledge" ON public.text_agent_knowledge
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE INDEX text_agent_knowledge_embedding_idx
  ON public.text_agent_knowledge USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER text_agent_knowledge_set_updated_at
  BEFORE UPDATE ON public.text_agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.match_text_agent_knowledge(
  query_embedding vector(1536),
  match_count int DEFAULT 5
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
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_text_agent_knowledge(vector, int) TO authenticated, service_role;
