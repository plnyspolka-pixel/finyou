import { useState } from "react";
import {
  ChevronDown,
  FileText,
  Sparkles,
  Building2,
  Home,
  Store,
  Trees,
  Map,
  type LucideIcon,
} from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";

type PropType = {
  key: string;
  title: string;
  Icon: LucideIcon;
  docs: string[];
};

const TYPES: PropType[] = [
  {
    key: "mieszkanie",
    title: "Mieszkanie",
    Icon: Building2,
    docs: ["Numer księgi wieczystej", "Zdjęcia każdego pomieszczenia", "Zdjęcia z zewnątrz"],
  },
  {
    key: "dom",
    title: "Dom / dom w budowie",
    Icon: Home,
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
    Icon: Store,
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
    Icon: Trees,
    docs: ["Wypis z rejestru gruntów", "Numer księgi wieczystej (jeżeli nie ma go na wypisie)"],
  },
  {
    key: "budowlana",
    title: "Działka budowlana",
    Icon: Map,
    docs: ["Numer księgi wieczystej", "MPZP albo warunki zabudowy"],
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

  return (
    <div
      className={
        selectMode
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {TYPES.map((p, i) => {
        const isOpen = !selectMode && openKey === p.key;
        const isSelected = selectMode && selectedKey === p.key;
        const highlight = isOpen || isSelected;
        const Icon = p.Icon;

        if (selectMode) {
          return (
            <BlurFade key={p.key} delay={0.04 + i * 0.03}>
              <button
                type="button"
                onClick={() => onSelect!(p.key)}
                aria-pressed={isSelected}
                className={[
                  "group flex h-full min-h-[92px] w-full flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition-all",
                  isSelected
                    ? "border-primary/60 bg-gradient-to-br from-primary/25 to-primary/10 text-white shadow-lg shadow-primary/20 ring-1 ring-primary/50"
                    : "border-white/15 bg-white/[0.06] text-white/85 hover:bg-white/[0.1] hover:border-white/25",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors",
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-white/80 group-hover:text-white",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[11px] font-semibold leading-tight sm:text-xs">
                  {p.title}
                </span>
              </button>
            </BlurFade>
          );
        }

        return (
          <BlurFade key={p.key} delay={0.04 + i * 0.03}>
            <div className="rounded-xl border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : p.key)}
                aria-expanded={isOpen}
                className={[
                  "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                  highlight ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted/50",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                    highlight ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold leading-tight">
                  {p.title}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              <div
                className={`grid transition-all duration-200 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              >
                <div className="overflow-hidden">
                  <div className="border-t p-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      Co przygotować
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {p.docs.map((d) => (
                        <li key={d} className="flex items-start gap-2 text-sm">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Każdą sprawę analizujemy indywidualnie — listę dopasujemy do Twojej
                      nieruchomości.
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

export const PROPERTY_SHOWCASE_KEY_TO_SECURITY: Record<string, string> = {
  mieszkanie: "mieszkanie",
  dom: "dom",
  lokal: "lokal_uslugowy",
  rolna: "grunt_rolny",
  budowlana: "dzialka_budowlana",
};

export const PROPERTY_DOCS_BY_SECURITY: Record<string, { title: string; docs: string[] }> = {
  mieszkanie: { title: TYPES[0].title, docs: TYPES[0].docs },
  dom: { title: TYPES[1].title, docs: TYPES[1].docs },
  lokal_uslugowy: { title: TYPES[2].title, docs: TYPES[2].docs },
  grunt_rolny: { title: TYPES[3].title, docs: TYPES[3].docs },
  dzialka_budowlana: { title: TYPES[4].title, docs: TYPES[4].docs },
};
