import { describe, it, expect } from "vitest";
import { parseSubscriberCsv } from "./subscriber-csv";

describe("parseSubscriberCsv", () => {
  it("czyta CSV z przecinkiem, cudzysłowami i tagami", () => {
    const r = parseSubscriberCsv(
      '\uFEFFemail,first_name,tags\na@b.pl,"Kowalski, Jan",posrednicy|ocena-A\nc@d.pl,,\n',
    );
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([
      { email: "a@b.pl", first_name: "Kowalski, Jan", tags: ["posrednicy", "ocena-A"] },
      { email: "c@d.pl" },
    ]);
  });

  it("rozpoznaje średnik i polskie nagłówki", () => {
    const r = parseSubscriberCsv("E-mail;Imię;Nazwisko\r\nx@y.pl;Anna;Nowak\r\n");
    expect(r.rows).toEqual([{ email: "x@y.pl", first_name: "Anna", last_name: "Nowak" }]);
  });

  it("zgłasza brak kolumny email", () => {
    expect(parseSubscriberCsv("imie\nJan\n").error).toBeTruthy();
  });
});
