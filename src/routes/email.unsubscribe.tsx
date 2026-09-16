import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { applyOptOut } from "@/lib/email-unsubscribe.server";

// Wypis z korespondencji mailowej. Trzy źródła linków:
//   ?t=<email_unsubscribe_tokens.token>    — stopka KAŻDEGO maila (trwały token)
//   ?s=<loan_reminder_email_sends.id>      — drip 120 szablonów
//   ?m=<missing_info_follow_up_sends.id>   — follow-up braków
// Każdy z nich kończy się tym samym: adres ląduje na liście blokad
// (applyOptOut), więc milkną wszystkie silniki — kampanie, przypomnienia,
// follow-upy i auto-odpowiedzi.
const unsubscribeFn = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        t: z.string().max(200).optional().default(""),
        s: z.string().max(200).optional().default(""),
        m: z.string().max(200).optional().default(""),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let loanId: string | null = null;
    let email: string | null = null;
    let source = "footer_link";

    if (data.t) {
      const { data: row } = await s
        .from("email_unsubscribe_tokens")
        .select("email")
        .eq("token", data.t)
        .maybeSingle();
      email = row?.email ?? null;
    } else if (data.s) {
      source = "reminder_link";
      const { data: row } = await s
        .from("loan_reminder_email_sends")
        .select("loan_application_id,recipient_email")
        .eq("id", data.s)
        .maybeSingle();
      loanId = row?.loan_application_id ?? null;
      email = (row as any)?.recipient_email ?? null;
    } else if (data.m) {
      source = "follow_up_link";
      const { data: row } = await (s as any)
        .from("missing_info_follow_up_sends")
        .select("loan_application_id")
        .eq("id", data.m)
        .maybeSingle();
      loanId = row?.loan_application_id ?? null;
      if (loanId) {
        const { data: loan } = await s
          .from("loan_applications")
          .select("client:clients(email)")
          .eq("id", loanId)
          .maybeSingle();
        email = (loan as any)?.client?.email ?? null;
      }
    }

    // Wypis po stronie wniosku działa nawet wtedy, gdy nie znamy adresu
    // (stare linki bez recipient_email).
    if (loanId) {
      await s
        .from("loan_applications")
        .update({
          reminder_email_unsubscribed: true,
          reminder_email_unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", loanId);
    }

    if (email) {
      await applyOptOut({ email, source, signal: "link", strength: "soft" });
      return { ok: true, email };
    }
    return { ok: !!loanId, email: null };
  });

export const Route = createFileRoute("/email/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : "",
    s: typeof s.s === "string" ? s.s : "",
    m: typeof s.m === "string" ? s.m : "",
  }),
  loaderDeps: ({ search }) => ({ t: search.t, s: search.s, m: search.m }),
  loader: async ({ deps }) => {
    if (!deps.t && !deps.s && !deps.m) return { ok: false as const, email: null };
    const res = await unsubscribeFn({ data: { t: deps.t, s: deps.s, m: deps.m } });
    return { ok: !!res.ok, email: (res as any).email ?? null };
  },
  component: UnsubPage,
});

function UnsubPage() {
  const { ok, email } = Route.useLoaderData();
  return (
    <div
      style={{
        maxWidth: 560,
        margin: "80px auto",
        padding: 24,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Finance You — wypis z wiadomości</h1>
      {ok ? (
        <>
          <p>
            Gotowe. Wypisaliśmy {email ? <strong>{email}</strong> : "Twój adres"} z wiadomości
            marketingowych, przypomnień i automatycznych follow-upów. Od tej chwili nic już nie
            wyślemy.
          </p>
          <p style={{ color: "#555", fontSize: 14 }}>
            Wyjątkiem są wiadomości wynikające z zawartej umowy (np. harmonogram spłat czy dokumenty
            do podpisu) — jeśli i ich sobie nie życzysz, napisz na{" "}
            <a href="mailto:kontakt@financeyou.pl">kontakt@financeyou.pl</a>.
          </p>
        </>
      ) : (
        <p>
          Nie udało się zidentyfikować adresu. Link mógł wygasnąć — napisz na kontakt@financeyou.pl
          (wystarczy „wypisz mnie"), a wypiszemy cię od ręki.
        </p>
      )}
    </div>
  );
}
