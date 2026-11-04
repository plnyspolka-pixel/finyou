// Wersja demonstracyjna modułu Centrum Zarządzania (dokumenty, CRM, e-podpis,
// compliance) — dostępna bez logowania. Działa wyłącznie w przeglądarce, na
// fikcyjnych danych: nic nie jest zapisywane ani wysyłane na serwer.
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, FileText, PenLine, ShieldCheck, Users } from "lucide-react";

type Tab = "docs" | "crm" | "esign" | "aml";

const TABS: Array<{ key: Tab; label: string; icon: typeof FileText }> = [
  { key: "docs", label: "Dokumenty", icon: FileText },
  { key: "crm", label: "CRM", icon: Users },
  { key: "esign", label: "E-podpis", icon: PenLine },
  { key: "aml", label: "Compliance", icon: ShieldCheck },
];

const TEMPLATES = {
  wezwanie: {
    name: "Wezwanie do zapłaty",
    body: (v: DocValues) =>
      `${v.city}, ${v.date}\n\nWEZWANIE DO ZAPŁATY\n\nSzanowny Panie / Szanowna Pani ${v.party},\n\n` +
      `na podstawie umowy pożyczki z dnia ${v.contractDate} wzywam do zapłaty kwoty ${v.amount} zł ` +
      `w terminie ${v.days} dni od dnia doręczenia niniejszego wezwania na rachunek wskazany w umowie.\n\n` +
      `Brak zapłaty w wyznaczonym terminie spowoduje skierowanie sprawy na drogę postępowania sądowego.\n\nZ poważaniem\nPożyczkodawca`,
  },
  aneks: {
    name: "Aneks do umowy pożyczki",
    body: (v: DocValues) =>
      `ANEKS NR 1\ndo umowy pożyczki z dnia ${v.contractDate}\n\nzawarty w ${v.city} dnia ${v.date} pomiędzy Pożyczkodawcą ` +
      `a ${v.party} (Pożyczkobiorca).\n\n§ 1. Strony zgodnie zmieniają termin spłaty pozostałej kwoty ${v.amount} zł, ` +
      `przesuwając go o ${v.days} dni.\n§ 2. Pozostałe postanowienia umowy pozostają bez zmian.`,
  },
  ugoda: {
    name: "Porozumienie w sprawie spłaty (ugoda)",
    body: (v: DocValues) =>
      `POROZUMIENIE W SPRAWIE SPŁATY\n\n${v.city}, ${v.date}\n\n${v.party} uznaje zadłużenie w kwocie ${v.amount} zł ` +
      `wynikające z umowy z dnia ${v.contractDate} i zobowiązuje się do jego spłaty w ratach w ciągu ${v.days} dni.`,
  },
} as const;
type TemplateKey = keyof typeof TEMPLATES;
type DocValues = { party: string; amount: string; days: string; city: string; date: string; contractDate: string };

const STAGES = ["Nowy", "Weryfikacja", "Umowa", "Spłata"] as const;
type Stage = (typeof STAGES)[number];
const DEMO_CLIENTS: Array<{ id: number; name: string; city: string; amount: number; ltv: number; stage: Stage }> = [
  { id: 1, name: "Jan Przykładowy", city: "Poznań", amount: 120_000, ltv: 38, stage: "Weryfikacja" },
  { id: 2, name: "Anna Testowa", city: "Kraków", amount: 260_000, ltv: 45, stage: "Umowa" },
  { id: 3, name: "Demo Sp. z o.o.", city: "Gdańsk", amount: 480_000, ltv: 41, stage: "Nowy" },
  { id: 4, name: "Piotr Wzorcowy", city: "Lublin", amount: 90_000, ltv: 29, stage: "Spłata" },
];

const RISK_FACTORS = [
  { key: "pep", label: "Klient lub beneficjent rzeczywisty jest PEP", weight: 3 },
  { key: "country", label: "Powiązanie z państwem wysokiego ryzyka", weight: 3 },
  { key: "cash", label: "Transakcja gotówkowa ≥ 15 000 EUR", weight: 2 },
  { key: "sof", label: "Brak udokumentowanego źródła środków", weight: 3 },
  { key: "structure", label: "Nieprzejrzysta struktura własności", weight: 2 },
  { key: "remote", label: "Relacja nawiązana bez fizycznej obecności", weight: 1 },
] as const;

export function ManagementDemo() {
  const [tab, setTab] = useState<Tab>("docs");
  return (
    <div className="fy-demo" aria-label="Wersja demonstracyjna Centrum Zarządzania">
      <div className="fy-demo-bar">
        <span className="fy-demo-badge">DEMO · bez logowania · dane fikcyjne</span>
        <div role="tablist" className="fy-demo-tabs">
          {TABS.map(({ key, label, icon: I }) => (
            <button key={key} role="tab" type="button" aria-selected={tab === key}
              className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              <I size={16} /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="fy-demo-body" role="tabpanel">
        {tab === "docs" && <DocsDemo />}
        {tab === "crm" && <CrmDemo />}
        {tab === "esign" && <EsignDemo />}
        {tab === "aml" && <AmlDemo />}
      </div>
      <p className="fy-demo-foot">
        To podgląd działania modułu. W pełnej wersji dokumenty generujesz do DOCX, klienci i podpisy są
        zapisywane na Twoim koncie, a screening korzysta z list sankcyjnych i PEP.
      </p>
    </div>
  );
}

function DocsDemo() {
  const [tpl, setTpl] = useState<TemplateKey>("wezwanie");
  const [v, setV] = useState<DocValues>({
    party: "Jan Przykładowy", amount: "120 000", days: "14", city: "Poznań",
    date: new Date().toLocaleDateString("pl-PL"), contractDate: "15.03.2026",
  });
  const [generated, setGenerated] = useState(false);
  const field = (k: keyof DocValues, label: string) => (
    <label key={k}><span>{label}</span>
      <input value={v[k]} onChange={(e) => { setV({ ...v, [k]: e.target.value }); setGenerated(false); }} />
    </label>
  );
  return (
    <div className="fy-demo-grid">
      <div className="fy-demo-form">
        <label><span>Rodzaj pisma</span>
          <select value={tpl} onChange={(e) => { setTpl(e.target.value as TemplateKey); setGenerated(false); }}>
            {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
          </select>
        </label>
        {field("party", "Druga strona")}
        {field("amount", "Kwota (zł)")}
        {field("days", "Termin (dni)")}
        {field("contractDate", "Data umowy")}
        {field("city", "Miejscowość")}
        <button type="button" className="fy-store-add" onClick={() => setGenerated(true)}>Generuj dokument</button>
        {generated && <p className="fy-demo-ok" role="status"><CheckCircle2 size={16} /> Gotowe. W pełnej wersji pobierasz plik DOCX i jednym kliknięciem wysyłasz go do podpisu.</p>}
      </div>
      <pre className="fy-demo-paper">{TEMPLATES[tpl].body(v)}</pre>
    </div>
  );
}

function CrmDemo() {
  const [clients, setClients] = useState(DEMO_CLIENTS);
  const move = (id: number, dir: 1 | -1) => setClients((list) => list.map((c) => {
    if (c.id !== id) return c;
    const i = Math.min(STAGES.length - 1, Math.max(0, STAGES.indexOf(c.stage) + dir));
    return { ...c, stage: STAGES[i] };
  }));
  const total = clients.reduce((n, c) => n + c.amount, 0);
  return (
    <div>
      <p className="fy-demo-lead">Portfel: {clients.length} klientów · {total.toLocaleString("pl-PL")} zł. Przesuwaj karty między etapami.</p>
      <div className="fy-demo-kanban">
        {STAGES.map((stage) => (
          <div key={stage} className="fy-demo-col">
            <h4>{stage}</h4>
            {clients.filter((c) => c.stage === stage).map((c) => (
              <article key={c.id}>
                <strong>{c.name}</strong>
                <span>{c.city} · {c.amount.toLocaleString("pl-PL")} zł · LTV {c.ltv}%</span>
                <div>
                  <button type="button" aria-label={`Cofnij ${c.name}`} onClick={() => move(c.id, -1)} disabled={stage === STAGES[0]}>←</button>
                  <button type="button" aria-label={`Dalej ${c.name}`} onClick={() => move(c.id, 1)} disabled={stage === STAGES[STAGES.length - 1]}>→</button>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const ESIGN_STEPS = ["Wysłano link", "Otwarto dokument", "Weryfikacja tożsamości", "Kod jednorazowy SMS", "Podpisano"];

function EsignDemo() {
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const signers = ["Pożyczkodawca (Ty)", "Jan Przykładowy"];
  const advance = (i: 0 | 1) => setProgress((p) => {
    const n: [number, number] = [...p] as [number, number];
    n[i] = Math.min(ESIGN_STEPS.length, n[i] + 1);
    return n;
  });
  const done = progress.every((p) => p === ESIGN_STEPS.length);
  return (
    <div>
      <p className="fy-demo-lead">Koperta: „Umowa pożyczki — Jan Przykładowy.docx”. Kliknij, aby zasymulować kolejne etapy u każdego podpisującego.</p>
      <div className="fy-demo-signers">
        {signers.map((name, i) => (
          <div key={name} className="fy-demo-signer">
            <strong>{name}</strong>
            <ul>
              {ESIGN_STEPS.map((s, k) => (
                <li key={s} className={k < progress[i] ? "done" : ""}>
                  {k < progress[i] ? <CheckCircle2 size={15} /> : <Circle size={15} />} {s}
                </li>
              ))}
            </ul>
            <button type="button" className="fy-store-add" disabled={progress[i] === ESIGN_STEPS.length}
              onClick={() => advance(i as 0 | 1)}>
              {progress[i] === ESIGN_STEPS.length ? "Podpisano" : "Następny etap"}
            </button>
          </div>
        ))}
      </div>
      {done && <p className="fy-demo-ok" role="status"><CheckCircle2 size={16} /> Komplet podpisów. Karta podpisów z sumą kontrolną dokumentu trafia do obu stron.</p>}
      <button type="button" className="fy-demo-reset" onClick={() => setProgress([0, 0])}>Zacznij od nowa</button>
    </div>
  );
}

function AmlDemo() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const score = useMemo(() => RISK_FACTORS.reduce((n, f) => n + (checked[f.key] ? f.weight : 0), 0), [checked]);
  const level = score >= 6 ? "wysokie" : score >= 3 ? "podwyższone" : "standardowe";
  const actions = score >= 6
    ? ["Wzmożone środki bezpieczeństwa finansowego", "Zgoda kadry kierowniczej na nawiązanie relacji", "Rozważenie zawiadomienia GIIF"]
    : score >= 3
      ? ["Dodatkowe dokumenty źródła środków", "Częstszy monitoring transakcji"]
      : ["Standardowa identyfikacja i weryfikacja", "Monitoring w cyklu rocznym"];
  return (
    <div className="fy-demo-grid">
      <div className="fy-demo-form">
        <p className="fy-demo-lead">Ocena ryzyka klienta (Demo Sp. z o.o.). Zaznacz czynniki:</p>
        {RISK_FACTORS.map((f) => (
          <label key={f.key} className="fy-demo-check">
            <input type="checkbox" checked={Boolean(checked[f.key])}
              onChange={(e) => setChecked({ ...checked, [f.key]: e.target.checked })} />
            <span>{f.label}</span>
          </label>
        ))}
      </div>
      <div className={`fy-demo-risk fy-demo-risk-${score >= 6 ? "high" : score >= 3 ? "mid" : "low"}`}>
        <span>Wynik: {score} pkt</span>
        <strong>Ryzyko {level}</strong>
        <ul>{actions.map((a) => <li key={a}>{a}</li>)}</ul>
        <small>Wynik demonstracyjny. W pełnym module ocena zapisuje się w rejestrze AML razem ze screeningiem i historią zmian.</small>
      </div>
    </div>
  );
}
