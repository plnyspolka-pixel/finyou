import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listLeads } from "@/lib/leads-admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/leady-all")({
  component: LeadsUnifiedPage,
});

function LeadsUnifiedPage() {
  const fn = useServerFn(listLeads);
  const [type, setType] = useState<"all" | "pozyczkowy" | "inwestorski">("all");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["unified-leads", type, source, search],
    queryFn: () => fn({ data: { type, source, search } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leady</h1>
          <p className="text-sm text-muted-foreground">Wszyscy klienci pożyczkowi i inwestorzy w jednym miejscu — z pełną historią rozmów, SMS-ów i maili.</p>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["all", "pozyczkowy", "inwestorski"] as const).map((t) => (
            <Button key={t} variant={type === t ? "default" : "outline"} size="sm" onClick={() => setType(t)}>
              {t === "all" ? "Wszystkie" : t === "pozyczkowy" ? "Pożyczkowe" : "Inwestorzy"}
            </Button>
          ))}
        </div>
        <Input placeholder="Szukaj: imię, e-mail, telefon…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select className="border rounded-md px-2 py-1.5 text-sm bg-background" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Wszystkie źródła</option>
          <option value="meta_ads">Meta Ads</option>
          <option value="google_ads">Google Ads</option>
          <option value="landing">Landing Page</option>
          <option value="sheets">Google Sheets</option>
          <option value="manual">Manual</option>
          <option value="voicebot">Voicebot</option>
          <option value="meta_lead">Meta Lead (legacy)</option>
        </select>
      </Card>

      <Card>
        {/* Mobile: karty */}
        <div className="md:hidden divide-y">
          {q.isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Ładowanie…</div>}
          {q.data?.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Brak leadów.</div>}
          {q.data?.map((l: any) => (
            <Link
              key={l.id}
              to="/admin/leady-all/$id"
              params={{ id: l.id }}
              className="block p-3 hover:bg-muted/40 active:bg-muted/60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{l.email || l.phone_normalized || "—"}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={l.type === "inwestorski" ? "secondary" : "default"} className="text-[10px]">{l.type}</Badge>
                  <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">{l.source || "—"}{l.current_form_step ? ` · krok ${l.current_form_step}` : ""}</span>
                <span className="shrink-0">{new Date(l.created_at).toLocaleDateString("pl-PL")}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-2">Imię i nazwisko</th>
                <th className="px-4 py-2">Kontakt</th>
                <th className="px-4 py-2">Typ</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Źródło</th>
                <th className="px-4 py-2">Krok</th>
                <th className="px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Ładowanie…</td></tr>}
              {q.data?.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Brak leadów.</td></tr>}
              {q.data?.map((l: any) => (
                <tr key={l.id} className="border-b hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <Link to="/admin/leady-all/$id" params={{ id: l.id }} className="font-medium hover:underline">
                      {[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div>{l.email || "—"}</div>
                    <div className="text-muted-foreground">{l.phone_normalized || "—"}</div>
                  </td>
                  <td className="px-4 py-2"><Badge variant={l.type === "inwestorski" ? "secondary" : "default"}>{l.type}</Badge></td>
                  <td className="px-4 py-2"><Badge variant="outline">{l.status}</Badge></td>
                  <td className="px-4 py-2 text-xs">{l.source || "—"}</td>
                  <td className="px-4 py-2 text-xs">{l.current_form_step ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("pl-PL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
