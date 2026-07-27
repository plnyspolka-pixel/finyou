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

  let userId: string | null = null;
  let created = false;
  try {
    const { data: createRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: meta.firstName ?? null,
        last_name: meta.lastName ?? null,
        source: meta.source ?? "meta_lead",
        intended_role: role,
      },
    });
    if (createRes?.user?.id) {
      userId = createRes.user.id;
      created = true;
    } else if (
      createErr &&
      !String(createErr.message ?? "")
        .toLowerCase()
        .includes("registered")
    ) {
      return { userId: null, magicLink: null, created: false, role, error: createErr.message };
    }
  } catch (e: any) {
    return { userId: null, magicLink: null, created: false, role, error: e?.message ?? String(e) };
  }

  if (!userId) {
    let page = 1;
    while (page <= 20 && !userId) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      const found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
      if (found) {
        userId = found.id;
        break;
      }
      if (!list?.users?.length || list.users.length < 200) break;
      page++;
    }
  }

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

  return { userId, magicLink, created, role };
}
