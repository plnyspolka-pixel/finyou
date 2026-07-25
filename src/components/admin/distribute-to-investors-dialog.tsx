import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Send, Building2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { sendInvestorDistribution } from "@/lib/broker-distribution.functions";

type Audience = "instytucjonalny" | "indywidualny";
type Investor = {
  id: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
};

/**
 * Wysyłka śledzona: tworzy wiersze `offer_distributions` i wysyła sformatowanego
 * maila do wybranych inwestorów. Odpowiedzi wracają na kontakt@financeyou.pl i są
 * przypisywane z powrotem do tego wniosku.
 */
export function DistributeToInvestorsDialog({
  open,
  onOpenChange,
  applicationId,
  audience,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applicationId: string;
  audience: Audience;
  onSent?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const { data: investors = [], isLoading } = useQuery({
    queryKey: ["admin-distribute-investors", audience],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investors")
        .select("id, company_name, first_name, last_name, email, city")
        .eq("investor_type", audience)
        .eq("is_active", true)
        .not("email", "is", null)
        .order("company_name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const rows = (data ?? []) as Investor[];
      const byEmail = new Map<string, Investor>();
      for (const r of rows) {
        const key = (r.email ?? "").trim().toLowerCase();
        if (!key) continue;
        const prev = byEmail.get(key);
        if (!prev) { byEmail.set(key, r); continue; }
        const score = (i: Investor) => (i.company_name?.length ?? 0) + (i.city ? 5 : 0);
        if (score(r) > score(prev)) byEmail.set(key, r);
      }
      return Array.from(byEmail.values()).sort((a, b) =>
        (a.company_name ?? "").localeCompare(b.company_name ?? "", "pl"),
      );
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) { setSelected(new Set()); setQ(""); }
  }, [open]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return investors;
    return investors.filter(
      (i) =>
        (i.company_name ?? "").toLowerCase().includes(n) ||
        (i.email ?? "").toLowerCase().includes(n) ||
        `${i.first_name ?? ""} ${i.last_name ?? ""}`.toLowerCase().includes(n),
    );
  }, [investors, q]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((i) => next.delete(i.id));
    else filtered.forEach((i) => next.add(i.id));
    setSelected(next);
  };

  const sendFn = useServerFn(sendInvestorDistribution);
  const mut = useMutation({
    mutationFn: async (investorIds: string[]) => sendFn({ data: { applicationId, investorIds } }),
    onSuccess: (res) => {
      if (res.sent > 0) {
        toast.success(
          `Wysłano do ${res.sent} inwestor(ów)${res.failed ? `, nieudane: ${res.failed}` : ""}.`,
        );
      } else {
        toast.error("Nie udało się wysłać żadnej wiadomości.");
      }
      onOpenChange(false);
      onSent?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się wysłać dystrybucji"),
  });

  const sendSelected = () => {
    const ids = investors.filter((i) => selected.has(i.id)).map((i) => i.id);
    if (!ids.length) return;
    mut.mutate(ids);
  };

  const isInst = audience === "instytucjonalny";
  const label = isInst ? "instytucjonalnych" : "prywatnych";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isInst ? <Building2 className="h-5 w-5 text-primary" /> : <UserRound className="h-5 w-5 text-primary" />}
            Wyślij do inwestorów {label}
          </DialogTitle>
          <DialogDescription>
            Zaznacz odbiorców i wyślij ofertę (KW, kwota, zdjęcia, dokumenty, stopka). Utworzę wpisy dystrybucji, a odpowiedzi inwestorów pojawią się w tym wniosku.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj…" className="pl-9" />
        </div>

        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={toggleAll} className="text-primary hover:underline">
            {allSelected ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
          </button>
          <Badge variant="outline">{selected.size} / {investors.length}</Badge>
        </div>

        <ScrollArea className="h-72 rounded-md border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Ładowanie…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Brak inwestorów z adresem e-mail.</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((i) => {
                const name = i.company_name || [i.first_name, i.last_name].filter(Boolean).join(" ") || "—";
                return (
                  <li key={i.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                    <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggle(i.id)} />
                    <button type="button" onClick={() => toggle(i.id)} className="flex-1 min-w-0 text-left">
                      <div className="truncate text-sm font-medium">{name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {i.email}{i.city ? ` · ${i.city}` : ""}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Anuluj
          </Button>
          <Button onClick={sendSelected} disabled={mut.isPending || selected.size === 0}>
            <Send className="mr-2 h-4 w-4" />
            {mut.isPending ? "Wysyłam…" : `Wyślij (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
