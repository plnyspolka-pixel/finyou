// Analiza AI jednego obwieszczenia KRZ: etap postępowania, rodzaj dłużnika,
// streszczenie, termin dla wierzycieli i sygnał ryzyka. Structured outputs
// przez wspólny helper `claudeJson` (fetch, bez SDK — działa też na Workerze).
import { claudeJson } from "@/lib/claude-json.server";
import type { KrzAiAnalysis, KrzNoticeDetail } from "./types";
import { displayName } from "./parse";

export const KRZ_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "etap",
    "rodzajPodmiotu",
    "streszczenie",
    "kluczoweFakty",
    "terminDlaWierzycieli",
    "sygnalRyzyka",
    "uzasadnienieRyzyka",
    "wartoSprawdzicWBazie",
    "identyfikatory",
  ],
  properties: {
    etap: {
      type: "string",
      enum: [
        "wniosek",
        "zabezpieczenie",
        "otwarcie",
        "ogloszenie_upadlosci",
        "oddalenie",
        "uklad",
        "plan_splaty",
        "umorzenie",
        "zakonczenie",
        "inne",
      ],
    },
    rodzajPodmiotu: { type: "string", enum: ["konsument", "jdg", "spolka", "inny"] },
    streszczenie: { type: "string", description: "2–3 zdania po polsku, bez PESEL." },
    kluczoweFakty: { type: "array", items: { type: "string" }, maxItems: 6 },
    terminDlaWierzycieli: {
      type: ["string", "null"],
      description:
        "Najbliższy termin istotny dla wierzyciela (np. zgłoszenie wierzytelności, zażalenie) w formacie YYYY-MM-DD lub opis; null gdy brak.",
    },
    sygnalRyzyka: { type: "string", enum: ["niski", "sredni", "wysoki"] },
    uzasadnienieRyzyka: { type: "string" },
    wartoSprawdzicWBazie: { type: "boolean" },
    identyfikatory: {
      type: "object",
      additionalProperties: false,
      required: ["krs", "nip"],
      properties: { krs: { type: ["string", "null"] }, nip: { type: ["string", "null"] } },
    },
  },
} as const;

const SYSTEM = `Jesteś analitykiem Finyou (platforma pożyczek pod zastaw nieruchomości). Dostajesz jedno obwieszczenie z Krajowego Rejestru Zadłużonych (KRZ).
Zadanie: sklasyfikuj etap postępowania, rodzaj dłużnika i napisz zwięzłe streszczenie dla inwestora/operatora.
Zasady:
- Pisz po polsku, rzeczowo, bez ocen moralnych.
- Nie wymyślaj faktów spoza obwieszczenia. Jeśli czegoś nie ma, wpisz null lub "inne".
- Nigdy nie przepisuj numerów PESEL ani adresów zamieszkania osób fizycznych.
- sygnalRyzyka: "wysoki" = ogłoszona upadłość, otwarte postępowanie sanacyjne/układowe, zabezpieczenie majątku; "sredni" = sam wniosek dłużnika lub ustanowienie tymczasowego nadzorcy; "niski" = czynności techniczne (sprawozdania, zmiana nadzorcy, zakończenie bez skutków dla wierzycieli).
- wartoSprawdzicWBazie = true, gdy podmiot to spółka lub osoba prowadząca działalność, albo gdy obwieszczenie otwiera/ogłasza postępowanie (potencjalny pożyczkobiorca, poręczyciel lub kontrahent w bazie Finyou).`;

export function detailToPrompt(d: KrzNoticeDetail): string {
  const p = d.podmiot;
  const lines = [
    `Tytuł: ${d.tytul ?? "-"}`,
    `Sygnatura: ${d.sygnaturaAkt ?? "-"}; numer: ${d.numerObwieszczenia ?? "-"}; data: ${d.dataObwieszczenia ?? "-"}`,
    `Sąd: ${d.sad ?? "-"}, ${d.wydzial ?? "-"}`,
    `Podmiot: ${displayName(d)} (${p.rodzaj}${p.formaPrawna ? ", " + p.formaPrawna : ""}${
      p.prowadziDzialalnosc === true
        ? ", prowadzi działalność"
        : p.prowadziDzialalnosc === false
          ? ", nie prowadzi działalności"
          : ""
    })`,
    `KRS: ${p.krs ?? "-"}; NIP: ${p.nip ?? "-"}; miejscowość: ${p.miejscowosc ?? "-"}`,
    `Atrybuty: ${JSON.stringify(d.atrybuty)}`,
    `Doradcy: ${d.doradcy.map((x) => `${x.zdarzenie ?? ""}: ${x.tytul ?? x.nazwa ?? ""}`).join(" | ") || "-"}`,
    "",
    "Treść obwieszczenia:",
    d.tresc.slice(0, 6000),
  ];
  return lines.join("\n");
}

export async function analyzeKrzNotice(d: KrzNoticeDetail): Promise<KrzAiAnalysis> {
  return claudeJson<KrzAiAnalysis>({
    label: "krz_obwieszczenie",
    system: SYSTEM,
    content: [{ type: "text", text: detailToPrompt(d) }],
    schema: KRZ_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    effort: "low",
    maxTokens: 1500,
  });
}
