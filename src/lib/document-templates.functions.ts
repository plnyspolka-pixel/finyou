import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const DOCS_GW = "https://connector-gateway.lovable.dev/google_docs/v1";

function gwHeaders(kind: "drive" | "docs") {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const apiKey =
    kind === "drive" ? process.env.GOOGLE_DRIVE_API_KEY : process.env.GOOGLE_DOCS_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  if (!apiKey)
    throw new Error(
      `${kind === "drive" ? "GOOGLE_DRIVE_API_KEY" : "GOOGLE_DOCS_API_KEY"} not configured`,
    );
  return { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey };
}

export const listGoogleDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(200).optional(),
        scope: z.enum(["all", "mine", "shared", "drives"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const scope = data.scope ?? "all";
      const parts = [
        // Google Docs + uploaded Word documents
        "mimeType='application/vnd.google-apps.document'",
        "trashed=false",
      ];
      if (data.search) parts.push(`name contains '${String(data.search).replace(/'/g, "\\'")}'`);
      if (scope === "mine") parts.push("'me' in owners");
      if (scope === "shared") parts.push("sharedWithMe=true");
      const q = parts.join(" and ");
      const params = new URLSearchParams({
        q,
        pageSize: "100",
        orderBy: "modifiedTime desc",
        fields:
          "files(id,name,mimeType,modifiedTime,owners(displayName,emailAddress),webViewLink,driveId,shared)",
        includeItemsFromAllDrives: "true",
        supportsAllDrives: "true",
        corpora: scope === "drives" ? "allDrives" : "allDrives",
      });
      const url = `${DRIVE_GW}/files?${params.toString()}`;
      const res = await fetch(url, { headers: gwHeaders("drive") });
      const json: any = await res.json();
      if (!res.ok)
        return { ok: false, error: json?.error?.message || `HTTP ${res.status}`, files: [] };
      let files = (json.files || []) as Array<any>;
      if (scope === "drives") files = files.filter((f) => !!f.driveId);
      return { ok: true, files };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e), files: [] };
    }
  });

export const getConnectedGoogleAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const url = `${DRIVE_GW}/about?fields=user(displayName,emailAddress,photoLink),storageQuota(usage,limit)`;
      const res = await fetch(url, { headers: gwHeaders("drive") });
      const json: any = await res.json();
      if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
      return { ok: true, user: json.user };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function gdocsToHtml(doc: any): { html: string; title: string } {
  const out: string[] = [];
  const elements: any[] = doc?.body?.content ?? [];
  for (const el of elements) {
    const p = el.paragraph;
    if (!p) continue;
    const style = p.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT";
    const runs: string[] = [];
    for (const e of p.elements ?? []) {
      const tr = e.textRun;
      if (!tr) continue;
      let txt = escapeHtml((tr.content ?? "").replace(/\n$/, ""));
      const ts = tr.textStyle ?? {};
      if (ts.bold) txt = `<strong>${txt}</strong>`;
      if (ts.italic) txt = `<em>${txt}</em>`;
      if (ts.underline) txt = `<u>${txt}</u>`;
      if (ts.strikethrough) txt = `<s>${txt}</s>`;
      runs.push(txt);
    }
    const inner = runs.join("");
    if (!inner.trim()) {
      out.push("<p></p>");
      continue;
    }
    const m = /^HEADING_(\d)$/.exec(style);
    if (m) out.push(`<h${m[1]}>${inner}</h${m[1]}>`);
    else if (style === "TITLE") out.push(`<h1>${inner}</h1>`);
    else if (style === "SUBTITLE") out.push(`<h2>${inner}</h2>`);
    else out.push(`<p>${inner}</p>`);
  }
  return { html: out.join("\n") || "<p></p>", title: doc?.title ?? "Dokument" };
}

export const importGoogleDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().min(5).max(200) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${DOCS_GW}/documents/${data.documentId}`, {
        headers: gwHeaders("docs"),
      });
      const json: any = await res.json();
      if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
      const { html, title } = gdocsToHtml(json);
      return { ok: true, html, title };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

const KNOWN_PLACEHOLDERS = [
  "klient.imie",
  "klient.nazwisko",
  "klient.pelne_imie",
  "klient.email",
  "klient.telefon",
  "klient.pesel",
  "klient.adres",
  "wniosek.kwota",
  "wniosek.okres_miesiace",
  "wniosek.oprocentowanie",
  "wniosek.miesięczna_rata",
  "wniosek.cel",
  "nieruchomosc.adres",
  "nieruchomosc.miasto",
  "nieruchomosc.kw",
  "nieruchomosc.powierzchnia",
  "nieruchomosc.wartosc",
  "dzisiejsza_data",
  "firma.nazwa",
  "firma.nip",
];

export const suggestPlaceholders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ content: z.string().min(1).max(50000) }).parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY nieskonfigurowany", placeholders: [] };

    const systemPrompt = `Jesteś asystentem, który analizuje treść szablonu dokumentu prawnego/finansowego po polsku.
Twoje zadanie: znajdź miejsca w tekście, gdzie powinny być placeholdery na zmienne dane (imię klienta, kwota pożyczki, adres nieruchomości itp.) i zaproponuj zamianę.

Dostępne klucze placeholderów (używaj WYŁĄCZNIE tych):
${KNOWN_PLACEHOLDERS.map((p) => "- {{" + p + "}}").join("\n")}

Zwróć JSON z listą propozycji. Każda propozycja zawiera:
- "original": dokładny fragment tekstu do zamiany (max 100 znaków)
- "placeholder": klucz placeholdera z listy powyżej w formacie {{klucz}}
- "reason": krótkie uzasadnienie (max 80 znaków)`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Treść szablonu:\n\n${data.content}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_placeholders",
              description: "Zwraca listę proponowanych placeholderów",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        original: { type: "string" },
                        placeholder: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["original", "placeholder", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_placeholders" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429)
        return { ok: false, error: "Za dużo zapytań, spróbuj za chwilę", placeholders: [] };
      if (res.status === 402)
        return {
          ok: false,
          error: "Brak kredytów Lovable AI — dodaj środki w Ustawieniach",
          placeholders: [],
        };
      return { ok: false, error: `AI error ${res.status}`, placeholders: [] };
    }
    const json: any = await res.json();
    try {
      const args = JSON.parse(
        json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}",
      );
      return {
        ok: true,
        placeholders: (args.suggestions ?? []) as Array<{
          original: string;
          placeholder: string;
          reason: string;
        }>,
      };
    } catch {
      return { ok: false, error: "Nie udało się sparsować odpowiedzi AI", placeholders: [] };
    }
  });
