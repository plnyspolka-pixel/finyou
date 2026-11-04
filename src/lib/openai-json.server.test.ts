import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPENAI_MODEL, isOpenAiConfigured, openAiModel } from "./openai-json.server";

afterEach(() => vi.unstubAllEnvs());

describe("openai-json konfiguracja", () => {
  it("bez klucza zapas jest pomijany", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(isOpenAiConfigured()).toBe(false);
  });
  it("model z OPENAI_MODEL albo domyślny", () => {
    vi.stubEnv("OPENAI_MODEL", "");
    expect(openAiModel()).toBe(DEFAULT_OPENAI_MODEL);
    vi.stubEnv("OPENAI_MODEL", "gpt-x");
    expect(openAiModel()).toBe("gpt-x");
  });
});
