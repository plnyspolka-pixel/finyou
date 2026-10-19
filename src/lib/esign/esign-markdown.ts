import { z } from "zod";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import type { RootContent, PhrasingContent } from "mdast";
import type { Blok, Run } from "@/lib/contract-engine/umowa-docx";

export const documentMarkdownSchema = z.string().min(1).max(200_000)
  .refine((value) => value.trim().length > 0, "Treść dokumentu nie może być pusta.");
export const documentHeaderSchema = z.string().trim().max(200)
  .refine((value) => !/[\r\n]/.test(value), "Nagłówek musi mieć jeden wiersz.");
export const previewDocumentInput = z.object({
  document_markdown: documentMarkdownSchema,
  document_header: documentHeaderSchema.optional(),
});

function runs(nodes: PhrasingContent[], style: Omit<Run, "tekst"> = {}): Run[] {
  return nodes.flatMap((node): Run[] => {
    if (node.type === "strong") return runs(node.children, { ...style, bold: true });
    if (node.type === "emphasis") return runs(node.children, { ...style, italic: true });
    if (node.type === "link" || node.type === "delete") return runs(node.children, style);
    if (node.type === "break") return [{ tekst: " ", ...style }];
    if (node.type === "image") return [{ tekst: node.alt ?? "", ...style }];
    if ("value" in node) return [{ tekst: node.value, ...style }];
    return [];
  });
}

export function markdownBlocks(markdown: string) {
  documentMarkdownSchema.parse(markdown);
  const bloki: Blok[] = [];
  const pageBreakBefore: number[] = [];
  const visit = (node: RootContent) => {
    if (node.type === "heading") {
      const tekst = runs(node.children).map((r) => r.tekst).join("");
      bloki.push({ t: node.depth === 1 ? "tytul" : node.depth === 2 ? "podtytul" : "naglowek", tekst });
    } else if (node.type === "paragraph") {
      bloki.push({ t: "akapit", runs: runs(node.children), align: "left" });
    } else if (node.type === "list") {
      node.children.forEach((item, i) => {
        item.children.forEach((child, j) => {
          if (child.type === "paragraph") bloki.push({ t: "akapit", runs: runs(child.children),
            wciecie: "lista", etykieta: j === 0 ? node.ordered ? `${(node.start ?? 1) + i}.` : "–" : undefined, align: "left" });
          else visit(child);
        });
      });
    } else if (node.type === "table") {
      const columns = node.children[0]?.children.length ?? 1;
      bloki.push({ t: "tabela", szerokosci: Array.from({ length: columns }, () => 9638 / columns),
        wiersze: node.children.map((row, i) => ({ naglowek: i === 0,
          komorki: row.children.map((cell, col) => ({ tekst: runs(cell.children), align: node.align?.[col] ?? "left" })) })) });
    } else if (node.type === "blockquote") node.children.forEach(visit);
    else if (node.type === "code" || node.type === "html") bloki.push({ t: "akapit", runs: [{ tekst: node.value }], align: "left" });
  };
  // Split only standalone custom directives; never interpret arbitrary HTML or fetch images.
  let buffer: string[] = [];
  const flush = () => {
    const tree = fromMarkdown(buffer.join("\n"), { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
    tree.children.forEach(visit);
    buffer = [];
  };
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "\\pagebreak") { flush(); pageBreakBefore.push(bloki.length); }
    else if (line.trim().startsWith("->") && line.trim().endsWith("<-")) {
      flush();
      const text = line.trim().slice(2, -2).trim();
      const tree = fromMarkdown(text);
      const first = tree.children[0];
      bloki.push({ t: "akapit", runs: first?.type === "paragraph" ? runs(first.children) : [{ tekst: text }], align: "center" });
    } else buffer.push(line);
  }
  flush();
  if (!bloki.length) throw new Error("Dokument nie zawiera treści do wyrenderowania.");
  return { bloki, pageBreakBefore };
}

export async function renderEsignMarkdown(markdown: string, header?: string) {
  if (header !== undefined) documentHeaderSchema.parse(header);
  const { pdfZBlokow } = await import("@/lib/legal/pdf-z-tekstu");
  return pdfZBlokow({ ...markdownBlocks(markdown), documentHeader: header, title: "Dokument do podpisu", version: "" });
}