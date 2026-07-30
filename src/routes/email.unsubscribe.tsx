import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// Wypis z przypomnień mailowych. Dwa źródła linków:
//   ?s=<loan_reminder_email_sends.id>       — drip 120 szablonów
//   ?m=<missing_info_follow_up_sends.id>    — follow-up braków
// Oba ustawiają tę samą flagę loan_applications.reminder_email_unsubscribed,
// którą respektują wszystkie silniki mailowe.
const unsubscribeFn = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        s: z.string().max(200).optional().default(""),
        m: z.string().max(200).optional().default(""),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let loanId: string | null = null;
    let email: string | null = null;
    if (data.s) {
      const { data: row } = await s
        .from("loan_reminder_email_sends")
        .select("loan_application_id,recipient_email")
        .eq("id", data.s)
        .maybeSingle();
      loanId = row?.loan_application_id ?? null;
      email = (row as any)?.recipient_email ?? null;
    } else if (data.m) {
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
    if (!loanId) return { ok: false };
    await s
      .from("loan_applications")
      .update({
        reminder_email_unsubscribed: true,
        reminder_email_unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", loanId);
    return { ok: true, email };
  });

export const Route = createFileRoute("/email/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({
    s: typeof s.s === "string" ? s.s : "",
    m: typeof s.m === "string" ? s.m : "",
  }),
  loaderDeps: ({ search }) => ({ s: search.s, m: search.m }),
  loader: async ({ deps }) => {
    if (!deps.s && !deps.m) return { ok: false as const, email: null };
    const res = await unsubscribeFn({ data: { s: deps.s, m: deps.m } });
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
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Finance You — przypomnienia mailowe</h1>
      {ok ? (
        <p>
          Wypisaliśmy {email ? <strong>{email}</strong> : "Twój adres"} z przypomnień o wniosku. Nie
          będziemy już wysyłać wiadomości. Jeśli to pomyłka — po prostu wróć do wniosku i kontynuuj,
          automatycznie cię ponownie zapiszemy.
        </p>
      ) : (
        <p>
          Nie udało się zidentyfikować adresu. Link mógł wygasnąć — napisz na kontakt@financeyou.pl,
          a wypiszemy cię ręcznie.
        </p>
      )}
    </div>
  );
}
