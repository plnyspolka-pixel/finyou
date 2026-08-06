import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  accentClasses,
  adminSections,
  allAdminNavItems,
  type AccentKey,
} from "@/lib/admin-nav";

/** Zdarzenie otwierające wyszukiwarkę — triggery nie potrzebują wspólnego kontekstu. */
const OPEN_EVENT = "fy:admin-search-open";

export type SearchResult = {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  to: string;
  sectionId: string;
  sectionLabel: string;
};

export interface SearchProvider {
  id: string;
  search(query: string): SearchResult[];
}

/** Normalizacja do dopasowań: małe litery + zdjęte polskie diakrytyki (ł→l itd.). */
function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Provider modułów panelu — indeks z `admin-nav.ts`, opcjonalnie zawężony do ról. */
function createModulesProvider(allowedPaths?: string[]): SearchProvider {
  const items = allAdminNavItems.filter(
    (it) => !allowedPaths || allowedPaths.includes(it.to),
  );
  const indexed = items.map((it) => ({
    item: it,
    haystack: normalizeSearchText(
      [it.label, it.sectionLabel, it.to, ...it.synonyms].join(" "),
    ),
  }));
  return {
    id: "modules",
    search(query: string): SearchResult[] {
      const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
      return indexed
        .filter(({ haystack }) => tokens.every((t) => haystack.includes(t)))
        .map(({ item }) => ({
          id: `modules:${item.to}`,
          label: item.label,
          description: item.description,
          icon: item.icon,
          to: item.to,
          sectionId: item.sectionId,
          sectionLabel: item.sectionLabel,
        }));
    },
  };
}

// Przyszłe providery rekordów (np. klienci po nazwisku/telefonie, wnioski po ID)
// — dopisać tutaj; wyniki dołączą do listy pod modułami.
const extraProviders: SearchProvider[] = [];

const sectionAccent = new Map<string, AccentKey>(adminSections.map((s) => [s.id, s.accent]));
const sectionOrder = new Map<string, number>(adminSections.map((s, i) => [s.id, i]));

type AdminSearchDialogProps = {
  /** Zawężenie indeksu do dozwolonych ścieżek (np. rola `ksiegowosc`). */
  allowedPaths?: string[];
};

/**
 * Globalna wyszukiwarka modułów panelu admina. Montowana raz w layoucie;
 * otwierana skrótem Cmd/Ctrl+K albo triggerami poniżej. Na mobile pełny ekran.
 */
export function AdminSearchDialog({ allowedPaths }: AdminSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const providers = useMemo(
    () => [createModulesProvider(allowedPaths), ...extraProviders],
    [allowedPaths],
  );

  const grouped = useMemo(() => {
    const results = providers.flatMap((p) => p.search(query));
    const bySection = new Map<string, { label: string; results: SearchResult[] }>();
    for (const r of results) {
      const g = bySection.get(r.sectionId) ?? { label: r.sectionLabel, results: [] };
      g.results.push(r);
      bySection.set(r.sectionId, g);
    }
    return [...bySection.entries()].sort(
      ([a], [b]) => (sectionOrder.get(a) ?? 99) - (sectionOrder.get(b) ?? 99),
    );
  }, [providers, query]);

  const go = (to: string) => {
    setOpen(false);
    void navigate({ to });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="h-dvh w-screen max-w-none gap-0 rounded-none p-0 sm:h-auto sm:w-full sm:max-w-xl sm:rounded-lg">
        <DialogTitle className="sr-only">Wyszukiwarka modułów</DialogTitle>
        <Command shouldFilter={false} className="h-full">
          <CommandInput
            placeholder="Szukaj modułów…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-none flex-1 sm:max-h-[60vh]">
            <CommandEmpty>Brak wyników.</CommandEmpty>
            {grouped.map(([sectionId, group]) => {
              const accent = accentClasses[sectionAccent.get(sectionId) ?? "slate"];
              return (
                <CommandGroup key={sectionId} heading={group.label}>
                  {group.results.map((r) => (
                    <CommandItem key={r.id} value={r.id} onSelect={() => go(r.to)}>
                      <span
                        aria-hidden
                        className={cn("h-5 w-1 shrink-0 rounded-full", accent.dot)}
                      />
                      <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate">{r.label}</span>
                        {r.description && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.description}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function openSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Przycisk-input wyszukiwarki do top bara (desktop). */
export function AdminSearchTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openSearch}
      className={cn(
        "flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Szukaj modułów…</span>
      <kbd className="pointer-events-none hidden select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground lg:inline-flex">
        ⌘K
      </kbd>
    </button>
  );
}

/** Lupa do mobilnego headera — otwiera wyszukiwarkę pełnoekranowo. */
export function AdminSearchIconTrigger() {
  return (
    <Button variant="ghost" size="icon" aria-label="Szukaj modułów" onClick={openSearch}>
      <Search className="h-5 w-5" />
    </Button>
  );
}
