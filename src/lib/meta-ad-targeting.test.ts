import { describe, it, expect } from "vitest";
import {
  buildUmiejscowienia,
  buildGeoLocations,
  przytnijPromien,
  buildAdSetPayload,
  buildCampaignPayload,
  buildCreativePayload,
  sprawdzKampanie,
  zUtm,
  MAX_PROMIEN_KM,
  PRESET_LUBLIN_100KM,
  SZABLON_SZALUNKI_LUBLIN,
  SZABLON_SZALUNKI_FORMULARZ,
  statusPublikacji,
  zastosujSzablon,
} from "./meta-ad-targeting";

/** Sięga po zagnieżdżone pole gotowego ciała żądania. */
const pole = (obiekt: unknown, ...sciezka: string[]): unknown =>
  sciezka.reduce<unknown>((acc, klucz) => (acc as Record<string, unknown>)[klucz], obiekt);

describe("umiejscowienia", () => {
  it("tryb „główne kanały” to wyłącznie aktualności FB i feed IG", () => {
    const u = buildUmiejscowienia("glowne");
    expect(u.publisher_platforms).toEqual(["facebook", "instagram"]);
    expect(u.facebook_positions).toEqual(["feed"]);
    expect(u.instagram_positions).toEqual(["stream"]);
  });

  it("żaden tryb nie włącza Audience Network ani Messengera", () => {
    for (const tryb of ["glowne", "glowne_reels", "auto"] as const) {
      const u = buildUmiejscowienia(tryb);
      expect(u.publisher_platforms).not.toContain("audience_network");
      expect(u.publisher_platforms).not.toContain("messenger");
    }
  });

  it("tryb z Reels dokłada Reels, ale nie inne pozycje", () => {
    const u = buildUmiejscowienia("glowne_reels");
    expect(u.facebook_positions).toEqual(["feed", "facebook_reels"]);
    expect(u.instagram_positions).toEqual(["stream", "reels"]);
  });

  it("tryb automatyczny nie narzuca pozycji", () => {
    const u = buildUmiejscowienia("auto");
    expect(u.facebook_positions).toBeUndefined();
    expect(u.instagram_positions).toBeUndefined();
  });
});

describe("lokalizacje", () => {
  it("promień jest przycinany do limitu Meta", () => {
    expect(przytnijPromien(100)).toBe(MAX_PROMIEN_KM);
    expect(przytnijPromien(2)).toBe(10);
    expect(przytnijPromien(35)).toBe(35);
  });

  it("miasta trafiają do geo_locations w kilometrach", () => {
    const geo = buildGeoLocations([{ key: "2490383", name: "Lublin", radius: 80 }]);
    expect(pole(geo, "cities")).toEqual([
      { key: "2490383", radius: 80, distance_unit: "kilometer" },
    ]);
    expect(pole(geo, "location_types")).toEqual(["home", "recent"]);
  });

  it("bez miast zostaje cała Polska", () => {
    expect(buildGeoLocations([])).toEqual({ countries: ["PL"] });
  });

  it("preset Lublin + 100 km nie przekracza limitu promienia", () => {
    for (const m of PRESET_LUBLIN_100KM.miasta) {
      expect(m.radius).toBeLessThanOrEqual(MAX_PROMIEN_KM);
    }
    expect(PRESET_LUBLIN_100KM.miasta[0].q).toBe("Lublin");
  });
});

describe("zestaw reklam", () => {
  const bazowy = {
    nazwa: "Szalunki Lublin",
    campaignId: "123",
    budzetDzienny: 50,
    pageId: "999",
    targeting: { geo_locations: { countries: ["PL"] }, age_min: 25, age_max: 60 },
  };

  it("kampania na stronę optymalizuje się pod zdarzenie LEAD z piksela", () => {
    const p = buildAdSetPayload({
      ...bazowy,
      cel: "strona_www",
      pixelId: "777",
    });
    expect(p.optimization_goal).toBe("OFFSITE_CONVERSIONS");
    expect(p.promoted_object).toEqual({ pixel_id: "777", custom_event_type: "LEAD" });
    expect(p.daily_budget).toBe(5000);
    expect(p.status).toBe("PAUSED");
  });

  it("wariant „wejścia na stronę” nie wymaga zdarzenia konwersji", () => {
    const p = buildAdSetPayload({
      ...bazowy,
      cel: "strona_www",
      pixelId: "777",
      optymalizacjaWww: "wejscia",
    });
    expect(p.optimization_goal).toBe("LANDING_PAGE_VIEWS");
    expect(p.promoted_object).toEqual({ pixel_id: "777" });
  });

  it("formularz FB zostaje przy LEAD_GENERATION i stronie jako promowanym obiekcie", () => {
    const p = buildAdSetPayload({ ...bazowy, cel: "formularz_fb" });
    expect(p.optimization_goal).toBe("LEAD_GENERATION");
    expect(p.promoted_object).toEqual({ page_id: "999" });
  });

  it("domyślnie nie pozwalamy Meta poszerzać grupy odbiorców", () => {
    const p = buildAdSetPayload({ ...bazowy, cel: "formularz_fb" });
    expect(pole(p, "targeting", "targeting_automation")).toEqual({ advantage_audience: 0 });
    expect(pole(p, "targeting", "facebook_positions")).toEqual(["feed"]);
  });

  it("poszerzanie grupy da się włączyć świadomie", () => {
    const p = buildAdSetPayload({
      ...bazowy,
      cel: "formularz_fb",
      targeting: { ...bazowy.targeting, poszerzanie_grupy: true },
    });
    expect(pole(p, "targeting", "targeting_automation")).toEqual({ advantage_audience: 1 });
  });
});

describe("status publikacji", () => {
  it("domyślnie kampania powstaje wstrzymana", () => {
    expect(statusPublikacji()).toBe("PAUSED");
    expect(statusPublikacji(false)).toBe("PAUSED");
    const p = buildAdSetPayload({
      nazwa: "FY",
      campaignId: "1",
      budzetDzienny: 50,
      pageId: "999",
      cel: "formularz_fb",
      targeting: {},
    });
    expect(p.status).toBe("PAUSED");
  });

  it("na wyraźne życzenie zestaw startuje jako aktywny", () => {
    expect(statusPublikacji(true)).toBe("ACTIVE");
    const p = buildAdSetPayload({
      nazwa: "FY",
      campaignId: "1",
      budzetDzienny: 50,
      pageId: "999",
      cel: "formularz_fb",
      wlaczOdRazu: true,
      targeting: {},
    });
    expect(p.status).toBe("ACTIVE");
  });
});

describe("szablon kampanii", () => {
  const pusty = {
    name: "",
    daily_budget: 10,
    targeting: { umiejscowienia: "auto", poszerzanie_grupy: true, interests: [{ id: "1" }] },
    creative: { cel: "formularz_fb", headline: "" },
    ad_account_id: "konto",
    page_id: "strona",
  };

  it("szablon szalunków ustawia kampanię na formularz na stronie", () => {
    const f = zastosujSzablon(pusty, SZABLON_SZALUNKI_LUBLIN);
    expect(f.creative.cel).toBe("strona_www");
    expect(f.creative.landing_url).toBe("https://szalunki-lublin.pl");
    expect(f.daily_budget).toBe(50);
    expect(f.targeting.umiejscowienia).toBe("glowne");
    expect(f.targeting.poszerzanie_grupy).toBe(false);
  });

  it("szablon nie rusza konta, strony ani wybranych zainteresowań", () => {
    const f = zastosujSzablon(pusty, SZABLON_SZALUNKI_LUBLIN);
    expect(f.ad_account_id).toBe("konto");
    expect(f.page_id).toBe("strona");
    expect(f.targeting.interests).toEqual([{ id: "1" }]);
  });

  it("teksty reklamy mieszczą się w limitach Meta", () => {
    for (const szablon of [SZABLON_SZALUNKI_LUBLIN, SZABLON_SZALUNKI_FORMULARZ]) {
      expect(szablon.headline.length).toBeLessThanOrEqual(40);
      expect(szablon.description.length).toBeLessThanOrEqual(30);
    }
  });

  it("szablon formularza błyskawicznego pyta tylko o imię i kontakt", () => {
    const f = zastosujSzablon(pusty, SZABLON_SZALUNKI_FORMULARZ);
    expect(f.creative.cel).toBe("formularz_fb");
    expect(f.lead_form?.questions).toEqual([
      { type: "FULL_NAME" },
      { type: "PHONE" },
      { type: "EMAIL" },
    ]);
  });

  it("formularz błyskawiczny linkuje politykę klienta, nie Finance You", () => {
    const f = zastosujSzablon(pusty, SZABLON_SZALUNKI_FORMULARZ);
    const polityka = (f.lead_form?.privacy_policy as { url: string }).url;
    expect(polityka).toBe("https://szalunki-lublin.pl/polityka-prywatnosci");
    expect(polityka).not.toContain("financeyou");
  });

  it("kampania klienta nie podpina remarketingu Finance You", () => {
    for (const szablon of [SZABLON_SZALUNKI_LUBLIN, SZABLON_SZALUNKI_FORMULARZ]) {
      expect(szablon.remarketing_fy).toBe(false);
      expect(zastosujSzablon(pusty, szablon).targeting.remarketing).toBe(false);
    }
  });
});

describe("kreacja", () => {
  it("kampania na stronę linkuje do strony docelowej z UTM-ami", () => {
    const c = buildCreativePayload({
      nazwa: "Szalunki Lublin",
      pageId: "999",
      cel: "strona_www",
      landingUrl: "https://szalunki-lublin.pl/",
      headline: "Wynajem szalunków",
    });
    const link = pole(c, "object_story_spec", "link_data", "link") as string;
    expect(link).toContain("utm_source=facebook");
    expect(link).toContain("utm_medium=paid_social");
    expect(pole(c, "object_story_spec", "link_data", "call_to_action")).toEqual({
      type: "GET_QUOTE",
    });
  });

  it("kampania z formularzem FB podpina identyfikator formularza", () => {
    const c = buildCreativePayload({
      nazwa: "FY",
      pageId: "999",
      cel: "formularz_fb",
      landingUrl: "https://szalunki-lublin.pl",
      leadFormId: "form-1",
    });
    expect(pole(c, "object_story_spec", "link_data", "call_to_action")).toEqual({
      type: "SIGN_UP",
      value: { lead_gen_form_id: "form-1" },
    });
  });

  it("kreacja nie wysyła wycofanego pola ulepszeń — Meta odrzuca z nim całe żądanie", () => {
    const c = buildCreativePayload({ nazwa: "FY", pageId: "999", cel: "formularz_fb" });
    expect(c.degrees_of_freedom_spec).toBeUndefined();
  });

  it("reklama z formularzem linkuje stronę reklamodawcy, nie profil na Facebooku", () => {
    const c = buildCreativePayload({
      nazwa: "Szalunki",
      pageId: "999",
      cel: "formularz_fb",
      landingUrl: "https://szalunki-lublin.pl",
      leadFormId: "form-1",
    });
    const link = pole(c, "object_story_spec", "link_data", "link") as string;
    expect(link).toContain("szalunki-lublin.pl");
    expect(link).not.toContain("facebook.com");
  });
});

describe("kampania", () => {
  it("deklaruje harmonogram budżetu — bez tego Meta odrzuca utworzenie kampanii", () => {
    const c = buildCampaignPayload({ nazwa: "Szalunki", cel: "formularz_fb" });
    expect(c.is_budget_schedule_enabled).toBe(false);
    expect(c.objective).toBe("OUTCOME_LEADS");
    expect(c.status).toBe("PAUSED");
  });

  it("wariant „wejścia na stronę” idzie celem ruch", () => {
    const c = buildCampaignPayload({
      nazwa: "Szalunki",
      cel: "strona_www",
      optymalizacjaWww: "wejscia",
      wlaczOdRazu: true,
    });
    expect(c.objective).toBe("OUTCOME_TRAFFIC");
    expect(c.status).toBe("ACTIVE");
  });
});

describe("UTM", () => {
  it("nie nadpisuje parametrów, które już są w adresie", () => {
    const url = zUtm("https://example.pl/?utm_source=ulotka", {
      source: "facebook",
      medium: "paid_social",
    });
    expect(url).toContain("utm_source=ulotka");
    expect(url).toContain("utm_medium=paid_social");
  });

  it("zły adres zwraca bez zmian", () => {
    expect(zUtm("nie-adres", { source: "facebook", medium: "paid_social" })).toBe("nie-adres");
  });
});

describe("kontrola przed publikacją", () => {
  it("kampania na stronę bez piksela i adresu nie przejdzie", () => {
    const bledy = sprawdzKampanie({ cel: "strona_www", pageId: "999", budzetDzienny: 50 });
    expect(bledy).toHaveLength(2);
    expect(bledy.join(" ")).toContain("piksel");
    expect(bledy.join(" ")).toContain("adres strony");
  });

  it("adres bez https jest odrzucany", () => {
    const bledy = sprawdzKampanie({
      cel: "strona_www",
      pageId: "999",
      budzetDzienny: 50,
      pixelId: "777",
      landingUrl: "http://szalunki-lublin.pl",
    });
    expect(bledy.join(" ")).toContain("https://");
  });

  it("formularz błyskawiczny bez polityki prywatności nie przejdzie", () => {
    const bledy = sprawdzKampanie({
      cel: "formularz_fb",
      pageId: "999",
      budzetDzienny: 50,
      landingUrl: "https://szalunki-lublin.pl",
    });
    expect(bledy.join(" ")).toContain("polityki prywatności");
  });

  it("formularz błyskawiczny bez adresu strony też nie przejdzie", () => {
    const bledy = sprawdzKampanie({
      cel: "formularz_fb",
      pageId: "999",
      budzetDzienny: 50,
      politykaUrl: "https://szalunki-lublin.pl/polityka-prywatnosci",
    });
    expect(bledy.join(" ")).toContain("adres strony reklamodawcy");
  });

  it("formularz błyskawiczny z polityką i adresem przechodzi", () => {
    expect(
      sprawdzKampanie({
        cel: "formularz_fb",
        pageId: "999",
        budzetDzienny: 50,
        landingUrl: "https://szalunki-lublin.pl",
        politykaUrl: "https://szalunki-lublin.pl/polityka-prywatnosci",
      }),
    ).toEqual([]);
  });

  it("komplet danych nie zgłasza uwag", () => {
    expect(
      sprawdzKampanie({
        cel: "strona_www",
        pageId: "999",
        budzetDzienny: 50,
        pixelId: "777",
        landingUrl: "https://szalunki-lublin.pl",
      }),
    ).toEqual([]);
  });
});
