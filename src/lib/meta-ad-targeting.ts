// Budowanie targetowania, umiejscowień i kreacji dla kampanii Meta.
// Czyste funkcje (bez sieci i bazy) — łatwe do przetestowania i wspólne
// dla kreatora kampanii oraz publikacji na Graph API.

/** Meta nie przyjmuje promienia większego niż 80 km (50 mil) dla miasta. */
export const MAX_PROMIEN_KM = 80;
/** Poniżej 10 km Meta odrzuca promień dla miasta. */
export const MIN_PROMIEN_KM = 10;

export type UmiejscowieniaTryb = "glowne" | "glowne_reels" | "auto";

export type Umiejscowienia = {
  publisher_platforms: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
};

/**
 * Umiejscowienia reklam.
 * - "glowne"       — tylko główne kanały: aktualności FB + feed Instagrama.
 * - "glowne_reels" — jw. + Reels (FB i IG).
 * - "auto"         — automat Meta, ale wyłącznie na FB i IG.
 *
 * W żadnym trybie nie włączamy Audience Network ani Messengera — to tam
 * najczęściej „przepalają się" wyświetlenia poza właściwymi kanałami.
 */
export function buildUmiejscowienia(tryb: UmiejscowieniaTryb): Umiejscowienia {
  if (tryb === "auto") {
    return { publisher_platforms: ["facebook", "instagram"] };
  }
  if (tryb === "glowne_reels") {
    return {
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed", "facebook_reels"],
      instagram_positions: ["stream", "reels"],
    };
  }
  return {
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["feed"],
    instagram_positions: ["stream"],
  };
}

export type MiastoCel = {
  /** Klucz miasta z Meta (`/search?type=adgeolocation`). */
  key: string;
  name?: string;
  /** Promień w km. */
  radius: number;
};

export type GeoMiasta = {
  cities: Array<{ key: string; radius: number; distance_unit: "kilometer" }>;
  location_types: string[];
};
export type GeoKraje = { countries: string[] };
export type GeoLocations = GeoMiasta | GeoKraje;

/** Promień przycięty do zakresu akceptowanego przez Meta. */
export function przytnijPromien(km: number): number {
  if (!Number.isFinite(km)) return MIN_PROMIEN_KM;
  return Math.min(MAX_PROMIEN_KM, Math.max(MIN_PROMIEN_KM, Math.round(km)));
}

/**
 * Zamienia listę miast z promieniem na `geo_locations`.
 * `location_types: ["home", "recent"]` = mieszkańcy + osoby ostatnio w okolicy
 * (bez turystów „przejazdem", których Meta liczy w „travel_in").
 */
export function buildGeoLocations(miasta: MiastoCel[]): GeoLocations {
  const cities = miasta
    .filter((m) => m.key)
    .map((m) => ({
      key: m.key,
      radius: przytnijPromien(m.radius),
      distance_unit: "kilometer" as const,
    }));
  if (!cities.length) return { countries: ["PL"] };
  return { cities, location_types: ["home", "recent"] };
}

export type PresetGeo = {
  id: string;
  label: string;
  opis: string;
  /** Zapytania do wyszukiwarki lokalizacji Meta (kluczy miast nie da się zgadnąć). */
  miasta: Array<{ q: string; radius: number }>;
};

/**
 * „Lublin + 100 km". Meta ogranicza promień jednego miasta do 80 km, więc
 * brakujący pierścień 80–100 km dokładamy mniejszymi okręgami wokół miast
 * leżących na jego obrzeżu.
 */
export const PRESET_LUBLIN_100KM: PresetGeo = {
  id: "lublin_100km",
  label: "Lublin + 100 km",
  opis:
    "Lublin z promieniem 80 km (maksimum Meta) plus okręgi 25 km wokół Zamościa, " +
    "Białej Podlaskiej, Stalowej Woli i Łukowa — razem pokrywa ok. 100 km od Lublina.",
  miasta: [
    { q: "Lublin", radius: 80 },
    { q: "Zamość", radius: 25 },
    { q: "Biała Podlaska", radius: 25 },
    { q: "Stalowa Wola", radius: 25 },
    { q: "Łuków", radius: 25 },
  ],
};

export type PresetZainteresowania = {
  id: string;
  label: string;
  opis: string;
  /** Frazy do `/search?type=adinterest` — realne ID pobieramy z Meta. */
  frazy: string[];
};

/** Zainteresowania typowe dla osób, które właśnie się budują. */
export const PRESET_BUDUJE_SIE: PresetZainteresowania = {
  id: "buduje_sie",
  label: "Buduje dom / jest w trakcie budowy",
  opis:
    "Frazy wskazujące na trwającą inwestycję: budowa domu, stan surowy, beton, " +
    "materiały budowlane, projekt domu, kredyt hipoteczny.",
  frazy: [
    "Budowa domu",
    "Budownictwo",
    "Dom jednorodzinny",
    "Beton",
    "Materiały budowlane",
    "Projekt domu",
    "Kredyt hipoteczny",
    "Remont",
    "Wykonawca budowlany",
  ],
};

export type CelKampanii = "formularz_fb" | "strona_www";

export type AdSetInput = {
  nazwa: string;
  campaignId: string;
  /** Budżet dzienny w PLN. */
  budzetDzienny: number;
  targeting: {
    geo_locations?: unknown;
    age_min?: number;
    age_max?: number;
    genders?: number[];
    interests?: Array<{ id: string; name?: string }>;
    custom_audiences?: Array<{ id: string }>;
    excluded_custom_audiences?: Array<{ id: string }>;
    umiejscowienia?: UmiejscowieniaTryb;
    /** Domyślnie wyłączone — nie chcemy, żeby Meta samo rozszerzało grupę. */
    poszerzanie_grupy?: boolean;
  };
  cel: CelKampanii;
  pageId: string;
  pixelId?: string | null;
  /** Cel optymalizacji dla kampanii na stronę: zdarzenie LEAD albo wejścia na stronę. */
  optymalizacjaWww?: "konwersje" | "wejscia";
  startTime?: string | null;
  endTime?: string | null;
};

/** Ciało żądania POST /act_<id>/adsets. */
export function buildAdSetPayload(input: AdSetInput): Record<string, unknown> {
  const t = input.targeting ?? {};
  const naStrone = input.cel === "strona_www";
  const optymalizacja = naStrone
    ? input.optymalizacjaWww === "wejscia"
      ? "LANDING_PAGE_VIEWS"
      : "OFFSITE_CONVERSIONS"
    : "LEAD_GENERATION";

  const promoted_object: Record<string, unknown> = naStrone
    ? optymalizacja === "OFFSITE_CONVERSIONS"
      ? { pixel_id: input.pixelId, custom_event_type: "LEAD" }
      : { pixel_id: input.pixelId }
    : { page_id: input.pageId };

  return {
    name: `${input.nazwa} - zestaw`,
    campaign_id: input.campaignId,
    daily_budget: Math.round(Number(input.budzetDzienny) * 100),
    billing_event: "IMPRESSIONS",
    optimization_goal: optymalizacja,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: {
      geo_locations: t.geo_locations ?? { countries: ["PL"] },
      age_min: t.age_min ?? 18,
      age_max: t.age_max ?? 65,
      genders: t.genders,
      interests: t.interests,
      custom_audiences: t.custom_audiences,
      excluded_custom_audiences: t.excluded_custom_audiences,
      ...buildUmiejscowienia(t.umiejscowienia ?? "glowne"),
      // 0 = bez automatycznego poszerzania grupy odbiorców przez Meta.
      targeting_automation: { advantage_audience: t.poszerzanie_grupy ? 1 : 0 },
    },
    status: "PAUSED",
    promoted_object,
    start_time: input.startTime ?? undefined,
    end_time: input.endTime ?? undefined,
  };
}

/** Dokleja parametry UTM, nie nadpisując tych, które już są w adresie. */
export function zUtm(
  url: string,
  utm: { source: string; medium: string; campaign?: string; content?: string },
): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const wpisy: Array<[string, string | undefined]> = [
    ["utm_source", utm.source],
    ["utm_medium", utm.medium],
    ["utm_campaign", utm.campaign],
    ["utm_content", utm.content],
  ];
  for (const [k, v] of wpisy) {
    if (v && !u.searchParams.has(k)) u.searchParams.set(k, v);
  }
  return u.toString();
}

export type KreacjaInput = {
  nazwa: string;
  pageId: string;
  cel: CelKampanii;
  /** Adres strony docelowej (tylko dla `strona_www`). */
  landingUrl?: string | null;
  leadFormId?: string | null;
  primaryText?: string;
  headline?: string;
  description?: string;
  imageUrl?: string;
  imageHash?: string;
  ctaType?: string;
};

/** Ciało żądania POST /act_<id>/adcreatives. */
export function buildCreativePayload(input: KreacjaInput): Record<string, unknown> {
  const naStrone = input.cel === "strona_www";
  const link = naStrone
    ? zUtm(input.landingUrl ?? "", {
        source: "facebook",
        medium: "paid_social",
        campaign: input.nazwa,
      })
    : `https://www.facebook.com/${input.pageId}`;

  const call_to_action = naStrone
    ? { type: input.ctaType ?? "GET_QUOTE" }
    : {
        type: input.ctaType ?? "SIGN_UP",
        value: { lead_gen_form_id: input.leadFormId },
      };

  const link_data: Record<string, unknown> = {
    message: input.primaryText ?? "",
    link,
    name: input.headline ?? input.nazwa,
    description: input.description ?? "",
    call_to_action,
  };
  if (input.imageHash) link_data.image_hash = input.imageHash;
  else if (input.imageUrl) link_data.picture = input.imageUrl;

  return {
    name: `${input.nazwa} - kreacja`,
    object_story_spec: { page_id: input.pageId, link_data },
    // Bez „ulepszeń" Meta (kadrowanie, dopiski, muzyka) — kreacja ma iść tak,
    // jak ją przygotowaliśmy.
    degrees_of_freedom_spec: {
      creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } },
    },
  };
}

/** Ostrzeżenia pokazywane przed publikacją — lepiej złapać je przed wysyłką do Meta. */
export function sprawdzKampanie(input: {
  cel: CelKampanii;
  landingUrl?: string | null;
  pixelId?: string | null;
  pageId?: string | null;
  budzetDzienny: number;
  targeting?: { geo_locations?: unknown; umiejscowienia?: UmiejscowieniaTryb };
}): string[] {
  const bledy: string[] = [];
  if (!input.pageId) bledy.push("Wybierz stronę Facebook.");
  if (input.budzetDzienny < 5) bledy.push("Budżet dzienny musi wynosić co najmniej 5 PLN.");
  if (input.cel === "strona_www") {
    if (!input.landingUrl) bledy.push("Podaj adres strony z formularzem kontaktowym.");
    else {
      try {
        const u = new URL(input.landingUrl);
        if (u.protocol !== "https:") bledy.push("Adres strony musi zaczynać się od https://");
      } catch {
        bledy.push("Adres strony jest nieprawidłowy.");
      }
    }
    if (!input.pixelId) bledy.push("Wybierz albo utwórz piksel dla tej kampanii.");
  }
  return bledy;
}
