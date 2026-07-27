// Helpers RAG dla agenta DM: embedding przez Lovable AI Gateway + retrieval z pgvector.
import { createClient } from "@supabase/supabase-js";

const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function embedText(input: string): Promise<number[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: input.slice(0, 8000) }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`embed ${res.status}: ${t.slice(0, 200)}`);
  }
  const json: any = await res.json();
  return json?.data?.[0]?.embedding ?? [];
}

export async function retrieveKnowledge(
  query: string,
  k = 4,
): Promise<Array<{ title: string; content: string; similarity: number }>> {
  try {
    const s = admin();
    // sprawdź czy mamy w ogóle jakieś wiedzowe wpisy z embeddingami
    const { count } = await s
      .from("text_agent_knowledge")
      .select("id", { count: "exact", head: true })
      .not("embedding", "is", null);
    if (!count || count === 0) return [];

    const emb = await embedText(query);
    if (emb.length === 0) return [];
    const { data, error } = await s.rpc("match_text_agent_knowledge", {
      query_embedding: emb as any,
      match_count: k,
    });
    if (error) {
      console.error("[rag] match error", error);
      return [];
    }
    return (data ?? []).filter((r: any) => r.similarity > 0.5);
  } catch (e) {
    console.error("[rag] retrieve failed", e);
    return [];
  }
}
