// Generuje świeży magic link dla klienta (rola: klient).
// Używane w follow-upach – każdy link ważny ~1h, więc generujemy tuż przed wysyłką.

export async function ensureKlientAccountAndMagicLink(
  email: string,
  meta: { firstName?: string | null; lastName?: string | null; source?: string } = {},
): Promise<{ userId: string | null; magicLink: string | null; created: boolean; error?: string }> {
  if (!email) return { userId: null, magicLink: null, created: false, error: "no email" };
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
      },
    });
    if (createRes?.user?.id) {
      userId = createRes.user.id;
      created = true;
    } else if (createErr && !String(createErr.message ?? "").toLowerCase().includes("registered")) {
      return { userId: null, magicLink: null, created: false, error: createErr.message };
    }
  } catch (e: any) {
    return { userId: null, magicLink: null, created: false, error: e?.message ?? String(e) };
  }

  if (!userId) {
    // user już istnieje — znajdź
    let page = 1;
    while (page <= 20 && !userId) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      const found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
      if (found) { userId = found.id; break; }
      if (!list?.users?.length || list.users.length < 200) break;
      page++;
    }
  }

  if (userId) {
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role: "klient" as any },
      { onConflict: "user_id,role" },
    );
  }

  let magicLink: string | null = null;
  try {
    const { data: linkRes, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: "https://financeyou.pl/klient" },
    });
    if (!linkErr) magicLink = (linkRes?.properties as any)?.action_link ?? null;
  } catch { /* noop */ }

  return { userId, magicLink, created };
}
