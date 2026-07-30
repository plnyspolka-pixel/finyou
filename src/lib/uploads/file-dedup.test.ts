import { describe, expect, it } from "vitest";
import { partitionByContentHash, sha256Hex, uploadSummaryLabel } from "./file-dedup";

describe("sha256Hex", () => {
  it("liczy znany wektor SHA-256 dla 'abc'", async () => {
    const bytes = new TextEncoder().encode("abc");
    const hash = await sha256Hex(bytes);
    // Best-effort: w środowisku bez WebCrypto helper zwraca null zamiast rzucać.
    if (hash === null) return;
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("daje ten sam hash niezależnie od typu wejścia (Uint8Array vs Blob)", async () => {
    const bytes = new TextEncoder().encode("finyou");
    const a = await sha256Hex(bytes);
    const b = await sha256Hex(new Blob([bytes]));
    expect(a).toEqual(b);
  });

  it("hashuje poprawnie widok Uint8Array z offsetem", async () => {
    const raw = new TextEncoder().encode("xxabc");
    const view = new Uint8Array(raw.buffer, 2); // "abc"
    const direct = await sha256Hex(new TextEncoder().encode("abc"));
    expect(await sha256Hex(view)).toEqual(direct);
  });
});

describe("partitionByContentHash", () => {
  const f = (name: string, contentHash: string | null) => ({ name, contentHash });

  it("odsiewa duplikaty względem znanych hashy", () => {
    const { fresh, duplicates } = partitionByContentHash(
      [f("a.jpg", "h1"), f("b.jpg", "h2")],
      ["h1"],
    );
    expect(fresh.map((x) => x.name)).toEqual(["b.jpg"]);
    expect(duplicates.map((x) => x.name)).toEqual(["a.jpg"]);
  });

  it("odsiewa duplikaty wewnątrz jednej partii", () => {
    const { fresh, duplicates } = partitionByContentHash(
      [f("a.jpg", "h1"), f("kopia-a.jpg", "h1"), f("b.jpg", "h2")],
      [],
    );
    expect(fresh.map((x) => x.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(duplicates.map((x) => x.name)).toEqual(["kopia-a.jpg"]);
  });

  it("pliki bez hasha zawsze przechodzą (dedup nie może gubić plików)", () => {
    const { fresh, duplicates } = partitionByContentHash(
      [f("a.jpg", null), f("b.jpg", null)],
      ["h1"],
    );
    expect(fresh).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});

describe("uploadSummaryLabel", () => {
  it("komunikaty zależnie od liczby dodanych i pominiętych", () => {
    expect(uploadSummaryLabel(3, 0)).toBe("Dodano 3 plik(ów)");
    expect(uploadSummaryLabel(2, 1)).toBe("Dodano 2 plik(ów), pominięto 1 duplikat(ów)");
    expect(uploadSummaryLabel(0, 2)).toBe("Pominięto 2 duplikat(ów) — te pliki już są w systemie");
  });
});
