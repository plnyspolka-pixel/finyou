import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
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
import { Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { sendApplicationToInvestors } from "@/lib/broker-distribution.functions";

type Audience = "instytucjonalny" | "indywidualny";
type Investor = { id: string; company_name: string | null; first_name: string | null; last_name: string | null; email: string | null; city: string | null };

export function SendToInvestorsDialog({
  open,
  onOpenChange,
  applicationId,
  audience,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applicationId: string;
  audience: "instytucjonalny" | "prywatny";
}) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const { data: investors = [], isLoading } = useQuery({
    queryKey: ["broker-distribution-investors", audience],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investors")
        .select("id, company_name, first_name, last_name, email, city")
        .eq("investor_type", audience)
        .eq("is_active", true)
        .not("email", "is", null)
        .order("company_name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Investor[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setQ("");
    }
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
    if (allSelected) {
      const next = new Set(selected);
      filtered.forEach((i) => next.delete(i.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((i) => next.add(i.id));
      setSelected(next);
    }
  };

  const sendFn = useServerFn(sendApplicationToInvestors);
  const mut = useMutation({
    mutationFn: async (emails: string[]) =>
      sendFn({ data: { applicationId, recipients: emails, audience } }),
    onSuccess: (res) => {
      toast.success(`Wysłano ${res.sent}/${res.total} wiadomości`);
      onOpenChange(false);
      navigate({ to: "/posrednik/skrzynka" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się wysłać"),
  });

  const sendSelected = () => {
    const emails = investors.filter((i) => selected.has(i.id)).map((i) => i.email!).filter(Boolean);
    if (!emails.length) return;
    mut.mutate(emails);
  };
  const sendAll = () => {
    const emails = investors.map((i) => i.email!).filter(Boolean);
    if (!emails.length) return;
    mut.mutate(emails);
  };

  const label = audience === "instytucjonalny" ? "instytucjonalnych" : "prywatnych";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Wyślij do inwestorów {label}
          </DialogTitle>
          <DialogDescription>
            Zaznacz odbiorców lub wyślij do wszystkich. Wiadomość zawiera KW, kwotę, zdjęcia, dokumenty i Twoją stopkę.
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
          <Badge variant="outline">
            {selected.size} / {investors.length}
          </Badge>
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
                        {i.email}
                        {i.city ? ` · ${i.city}` : ""}
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
          <Button variant="secondary" onClick={sendAll} disabled={mut.isPending || investors.length === 0}>
            Wyślij do wszystkich ({investors.length})
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
