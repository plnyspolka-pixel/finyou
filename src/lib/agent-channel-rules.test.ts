import { describe, it, expect } from "vitest";
import {
  buildChannelRulesSection,
  channelDynamicVariables,
  channelLabel,
  channelRules,
  normalizeChannel,
} from "./agent-channel-rules";

describe("agent-channel-rules", () => {
  it("mapuje nazwy kanałów używane w bazie i w kodzie", () => {
    expect(normalizeChannel("chat")).toBe("chat");
    expect(normalizeChannel("messenger")).toBe("messenger");
    expect(normalizeChannel("voicebot_call")).toBe("voice_phone");
    expect(normalizeChannel("telefon")).toBe("voice_phone");
    expect(normalizeChannel("voice_web")).toBe("voice_web");
  });

  it("nieznany kanał traktuje jak telefon (najostrożniejszy zestaw zasad)", () => {
    expect(normalizeChannel(null)).toBe("voice_phone");
    expect(normalizeChannel("cokolwiek")).toBe("voice_phone");
    expect(channelLabel(undefined)).toBe("telefon");
  });

  it("czat na stronie zabrania proszenia o zdjęcia, Messenger wprost je dopuszcza", () => {
    expect(channelRules("chat")).toMatch(/NIE DA SIĘ przesłać zdjęć/);
    expect(channelRules("messenger")).toMatch(/MOŻE przesłać zdjęcia/);
  });

  it("telefon kieruje na wniosek na stronie, a rozmowa na stronie — do formularza na ekranie", () => {
    expect(channelRules("voice_phone")).toMatch(/send_application_link/);
    expect(channelRules("voice_web")).toMatch(/Złóż wniosek/);
  });

  it("sekcja dla agenta zawiera wszystkie kanały i zmienną channel", () => {
    const section = buildChannelRulesSection();
    for (const key of [
      "voice_phone",
      "voice_web",
      "chat",
      "messenger",
      "instagram",
      "email",
      "sms",
    ]) {
      expect(section).toContain(`### channel = ${key}`);
    }
    expect(section).toContain("{{channel}}");
  });

  it("zmienne dynamiczne niosą kanał i jego polską nazwę", () => {
    expect(channelDynamicVariables("email")).toEqual({
      channel: "email",
      channel_label: "e-mail",
    });
  });
});
