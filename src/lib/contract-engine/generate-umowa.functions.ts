// ════════════════════════════════════════════════════════════════════
// GENERACJA UMOWY POŻYCZKI Z SILNIKA KLAUZUL (pkt 3.4)
//
// Zamyka most Kreator → silnik: dokument NIE jest już wypełnianym wzorem z
// lukami, lecz jest składany deterministycznie z biblioteki klauzul na podstawie
// `UmowaData` zbudowanej z profilu klienta i oferty.
//
// Przepływ:
//   ClientProfile (+ oferta)  →  profileToCalcPayload / buildUmowaData
//                             →  waliduj() + walidujHarmonogram()  (BRAMA)
//                             →  renderuj()  →  formatuj() (podgląd) / buildUmowaDocx() (.docx)
//
// Braki danych nie rzucają wyjątku — `waliduj()` zwraca je jako problemy do
// uzupełnienia przez operatora (BLAD = blokuje generację, OSTRZEZENIE/INFO = nie).
// ════════════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import type { ClientProfile } from "@/lib/client-profile-types";
import type { LoanCalcPayload } from "@/lib/loan-calc-pdf";
import { buildUmowaData, profileToCalcPayload, type BuildUmowaOptions } from "./profile-to-umowa";
import { waliduj } from "./validator";
import { walidujHarmonogram } from "./schedule";
import { renderuj } from "./renderer";
import { formatuj } from "./formatter";
import { buildUmowaDocx, harmonogramZUmowy } from "./umowa-docx";
import type { Problem } from "./validator";

export interface UmowaGenInput {
  profileId: string;
  /** Miejscowość zawarcia umowy — nie wynika z profilu (operator). */
  miejscowosc?: string;
  numerUmowy?: string;
  /** Data zawarcia umowy (YYYY-MM-DD lub DD.MM.RRRR). */
  dataUmowy?: string;
  /** Kalkulacja z kalkulatora; gdy brak — wyprowadzana z oferty w profilu. */
  calc?: LoanCalcPayload | null;
  /** Nieruchomości z mapera KW (zastępują stub z propertyData). */
  nieruchomosci?: any[];
  /** Głębokie nadpisania pól UmowaData (uzupełnienia operatora). */
  overrides?: Record<string, any>;
}

const inputSchema = z.object({
  profileId: z.string().uuid(),
  miejscowosc: z.string().optional(),
  numerUmowy: z.string().optional(),
  dataUmowy: z.string().optional(),
  calc: z.any().optional(),
  nieruchomosci: z.array(z.any()).optional(),
  overrides: z.record(z.string(), z.any()).optional(),
});

async function ladujProfil(supabase: any, profileId: string): Promise<ClientProfile> {
  const { data: row, error } = await supabase
    .from("client_profiles")
    .select("*")
    .eq("id", profileId)
    .single();
  if (error) throw new Error(error.message);
  return { ...(row.data as object), id: row.id, updatedAt: row.updated_at } as ClientProfile;
}

/** Wspólny rdzeń: profil → UmowaData + problemy walidacji + wyrenderowany dokument. */
function zbudujIzweryfikuj(profile: ClientProfile, input: UmowaGenInput) {
  const calc = input.calc ?? profileToCalcPayload(profile);
  if (!calc) {
    const problem: Problem = {
      poziom: "BLAD",
      sciezka: "offerData",
      komunikat:
        "Brak danych oferty do policzenia harmonogramu (kwota, okres, maks. rata, data wypłaty). Uzupełnij ofertę w profilu.",
    };
    return { calc: null, umowa: null, problemy: [problem], blocked: true };
  }

  const opts: BuildUmowaOptions = {
    dataUmowy: input.dataUmowy,
    miejscowosc: input.miejscowosc,
    numerUmowy: input.numerUmowy,
    nieruchomosci: input.nieruchomosci,
    overrides: input.overrides,
  };
  const umowa = buildUmowaData(profile, calc, opts);

  const problemy: Problem[] = [...waliduj(umowa), ...walidujHarmonogram(umowa.warunki)];
  const blocked = problemy.some((p) => p.poziom === "BLAD");
  return { calc, umowa, problemy, blocked };
}

// ─────────────────────────────────────────────────────────────────────
// Podgląd (tekstowy) + walidacja — bez zapisu do Storage
// ─────────────────────────────────────────────────────────────────────

export const previewUmowaFromEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input) as UmowaGenInput)
  .handler(async ({ data, context }) => {
    const profile = await ladujProfil(context.supabase, data.profileId);
    const { umowa, problemy, blocked } = zbudujIzweryfikuj(profile, data);

    let previewText = "";
    if (umowa && !blocked) {
      try {
        previewText = formatuj(renderuj(umowa));
      } catch (e: any) {
        problemy.push({
          poziom: "BLAD",
          sciezka: "render",
          komunikat: `Nie udało się wyrenderować dokumentu: ${e?.message ?? e}`,
        });
      }
    }

    return { previewText, problemy, blocked: blocked || problemy.some((p) => p.poziom === "BLAD") };
  });

// ─────────────────────────────────────────────────────────────────────
// Generacja pliku .docx — zapis do Storage + wpis do generated_documents
// ─────────────────────────────────────────────────────────────────────

export const generateUmowaFromEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input) as UmowaGenInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await ladujProfil(supabase, data.profileId);
    const { umowa, problemy, blocked } = zbudujIzweryfikuj(profile, data);

    // Brama: przy błędach blokujących nie generujemy pliku — zwracamy braki.
    if (!umowa || blocked) {
      return { docxPath: null, signedUrl: null, problemy, blocked: true };
    }

    // Render może rzucić BladPola dla pola szablonu, które przechodzi schemat
    // (np. brak wartości podstawianej w klauzuli) — traktujemy to jak brak
    // blokujący, nie jak błąd 500.
    let bytes: Uint8Array;
    try {
      const doc = renderuj(umowa);
      bytes = await buildUmowaDocx(doc, harmonogramZUmowy(umowa));
    } catch (e: any) {
      problemy.push({
        poziom: "BLAD",
        sciezka: "render",
        komunikat: `Nie udało się złożyć dokumentu: ${e?.message ?? e}`,
      });
      return { docxPath: null, signedUrl: null, problemy, blocked: true };
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const nazwa = (umowa.meta?.numer_umowy || "umowa-pozyczki")
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .slice(0, 60);
    const outPath = `generated/${userId}/${ts}_${nazwa}.docx`;

    const { error: upErr } = await supabase.storage.from(CLIENT_FILES_BUCKET).upload(
      outPath,
      new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      { upsert: false },
    );
    if (upErr) throw new Error(`Upload DOCX: ${upErr.message}`);

    // Wpis do rejestru dokumentów — best-effort (nie blokuje wyniku, gdy schemat
    // wymaga innych pól niż przy generacji z wzoru).
    try {
      // Tabela nie ma kolumny client_profile_id — powiązanie z profilem
      // trafia do form_data (Json), inaczej insert jest odrzucany.
      await supabase.from("generated_documents").insert({
        template_name: "Umowa pożyczki (silnik klauzul)",
        form_data: { client_profile_id: data.profileId },
        docx_path: outPath,
        file_size_bytes: bytes.length,
        created_by: userId,
      });
    } catch {
      /* rejestracja pomocnicza — pomijalna */
    }

    const { data: signed } = await supabase.storage
      .from(CLIENT_FILES_BUCKET)
      .createSignedUrl(outPath, 3600);

    return { docxPath: outPath, signedUrl: signed?.signedUrl ?? null, problemy, blocked: false };
  });
