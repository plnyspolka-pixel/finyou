// Generuje świeże konto + magic link dla leada w wybranej kategorii (klient / operator / inwestor).
// Używane w follow-upach – każdy link ważny ~1h, więc generujemy tuż przed wysyłką.

type Role = "klient" | "operator" | "inwestor" | "administrator";

const ROLE_REDIRECT: Record<Role, string> = {
  klient: "https://financeyou.pl/klient",
  operator: "https://financeyou.pl/posrednik",
  inwestor: "https://financeyou.pl/inwestor",
  administrator: "https://financeyou.pl/admin",
};

export async function ensureKlientAccountAndMagicLink(
  email: string,
  meta: {
    firstName?: string | null;
    lastName?: string | null;
    source?: string;
    role?: Role;
  } = {},
): Promise<{
  userId: string | null;
  magicLink: string | null;
  created: boolean;
  role: Role;
  error?: string;
}> {
  const role: Role = meta.role ?? "klient";
  if (!email) return { userId: null, magicLink: null, created: false, role, error: "no email" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Uwaga: konto dla tego adresu może już istnieć. `ensureAuthUser` sam to
  // rozpoznaje — również wtedy, gdy GoTrue zamiast „already registered" zwróci
  // 500 `unexpected_failure` z naruszeniem unikalności `users_email_partial_key`.
  const { ensureAuthUser } = await import("@/lib/auth-users.server");
  const ensured = await ensureAuthUser({
    email,
    userMetadata: {
      first_name: meta.firstName ?? null,
      last_name: meta.lastName ?? null,
      source: meta.source ?? "meta_lead",
      intended_role: role,
    },
  });
  const userId: string | null = ensured.userId;
  const created = ensured.created;

  if (userId) {
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: role as any }, { onConflict: "user_id,role" });

    // Inwestor → załóż także rekord w investors (jeśli brak)
    if (role === "inwestor") {
      const { data: existingInv } = await supabaseAdmin
        .from("investors")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!existingInv) {
        await supabaseAdmin.from("investors").insert({
          user_id: userId,
          email,
          first_name: meta.firstName ?? null,
          last_name: meta.lastName ?? null,
          investor_type: "indywidualny" as any,
        });
      }
    }
  }

  let magicLink: string | null = null;
  try {
    const { data: linkRes, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: ROLE_REDIRECT[role] },
    });
    if (!linkErr) magicLink = (linkRes?.properties as any)?.action_link ?? null;
  } catch {
    /* noop */
  }

  // `generateLink` działa po adresie, więc potrafi się udać nawet wtedy, gdy
  // nie rozpoznaliśmy konta (np. baza większa niż limit stron w wyszukiwaniu).
  // Błąd zgłaszamy dopiero, gdy nie mamy ani konta, ani linku.
  if (!userId && !magicLink) {
    return { userId: null, magicLink: null, created: false, role, error: ensured.error };
  }

  return { userId, magicLink, created, role };
}
