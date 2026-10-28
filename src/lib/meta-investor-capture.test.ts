import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tryb „tylko mailing” formularza inwestorskiego: bez SMS-a i telefonu,
 * lead z e-mailem ląduje na liście mailingowej z tagami formularza.
 */

type Wiersz = Record<string, unknown>;

const wstawione: Record<string, Wiersz[]> = {};
const zmienione: Record<string, Wiersz[]> = {};
let subskrybent: Wiersz | null = null;

function zapytanie(tabela: string) {
  const q: any = {
    select: () => q,
    eq: () => q,
    limit: async () => ({ data: [] }),
    maybeSingle: async () => ({ data: tabela === "email_subscribers" ? subskrybent : null }),
    single: async () => ({ data: { id: `${tabela}-1` } }),
    upsert: () => q,
    update: (patch: Wiersz) => {
      (zmienione[tabela] ??= []).push(patch);
      return q;
    },
    insert: async (rows: Wiersz) => {
      (wstawione[tabela] ??= []).push(rows);
      return { error: null };
    },
  };
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => zapytanie(t) },
}));

const sendSmsInternal = vi.fn(async () => ({ ok: true }));
const placeOutboundCallInternal = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/voicebot.functions", () => ({ sendSmsInternal, placeOutboundCallInternal }));

vi.mock("@/lib/lead-comms.server", () => ({
  findLeadId: async () => null,
  upsertLeadFromSource: async () => "lead-1",
}));

const pola = [
  { name: "full_name", values: ["Jan Kowalski"] },
  { name: "email", values: ["Jan@Example.pl"] },
  { name: "phone_number", values: ["+48 600 100 200"] },
];

beforeEach(() => {
  for (const k of Object.keys(wstawione)) delete wstawione[k];
  for (const k of Object.keys(zmienione)) delete zmienione[k];
  subskrybent = null;
  sendSmsInternal.mockClear();
  placeOutboundCallInternal.mockClear();
});

describe("captureMetaInvestorLead — tryb tylko mailing", () => {
  it("nie wysyła SMS-a ani nie dzwoni, zapisuje na listę z tagami", async () => {
    const { captureMetaInvestorLead } = await import("./meta-investor-capture.server");
    const r = await captureMetaInvestorLead({
      leadgenId: "lg-1",
      formId: "2072198913500017",
      campaignId: "c-1",
      createdTime: null,
      fieldData: pola,
      allowCall: false,
      allowSms: false,
      subscriberTags: ["inwestor", "meta-do-cc-2"],
    });
    expect(sendSmsInternal).not.toHaveBeenCalled();
    expect(placeOutboundCallInternal).not.toHaveBeenCalled();
    expect(r.subscribed).toBe(true);
    const sub = wstawione.email_subscribers?.[0];
    expect(sub).toMatchObject({
      email: "jan@example.pl",
      source: "meta_lead_form",
      source_id: "2072198913500017",
      tags: ["inwestor", "meta-do-cc-2"],
      status: "active",
    });
  });

  it("istniejącemu subskrybentowi dopina tagi bez zmiany statusu", async () => {
    subskrybent = { id: "s-1", tags: ["inwestor", "stary"], first_name: null, last_name: null };
    const { captureMetaInvestorLead } = await import("./meta-investor-capture.server");
    await captureMetaInvestorLead({
      leadgenId: "lg-2",
      formId: "f",
      campaignId: null,
      createdTime: null,
      fieldData: pola,
      allowCall: false,
      allowSms: false,
      subscriberTags: ["inwestor", "meta-do-cc-2"],
    });
    const patch = zmienione.email_subscribers?.[0];
    expect(patch?.tags).toEqual(["inwestor", "stary", "meta-do-cc-2"]);
    expect(patch).not.toHaveProperty("status");
    expect(wstawione.email_subscribers).toBeUndefined();
  });

  it("bez tagów nie dotyka listy mailingowej, a SMS zostaje domyślnie włączony", async () => {
    const { captureMetaInvestorLead } = await import("./meta-investor-capture.server");
    const r = await captureMetaInvestorLead({
      leadgenId: "lg-3",
      formId: "f",
      campaignId: null,
      createdTime: null,
      fieldData: pola,
      allowCall: false,
    });
    expect(r.subscribed).toBe(false);
    expect(wstawione.email_subscribers).toBeUndefined();
    expect(sendSmsInternal).toHaveBeenCalledTimes(1);
  });
});
