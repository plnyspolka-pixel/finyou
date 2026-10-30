import { describe, expect, it } from "vitest";
import { isCallRequest } from "./call-request";

describe("isCallRequest", () => {
  it.each([
    "Proszę zadzwonić 501 845 505",
    "prosze zadzwonic",
    "Zadzwońcie do mnie",
    "Proszę o telefon",
    "Proszę o kontakt telefoniczny",
    "Wolę rozmowę telefoniczną",
    "zadzwoń na ten numer 600100200",
    "Proszę oddzwonić",
    "Tak ,dotarła i jestem zainteresowany .Oczywiście pytań jest dużo i dlatego powinniśmy się zdzwonić i porozmawiać .",
    "Możemy porozmawiać telefonicznie?",
    "proszę o kontakt",
    "o której godzinie możemy porozmawiać?",
  ])("rozpoznaje prośbę o telefon: %s", (t) => {
    expect(isCallRequest(t)).toBe(true);
  });

  it.each([
    "pracujące pieniadze",
    "W wiedzy na temat pracujących pieniędzy",
    "Jaki jest numer telefonu do was?",
    "",
    null,
  ])("nie myli zwykłej wiadomości: %s", (t) => {
    expect(isCallRequest(t)).toBe(false);
  });
});
