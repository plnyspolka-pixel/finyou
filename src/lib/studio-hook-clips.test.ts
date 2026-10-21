// Bank klipów hooka: dobór do treści (koncepty, słowa kluczowe, odpowiedź AI), walidacja importu, długość mp4.
import { describe, expect, it } from "vitest";
import type { Track } from "./autopilot/types";
import {
  acceptAiClipMatch,
  foldPl,
  groupHookClipConcepts,
  hookClipConceptList,
  keywordStems,
  matchHookClipByKeywords,
  mp4DurationSeconds,
  sanitizeHookClipItem,
  stemsMatch,
  type HookClip,
} from "./studio-hook-clips";

const clip = (over: Partial<HookClip> & Pick<HookClip, "slug">): HookClip => ({
  id: over.slug,
  track: "both",
  rating: 3,
  media_url: `https://cdn.test/${over.slug}.mp4`,
  duration_s: 5,
  active: true,
  use_count: 0,
  last_used_at: null,
  ...over,
});

// Koncepty banku (tytuł, tor, opis, tagi) — jak w seedzie klipów hooka.
const SEED: Array<[string, string, HookClip["track"], string, string[]]> = [
  [
    "h01_vault",
    "Skarbiec się otwiera",
    "both",
    "Otwarcie dostępu do pieniędzy / kapitału; dla pożyczkobiorcy: dostajesz finansowanie; dla inwestora: zabezpieczenie i bezpieczny skarbiec.",
    ["skarbiec", "dostęp do pieniędzy", "zabezpieczenie", "bezpieczeństwo", "finansowanie"],
  ],
  [
    "h02_stamp",
    "Pieczątka ODMOWA uderza",
    "pozyczkobiorca",
    "Odmowa banku, odrzucony wniosek kredytowy, bank powiedział nie — i jest alternatywa.",
    ["odmowa banku", "bank powiedział nie", "odrzucony wniosek", "zdolność kredytowa", "BIK"],
  ],
  [
    "h03_paper_tower",
    "Wieża papierów się wali",
    "pozyczkobiorca",
    "Biurokracja, sterty dokumentów, długa procedura w banku — u nas prościej i szybciej.",
    ["biurokracja", "dokumenty", "formalności", "procedura", "szybko"],
  ],
  [
    "h04_hourglass",
    "Klepsydra pęka",
    "pozyczkobiorca",
    "Czas ucieka, pilna potrzeba pieniędzy, termin, szybka decyzja.",
    ["czas", "pilne", "termin", "szybka decyzja", "ile to trwa"],
  ],
  [
    "h05_bank_shutter",
    "Bank zamyka roletę",
    "pozyczkobiorca",
    "Bank zamknął drzwi, brak opcji w banku, koniec drogi w bankach — otwarte drzwi gdzie indziej.",
    ["bank zamknął drzwi", "brak opcji", "odmowa", "alternatywa dla banku"],
  ],
  [
    "h06_mini_house",
    "Wlot w okno makiety domu",
    "both",
    "Twój dom / nieruchomość jako klucz do finansowania; wejście w temat nieruchomości.",
    ["dom", "nieruchomość", "zastaw", "mieszkanie", "wartość nieruchomości"],
  ],
  [
    "h07_giant_key",
    "Gigantyczny klucz się przekręca",
    "both",
    "Odblokowanie wartości nieruchomości, klucz do rozwiązania problemu finansowego.",
    ["klucz", "odblokowanie", "rozwiązanie", "wartość nieruchomości", "kapitał z nieruchomości"],
  ],
  [
    "h09_glass_piggy",
    "Szklana skarbonka eksploduje światłem",
    "inwestor",
    "Oszczędności, które nie rosną / eksplodują wzrostem; dla inwestora: lepszy zwrot niż lokata.",
    ["oszczędności", "lokata", "oprocentowanie", "zysk", "inwestycja"],
  ],
  [
    "h10_chess",
    "Ruch figurą-domem na szachownicy",
    "inwestor",
    "Strategiczny ruch inwestora, mądra decyzja, nieruchomość jako figura w grze.",
    ["strategia", "decyzja", "inwestor", "ruch", "przewaga"],
  ],
  [
    "h12_domino",
    "Domino domków",
    "both",
    "Reakcja łańcuchowa długów / problemów, efekt domina; zatrzymanie spirali.",
    ["długi", "efekt domina", "spirala zadłużenia", "konsolidacja", "problemy finansowe"],
  ],
  [
    "h14_storm_house",
    "Burza nad domem, przebija słońce",
    "pozyczkobiorca",
    "Kryzys, burza finansowa nad domem, trudna sytuacja — wyjście z kryzysu.",
    ["kryzys", "trudna sytuacja", "problem", "ratunek", "wyjście z kłopotów"],
  ],
  [
    "h15_folder_slam",
    "Dłoń trzaska teczką",
    "both",
    "Konkret, decyzja, umowa, załatwione — profesjonalne podejście, dokumenty gotowe.",
    ["umowa", "decyzja", "konkret", "załatwione", "profesjonalnie"],
  ],
  [
    "h16_deposit_box",
    "Skrytka depozytowa świeci",
    "inwestor",
    "Bezpieczna inwestycja, zabezpieczenie hipoteką, wartość ukryta w skrytce.",
    ["bezpieczna inwestycja", "hipoteka", "zabezpieczenie", "skrytka", "inwestor"],
  ],
  [
    "h17_elevator",
    "Winda otwiera się na biuro",
    "both",
    "Awans, przejście na wyższy poziom, wejście do biura Finance You, elegancja.",
    ["wyższy poziom", "awans", "wejście", "nowy etap", "elegancko"],
  ],
  [
    "h18_house_of_cards",
    "Domek z kart się wali",
    "pozyczkobiorca",
    "Niestabilne finanse, wszystko się sypie, ryzyko zawalenia budżetu.",
    ["sypie się", "niestabilność", "ryzyko", "budżet", "długi"],
  ],
  [
    "h19_sinking_house",
    "Tonący dom, promień z góry",
    "pozyczkobiorca",
    "Tonięcie w długach, zadłużony dom, ratunek i wyciągnięcie z kłopotów.",
    ["tonę w długach", "zadłużenie", "komornik", "ratunek", "egzekucja"],
  ],
  [
    "h20_rope_house",
    "Dom na pękającej linie",
    "pozyczkobiorca",
    "Sytuacja na włosku, ostatnia chwila, groźba utraty domu.",
    ["na włosku", "ostatnia chwila", "utrata domu", "ryzyko", "pilne"],
  ],
  [
    "h21_house_rocket",
    "Dom-rakieta startuje",
    "inwestor",
    "Wzrost kapitału, start inwestycji, szybki zysk z nieruchomości.",
    ["wzrost", "zysk", "start", "inwestycja", "kapitał rośnie"],
  ],
  [
    "h22_tornado",
    "Tornado przy domu",
    "pozyczkobiorca",
    "Chaos finansowy, nagły problem, wszystko wiruje — spokój po burzy.",
    ["chaos", "nagły problem", "stres", "spokój", "rozwiązanie"],
  ],
  [
    "h23_meteor",
    "Złoty meteoryt w ulicę",
    "both",
    "Nagła zmiana, przełom, coś spada z nieba — okazja.",
    ["przełom", "okazja", "nagła zmiana", "szansa"],
  ],
  [
    "h24_jar",
    "Złotówki w zakurzonym słoju",
    "inwestor",
    "Pieniądze nudzą się na koncie, kurzą się w słoiku/na lokacie, nie pracują.",
    [
      "pieniądze nudzą się",
      "pieniądze na koncie",
      "lokata",
      "oszczędności nie pracują",
      "inflacja",
    ],
  ],
  [
    "h25_snail",
    "Ślimak niesie stówki",
    "inwestor",
    "Pieniądze rosną jak ślimak, niskie oprocentowanie lokaty, wolny zysk.",
    ["wolno", "niskie oprocentowanie", "lokata", "konto oszczędnościowe", "zysk"],
  ],
  [
    "h26_ice",
    "Złotówki zamrożone w lodzie",
    "inwestor",
    "Zamrożony kapitał, pieniądze zamrożone na koncie, odmrożenie kapitału.",
    ["zamrożone pieniądze", "kapitał", "konto", "odmrożenie", "inflacja"],
  ],
  [
    "h27_hammock",
    "Stówki śpią w hamaku",
    "inwestor",
    "Leniwe pieniądze śpią na koncie, obudź swoje pieniądze, niech pracują.",
    ["pieniądze śpią", "leniwe pieniądze", "niech pieniądze pracują", "pasywny dochód"],
  ],
];

/** Bank z seedu: każdy koncept w dwóch modelach (ocena 3 i 4). */
const BANK: HookClip[] = SEED.flatMap(([concept, title, track, description, tags]) =>
  [3, 4].map((rating) =>
    clip({
      slug: `${concept}_${rating === 4 ? "kling" : "flux"}`,
      concept,
      title,
      track,
      description,
      tags,
      rating,
    }),
  ),
);

const pick = (text: string, track: Track | null) =>
  matchHookClipByKeywords(text, groupHookClipConcepts(BANK, track));

describe("koncepty banku", () => {
  it("jedna pozycja na koncept; reprezentant = najwyższa ocena; tor albo `both`", () => {
    const inw = groupHookClipConcepts(BANK, "inwestor");
    expect(inw.every((c) => c.clips.every((k) => k.track !== "pozyczkobiorca"))).toBe(true);
    const jar = inw.find((c) => c.concept === "h24_jar")!;
    expect(jar.clips.map((c) => c.slug)).toEqual(["h24_jar_kling", "h24_jar_flux"]);
    expect(new Set(inw.map((c) => c.concept)).size).toBe(inw.length);
  });

  it("w koncepcie: ocena wygrywa z rotacją; najdawniej użyty tylko przy remisie ocen", () => {
    const list = [
      clip({ slug: "a", concept: "k", rating: 4, last_used_at: "2026-10-21T00:00:00Z" }),
      clip({ slug: "b", concept: "k", rating: 3 }),
      clip({ slug: "c", concept: "k", rating: 4, last_used_at: "2026-10-01T00:00:00Z" }),
      clip({ slug: "d", concept: "k", rating: 4, active: false }),
    ];
    expect(groupHookClipConcepts(list, null)[0].clips.map((c) => c.slug)).toEqual(["c", "a", "b"]);
  });
});

describe("dopasowanie po słowach kluczowych (bez AI)", () => {
  it("„Pieniądze nudzą Ci się na koncie?” → rodzina leniwych pieniędzy (h24–h27)", () => {
    const m = pick("Pieniądze nudzą Ci się na koncie? Zobacz, jak mogą pracować.", "inwestor");
    expect(["h24_jar", "h25_snail", "h26_ice", "h27_hammock"]).toContain(m?.concept.concept);
    expect(m?.clip.rating).toBe(4);
    expect(m?.method).toBe("keywords");
  });

  it("„Bank powiedział nie” → pieczątka odmowy albo roleta banku", () => {
    const m = pick(
      "Bank powiedział nie? Twoja nieruchomość może powiedzieć tak.",
      "pozyczkobiorca",
    );
    expect(["h02_stamp", "h05_bank_shutter"]).toContain(m?.concept.concept);
  });

  it("odmiana i polskie znaki: „długów”, „zadłużenie”, „komornika”", () => {
    const m = pick(
      "Toniesz w długach i dzwoni komornik? Zadłużenie da się zatrzymać.",
      "pozyczkobiorca",
    );
    expect(m?.concept.concept).toBe("h19_sinking_house");
  });

  it("brak wyraźnego dopasowania → null (żadnego losowego klipu)", () => {
    expect(pick("Dzień dobry, dzisiaj o pogodzie w górach.", null)).toBeNull();
    expect(pick("", "inwestor")).toBeNull();
    // Temat inwestora nie wyciąga klipów toru pożyczkobiorcy.
    expect(
      pick("Bank powiedział nie, odmowa banku.", "inwestor")?.concept.concept ?? null,
    ).not.toBe("h02_stamp");
  });

  it("narzędzia tekstowe: bez diakrytyków, rdzenie z prefiksu", () => {
    expect(foldPl("Łódź ŻÓŁĆ się")).toBe("lodz zolc sie");
    expect(keywordStems("Pieniądze nudzą się na koncie")).toEqual(["pieni", "nudza", "konci"]);
    expect(stemsMatch("bank", "banku")).toBe(true);
    expect(stemsMatch("dom", "domek")).toBe(false);
  });
});

describe("odpowiedź AI", () => {
  const concepts = groupHookClipConcepts(BANK, "inwestor");

  it("koncept po kluczu albo numerze listy; wynik ≥ 55", () => {
    const m = acceptAiClipMatch(
      { concept: "h27_hammock", score: 81, reason: "śpiące pieniądze" },
      concepts,
    );
    expect(m).toMatchObject({ method: "ai", score: 81, clip: { slug: "h27_hammock_kling" } });
    expect(m?.reason).toMatch(/śpiące/);
    const n = concepts.findIndex((c) => c.concept === "h24_jar") + 1;
    expect(acceptAiClipMatch({ concept: String(n), score: 70 }, concepts)?.concept.concept).toBe(
      "h24_jar",
    );
  });

  it("słabe dopasowanie, nieznany koncept albo śmieci → null", () => {
    expect(acceptAiClipMatch({ concept: "h24_jar", score: 54 }, concepts)).toBeNull();
    expect(acceptAiClipMatch({ concept: "h02_stamp", score: 90 }, concepts)).toBeNull();
    expect(acceptAiClipMatch({ concept: "h24_jar" }, concepts)).toBeNull();
    expect(acceptAiClipMatch(null, concepts)).toBeNull();
  });

  it("lista konceptów dla AI ma klucz, tytuł, opis i tagi", () => {
    const list = hookClipConceptList(concepts);
    expect(list).toMatch(/^1\. \[h01_vault\] Skarbiec się otwiera — /);
    expect(list).toMatch(/\[h24_jar\].*tagi: pieniądze nudzą się/);
    expect(list).not.toMatch(/h02_stamp/);
  });
});

describe("sanitizeHookClipItem", () => {
  it("normalizuje pola i pilnuje toru / https", () => {
    const item = sanitizeHookClipItem({
      slug: " H01_Vault_Kling ",
      track: "both",
      rating: 4.4,
      tags: ["Skarbiec", "skarbiec", ""],
      description: "  Otwarcie   dostępu do pieniędzy ",
      source_url: "https://v3b.fal.media/files/x.mp4",
    });
    expect(item).toMatchObject({
      slug: "h01_vault_kling",
      rating: 4,
      tags: ["skarbiec"],
      description: "Otwarcie dostępu do pieniędzy",
    });
    expect(() =>
      sanitizeHookClipItem({ slug: "a", track: "klient", source_url: "https://x" }),
    ).toThrow(/tor/);
    expect(() =>
      sanitizeHookClipItem({ slug: "a", track: "both", source_url: "http://x" }),
    ).toThrow(/https/);
    expect(() =>
      sanitizeHookClipItem({ slug: "a b", track: "both", source_url: "https://x" }),
    ).toThrow(/slug/);
  });
});

describe("mp4DurationSeconds", () => {
  const box = (version: 0 | 1, timescale: number, duration: number) => {
    const b = new Uint8Array(version === 1 ? 120 : 108);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, b.length);
    b.set([0x6d, 0x76, 0x68, 0x64], 4); // mvhd
    b[8] = version;
    if (version === 1) {
      dv.setUint32(28, timescale);
      dv.setUint32(32, Math.floor(duration / 2 ** 32));
      dv.setUint32(36, duration >>> 0);
    } else {
      dv.setUint32(20, timescale);
      dv.setUint32(24, duration);
    }
    // Poprzedzone innym boksem (np. ftyp), jak w prawdziwym pliku.
    const out = new Uint8Array(16 + b.length);
    out.set([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70], 0);
    out.set(b, 16);
    return out;
  };

  it("czyta mvhd w wersji 0 i 1", () => {
    expect(mp4DurationSeconds(box(0, 1000, 5041))).toBe(5.041);
    expect(mp4DurationSeconds(box(1, 90000, 450000))).toBe(5);
  });

  it("bez nagłówka → null", () => {
    expect(mp4DurationSeconds(new Uint8Array(64))).toBeNull();
  });
});
