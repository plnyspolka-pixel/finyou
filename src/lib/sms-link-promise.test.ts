import { describe, expect, it } from "vitest";
import { promisesLinkWithoutUrl } from "./sms-link-promise";

describe("promisesLinkWithoutUrl", () => {
  it("wykrywa obietnicę linku bez adresu", () => {
    expect(
      promisesLinkWithoutUrl(
        "Jasne, już wysyłam SMS z linkiem do wniosku. Będzie tam można uzupełnić wszystkie potrzebne informacje.",
      ),
    ).toBe(true);
    expect(promisesLinkWithoutUrl("Właśnie wysłałem Ci link.")).toBe(true);
    expect(promisesLinkWithoutUrl("Wyślę Panu link do wniosku.")).toBe(true);
  });

  it("odpowiedź z adresem jest w porządku", () => {
    expect(
      promisesLinkWithoutUrl("Twój link do dokończenia wniosku: https://financeyou.pl/klient"),
    ).toBe(false);
    expect(promisesLinkWithoutUrl("Wysyłam link: financeyou.pl")).toBe(false);
  });

  it("zwykła odpowiedź nie jest obietnicą", () => {
    expect(promisesLinkWithoutUrl("Rozumiem. Kiedy będzie Pani pasowała rozmowa?")).toBe(false);
    expect(promisesLinkWithoutUrl("Jestem asystentem AI Finance You.")).toBe(false);
  });
});
