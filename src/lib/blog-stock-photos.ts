// Kuratorska pula darmowych zdjęć stockowych (Unsplash) — finanse, biznes,
// nieruchomości, inwestycje. Hot-linking z images.unsplash.com jest dozwolony
// przez licencję Unsplash. Każde zdjęcie używane jako baza okładki bloga —
// wordmark Finance You jest nakładany w UI (overlay CSS), nie wbijany w piksele.

export interface StockPhoto {
  url: string;
  alt: string;
  tags: Array<"borrower" | "investor" | "review" | "any">;
}

const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=75`;

export const STOCK_PHOTOS: StockPhoto[] = [
  // Nieruchomości / pożyczki pod zastaw
  {
    url: U("photo-1560518883-ce09059eeffa"),
    alt: "Klucze do mieszkania na tle dokumentów",
    tags: ["borrower", "any"],
  },
  {
    url: U("photo-1568605114967-8130f3a36994"),
    alt: "Nowoczesny budynek mieszkalny",
    tags: ["borrower", "review", "any"],
  },
  {
    url: U("photo-1570129477492-45c003edd2be"),
    alt: "Dom jednorodzinny w Polsce",
    tags: ["borrower", "any"],
  },
  {
    url: U("photo-1554995207-c18c203602cb"),
    alt: "Wnętrze nowoczesnego mieszkania",
    tags: ["borrower", "any"],
  },
  {
    url: U("photo-1448630360428-65456885c650"),
    alt: "Działka budowlana z widokiem",
    tags: ["borrower", "any"],
  },
  {
    url: U("photo-1582407947304-fd86f028f716"),
    alt: "Plan architektoniczny mieszkania",
    tags: ["borrower", "any"],
  },

  // Finanse / pieniądze / dokumenty
  {
    url: U("photo-1554224155-6726b3ff858f"),
    alt: "Polskie banknoty 100 zł",
    tags: ["borrower", "any"],
  },
  {
    url: U("photo-1579621970795-87facc2f976d"),
    alt: "Kalkulator i monety na biurku",
    tags: ["borrower", "investor", "any"],
  },
  {
    url: U("photo-1450101499163-c8848c66ca85"),
    alt: "Dokumenty finansowe na biurku",
    tags: ["borrower", "any"],
  },
  {
    url: U("photo-1554224154-26032ffc0d07"),
    alt: "Banknoty euro w portfelu",
    tags: ["borrower", "investor", "any"],
  },
  {
    url: U("photo-1611974789855-9c2a0a7236a3"),
    alt: "Polskie monety i banknoty",
    tags: ["borrower", "any"],
  },

  // Inwestor / rynek
  {
    url: U("photo-1611974789855-9c2a0a7236a3"),
    alt: "Inwestor analizujący dane",
    tags: ["investor", "review"],
  },
  {
    url: U("photo-1590283603385-17ffb3a7f29f"),
    alt: "Wykres giełdowy na monitorze",
    tags: ["investor", "review", "any"],
  },
  {
    url: U("photo-1611224923853-80b023f02d71"),
    alt: "Trader analizuje wykresy",
    tags: ["investor", "review"],
  },
  {
    url: U("photo-1551288049-bebda4e38f71"),
    alt: "Wykresy finansowe na ekranie",
    tags: ["investor", "review"],
  },
  {
    url: U("photo-1460925895917-afdab827c52f"),
    alt: "Analiza danych na laptopie",
    tags: ["investor", "review", "any"],
  },
  {
    url: U("photo-1543286386-713bdd548da4"),
    alt: "Wykres wzrostu na tablecie",
    tags: ["investor", "review"],
  },
  {
    url: U("photo-1642543492481-44e81e3914a7"),
    alt: "Sala konferencyjna inwestorów",
    tags: ["investor", "review"],
  },
  {
    url: U("photo-1604594849809-dfedbc827105"),
    alt: "Wykres świecowy giełdy",
    tags: ["investor", "review"],
  },

  // Biuro / spotkania / podpis umowy
  {
    url: U("photo-1664575602807-e002fc1ce7e7"),
    alt: "Podpisywanie umowy",
    tags: ["borrower", "investor", "any"],
  },
  {
    url: U("photo-1556761175-5973dc0f32e7"),
    alt: "Spotkanie biznesowe",
    tags: ["investor", "any"],
  },
  {
    url: U("photo-1454165804606-c3d57bc86b40"),
    alt: "Praca z dokumentami w biurze",
    tags: ["borrower", "investor", "any"],
  },
  {
    url: U("photo-1521791136064-7986c2920216"),
    alt: "Uścisk dłoni po umowie",
    tags: ["borrower", "investor", "any"],
  },
  {
    url: U("photo-1606857521015-7f9fcf423740"),
    alt: "Doradca finansowy w biurze",
    tags: ["borrower", "investor", "any"],
  },

  // Warszawa / Polska
  {
    url: U("photo-1568797629192-7459d7c39c4d"),
    alt: "Panorama Warszawy o zmierzchu",
    tags: ["investor", "review", "any"],
  },
  {
    url: U("photo-1567002912497-4ed79be8a317"),
    alt: "Centrum biznesowe w Warszawie",
    tags: ["investor", "review"],
  },
];

export function pickStockPhoto(audience: "borrower" | "investor", isReview: boolean): StockPhoto {
  const wantTag = isReview ? "review" : audience;
  const pool = STOCK_PHOTOS.filter((p) => p.tags.includes(wantTag) || p.tags.includes("any"));
  return pool[Math.floor(Math.random() * pool.length)];
}
