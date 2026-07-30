// Moduł „Follow-up braków" — treści wiadomości per kanał (e-mail / SMS /
// Messenger). Moduł CZYSTY: silnik i panel podglądu składają z niego treść
// z gotowego briefu. Treść jest deterministyczna (bez AI) — pytania o KW
// pochodzą wprost z silnika reguł analizy KW, więc są precyzyjne prawnie.

import type { BriefItem, MissingInfoBrief } from "./brief";

/** Maksymalna liczba punktów w jednej wiadomości — reszta jako „+ n dalszych". */
export const MAX_ITEMS_PER_MESSAGE = 6;

export interface ComposeVars {
  firstName: string | null;
  /** Link „dokończ wniosek" (/wniosek/$token). */
  link: string;
  /** Numer próby (1-indexed) — różnicuje ton kolejnych wiadomości. */
  attempt: number;
}

function greeting(firstName: string | null): string {
  const name = (firstName ?? "").trim();
  return name ? `Dzień dobry, ${name}` : "Dzień dobry";
}

function visibleItems(brief: MissingInfoBrief): { shown: BriefItem[]; hiddenCount: number } {
  const shown = brief.items.slice(0, MAX_ITEMS_PER_MESSAGE);
  return { shown, hiddenCount: Math.max(0, brief.items.length - shown.length) };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── E-MAIL ──────────────────────────────────────────────────────────────────

export function composeEmailSubject(brief: MissingInfoBrief, vars: ComposeVars): string {
  const n = brief.items.length;
  const what =
    n === 1 ? `1 rzeczy: ${brief.items[0].label}` : `${n} ${n < 5 ? "rzeczy" : "informacji"}`;
  if (vars.attempt <= 1) return `Twój wniosek w Finance You — brakuje jeszcze ${what}`;
  if (vars.attempt === 2) return `Przypomnienie: do dokończenia wniosku brakuje ${what}`;
  return `Wciąż czekamy na ${what} — Twój wniosek w Finance You`;
}

export function composeEmailText(brief: MissingInfoBrief, vars: ComposeVars): string {
  const { shown, hiddenCount } = visibleItems(brief);
  const lines: string[] = [];
  lines.push(`${greeting(vars.firstName)},`);
  lines.push("");
  lines.push(
    vars.attempt <= 1
      ? "Twój wniosek o pożyczkę pod zastaw nieruchomości jest już prawie gotowy. Żeby móc przekazać go inwestorowi, potrzebujemy jeszcze:"
      : "Wracamy z przypomnieniem — do dokończenia Twojego wniosku wciąż brakuje:",
  );
  lines.push("");
  for (const item of shown) {
    lines.push(`• ${item.question}`);
    for (const doc of item.documents) {
      if (!item.question.includes(doc)) lines.push(`   – dokument: ${doc}`);
    }
  }
  if (hiddenCount > 0)
    lines.push(`• …oraz ${hiddenCount} dalszych punktów (pełna lista po zalogowaniu).`);
  lines.push("");
  lines.push(`Uzupełnij wniosek tutaj: ${vars.link}`);
  lines.push("");
  lines.push("Możesz też po prostu odpowiedzieć na tę wiadomość — dopiszemy wszystko za Ciebie.");
  lines.push("");
  lines.push("Pozdrawiamy,\nZespół Finance You");
  return lines.join("\n");
}

export function composeEmailHtml(brief: MissingInfoBrief, vars: ComposeVars): string {
  const { shown, hiddenCount } = visibleItems(brief);
  const P = (t: string) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#0f172a">${t}</p>`;
  const LI = (t: string) =>
    `<li style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#0f172a">${t}</li>`;
  const parts: string[] = [];
  parts.push(P(`${esc(greeting(vars.firstName))},`));
  parts.push(
    P(
      vars.attempt <= 1
        ? "Twój wniosek o pożyczkę pod zastaw nieruchomości jest już prawie gotowy. Żeby móc przekazać go inwestorowi, potrzebujemy jeszcze:"
        : "Wracamy z przypomnieniem — do dokończenia Twojego wniosku wciąż brakuje:",
    ),
  );
  const lis = shown.map((item) => {
    const docs = item.documents.filter((d) => !item.question.includes(d));
    const docsHtml = docs.length
      ? `<br/><span style="color:#475569;font-size:13px">Dokument: ${docs.map(esc).join(", ")}</span>`
      : "";
    return LI(`${esc(item.question)}${docsHtml}`);
  });
  if (hiddenCount > 0) {
    lis.push(
      LI(`…oraz <strong>${hiddenCount}</strong> dalszych punktów — pełna lista we wniosku.`),
    );
  }
  parts.push(`<ul style="margin:0 0 18px;padding-left:20px">${lis.join("")}</ul>`);
  parts.push(
    `<p style="text-align:center;margin:24px 0 6px"><a href="${vars.link}" style="display:inline-block;background:#0a7f4f;color:#ffffff;font-weight:700;font-size:16px;line-height:1;padding:15px 30px;border-radius:9999px;text-decoration:none">Uzupełnij wniosek →</a></p>`,
  );
  parts.push(
    P(
      `Możesz też po prostu <strong>odpowiedzieć na tę wiadomość</strong> — dopiszemy wszystko za Ciebie.`,
    ),
  );
  parts.push(P("Pozdrawiamy,<br/>Zespół Finance You"));
  return parts.join("");
}

// ── SMS ─────────────────────────────────────────────────────────────────────

export function composeSms(brief: MissingInfoBrief, vars: ComposeVars): string {
  const first = brief.items[0];
  const rest = brief.items.length - 1;
  const what = first ? first.label : "kilka informacji";
  const more = rest > 0 ? ` (+${rest} inne)` : "";
  return `Finance You: do dokonczenia wniosku brakuje: ${what}${more}. Uzupelnij: ${vars.link} Odpowiedz STOP, aby nie dostawac SMS.`;
}

// ── MESSENGER / INSTAGRAM ───────────────────────────────────────────────────

export function composeMessenger(brief: MissingInfoBrief, vars: ComposeVars): string {
  const { shown, hiddenCount } = visibleItems(brief);
  const lines: string[] = [];
  lines.push(
    vars.attempt <= 1
      ? `${greeting(vars.firstName)}! Twój wniosek jest prawie gotowy — brakuje nam jeszcze kilku rzeczy:`
      : `${greeting(vars.firstName)}, przypominamy się w sprawie wniosku — wciąż brakuje:`,
  );
  for (const item of shown) lines.push(`• ${item.question}`);
  if (hiddenCount > 0) lines.push(`• …i ${hiddenCount} dalszych punktów.`);
  lines.push("Możesz odpisać tutaj albo uzupełnić wniosek online:");
  lines.push(vars.link);
  return lines.join("\n");
}
