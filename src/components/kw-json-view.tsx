/**
 * Render treści KW pobranej z EasyMKW w formacie JSON.
 * Struktura odpowiedzi dostawcy jest zagnieżdżona i zmienna, więc renderujemy
 * ją rekurencyjnie: obiekty jako listy „etykieta → wartość”, tablice jako
 * kolejne pozycje. Klucze są tłumaczone tam, gdzie znamy odpowiednik.
 */

const LABELS: Record<string, string> = {
  okladka: "Okładka",
  dzial1o: "Dział I-O — Oznaczenie nieruchomości",
  dzial1s: "Dział I-Sp — Spis praw związanych",
  dzial2: "Dział II — Własność",
  dzial3: "Dział III — Prawa, roszczenia i ograniczenia",
  dzial4: "Dział IV — Hipoteki",
  nrKsiegiWieczystej: "Numer księgi wieczystej",
  stanZDnia: "Stan z dnia",
  kw: "Numer KW",
  kwNumber: "Numer KW",
  sad: "Sąd",
  polozenie: "Położenie",
  dzialki: "Działki",
  budynki: "Budynki",
  lokal: "Lokal",
  wlasciciele: "Właściciele",
  hipoteki: "Hipoteki",
  wzmianki: "Wzmianki",
};

function label(key: string): string {
  return LABELS[key] ?? key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function isEmpty(v: unknown): boolean {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function Value({ value }: { value: unknown }) {
  if (isEmpty(value)) return <span className="text-muted-foreground">—</span>;
  if (typeof value === "boolean")
    return <span>{value ? "Tak" : "Nie"}</span>;
  if (typeof value !== "object") return <span className="break-words">{String(value)}</span>;

  if (Array.isArray(value)) {
    return (
      <ol className="space-y-2">
        {value.map((item, i) => (
          <li key={i} className="rounded-md border border-border/60 bg-muted/30 p-2">
            <Value value={item} />
          </li>
        ))}
      </ol>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => !isEmpty(v));
  if (!entries.length) return <span className="text-muted-foreground">—</span>;
  return (
    <dl className="space-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="grid gap-0.5 sm:grid-cols-[minmax(11rem,auto)_1fr] sm:gap-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label(k)}
          </dt>
          <dd className="text-sm">
            <Value value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function KwJsonView({ data }: { data: unknown }) {
  if (isEmpty(data))
    return <p className="text-sm text-muted-foreground">Brak danych w odpowiedzi dostawcy.</p>;
  return (
    <div className="space-y-3 text-sm">
      <Value value={data} />
    </div>
  );
}
