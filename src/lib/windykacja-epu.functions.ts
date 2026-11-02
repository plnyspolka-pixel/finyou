import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInvestorPro } from "@/lib/investor-plan/pro-middleware";

/**
 * Ręczna ścieżka EPU: wierzyciel sam składa, podpisuje i opłaca pozew
 * na e-sad.gov.pl, a Finance You tylko dokumentuje zgłoszone przez niego kroki.
 * Bez API e-Sądu; nie oznaczamy statusów jako zweryfikowanych w sądzie.
 */
export const EPU_STATUS_LABELS = {
  prepared: "Przygotowano dane pozwu",
  filed: "Wierzyciel zgłosił wniesienie pozwu",
  order: "Wierzyciel zgłosił wydanie nakazu zapłaty",
  served: "Wierzyciel zgłosił doręczenie",
  objection: "Wierzyciel zgłosił sprzeciw pozwanego",
  final: "Wierzyciel zgłosił prawomocność",
  discontinued: "Wierzyciel zgłosił umorzenie postępowania",
  enforcement: "Wierzyciel zgłosił skierowanie do egzekucji",
  other: "Inna aktualizacja z e-Sądu",
} as const;

const eventInput = z.object({
  caseId: z.string().uuid(),
  status: z.enum([
    "prepared", "filed", "order", "served", "objection",
    "final", "discontinued", "enforcement", "other",
  ]),
  sygnatura: z.string().trim().max(120).optional().nullable(),
  occurredOn: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  note: z.string().trim().max(6000).optional().nullable(),
  attachmentPath: z.string().trim().max(650).optional().nullable(),
  claimSummary: z.string().trim().max(15000).optional().nullable(),
});

export const recordWindEpuEvent = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((input: unknown) => eventInput.parse(input))
  .handler(async ({ data, context }) => {
    const { warsawToday } = await import("@/lib/windykacja-recalc");
    if (data.occurredOn > warsawToday()) {
      throw new Error("Data zdarzenia nie może być w przyszłości.");
    }
    if (data.status === "prepared" && !data.claimSummary?.trim()) {
      throw new Error("Uzupełnij dane pozwu przed zapisaniem szkicu.");
    }
    if (data.attachmentPath) {
      const prefix = `windykacja/${context.userId}/${data.caseId}/epu/`;
      if (!data.attachmentPath.startsWith(prefix)) {
        throw new Error("Niedozwolona ścieżka załącznika.");
      }
    }

    // Supabase RLS ogranicza zakres do sprawy wierzyciela (lub uprawnionego personelu).
    const db = context.supabase as unknown as { from: (table: string) => any };
    const { data: kase, error: checkError } = await db
      .from("wind_collection_cases")
      .select("id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (checkError) throw new Error(checkError.message);
    if (!kase) throw new Error("Sprawa nie istnieje albo nie masz do niej dostępu.");

    const title = EPU_STATUS_LABELS[data.status];
    const { data: event, error } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "czynnosc_sadowa",
        kategoria: "manualne",
        tytul: `EPU — ${title}`,
        tresc: data.note || (data.status === "prepared" ? "Szkic danych do formularza EPU." : null),
        data_zdarzenia: `${data.occurredOn}T12:00:00.000Z`,
        zalacznik_url: data.attachmentPath || null,
        metadata: {
          epu: true,
          epu_status: data.status,
          epu_sygnatura: data.sygnatura || null,
          epu_claim_summary: data.status === "prepared" ? data.claimSummary : null,
          source: "creditor_manual",
          court_verified: false,
        },
        oplata: 0,
        autor: context.claims?.email ?? null,
      })
      .select("id, case_id, typ, kategoria, tytul, tresc, data_zdarzenia, data_doreczenia, status_doreczenia, zalacznik_url, metadata, oplata, autor, created_at")
      .single();
    if (error) throw new Error(error.message);
    return event;
  });
