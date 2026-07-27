// Wnioskowanie realnego źródła danych pogłębionych (kwota / numer KW /
// zdjęcia+dokumenty) dla wniosku pożyczkowego.
//
// Kanały pozyskania leada (np. meta_lead = Facebook Lead Ads) NIE mogą
// dostarczyć kwoty, KW ani zdjęć — te dane zawsze przychodzą jakimś innym
// kanałem: mailem, Messengerem, wnioskiem z landingu / embedu, panelem
// klienta albo są wpisane ręcznie w panelu. Ten moduł próbuje to ustalić
// z faktów w bazie i zwrócić klucz źródła + gotowy tooltip.

export type FieldSource = { key: string; title: string };

export type DocRef = {
  loan_application_id: string;
  document_type: string | null;
  uploaded_by: string | null;
};

export type CommRef = {
  lead_id: string;
  channel: string | null;
  direction: string | null;
  content: string | null;
};

export type EnrichmentContext = {
  // documents po loan_application_id
  docsByLoan: Map<string, DocRef[]>;
  // KW numery obecne w kw_documents (auto-pobrane z EKW)
  autoKwSet: Set<string>;
  // wiadomości (lead_communications) po client_id
  commsByClient: Map<string, CommRef[]>;
  // client_id -> lead_ids (potrzebne bo comms jest po lead_id)
  leadsByClient: Map<string, string[]>;
  // uploader / operator display name
  nameByUser: Map<string, string>;
  // uploader / operator -> nazwa panelu (Admin / Operator / Pośrednik / Klient)
  panelByUser?: Map<string, string>;
  // przypisany operator wniosku (opcjonalnie)
  operatorByLoan: Map<string, string | null>;
};

// Kanały które SĄ realnym źródłem pogłębionych danych (formularze / panel
// klienta). Meta lead ads / scheduled / inbound_enrichment / lead / unknown
// pozostają BEZ atrybucji i wpadają w tryb wnioskowania.
const FORM_LIKE_SOURCES = new Set([
  "landing_wizard",
  "landing_single_page",
  "embed",
  "panel_klienta",
]);

const CHANNEL_TO_SOURCE: Record<string, string> = {
  email: "email_inbound",
  inbound_email: "email_inbound",
  outbound_email: "email_inbound",
  messenger: "messenger",
  instagram: "messenger",
  ig: "messenger",
  whatsapp: "messenger",
  sms: "messenger",
};

function inboundChannel(comms: CommRef[] | undefined): string | null {
  if (!comms) return null;
  for (const c of comms) {
    if (c.direction && c.direction !== "inbound") continue;
    const key = (c.channel ?? "").toLowerCase();
    const mapped = CHANNEL_TO_SOURCE[key];
    if (mapped) return mapped;
  }
  return null;
}

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

function commsContainingDigits(comms: CommRef[] | undefined, needleDigits: string): CommRef | null {
  if (!comms || needleDigits.length < 4) return null;
  for (const c of comms) {
    if (!c.content) continue;
    const hay = digitsOnly(c.content);
    if (hay.includes(needleDigits)) return c;
  }
  return null;
}

function commsContainingText(comms: CommRef[] | undefined, needle: string): CommRef | null {
  if (!comms || !needle) return null;
  const n = needle.toLowerCase();
  for (const c of comms) {
    if (!c.content) continue;
    if (c.content.toLowerCase().includes(n)) return c;
  }
  return null;
}

function channelToSource(c: CommRef | null): string | null {
  if (!c) return null;
  const key = (c.channel ?? "").toLowerCase();
  return CHANNEL_TO_SOURCE[key] ?? null;
}

function panelLabel(userId: string | null | undefined, ctx: EnrichmentContext): string | null {
  if (!userId) return null;
  return ctx.panelByUser?.get(userId) ?? null;
}

function manualBy(loanId: string, ctx: EnrichmentContext): FieldSource {
  const op = ctx.operatorByLoan.get(loanId) ?? null;
  const name = op ? ctx.nameByUser.get(op) : null;
  const panel = panelLabel(op, ctx);
  const who = [panel ? `panel ${panel}` : null, name].filter(Boolean).join(" — ");
  return {
    key: "manual",
    title: who ? `Wpisane ręcznie (${who})` : "Wpisane ręcznie w panelu",
  };
}

/** Dla wniosku, który wszedł formularzem/z panelu klienta zwraca to źródło. */
function baseFormSource(appSource: string | null): FieldSource | null {
  if (!appSource) return null;
  if (FORM_LIKE_SOURCES.has(appSource)) {
    const label =
      appSource === "embed"
        ? "Formularz embed"
        : appSource === "panel_klienta"
          ? "Panel klienta"
          : "Formularz na stronie";
    return { key: appSource, title: `${label} — dane z wniosku klienta` };
  }
  return null;
}

/** Skąd wzięła się KWOTA pożyczki. */
export function inferAmountSource(
  loanId: string,
  amount: number | null,
  appSource: string | null,
  clientId: string | null,
  ctx: EnrichmentContext,
): FieldSource | null {
  if (amount == null) return null;
  const form = baseFormSource(appSource);
  if (form) return form;
  const comms = clientId ? ctx.commsByClient.get(clientId) : undefined;
  const digits = digitsOnly(String(Math.round(amount)));
  const hit = commsContainingDigits(comms, digits);
  const src = channelToSource(hit);
  if (src) {
    return {
      key: src,
      title: `Kwota pojawiła się w wiadomości od klienta (${src === "messenger" ? "Messenger/IG/WA" : "e-mail"})`,
    };
  }
  return manualBy(loanId, ctx);
}

/** Skąd wziął się NUMER KW (kanał, którym klient nam go przekazał). */
export function inferKwSource(
  loanId: string,
  kwNumber: string | null,
  appSource: string | null,
  clientId: string | null,
  ctx: EnrichmentContext,
): FieldSource | null {
  if (!kwNumber) return null;
  const trimmed = kwNumber.trim();
  // 1. wiadomość przychodząca od klienta z numerem KW
  const comms = clientId ? ctx.commsByClient.get(clientId) : undefined;
  const hit =
    commsContainingText(comms, trimmed) ?? commsContainingDigits(comms, digitsOnly(trimmed));
  const src = channelToSource(hit);
  if (src) {
    return {
      key: src,
      title: `Numer KW podany przez klienta w wiadomości (${src === "messenger" ? "Messenger/IG/WA" : "e-mail"})`,
    };
  }
  // 2. wniosek wypełniony przez klienta (landing / embed / panel klienta)
  const form = baseFormSource(appSource);
  if (form) return form;
  // 3. ręcznie wpisany w panelu przez operatora (być może z auto-weryfikacją EKW)
  return manualBy(loanId, ctx);
}

/** Skąd wzięły się ZDJĘCIA / DOKUMENTY. */
export function inferMediaSource(
  loanId: string,
  hasAny: boolean,
  appSource: string | null,
  ctx: EnrichmentContext,
): FieldSource | null {
  if (!hasAny) return null;
  const docs = ctx.docsByLoan.get(loanId) ?? [];
  // 1. dokumenty załączone przez klienta w kanale przychodzącym
  const dt = docs.find((d) => d.document_type?.startsWith("attachment_messenger"));
  if (dt) return { key: "messenger", title: "Załączniki wgrane z Messengera/IG" };
  const de = docs.find((d) => d.document_type?.startsWith("attachment_inbound"));
  if (de) return { key: "email_inbound", title: "Załączniki z maila od klienta" };
  // 2. uploader = pracownik → ręcznie
  const uploaded = docs.find((d) => !!d.uploaded_by);
  if (uploaded && uploaded.uploaded_by) {
    const name = ctx.nameByUser.get(uploaded.uploaded_by);
    const panel = panelLabel(uploaded.uploaded_by, ctx);
    const who = [panel ? `panel ${panel}` : null, name].filter(Boolean).join(" — ");
    return {
      key: "manual",
      title: who ? `Wgrane ręcznie (${who})` : "Wgrane ręcznie w panelu",
    };
  }

  // 3. fallback: formularz / panel klienta / ręcznie
  const form = baseFormSource(appSource);
  if (form) return form;
  return manualBy(loanId, ctx);
}
