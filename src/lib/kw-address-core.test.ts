import { describe, expect, it } from "vitest";
import { parseKwAddress } from "./kw-address-core";

describe("parseKwAddress — dział I-O KW", () => {
  it("czyta układ tabelaryczny CMD (komórki csDane/csBDane)", () => {
    const html =
      '<table><tr><td class="csTytul">Położenie</td></tr>' +
      '<tr><td class="csDane">1</td><td class="csDane">1</td>' +
      '<td class="csDane">DOLNOŚLĄSKIE, OLEŚNICKI, BIERUTÓW, BIERUTÓW</td><td class="csDane">2</td></tr>' +
      '<tr><td class="csTytul">Ulica</td><td class="csTytul">Numer budynku</td><td class="csTytul">Numer lokalu</td></tr>' +
      '<tr><td class="csBDane">ZIELONA</td><td class="csBDane">11</td><td class="csBDane">5</td></tr></table>';
    const a = parseKwAddress(html);
    expect(a.voivodeship).toBe("Dolnośląskie");
    expect(a.powiat).toBe("Oleśnicki");
    expect(a.gmina).toBe("Bierutów");
    expect(a.city).toBe("Bierutów");
    expect(a.street).toBe("Zielona");
    expect(a.buildingNumber).toBe("11");
    expect(a.unitNumber).toBe("5");
    expect(a.fullAddress).toBe("Zielona 11/5, Bierutów");
  });

  it("czyta układ etykietowany EKW (bez struktury tabeli)", () => {
    const html =
      "<div>Województwo DOLNOŚLĄSKIE Powiat OLEŚNICKI Gmina BIERUTÓW Miejscowość BIERUTÓW</div>" +
      "<div>Ulica ZIELONA Numer budynku 11 Numer lokalu 5</div>";
    const a = parseKwAddress(html);
    expect(a.city).toBe("Bierutów");
    expect(a.voivodeship).toBe("Dolnośląskie");
    expect(a.fullAddress).toBe("Zielona 11/5, Bierutów");
  });

  it("obsługuje miejscowości wieloczłonowe i brak ulicy", () => {
    const html =
      "Województwo LUBUSKIE Powiat NOWOSOLSKI Gmina NOWA SÓL Miejscowość NOWA SÓL Numer budynku 7";
    const a = parseKwAddress(html);
    expect(a.city).toBe("Nowa Sól");
    expect(a.street).toBeNull();
    expect(a.fullAddress).toBe("Nowa Sól 7, Nowa Sól");
  });

  it("'BRAK' w polu ulicy nie jest traktowany jako nazwa ulicy", () => {
    const a = parseKwAddress("Miejscowość BIERUTÓW Ulica BRAK");
    expect(a.street).toBeNull();
    expect(a.city).toBe("Bierutów");
  });

  it("pusty dział I-O daje pusty adres", () => {
    expect(parseKwAddress(null).fullAddress).toBeNull();
    expect(parseKwAddress("").fullAddress).toBeNull();
  });
});
