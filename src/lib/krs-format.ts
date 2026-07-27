// Bezpieczne formatowanie osób z KRS — nigdy nie zwraca [object Object].
// Wyciąga konkretne pola tekstowe z (potencjalnie zagnieżdżonych) obiektów.

import type { KrsPerson } from "@/lib/krs.functions";

const FALLBACK = "Dane wymagają ręcznego uzupełnienia";

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // typowe zagnieżdżenia z KRS
    const candidates = [
      o.nazwiskoICzlon,
      o.nazwisko,
      o.pierwszyCzlonNazwiska,
      o.imie,
      o.imiePierwsze,
      o.imiona,
      o.nazwa,
      o.wartosc,
    ];
    for (const c of candidates) {
      const t = asText(c);
      if (t) return t;
    }
  }
  return "";
}

function joinName(...parts: unknown[]): string {
  return parts
    .map((p) => asText(p))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatBoardMember(p: KrsPerson | Record<string, any>): string {
  const fn = asText((p as any).role);
  const name = joinName((p as any).firstName, (p as any).lastName);
  if (!name) return FALLBACK;
  return fn ? `${name} — ${fn}` : name;
}

export const formatProxy = formatBoardMember;
export const formatRepresentationPerson = formatBoardMember;

export function formatShareholder(
  w:
    | {
        name?: unknown;
        share?: unknown;
        sharesCount?: unknown;
      }
    | Record<string, any>,
): string {
  const name = asText(w.name) || joinName((w as any).firstName, (w as any).lastName);
  if (!name) return FALLBACK;
  const share = asText(w.share);
  const count = asText(w.sharesCount);
  let out = name;
  if (share) out += ` — ${share}`;
  if (count) out += ` (${count} udziałów)`;
  return out;
}

/** Czy w pełnej etykiecie osoby (np. "F**** R***** — PREZES ZARZĄDU") obecna jest maska. */
export function labelContainsMask(label: string): boolean {
  return /\*/.test(label);
}

/** Zwraca tylko zamaskowaną część (przed " — funkcja"). */
export function extractMaskedNamePart(label: string): string {
  const idx = label.indexOf(" — ");
  return idx >= 0 ? label.slice(0, idx) : label;
}

/** Zwraca część funkcji po " — ". */
export function extractFunctionPart(label: string): string {
  const idx = label.indexOf(" — ");
  return idx >= 0 ? label.slice(idx + 3) : "";
}
