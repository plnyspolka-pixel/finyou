import { createFileRoute, redirect } from "@tanstack/react-router";

// Publiczny sklep /sklep został zlikwidowany (decyzja właściciela 04.11.2026) —
// sklep z koszykiem żyje w panelu inwestora: /inwestor/sklep (niezalogowanego
// PanelShell przepuszcza przez /logowanie). Stare linki z reklam i e-maili
// dostają 301.
export const Route = createFileRoute("/sklep")({
  beforeLoad: () => {
    throw redirect({ to: "/inwestor/sklep", statusCode: 301 });
  },
  component: () => null,
});
