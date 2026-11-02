/** Deterministyczny Pakiet Startowy. Model AI wyłącznie odczytuje dokument, nie ustala prawa. */
export const WINDYKATOR_PRICE_GROSZ = 5000 as const;
export const WINDYKATOR_TERMS_VERSION = "windykator-startowy-2026-11-02-v1";

export interface SourceFacts {
  documentType: "invoice" | "loan" | "other" | "unknown";
  creditor: string | null;
  debtor: string | null;
  documentNumber: string | null;
  amount: number | null;
  dueDate: string | null;
  evidence: string[];
  missing: string[];
  summary: string;
}
export interface SubmittedClaim {
  creditorName: string;
  debtorName: string;
  amount: number;
  dueDate: string;
  claimKind: "invoice" | "loan" | "other";
  description?: string | null;
}
export interface Review {
  ready: boolean;
  warnings: string[];
  report: string;
  notice: string;
  epuDraft: string | null;
}
const clean = (v: unknown, max = 240) => String(v ?? "").replace(/[<>{}]/g, "").trim().slice(0, max);
const money = (v: number) => Number(v).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
const norm = (v: string) => v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameName = (a: string, b: string) => norm(a) === norm(b);
const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Nigdy nie wysyłamy żądań na podstawie niejednoznacznej ekstrakcji OCR. */
export function assembleStartPackage(claim: SubmittedClaim, facts: SourceFacts, today = new Date().toISOString().slice(0, 10)): Review {
  const warnings: string[] = [];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(claim.dueDate) ? claim.dueDate : "";
  if (!date || date > today) warnings.push("Niepotwierdzona wymagalność lub przyszły termin.");
  if (!Number.isFinite(claim.amount) || claim.amount <= 0) warnings.push("Nieprawidłowa kwota roszczenia.");
  if (!facts.creditor || !sameName(facts.creditor, claim.creditorName)) warnings.push("Nie potwierdzono zgodności wierzyciela z dokumentem.");
  if (!facts.debtor || !sameName(facts.debtor, claim.debtorName)) warnings.push("Nie potwierdzono zgodności dłużnika z dokumentem.");
  if (facts.amount == null || !sameMoney(facts.amount, claim.amount)) warnings.push("Nie potwierdzono kwoty z dokumentem.");
  if (!facts.dueDate || facts.dueDate !== date) warnings.push("Termin z dokumentu różni się od oświadczenia wierzyciela.");
  if (facts.documentType === "unknown") warnings.push("Nie rozpoznano rodzaju dokumentu.");
  if (facts.documentType !== "unknown" && claim.claimKind !== "other" && facts.documentType !== claim.claimKind) warnings.push("Rodzaj dokumentu nie odpowiada zgłoszonemu roszczeniu.");
  if (facts.missing.length) warnings.push("Wskazane braki dokumentacji: " + facts.missing.map(x => clean(x, 100)).join("; "));
  warnings.push("Brak integracji bankowej: brak niezależnego potwierdzenia niezapłacenia zobowiązania.");
  warnings.push("Autentyczność dokumentu, wykonanie świadczenia, umocowanie oraz ewentualne przedawnienie wymagają dodatkowej kontroli.");
  const critical = facts.missing.length > 0 || warnings.some(x => /Nie potwierdzono|Nieprawidłowa|Niepotwierdzona wymagalność|Nie rozpoznano|Termin z dokumentu różni|Rodzaj dokumentu nie odpowiada/.test(x));
  const creditor = clean(claim.creditorName);
  const debtor = clean(claim.debtorName);
  const id = clean(facts.documentNumber ?? "dokument wskazany w zgłoszeniu", 100);
  const report = [
    "PAKIET STARTOWY — RAPORT ANALIZY DOKUMENTÓW",
    "Wierzyciel: " + creditor,
    "Wskazany dłużnik: " + debtor,
    "Rodzaj roszczenia: " + claim.claimKind,
    "Numer dokumentu: " + id,
    "Kwota deklarowana: " + money(claim.amount),
    "Termin deklarowany: " + date,
    "Opis dokumentu: " + clean(facts.summary, 1200),
    "Dowody wskazane w pliku: " + facts.evidence.map(x=>clean(x,120)).join("; "),
    "",
    "WYNIK KONTROLI",
    ...warnings.map(x => "- " + x),
    "",
    "Raport jest automatyczną analizą danych, nie orzeczeniem o istnieniu długu ani opinią prawną.",
    "Przed wysyłką wezwania należy potwierdzić aktualne saldo i uprawnienie wierzyciela."
  ].join("\n");
  const notice = [
    "PROJEKT — WEZWANIE DO ZAPŁATY (NIEWYSŁANE)",
    "Wierzyciel: " + creditor,
    "Obsługa windykacji polubownej na zlecenie wierzyciela: Finance You sp. z o.o.",
    "Adresat: " + debtor,
    "Dotyczy: " + id,
    "Według oświadczenia wierzyciela należność wynosi " + money(claim.amount) + " i była wymagalna " + date + ".",
    "Prosimy o wyjaśnienie stanu rozliczenia oraz — jeżeli należność jest wymagalna i niezapłacona — jej uregulowanie",
    "na rachunek wskazany i zweryfikowany przez wierzyciela (rachunek nie został podany w tej wersji).",
    "Jeżeli należność została zapłacona, jest sporna albo występują inne zastrzeżenia, prosimy o zgłoszenie ich operatorowi.",
    "Projekt do zatwierdzenia, bez skutków wysyłki."
  ].join("\n\n");
  const threeYearsAgo = today.slice(0,4) && String(Number(today.slice(0,4))-3) + today.slice(4);
  const epu = !critical && date >= threeYearsAgo ? [
    "ROBOCZY SZKIC DANYCH POZWU DO EPU — NIE JEST POZWEM WNIESIONYM",
    "Powód: " + creditor,
    "Pozwany: " + debtor,
    "Żądanie główne: " + money(claim.amount),
    "Wymagalność: " + date,
    "Źródło: " + id,
    "Opis roszczenia: " + clean(facts.summary,1000),
    "Wskazanie dowodów: " + facts.evidence.map(x=>clean(x,120)).join("; "),
    "Do uzupełnienia i oceny prawnej: dane identyfikacyjne stron, właściwe odsetki, właściwość i dopuszczalność EPU,",
    "przedawnienie, nieuiszczone wpłaty, wymagane oświadczenia i informacja o próbie ugodowej.",
    "Nie składać bez kontroli i aktualnego potwierdzenia salda."
  ].join("\n") : null;
  return {ready: !critical, warnings, report, notice, epuDraft: epu};
}
