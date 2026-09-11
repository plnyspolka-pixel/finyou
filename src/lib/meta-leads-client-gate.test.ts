import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Bramka odcinająca leady klientów zewnętrznych od ścieżki Finance You.
 * Testy pilnują dwóch rzeczy, na których zależy najbardziej:
 * lead klienta ma wyjść do klienta i NIE zostawić u nas danych osobowych.
 */

type Wiersz = Record<string, unknown>;

const zapisane: Record<string, Wiersz[]> = {};
let formularz: Wiersz | null = null;
let jużPrzekazany: Wiersz | null = null;

const supabaseAdmin = {
  from(tabela: string) {
    return {
      select() {
        return {
          eq() {
            return {
              maybeSingle: async () => ({
                data: tabela === "meta_lead_forms" ? formularz : jużPrzekazany,
              }),
            };
          },
        };
      },
      upsert: async (wiersz: Wiersz) => {
        (zapisane[tabela] ??= []).push(wiersz);
        return { data: null, error: null };
      },
      insert: async (wiersz: Wiersz) => {
        (zapisane[tabela] ??= []).push(wiersz);
        return { data: null, error: null };
      },
    };
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

const { konfiguracjaKlienta, przekazLeadaKlientowi } =
  await import("./meta-leads-client-forward.server");

const lead = {
  id: "lead-1",
  created_time: "2026-09-11T08:00:00+0000",
  form_id: "1815430582820209",
  campaign_id: "camp-1",
  field_data: [
    { name: "full_name", values: ["Jan Kowalski"] },
    { name: "phone_number", values: ["600100200"] },
  ],
};

beforeEach(() => {
  for (const k of Object.keys(zapisane)) delete zapisane[k];
  formularz = null;
  jużPrzekazany = null;
  vi.unstubAllGlobals();
});

describe("rozpoznanie formularza klienta", () => {
  it("formularz bez adresu przekazania zostaje leadem Finance You", async () => {
    formularz = { client_forward_url: null, client_forward_secret: null };
    expect(await konfiguracjaKlienta("123")).toBeNull();
  });

  it("formularz z adresem przekazania jest formularzem klienta", async () => {
    formularz = { client_forward_url: "https://klient.pl/lead", client_forward_secret: "tajne" };
    expect(await konfiguracjaKlienta("123")).toEqual({
      url: "https://klient.pl/lead",
      secret: "tajne",
    });
  });

  it("brak identyfikatora formularza nie odpytuje bazy i nie jest klientem", async () => {
    expect(await konfiguracjaKlienta(null)).toBeNull();
  });
});

describe("przekazanie leada klientowi", () => {
  it("wysyła leada i zapisuje tylko identyfikatory — bez danych osobowych", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const wynik = await przekazLeadaKlientowi(
      { url: "https://klient.pl/lead", secret: "tajne" },
      lead,
    );

    expect(wynik.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    // U klienta ląduje komplet danych…
    const wyslane = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(wyslane.imie).toBe("Jan Kowalski");
    expect(wyslane.telefon).toBe("600100200");

    // …a u nas wyłącznie ślad techniczny.
    const slad = zapisane["client_lead_forwards"];
    expect(slad).toHaveLength(1);
    expect(slad[0]).toMatchObject({ meta_lead_id: "lead-1", status: "wyslany" });
    expect(JSON.stringify(slad[0])).not.toContain("Kowalski");
    expect(JSON.stringify(slad[0])).not.toContain("600100200");
  });

  it("nie zapisuje leada w meta_leads ani w leads", async () => {
    vi.stubGlobal("fetch", async () => new Response("ok", { status: 200 }));
    await przekazLeadaKlientowi({ url: "https://klient.pl/lead", secret: null }, lead);
    expect(zapisane["meta_leads"]).toBeUndefined();
    expect(zapisane["leads"]).toBeUndefined();
    expect(zapisane["clients"]).toBeUndefined();
    expect(zapisane["loan_applications"]).toBeUndefined();
  });

  it("lead już przekazany nie leci drugi raz", async () => {
    jużPrzekazany = { meta_lead_id: "lead-1", status: "wyslany" };
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const wynik = await przekazLeadaKlientowi(
      { url: "https://klient.pl/lead", secret: null },
      lead,
    );

    expect(wynik).toEqual({ ok: true, pominiety: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nieudane przekazanie zostawia ślad błędu, żeby dało się ponowić", async () => {
    vi.stubGlobal("fetch", async () => new Response("padło", { status: 500 }));
    const wynik = await przekazLeadaKlientowi(
      { url: "https://klient.pl/lead", secret: null },
      lead,
    );
    expect(wynik.ok).toBe(false);
    expect(zapisane["client_lead_forwards"][0]).toMatchObject({ status: "blad" });
  });
});
