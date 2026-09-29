import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultMaterialAudience,
  isStudioMaterialsEnabled,
  parseMaterialAudience,
  studioMaterialPath,
  studioMaterialTitle,
} from "./studio-materials.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("studio → materiały", () => {
  it("stała ścieżka pliku wiąże rolkę z materiałem", () => {
    expect(studioMaterialPath("abc-123")).toBe("studio/abc-123.mp4");
  });

  it("tytuł: publish_title, potem prompt bez tagu pytania z bazy", () => {
    expect(studioMaterialTitle({ publish_title: " LTV w 40 s ", prompt: "x" })).toBe("LTV w 40 s");
    expect(studioMaterialTitle({ publish_title: "", prompt: "#12 · Czym jest KW?" })).toBe(
      "Czym jest KW?",
    );
    expect(studioMaterialTitle({ publish_title: "", prompt: "" })).toBe("Rolka ze Studia");
  });

  it("kategoria: tylko znane wartości, domyślnie klient albo sekret", () => {
    expect(parseMaterialAudience("Inwestor")).toBe("inwestor");
    expect(parseMaterialAudience("obcy")).toBeNull();
    expect(defaultMaterialAudience()).toBe("klient");
    vi.stubEnv("STUDIO_MATERIALS_AUDIENCE", "posrednik");
    expect(defaultMaterialAudience()).toBe("posrednik");
    vi.stubEnv("STUDIO_MATERIALS_AUDIENCE", "zły");
    expect(defaultMaterialAudience()).toBe("klient");
  });

  it("zapis do materiałów domyślnie włączony, `0` wyłącza", () => {
    expect(isStudioMaterialsEnabled()).toBe(true);
    vi.stubEnv("STUDIO_SAVE_TO_MATERIALS", "0");
    expect(isStudioMaterialsEnabled()).toBe(false);
  });
});
