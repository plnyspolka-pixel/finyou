import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { dropLegacyClientFiles } from "./property-photos";

function fakeDb(listing: Record<string, Array<{ name: string; created_at: string | null }>>) {
  const list = vi.fn(async (dir: string) => ({ data: listing[dir] ?? [], error: null }));
  return { db: { storage: { from: () => ({ list }) } }, list };
}

describe("dropLegacyClientFiles", () => {
  it("odrzuca pliki sprzed migracji, zostawia nowsze i zewnętrzne URL-e", async () => {
    const { db, list } = fakeDb({
      "app1/property_photos": [
        { name: "stare.png", created_at: "2026-06-23T22:33:13Z" },
        { name: "nowe.png", created_at: "2026-10-14T10:00:00Z" },
      ],
    });
    const refs = [
      { src: "app1/property_photos/stare.png", name: "stare.png" },
      { src: "app1/property_photos/nowe.png", name: "nowe.png" },
      { src: "https://example.com/a.jpg", name: "a.jpg" },
    ];
    const out = await dropLegacyClientFiles(db, refs);
    expect(out.map((r) => r.name)).toEqual(["nowe.png", "a.jpg"]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("zostawia plik, którego nie ma w listingu albo gdy Storage zwróci błąd", async () => {
    const db = {
      storage: {
        from: () => ({ list: async () => ({ data: null, error: { message: "x" } }) }),
      },
    };
    const refs = [{ src: "app2/x.png", name: "x.png" }];
    expect(await dropLegacyClientFiles(db, refs)).toEqual(refs);
  });
});
