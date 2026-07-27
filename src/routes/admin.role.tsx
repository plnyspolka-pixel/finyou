import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/role")({
  component: RolesPage,
});

type AppRole = "administrator" | "operator" | "klient" | "inwestor";
const ALL_ROLES: AppRole[] = ["administrator", "operator", "klient", "inwestor"];

type Row = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  roles: AppRole[];
};

function RolesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles, error: pe }, { data: roles, error: re }] = await Promise.all([
      supabase.from("profiles").select("user_id, email, first_name, last_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pe || re) {
      toast.error("Nie udało się wczytać użytkowników", {
        description: pe?.message ?? re?.message,
      });
      setLoading(false);
      return;
    }
    const map = new Map<string, Row>();
    (profiles ?? []).forEach((p) => {
      map.set(p.user_id, {
        user_id: p.user_id,
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        roles: [],
      });
    });
    (roles ?? []).forEach((r) => {
      const cur = map.get(r.user_id) ?? {
        user_id: r.user_id,
        email: null,
        first_name: null,
        last_name: null,
        roles: [],
      };
      cur.roles.push(r.role as AppRole);
      map.set(r.user_id, cur);
    });
    setRows(Array.from(map.values()).sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (row: Row, role: AppRole, checked: boolean) => {
    setSaving(row.user_id + role);
    if (checked) {
      const { error } = await supabase.from("user_roles").insert({ user_id: row.user_id, role });
      if (error) toast.error("Nie udało się dodać roli", { description: error.message });
      else toast.success(`Dodano rolę: ${role}`);
    } else {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", row.user_id)
        .eq("role", role);
      if (error) toast.error("Nie udało się usunąć roli", { description: error.message });
      else toast.success(`Usunięto rolę: ${role}`);
    }
    setSaving(null);
    void load();
  };

  const filtered = rows.filter((r) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [r.email, r.first_name, r.last_name, r.user_id].some((v) =>
      (v ?? "").toLowerCase().includes(q),
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Role użytkowników</h1>
        <p className="text-sm text-muted-foreground">
          Zarządzaj rolami w tabeli <code>user_roles</code>. Zmiany zapisywane od razu.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Lista użytkowników ({filtered.length})</CardTitle>
          <Input
            placeholder="Szukaj po e-mailu, imieniu, nazwisku, ID…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Ładowanie…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak użytkowników.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Użytkownik</TableHead>
                    <TableHead>Aktualne role</TableHead>
                    {ALL_ROLES.map((r) => (
                      <TableHead key={r} className="text-center capitalize">
                        {r}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {row.first_name || row.last_name
                            ? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
                            : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.email ?? row.user_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">brak</span>
                          ) : (
                            row.roles.map((r) => (
                              <Badge key={r} variant="secondary" className="capitalize">
                                {r}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      {ALL_ROLES.map((r) => {
                        const checked = row.roles.includes(r);
                        const key = row.user_id + r;
                        return (
                          <TableCell key={r} className="text-center">
                            <Checkbox
                              checked={checked}
                              disabled={saving === key}
                              onCheckedChange={(v) => void toggle(row, r, Boolean(v))}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm("Usunąć wszystkie role tego użytkownika?")) return;
                            const { error } = await supabase
                              .from("user_roles")
                              .delete()
                              .eq("user_id", row.user_id);
                            if (error) toast.error("Błąd", { description: error.message });
                            else {
                              toast.success("Usunięto role");
                              void load();
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
