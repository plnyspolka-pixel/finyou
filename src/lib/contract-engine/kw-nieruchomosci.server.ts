// Nieruchomości umowy z treści KW w cache (kw_documents): opis z działu I-O,
// sąd z okładki, właściciele i PESEL z działu II, obciążenia z działów III/IV
// jako `obciazenia[]`. Wspólne dla MCP (`draft_contract`, `kw_numbers`)
// i kreatora pożyczki (/admin/kreator-pozyczki).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { compactKwNumber, validateKwNumber } from "@/lib/kw";

async function oneOf<T = Record<string, any>>(q: any, table: string): Promise<T | null> {
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? null) as T | null;
}

function pesele(strona: any): string[] {
  const list = Array.isArray(strona) ? strona : strona ? [strona] : [];
  return list.map((p: any) => String(p?.pesel ?? "")).filter((p: string) => /^\d{11}$/.test(p));
}

/** Nieruchomości z treści KW w cache (kw_documents) → szkice `nieruchomosc` silnika. */
export interface NieruchomosciZKwOpcje {
  /**
   * Brak treści KW w cache: `true` (MCP) — błąd; `false` (kreator) — księga
   * pominięta z ostrzeżeniem, nieruchomość zostaje ze szkicu.
   */
  wymagajTresci?: boolean;
}

export async function nieruchomosciZKw(
  s: SupabaseClient,
  kwNumbers: string[],
  umowa: any,
  opcje: NieruchomosciZKwOpcje = { wymagajTresci: true },
): Promise<{ nieruchomosci: any[]; ostrzezenia: string[]; pominiete: string[] }> {
  const { decodeMaybeBase64 } = await import("@/lib/kw-fetch.server");
  const { kwDocumentToExtraction } = await import("@/lib/kw-extraction");
  const { mapujKwDoNieruchomosci } = await import("@/lib/contract-engine/kw-mapper");
  const { scalPatch } = await import("@/lib/contract-engine/umowa-agent-core");
  const out: any[] = [];
  const ostrzezenia: string[] = [];
  const pominiete: string[] = [];
  const istniejace: any[] = Array.isArray(umowa?.nieruchomosci) ? umowa.nieruchomosci : [];

  for (const [i, raw] of kwNumbers.entries()) {
    const kw = validateKwNumber(raw);
    if (!kw.ok) throw new Error(kw.message);
    const { compact, value: label } = kw;
    const row = await oneOf<Record<string, string | null>>(
      s
        .from("kw_documents")
        .select("kw_number, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4")
        .eq("kw_number", compact),
      "kw_documents",
    );
    const sekcje = row
      ? {
          kwNumber: row.kw_number,
          okladka: decodeMaybeBase64(row.okladka),
          dzial_1o: decodeMaybeBase64(row.dzial_1o),
          dzial_1s: decodeMaybeBase64(row.dzial_1s),
          dzial_2: decodeMaybeBase64(row.dzial_2),
          dzial_3: decodeMaybeBase64(row.dzial_3),
          dzial_4: decodeMaybeBase64(row.dzial_4),
        }
      : null;
    if (!sekcje || !(sekcje.dzial_1o || sekcje.dzial_2 || sekcje.dzial_4)) {
      if (opcje.wymagajTresci === false) {
        pominiete.push(label);
        ostrzezenia.push(
          `${label}: brak treści KW w cache — dane nieruchomości uzupełnij ręcznie.`,
        );
        continue;
      }
      throw new Error(
        `Brak treści KW ${label} w cache — pobierz ją najpierw narzędziem fetch_kw_content.`,
      );
    }
    const ekstrakcja = kwDocumentToExtraction(sekcje);

    // Właściciele z działu II jako szkic pożyczkobiorców, gdy szkic ich
    // jeszcze nie ma (imię i nazwisko, PESEL; adres uzupełnia użytkownik).
    if (!umowa?.pozyczkobiorca) {
      const osoby = (ekstrakcja.dzial2?.wlasciciele ?? []).filter((o) => o?.pesel && o?.nazwisko);
      if (osoby.length) {
        const strony = osoby.map((o) => ({
          typ: "osoba_fizyczna",
          imie_nazwisko: [o.imiePierwsze, o.imieDrugie, o.nazwisko].filter(Boolean).join(" "),
          pesel: o.pesel,
        }));
        umowa.pozyczkobiorca = strony.length === 1 ? strony[0] : strony;
        ostrzezenia.push(
          `${label}: pożyczkobiorców przyjęto z działu II (właściciele) — uzupełnij adresy i dane kontaktowe.`,
        );
      }
    }

    // Sąd prowadzący księgę: z okładki, a gdy jej brak — z innej księgi tego
    // samego wydziału (ten sam prefiks, np. KR1P) w cache kw_documents.
    if (!ekstrakcja.sadRejonowy) {
      const { data: inne } = await s
        .from("kw_documents")
        .select("kw_number, okladka, dzial_1o, dzial_2")
        .like("kw_number", `${compact.slice(0, 4)}%`)
        .neq("kw_number", compact)
        .limit(10);
      for (const d of inne ?? []) {
        const sad = kwDocumentToExtraction({
          kwNumber: d.kw_number,
          okladka: decodeMaybeBase64(d.okladka),
          dzial_1o: decodeMaybeBase64(d.dzial_1o),
          dzial_2: decodeMaybeBase64(d.dzial_2),
        }).sadRejonowy;
        if (sad) {
          ekstrakcja.sadRejonowy = sad;
          break;
        }
      }
    }

    const mapped = mapujKwDoNieruchomosci(ekstrakcja, {
      id: `N${i + 1}`,
      pozyczkobiorcaPesele: pesele(umowa?.pozyczkobiorca),
      poreczicielPesel: pesele(umowa?.porecziciel)[0] ?? null,
    });
    ostrzezenia.push(...mapped.ostrzezenia.map((o) => `${label}: ${o}`));
    if (mapped.odrzucona || !mapped.nieruchomosc) {
      throw new Error(
        `KW ${label}: sprawy nie da się obsłużyć silnikiem — ${mapped.powod ?? "brak powodu"}.`,
      );
    }
    // Pola podane wcześniej dla tej samej KW (np. hipoteka, sposób usunięcia
    // obciążeń) mają pierwszeństwo przed szkicem z mapera.
    const wczesniej = istniejace.find((n) => compactKwNumber(n?.nr_kw) === compact);
    out.push(wczesniej ? scalPatch(mapped.nieruchomosc, wczesniej) : mapped.nieruchomosc);
  }
  return { nieruchomosci: out, ostrzezenia, pominiete };
}
