/**
 * Akceptacja aktywnych wersji regulaminu klienta i polityki prywatności
 * (consent_documents → consent_acceptances). Po publikacji nowej wersji
 * użytkownik akceptuje ją przy następnym wejściu do panelu (ConsentGate).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pendingConsents, type ConsentAudience } from "./consent-core";

const loose = (c: unknown) => c as any;
const AudienceSchema = z.object({ audience: z.enum(["klient", "inwestor"]) });

async function loadState(userId: string, audience: ConsentAudience) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: staff } = await loose(supabaseAdmin).rpc("is_internal_staff", {
    _user_id: userId,
  });
  if (staff === true) return { pending: [], staff: true };
  const [{ data: docs, error: e1 }, { data: acc, error: e2 }] = await Promise.all([
    loose(supabaseAdmin)
      .from("consent_documents")
      .select("id, kind, version, title")
      .eq("is_active", true),
    loose(supabaseAdmin).from("consent_acceptances").select("kind, version").eq("user_id", userId),
  ]);
  if (e1) throw new Error(e1.message);
  // Brak tabeli (migracja jeszcze nie wdrożona) nie może blokować panelu.
  if (e2) return { pending: [], staff: false };
  return { pending: pendingConsents(audience, docs ?? [], acc ?? []), staff: false };
}

export const getMyConsentState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AudienceSchema.parse(d))
  .handler(async ({ data, context }) => loadState(context.userId, data.audience));

export const acceptConsents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    AudienceSchema.extend({
      documentIds: z.array(z.string().uuid()).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { pending } = await loadState(userId, data.audience);
    // Akceptujemy wyłącznie to, co jest aktualnie wymagane — każdy dokument
    // musiał zostać zaznaczony osobno (checkboxy startują puste).
    const missing = pending.filter((p) => !data.documentIds.includes(p.id));
    if (missing.length > 0) {
      throw new Error(`Zaakceptuj: ${missing.map((m) => m.title).join(", ")}.`);
    }
    if (pending.length === 0) return { ok: true, accepted: 0 };

    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = request?.headers.get("user-agent") ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await loose(supabaseAdmin)
      .from("consent_acceptances")
      .upsert(
        pending.map((p) => ({
          user_id: userId,
          kind: p.kind,
          version: p.version,
          document_id: p.id,
          ip,
          user_agent: userAgent,
        })),
        { onConflict: "user_id,kind,version", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return { ok: true, accepted: pending.length };
  });
