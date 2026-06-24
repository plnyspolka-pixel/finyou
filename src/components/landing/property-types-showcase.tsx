import { useState } from "react";
import { ChevronDown, FileText, Sparkles } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import imgApartment from "@/assets/prop-apartment.jpg";
import imgHouse from "@/assets/prop-house.jpg";
import imgCommercial from "@/assets/prop-commercial.jpg";
import imgLandAgri from "@/assets/prop-land-agri.jpg";
import imgLandBuild from "@/assets/prop-land-build.jpg";

type PropType = {
  key: string;
  title: string;
  img: string;
  docs: string[];
};

const TYPES: PropType[] = [
  {
    key: "mieszkanie",
    title: "Mieszkanie",
    img: imgApartment,
    docs: [
      "Numer księgi wieczystej",
      "Zdjęcia każdego pomieszczenia",
      "Zdjęcia z zewnątrz",
    ],
  },
  {
    key: "dom",
    title: "Dom / dom w budowie",
    img: imgHouse,
    docs: [
      "Numer księgi wieczystej",
      "Zdjęcia z zewnątrz całego budynku",
      "Zdjęcia każdego pomieszczenia (z wyjątkiem piwnicy i strychu)",
      "Powierzchnia użytkowa",
    ],
  },
  {
    key: "lokal",
    title: "Lokal użytkowy / usługowy",
    img: imgCommercial,
    docs: [
      "Numer księgi wieczystej",
      "Zdjęcia każdego pomieszczenia",
      "Zdjęcia z zewnątrz",
      "Powierzchnia użytkowa (jeżeli lokal nie jest w bloku)",
    ],
  },
  {
    key: "rolna",
    title: "Grunt rolny",
    img: imgLandAgri,
    docs: [
      "Wypis z rejestru gruntów",
      "Numer księgi wieczystej (jeżeli nie ma go na wypisie)",
    ],
  },
  {
    key: "budowlana",
    title: "Działka budowlana",
    img: imgLandBuild,
    docs: [
      "Numer księgi wieczystej",
      "MPZP albo warunki zabudowy",
    ],
  },
];

export function PropertyTypesShowcase({
  onSelect,
  selectedKey,
}: {
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
} = {}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const selectMode = typeof onSelect === "function";

    <div className={selectMode ? "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>

      {TYPES.map((p, i) => {
        const isOpen = !selectMode && openKey === p.key;
        const isSelected = selectMode && selectedKey === p.key;
        const highlight = isOpen || isSelected;
        return (
          <BlurFade key={p.key} delay={0.06 + i * 0.05} inView>
            <div
              className={[
                "group relative overflow-hidden rounded-2xl p-[1.5px] transition-all duration-300",
                highlight
                  ? "shadow-[0_18px_55px_-15px_oklch(0.40_0.25_268/0.55)]"
                  : "shadow-[0_10px_30px_-15px_oklch(0.20_0.08_265/0.45)] hover:-translate-y-0.5 hover:shadow-[0_18px_55px_-15px_oklch(0.40_0.25_268/0.55)]",
              ].join(" ")}
              style={{
                background: highlight
                  ? "conic-gradient(from 140deg, oklch(0.40 0.25 268), oklch(0.65 0.18 240), oklch(0.55 0.20 255), oklch(0.30 0.15 265), oklch(0.40 0.25 268))"
                  : "linear-gradient(135deg, oklch(0.40 0.25 268 / 0.55), oklch(0.65 0.18 240 / 0.35), oklch(0.30 0.15 265 / 0.55))",
              }}
            >
              <div className="relative overflow-hidden rounded-[14px] bg-card">
                <button
                  type="button"
                  onClick={() => {
                    if (selectMode) {
                      onSelect!(p.key);
                    } else {
                      setOpenKey(isOpen ? null : p.key);
                    }
                  }}
                  aria-expanded={isOpen}
                  aria-pressed={isSelected}
                  className="relative block w-full text-left"
                >
                  <div className="relative h-44 w-full overflow-hidden">
                    <img
                      src={p.img}
                      alt={p.title}
                      loading="lazy"
                      width={800}
                      height={800}
                      className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-110"
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, oklch(0.13 0.04 265 / 0.15) 0%, oklch(0.18 0.06 265 / 0.55) 55%, oklch(0.13 0.04 265 / 0.95) 100%)",
                      }}
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl opacity-70 transition group-hover:opacity-90"
                      style={{
                        background:
                          "radial-gradient(circle, oklch(0.68 0.16 235 / 0.75), transparent 70%)",
                      }}
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -bottom-12 -left-6 h-36 w-36 rounded-full blur-2xl opacity-60 transition group-hover:opacity-80"
                      style={{
                        background:
                          "radial-gradient(circle, oklch(0.50 0.22 285 / 0.7), transparent 70%)",
                      }}
                    />

                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                      <h3 className="text-sm font-extrabold uppercase tracking-[0.14em] text-white drop-shadow-[0_2px_8px_oklch(0.13_0.04_265/0.9)] md:text-base">
                        {p.title}
                      </h3>
                      <span
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white ring-1 backdrop-blur transition",
                          highlight
                            ? "bg-white/25 ring-white/40"
                            : "bg-white/12 ring-white/25 group-hover:bg-white/20",
                        ].join(" ")}
                      >
                        {selectMode ? (isSelected ? "Wybrane" : "Wybierz") : "Dokumenty"}
                        {!selectMode && (
                          <ChevronDown
                            className={`h-3 w-3 transition ${isOpen ? "rotate-180" : ""}`}
                          />
                        )}
                      </span>
                    </div>
                  </div>
                </button>

                {!selectMode && (
                  <div
                    className={`grid transition-all duration-300 ease-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div
                        className="relative border-t border-white/10 p-5 text-white"
                        style={{
                          background:
                            "linear-gradient(160deg, oklch(0.20 0.08 265) 0%, oklch(0.15 0.05 265) 100%)",
                        }}
                      >
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
                          <Sparkles className="h-3.5 w-3.5" />
                          Co przygotować
                        </p>
                        <ul className="mt-3 space-y-2">
                          {p.docs.map((d) => (
                            <li
                              key={d}
                              className="flex items-start gap-2 text-sm text-white/90"
                            >
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.78_0.14_235)]" />
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3 text-xs text-white/55">
                          Każdą sprawę analizujemy indywidualnie — listę dopasujemy do
                          Twojej nieruchomości.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </BlurFade>
        );
      })}
    </div>
  );
}

export const PROPERTY_SHOWCASE_KEY_TO_SECURITY: Record<string, string> = {
  mieszkanie: "mieszkanie",
  dom: "dom",
  lokal: "lokal_uslugowy",
  rolna: "grunt_rolny",
  budowlana: "dzialka_budowlana",
};

