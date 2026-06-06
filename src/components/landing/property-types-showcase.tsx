import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
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

export function PropertyTypesShowcase() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TYPES.map((p, i) => {
        const isOpen = openKey === p.key;
        return (
          <BlurFade key={p.key} delay={0.08 + i * 0.06} inView>
            <div
              className={`group overflow-hidden rounded-2xl border bg-card shadow-sm transition ${
                isOpen
                  ? "border-accent/70 shadow-xl"
                  : "border-border hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-xl"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : p.key)}
                aria-expanded={isOpen}
                className="relative block w-full text-left"
              >
                <div className="relative h-44 w-full overflow-hidden">
                  <img
                    src={p.img}
                    alt={p.title}
                    loading="lazy"
                    width={800}
                    height={800}
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/40 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                    <h3 className="text-base font-extrabold text-white drop-shadow-sm md:text-lg">
                      {p.title}
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white ring-1 ring-white/30 backdrop-blur">
                      Dokumenty
                      <ChevronDown
                        className={`h-3 w-3 transition ${isOpen ? "rotate-180" : ""}`}
                      />
                    </span>
                  </div>
                </div>
              </button>

              <div
                className={`grid transition-all duration-300 ease-out ${
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-border bg-secondary/40 p-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-accent">
                      Co przygotować
                    </p>
                    <ul className="mt-3 space-y-2">
                      {p.docs.map((d) => (
                        <li
                          key={d}
                          className="flex items-start gap-2 text-sm text-foreground"
                        >
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Każdą sprawę analizujemy indywidualnie — listę dopasujemy do
                      Twojej nieruchomości.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </BlurFade>
        );
      })}
    </div>
  );
}
