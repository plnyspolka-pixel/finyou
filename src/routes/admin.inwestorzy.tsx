import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, LogIn } from "lucide-react";
import { loginAsUser } from "@/lib/impersonate-client";
import { investorTypeLabels, subscriptionPlanLabels, subscriptionStatusLabels } from "@/lib/labels";

export const Route = createFileRoute("/admin/inwestorzy")({
  component: InwestorzyAdmin,
});

function InwestorzyAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    company_name: "",
    email: "",
    phone: "",
    investor_type: "indywidualny",
    subscription_plan: "podstawowy",
    subscription_status: "aktywny",
  });

  const load = async () => {
    const { data } = await supabase
      .from("investors")
      .select("*")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    const { error } = await supabase.from("investors").insert({
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company_name: form.company_name || null,
      email: form.email || null,
      phone: form.phone || null,
      investor_type: form.investor_type as any,
      subscription_plan: form.subscription_plan as any,
      subscription_status: form.subscription_status as any,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dodano inwestora");
    setOpen(false);
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inwestorzy</h1>
          <p className="text-sm text-muted-foreground">
            CRUD inwestorów indywidualnych i instytucjonalnych.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Dodaj inwestora
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy inwestor</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Typ</Label>
                <Select
                  value={form.investor_type}
                  onValueChange={(v) => setForm({ ...form, investor_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(investorTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Firma</Label>
                <Input
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Imię</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Nazwisko</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Plan</Label>
                <Select
                  value={form.subscription_plan}
                  onValueChange={(v) => setForm({ ...form, subscription_plan: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(subscriptionPlanLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status abonamentu</Label>
                <Select
                  value={form.subscription_status}
                  onValueChange={(v) => setForm({ ...form, subscription_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(subscriptionStatusLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={add}>Zapisz</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inwestor</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Abonament</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.company_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{investorTypeLabels[r.investor_type]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{r.email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.phone ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      {r.subscription_plan ? subscriptionPlanLabels[r.subscription_plan] : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.subscription_status === "aktywny" ? "default" : "secondary"}
                      >
                        {r.subscription_status
                          ? subscriptionStatusLabels[r.subscription_status]
                          : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!r.email}
                        onClick={() => void loginAsUser(r.email)}
                      >
                        <LogIn className="mr-1 h-3 w-3" /> Zaloguj jako
                      </Button>
                      <Link
                        to="/admin/inwestorzy/$id"
                        params={{ id: r.id }}
                        className="text-sm text-primary hover:underline"
                      >
                        Otwórz
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
