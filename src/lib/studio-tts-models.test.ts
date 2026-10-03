import { describe, it, expect } from "vitest";
import {
  DEFAULT_TTS_MODEL_ID,
  TTS_MODEL_OPTIONS,
  parseTtsModelId,
  snapStability,
  voiceSettingsForModel,
} from "./studio-tts-models";
import { NARRATION_VOICE_SETTINGS } from "./studio-narration";

describe("modele lektora", () => {
  it("domyślny to najwyższa jakość i stoi pierwszy na liście", () => {
    expect(DEFAULT_TTS_MODEL_ID).toBe("eleven_v4");
    expect(TTS_MODEL_OPTIONS[0].id).toBe(DEFAULT_TTS_MODEL_ID);
    expect(TTS_MODEL_OPTIONS[0].quality).toBe("najwyższa");
  });

  it("nieznana wartość = zapas (domyślnie najlepszy; ustawienie Studia, gdy podane)", () => {
    expect(parseTtsModelId(undefined)).toBe("eleven_v4");
    expect(parseTtsModelId("eleven_turbo_v2_5")).toBe("eleven_v4");
    expect(parseTtsModelId(null, "eleven_multilingual_v2")).toBe("eleven_multilingual_v2");
    expect(parseTtsModelId("eleven_v3", "eleven_multilingual_v2")).toBe("eleven_v3");
  });
});

describe("voiceSettingsForModel", () => {
  it("v4 / v3: stabilność w trzech trybach, bez style i speaker boost", () => {
    const v4 = voiceSettingsForModel("eleven_v4", NARRATION_VOICE_SETTINGS);
    expect(v4).toEqual({ stability: 0.5, similarity_boost: 0.8, speed: 1.0 });
    expect(voiceSettingsForModel("eleven_v3", { stability: 0.9, similarity_boost: 0.7 })).toEqual({
      stability: 1,
      similarity_boost: 0.7,
    });
  });

  it("Multilingual v2 dostaje wszystko bez zmian", () => {
    expect(voiceSettingsForModel("eleven_multilingual_v2", NARRATION_VOICE_SETTINGS)).toEqual({
      ...NARRATION_VOICE_SETTINGS,
    });
  });

  it("Flash: bez style i speaker boost, stabilność ciągła", () => {
    expect(voiceSettingsForModel("eleven_flash_v2_5", NARRATION_VOICE_SETTINGS)).toEqual({
      stability: 0.72,
      similarity_boost: 0.8,
      speed: 1.0,
    });
  });

  it("nieznany model: ustawienia bez zmian", () => {
    const base = { stability: 0.3, similarity_boost: 0.5, style: 0.1 };
    expect(voiceSettingsForModel("eleven_obcy", base)).toEqual(base);
  });

  it("snapStability zaokrągla do 0 / 0.5 / 1", () => {
    expect(snapStability(0)).toBe(0);
    expect(snapStability(0.2)).toBe(0);
    expect(snapStability(0.25)).toBe(0.5);
    expect(snapStability(0.72)).toBe(0.5);
    expect(snapStability(0.75)).toBe(1);
    expect(snapStability(Number.NaN)).toBe(0.5);
  });
});
