import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listOperatorInvites,
  createOperatorInvite,
  revokeOperatorInvite,
} from "@/lib/operator-invites.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2, Plus, Link2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/operatorzy")({
  component: OperatorInvitesPage,
});

type Row = {
  id: string;
  token: string;
  email: string | null;
  note: string | null;
  expires_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  created_at: string;
};

function OperatorInvitesPage() {
  const list = useServerFn(listOperatorInvites);
  const create = useServerFn(createOperatorInvite);
  const revoke = useServerFn(revokeOperatorInvite);
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);

  const q = useQuery({
    queryKey: ["operator-invites"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          email: email.trim() || null,
          note: note.trim() || null,
          daysValid: days,
        },
      }),
    onSuccess: (row: any) => {
      setEmail("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["operator-invites"] });
      const url = `${window.location.origin}/operator-rejestracja?token=${row.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Link wygenerowany i skopiowany", { description: url });
    },
    onError: (e: any) => toast.error("Błąd", { description: e?.message ?? String(e) }),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operator-invites"] }),
    onError: (e: any) => toast.error("Błąd", { description: e?.message ?? String(e) }),
  });

  const rows = (q.data ?? []) as Row[];

  const linkFor = (token: string) =>
    `${window.location.origin}/operator-rejestracja?token=${token}`;

  const copy = (token: string) => {
    const url = linkFor(token);
    navigator.clipboard.writeText(url).then(
      () => toast.success("Skopiowano link"),
      () => toast.error("Nie udało się skopiować"),
    );
  };

  const status = (r: Row) => {
    if (r.used_at) return <Badge variant="secondary">Wykorzystane</Badge>;
    if (new Date(r.expires_at) <= new Date()) return <Badge variant="outline">Wygasło</Badge>;
    return <Badge>Aktywne</Badge>;
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Operatorzy wewnętrzni</h1>
          <p className="text-sm text-muted-foreground">
            Konta operatorów zakładane wyłącznie z linku zapraszającego. Generuj i wysyłaj
            indywidualnie.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wygeneruj nowy link</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>E-mail (opcjonalnie)</Label>
            <Input
              type="email"
              placeholder="operator@financeyou.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Ważność (dni)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 7)}
            />
          </div>
          <div className="space-y-1 md:col-span-4">
            <Label>Notatka (opcjonalnie)</Label>
            <Input
              placeholder="np. dla Jana z zespołu operacji"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="md:col-span-4">
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {createMut.isPending ? "Generuję…" : "Wygeneruj link"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zaproszenia ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Ładowanie…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zaproszeń.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {status(r)}
                      {r.email && <span className="text-sm font-medium">{r.email}</span>}
                      <span className="text-xs text-muted-foreground">
                        wygasa {new Date(r.expires_at).toLocaleString("pl-PL")}
                      </span>
                    </div>
                    {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="h-3 w-3" />
                      <span className="truncate font-mono">{linkFor(r.token)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(r.token)}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Kopiuj
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Usunąć zaproszenie?")) revokeMut.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
