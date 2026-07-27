import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listLandingPages,
  saveLandingPage,
  deleteLandingPage,
  listLandingLeads,
  generateLandingCopy,
} from "@/lib/landing-pages.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, Plus, Trash2, ExternalLink, Eye, Users } from "lucide-react";

export const Route = createFileRoute("/admin/marketing/landing")({
  component: LandingAdmin,
});

type Page = {
  id: string;
  slug: string;
  title: string;
  headline: string;
  subheadline: string | null;
  cta_text: string;
  hero_image_url: string | null;
  og_image_url: string | null;
  meta_description: string | null;
  sections: unknown;
  form_fields: unknown;
  thank_you_message: string;
  redirect_url: string | null;
  theme: { primary?: string; background?: string };
  published: boolean;
  view_count: number;
  conversion_count: number;
  created_at: string;
};

type FormState = {
  id?: string;
  slug: string;
  title: string;
  headline: string;
  subheadline: string;
  cta_text: string;
  hero_image_url: string;
  og_image_url: string;
  meta_description: string;
  sections: string; // JSON
  form_fields: string; // JSON
  thank_you_message: string;
  redirect_url: string;
  primary: string;
  background: string;
  published: boolean;
};

const emptyForm = (): FormState => ({
  slug: "",
  title: "",
  headline: "",
  subheadline: "",
  cta_text: "Zostaw kontakt",
  hero_image_url: "",
  og_image_url: "",
  meta_description: "",
  sections: JSON.stringify(
    [
      {
        type: "features",
        title: "Co zyskujesz",
        items: [{ title: "Szybko", description: "Decyzja w 48h" }],
      },
    ],
    null,
    2,
  ),
  form_fields: JSON.stringify(
    [
      { name: "name", label: "Imię i nazwisko", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Telefon", type: "tel", required: false },
    ],
    null,
    2,
  ),
  thank_you_message: "Dziękujemy! Skontaktujemy się w ciągu 24h.",
  redirect_url: "",
  primary: "#0ea5e9",
  background: "#ffffff",
  published: false,
});

function LandingAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLandingPages);
  const saveFn = useServerFn(saveLandingPage);
  const delFn = useServerFn(deleteLandingPage);

  const { data, isLoading } = useQuery({
    queryKey: ["landing-pages"],
    queryFn: () => listFn(),
  });

  const [editor, setEditor] = useState<FormState | null>(null);
  const [leadsFor, setLeadsFor] = useState<Page | null>(null);

  const saveMut = useMutation({
    mutationFn: async (form: FormState) => {
      const sections = JSON.parse(form.sections);
      const form_fields = JSON.parse(form.form_fields);
      return saveFn({
        data: {
          id: form.id,
          slug: form.slug.toLowerCase().trim(),
          title: form.title,
          headline: form.headline,
          subheadline: form.subheadline || undefined,
          cta_text: form.cta_text,
          hero_image_url: form.hero_image_url || undefined,
          og_image_url: form.og_image_url || undefined,
          meta_description: form.meta_description || undefined,
          sections,
          form_fields,
          thank_you_message: form.thank_you_message,
          redirect_url: form.redirect_url || undefined,
          theme: { primary: form.primary, background: form.background },
          published: form.published,
        },
      });
    },
    onSuccess: () => {
      toast.success("Zapisano");
      setEditor(null);
      qc.invalidateQueries({ queryKey: ["landing-pages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["landing-pages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pages = (data?.pages ?? []) as Page[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Landing Pages</h1>
          <p className="text-sm text-muted-foreground">
            Twórz strony docelowe z formularzami zapisu. Leady trafiają też do email marketingu.
          </p>
        </div>
        <Button onClick={() => setEditor(emptyForm())}>
          <Plus className="mr-2 h-4 w-4" /> Nowy landing
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Ładowanie…</div>
      ) : pages.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Brak landingów. Kliknij „Nowy landing”, żeby zacząć.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {pages.map((p) => {
            const cvr =
              p.view_count > 0 ? ((p.conversion_count / p.view_count) * 100).toFixed(1) : "0";
            return (
              <Card key={p.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.title}</span>
                      {p.published ? (
                        <Badge variant="default">opublikowany</Badge>
                      ) : (
                        <Badge variant="secondary">szkic</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">/l/{p.slug}</div>
                    <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {p.view_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {p.conversion_count} leadów
                      </span>
                      <span>CVR: {cvr}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {p.published && (
                      <a href={`/l/${p.slug}`} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="mr-1 h-3 w-3" /> Otwórz
                        </Button>
                      </a>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setLeadsFor(p)}>
                      <Users className="mr-1 h-3 w-3" /> Leady
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditor({
                          id: p.id,
                          slug: p.slug,
                          title: p.title,
                          headline: p.headline,
                          subheadline: p.subheadline ?? "",
                          cta_text: p.cta_text,
                          hero_image_url: p.hero_image_url ?? "",
                          og_image_url: p.og_image_url ?? "",
                          meta_description: p.meta_description ?? "",
                          sections: JSON.stringify(p.sections ?? [], null, 2),
                          form_fields: JSON.stringify(p.form_fields ?? [], null, 2),
                          thank_you_message: p.thank_you_message,
                          redirect_url: p.redirect_url ?? "",
                          primary: p.theme?.primary ?? "#0ea5e9",
                          background: p.theme?.background ?? "#ffffff",
                          published: p.published,
                        })
                      }
                    >
                      Edytuj
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Usunąć "${p.title}"? Razem ze wszystkimi leadami.`))
                          delMut.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editor && (
        <EditorDialog
          form={editor}
          setForm={setEditor}
          onSave={() => saveMut.mutate(editor)}
          saving={saveMut.isPending}
        />
      )}

      {leadsFor && <LeadsDialog page={leadsFor} onClose={() => setLeadsFor(null)} />}
    </div>
  );
}

function EditorDialog({
  form,
  setForm,
  onSave,
  saving,
}: {
  form: FormState;
  setForm: (f: FormState | null) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const aiFn = useServerFn(generateLandingCopy);
  const [brief, setBrief] = useState("");
  const aiMut = useMutation({
    mutationFn: () => aiFn({ data: { brief } }),
    onSuccess: (r) => {
      setForm({
        ...form,
        headline: r.headline || form.headline,
        subheadline: r.subheadline || form.subheadline,
        cta_text: r.cta_text || form.cta_text,
        meta_description: r.meta_description || form.meta_description,
        sections: JSON.stringify(r.sections, null, 2),
      });
      toast.success("Wygenerowano treść");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof FormState, v: string | boolean) =>
    setForm({ ...form, [k]: v } as FormState);

  return (
    <Dialog open onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edycja landing page" : "Nowy landing page"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basics">
          <TabsList>
            <TabsTrigger value="basics">Podstawy</TabsTrigger>
            <TabsTrigger value="content">Treść</TabsTrigger>
            <TabsTrigger value="form">Formularz</TabsTrigger>
            <TabsTrigger value="design">Wygląd</TabsTrigger>
            <TabsTrigger value="ai">AI Copy</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tytuł (wewnętrzny)</Label>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div>
                <Label>Slug (URL: /l/...)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) =>
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                  }
                  placeholder="pozyczka-pod-nieruchomosc"
                />
              </div>
            </div>
            <div>
              <Label>Meta description (SEO)</Label>
              <Textarea
                value={form.meta_description}
                onChange={(e) => set("meta_description", e.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>
            <div>
              <Label>OG image URL (social)</Label>
              <Input
                value={form.og_image_url}
                onChange={(e) => set("og_image_url", e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
              <Label>Opublikowany</Label>
            </div>
          </TabsContent>

          <TabsContent value="content" className="space-y-3 pt-4">
            <div>
              <Label>Nagłówek (H1)</Label>
              <Textarea
                value={form.headline}
                onChange={(e) => set("headline", e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label>Podnagłówek</Label>
              <Textarea
                value={form.subheadline}
                onChange={(e) => set("subheadline", e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label>Obrazek hero (URL)</Label>
              <Input
                value={form.hero_image_url}
                onChange={(e) => set("hero_image_url", e.target.value)}
              />
            </div>
            <div>
              <Label>Sekcje (JSON)</Label>
              <p className="mb-1 text-xs text-muted-foreground">
                Typy: features, stats, text, testimonial, cta. Skorzystaj z zakładki AI Copy, żeby
                wygenerować.
              </p>
              <Textarea
                value={form.sections}
                onChange={(e) => set("sections", e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
            </div>
          </TabsContent>

          <TabsContent value="form" className="space-y-3 pt-4">
            <div>
              <Label>Tekst przycisku CTA</Label>
              <Input value={form.cta_text} onChange={(e) => set("cta_text", e.target.value)} />
            </div>
            <div>
              <Label>Pola formularza (JSON)</Label>
              <p className="mb-1 text-xs text-muted-foreground">
                Typy pól: text, email, tel, textarea, select. „email” jest wymagany.
              </p>
              <Textarea
                value={form.form_fields}
                onChange={(e) => set("form_fields", e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label>Komunikat po wysłaniu</Label>
              <Textarea
                value={form.thank_you_message}
                onChange={(e) => set("thank_you_message", e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label>Albo przekieruj na URL (opcjonalnie)</Label>
              <Input
                value={form.redirect_url}
                onChange={(e) => set("redirect_url", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </TabsContent>

          <TabsContent value="design" className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kolor akcentu</Label>
                <Input
                  type="color"
                  value={form.primary}
                  onChange={(e) => set("primary", e.target.value)}
                />
              </div>
              <div>
                <Label>Kolor tła</Label>
                <Input
                  type="color"
                  value={form.background}
                  onChange={(e) => set("background", e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-3 pt-4">
            <div>
              <Label>Brief dla AI</Label>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={6}
                placeholder="Opisz produkt/ofertę, grupę docelową, główną korzyść, CTA. Np: Pożyczka pod nieruchomość dla przedsiębiorców z negatywnym BIK, do 70% wartości, decyzja w 48h..."
              />
            </div>
            <Button onClick={() => aiMut.mutate()} disabled={aiMut.isPending || brief.length < 10}>
              <Sparkles className="mr-2 h-4 w-4" />
              {aiMut.isPending ? "Generuję…" : "Wygeneruj treść"}
            </Button>
            <p className="text-xs text-muted-foreground">
              AI uzupełni nagłówek, podnagłówek, CTA, meta description i sekcje. Pola formularza i
              kolory zostawia w spokoju.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setForm(null)}>
            Anuluj
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Zapisuję…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadsDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  const fn = useServerFn(listLandingLeads);
  const { data, isLoading } = useQuery({
    queryKey: ["landing-leads", page.id],
    queryFn: () => fn({ data: { landing_page_id: page.id } }),
  });
  const leads = (data?.leads ?? []) as Array<{
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    custom_fields: Record<string, string>;
    created_at: string;
  }>;

  const csv = useMemo(() => {
    const headers = ["created_at", "email", "name", "phone"];
    const lines = [headers.join(",")];
    for (const l of leads) {
      lines.push(
        [l.created_at, l.email, l.name ?? "", l.phone ?? ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
    }
    return lines.join("\n");
  }, [leads]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Leady — {page.title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="text-muted-foreground">Ładowanie…</div>
        ) : leads.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">Brak leadów</div>
        ) : (
          <>
            <div className="mb-3 flex justify-between text-sm text-muted-foreground">
              <span>{leads.length} leadów</span>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
                download={`leads-${page.slug}.csv`}
                className="text-primary hover:underline"
              >
                Pobierz CSV
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Data</th>
                    <th>Email</th>
                    <th>Imię i nazwisko</th>
                    <th>Telefon</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="py-2 text-xs text-muted-foreground">
                        {formatDateTime(l.created_at)}
                      </td>
                      <td>{l.email}</td>
                      <td>{l.name ?? "—"}</td>
                      <td>{l.phone ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
