import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const unsubscribeFn = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ s: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data }) => {
    const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: row } = await s
      .from("loan_reminder_email_sends")
      .select("loan_application_id,recipient_email")
      .eq("id", data.s)
      .maybeSingle();
    if (!row?.loan_application_id) return { ok: false };
    await s
      .from("loan_applications")
      .update({
        reminder_email_unsubscribed: true,
        reminder_email_unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", row.loan_application_id);
    return { ok: true, email: row.recipient_email };
  });

export const Route = createFileRoute("/email/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ s: typeof s.s === "string" ? s.s : "" }),
  loaderDeps: ({ search }) => ({ s: search.s }),
  loader: async ({ deps }) => {
    if (!deps.s) return { ok: false as const, email: null };
    const res = await unsubscribeFn({ data: { s: deps.s } });
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
          Wypisaliśmy <strong>{email}</strong> z przypomnień o wniosku. Nie będziemy już wysyłać
          wiadomości. Jeśli to pomyłka — po prostu wróć do wniosku i kontynuuj, automatycznie cię
          ponownie zapiszemy.
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
