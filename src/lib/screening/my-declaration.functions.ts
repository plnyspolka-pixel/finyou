// Oświadczenie PEP składane z panelu zalogowanego klienta lub inwestora
// (np. wniosek założony przez pośrednika, rejestracja inwestora).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PepDeclarationInput } from "./declaration";

const Audience = z.enum(["client", "investor"]);

async function resolveSubject(
  userId: string,
  audience: "client" | "investor",
): Promise<{ id: string; loanApplicationId: string | null } | null> {
  const { sdb } = await import("./db.server");
  if (audience === "investor") {
    const { data } = await sdb
      .from("investors")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { id: data.id, loanApplicationId: null } : null;
  }
  const { data: client } = await sdb
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!client) return null;
  const { data: loan } = await sdb
    .from("loan_applications")
    .select("id")
    .eq("client_id", client.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { id: client.id, loanApplicationId: loan?.id ?? null };
}

export const getMyPepDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ audience: Audience }).parse(d))
  .handler(async ({ data, context }) => {
    const subject = await resolveSubject(context.userId, data.audience);
    if (!subject) return { hasSubject: false as const, latest: null };
    const { sdb } = await import("./db.server");
    const { data: latest } = await sdb
      .from("pep_declarations")
      .select("signed_at, declaration_text_version, any_yes")
      .eq("subject_type", data.audience)
      .eq("subject_id", subject.id)
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      hasSubject: true as const,
      latest: latest as {
        signed_at: string;
        declaration_text_version: string;
        any_yes: boolean;
      } | null,
    };
  });

export const submitMyPepDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ audience: Audience, declaration: PepDeclarationInput }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const subject = await resolveSubject(context.userId, data.audience);
    if (!subject)
      throw new Error(
        data.audience === "client"
          ? "Nie znaleziono profilu klienta."
          : "Nie znaleziono profilu inwestora.",
      );
    const { recordPepDeclaration, requestMeta } = await import("./declaration.server");
    const meta = requestMeta(getRequest());
    const r = await recordPepDeclaration({
      subjectType: data.audience,
      subjectId: subject.id,
      loanApplicationId: subject.loanApplicationId,
      value: data.declaration,
      ip: meta.ip,
      userAgent: meta.userAgent,
      userId: context.userId,
      channel: data.audience === "client" ? "client_panel" : "investor_pipeline",
    });
    return { ok: true as const, id: r.id };
  });
