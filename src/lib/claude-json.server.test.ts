import { describe, expect, it } from "vitest";
import { parseLooseJsonObject } from "./claude-json.server";

describe("parseLooseJsonObject", () => {
  it("czysty JSON", () => {
    expect(parseLooseJsonObject('{"script":"a"}')).toEqual({ script: "a" });
  });
  it("JSON w bloku kodu i z tekstem wokół", () => {
    expect(parseLooseJsonObject('Oto:\n```json\n{"title":"t"}\n```')).toEqual({ title: "t" });
  });
  it("brak obiektu → null", () => {
    expect(parseLooseJsonObject("nie mam")).toBeNull();
    expect(parseLooseJsonObject("[1,2]")).toBeNull();
  });
});
