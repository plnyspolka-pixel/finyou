import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMetaOverview } from "@/lib/meta-ads.functions";
import {
  listFbPages,
  searchTargeting,
  saveAdDraft,
  listAdDrafts,
  getAdDraft,
  deleteAdDraft,
  publishAdDraft,
  listAdPixels,
  createAdPixel,
  suggestTargeting,
} from "@/lib/meta-ads-creator.functions";
import {
  PRESET_LUBLIN_100KM,
  PRESET_BUDUJE_SIE,
  SZABLON_SZALUNKI_LUBLIN,
  SZABLON_SZALUNKI_FORMULARZ,
  zastosujSzablon,
  sprawdzKampanie,
  MAX_PROMIEN_KM,
} from "@/lib/meta-ad-targeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Facebook, Plus, Pencil, Trash2, Rocket, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/fb-ads/kreator")({
  component: FbCreatorPage,
});

function FbCreatorPage() {
  const fetchDrafts = useServerFn(listAdDrafts);
  const del = useServerFn(deleteAdDraft);
  const publish = useServerFn(publishAdDraft);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["fb-drafts"], queryFn: () => fetchDrafts() });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onPublish = async (id: string) => {
    if (
      !confirm(
        "Opublikować kampanię na Facebooku? Szkic z ustawieniem „włącz od razu” wystartuje " +
          "i zacznie wydawać budżet; pozostałe powstaną jako wstrzymane.",
      )
    )
      return;
    try {
      const r = await publish({ data: { id } });
      toast.success(
        r.status === "ACTIVE" ? "Opublikowano i włączono (ACTIVE)" : "Opublikowano (PAUSED)",
      );
      qc.invalidateQueries({ queryKey: ["fb-drafts"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Facebook className="h-6 w-6" />
            Kreator FB Lead Ads
          </h1>
          <p className="text-sm text-muted-foreground">
            Tworzenie kampanii pozyskiwania leadów krok po kroku.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nowa kampania
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Szkice i opublikowane</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Ładowanie…</div>
          ) : !data?.drafts.length ? (
            <div className="text-sm text-muted-foreground">
              Brak kampanii. Kliknij „Nowa kampania".
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Konto</TableHead>
                  <TableHead>Budżet/dzień</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.drafts.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.name}
                      {d.error_message && (
                        <div className="text-xs text-destructive">{d.error_message}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{d.meta_ad_accounts?.name ?? "—"}</TableCell>
                    <TableCell>{Number(d.daily_budget).toFixed(2)} PLN</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          d.status === "opublikowana"
                            ? "default"
                            : d.status === "blad"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(d.id);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {d.status !== "opublikowana" && (
                        <Button size="sm" onClick={() => onPublish(d.id)}>
                          <Rocket className="h-3 w-3 mr-1" />
                          Publikuj
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (confirm("Usunąć?")) {
                            await del({ data: { id: d.id } });
                            qc.invalidateQueries({ queryKey: ["fb-drafts"] });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {open && (
        <FbCreatorDialog
          open={open}
          onOpenChange={setOpen}
          editingId={editingId}
          onSaved={() => qc.invalidateQueries({ queryKey: ["fb-drafts"] })}
        />
      )}
    </div>
  );
}

function FbCreatorDialog({
  open,
  onOpenChange,
  editingId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingId: string | null;
  onSaved: () => void;
}) {
  const fetchOverview = useServerFn(listMetaOverview);
  const fetchPages = useServerFn(listFbPages);
  const searchT = useServerFn(searchTargeting);
  const save = useServerFn(saveAdDraft);
  const getDraft = useServerFn(getAdDraft);

  const { data: overview } = useQuery({
    queryKey: ["meta-overview"],
    queryFn: () => fetchOverview(),
  });
  const { data: pages } = useQuery({ queryKey: ["fb-pages"], queryFn: () => fetchPages() });

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<any>({
    name: "",
    ad_account_id: "",
    page_id: "",
    page_name: "",
    daily_budget: 50,
    start_time: null,
    end_time: null,
    targeting: {
      geo_locations: { countries: ["PL"] },
      cities: [],
      umiejscowienia: "glowne",
      poszerzanie_grupy: false,
      age_min: 25,
      age_max: 65,
      genders: undefined,
      interests: [],
    },
    creative: {
      headline: "",
      primary_text: "",
      description: "",
      image_url: "",
      cta_type: "SIGN_UP",
      cel: "formularz_fb",
      landing_url: "",
      pixel_id: "",
      optymalizacja_www: "konwersje",
    },
    lead_form: {
      name: "",
      questions: [{ type: "EMAIL" }, { type: "FULL_NAME" }, { type: "PHONE" }],
      privacy_policy: {
        url: "https://financeyou.pl/polityka-prywatnosci",
        link_text: "Polityka prywatności",
      },
      follow_up_action_url: "https://financeyou.pl/dziekujemy",
    },
  });

  useEffect(() => {
    if (editingId) {
      getDraft({ data: { id: editingId } }).then((r) => {
        if (r.draft) setForm(r.draft);
      });
    }
  }, [editingId, getDraft]);

  const fetchPixels = useServerFn(listAdPixels);
  const makePixel = useServerFn(createAdPixel);
  const suggest = useServerFn(suggestTargeting);

  const naStrone = form.creative?.cel === "strona_www";

  const { data: pixels, refetch: refetchPixels } = useQuery({
    queryKey: ["fb-pixels", form.ad_account_id],
    queryFn: () => fetchPixels({ data: { ad_account_id: form.ad_account_id } }),
    enabled: Boolean(form.ad_account_id) && naStrone,
  });

  type Miasto = { key: string; name: string; region?: string; radius: number };
  type Piksel = { id: string; name: string };

  const [nowyPiksel, setNowyPiksel] = useState("");
  const utworzPiksel = async () => {
    if (!form.ad_account_id) {
      toast.error("Najpierw wybierz konto reklamowe");
      return;
    }
    try {
      const r = await makePixel({
        data: {
          ad_account_id: form.ad_account_id,
          name: nowyPiksel.trim() || form.name || "Piksel kampanii",
        },
      });
      setForm((f: typeof form) => ({ ...f, creative: { ...f.creative, pixel_id: r.id } }));
      setNowyPiksel("");
      await refetchPixels();
      toast.success(`Utworzono piksel ${r.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const [presetLoading, setPresetLoading] = useState(false);
  const wstawPreset = async () => {
    setPresetLoading(true);
    try {
      const r = await suggest({
        data: { geo: PRESET_LUBLIN_100KM.id, interests: PRESET_BUDUJE_SIE.id },
      });
      setForm((f: typeof form) => {
        const stare = f.targeting.interests ?? [];
        const nowe = r.interests.filter(
          (i: { id: string }) => !stare.some((x: { id: string }) => x.id === i.id),
        );
        return {
          ...f,
          targeting: {
            ...f.targeting,
            cities: r.cities,
            geo_locations: r.geo_locations ?? f.targeting.geo_locations,
            interests: [...stare, ...nowe],
          },
        };
      });
      toast.success(
        `Wstawiono ${r.cities.length} lokalizacji i ${r.interests.length} zainteresowań`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPresetLoading(false);
    }
  };

  const [intSearch, setIntSearch] = useState("");
  const [intResults, setIntResults] = useState<any[]>([]);
  const doSearchInterest = async () => {
    if (!intSearch.trim()) return;
    const r = await searchT({ data: { type: "adinterest", q: intSearch } });
    setIntResults(r.results);
  };
  const addInterest = (i: any) => {
    const cur = form.targeting.interests ?? [];
    if (cur.find((x: any) => x.id === i.id)) return;
    setForm({
      ...form,
      targeting: { ...form.targeting, interests: [...cur, { id: i.id, name: i.name }] },
    });
  };
  const removeInterest = (id: string) => {
    setForm({
      ...form,
      targeting: {
        ...form.targeting,
        interests: (form.targeting.interests ?? []).filter((x: any) => x.id !== id),
      },
    });
  };

  const uploadImage = async (file: File) => {
    const path = `creatives/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage.from("ad-creatives").upload(path, file);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: pub } = supabase.storage.from("ad-creatives").getPublicUrl(path);
    setForm({ ...form, creative: { ...form.creative, image_url: pub.publicUrl } });
    toast.success("Zdjęcie zapisane");
  };

  const onSave = async () => {
    try {
      const payload: any = { ...form };
      if (editingId) payload.id = editingId;
      // pick page name
      const p = pages?.pages.find((x: any) => x.id === form.page_id);
      if (p) payload.page_name = p.name;
      await save({ data: payload });
      toast.success("Zapisano");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kreator kampanii FB Lead Ads — krok {step}/6</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mb-2">
          {["Konto", "Budżet", "Targetowanie", "Kreacja", "Formularz / strona", "Podgląd"].map(
            (label, i) => (
              <button
                key={i}
                onClick={() => setStep(i + 1)}
                className={`flex-1 text-xs py-2 rounded ${step === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {i + 1}. {label}
              </button>
            ),
          )}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>Nazwa kampanii</Label>
                <div className="flex gap-1">
                  {[SZABLON_SZALUNKI_FORMULARZ, SZABLON_SZALUNKI_LUBLIN].map((szablon) => (
                    <Button
                      key={szablon.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setForm((f: typeof form) => zastosujSzablon(f, szablon));
                        toast.success("Wstawiono szablon — zostaje konto, strona i piksel");
                      }}
                    >
                      {szablon.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Konto reklamowe</Label>
              <Select
                value={form.ad_account_id ?? ""}
                onValueChange={(v) => setForm({ ...form, ad_account_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz konto" />
                </SelectTrigger>
                <SelectContent>
                  {overview?.accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!overview?.accounts.length && (
                <div className="text-xs text-muted-foreground mt-1">
                  Brak kont — najpierw kliknij „Pobierz konta" w module Meta Ads.
                </div>
              )}
            </div>
            <div>
              <Label>Strona Facebook</Label>
              <Select
                value={form.page_id ?? ""}
                onValueChange={(v) => setForm({ ...form, page_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz stronę" />
                </SelectTrigger>
                <SelectContent>
                  {pages?.pages.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Gdzie klient zostawia kontakt</Label>
              <Select
                value={form.creative.cel ?? "formularz_fb"}
                onValueChange={(v) => setForm({ ...form, creative: { ...form.creative, cel: v } })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formularz_fb">Formularz na Facebooku (Lead Ads)</SelectItem>
                  <SelectItem value="strona_www">Formularz na stronie WWW (piksel)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {naStrone && (
              <div className="space-y-3 rounded border p-3">
                <div>
                  <Label>Adres strony z formularzem</Label>
                  <Input
                    placeholder="https://szalunki-lublin.pl"
                    value={form.creative.landing_url ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        creative: { ...form.creative, landing_url: e.target.value },
                      })
                    }
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Do adresu dokleimy UTM-y (utm_source=facebook), żeby leady były podpisane
                    źródłem.
                  </div>
                </div>
                <div>
                  <Label>Piksel</Label>
                  <Select
                    value={form.creative.pixel_id ?? ""}
                    onValueChange={(v) =>
                      setForm({ ...form, creative: { ...form.creative, pixel_id: v } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz piksel" />
                    </SelectTrigger>
                    <SelectContent>
                      {pixels?.pixels.map((px: Piksel) => (
                        <SelectItem key={px.id} value={px.id}>
                          {px.name} ({px.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Nazwa nowego piksela"
                      value={nowyPiksel}
                      onChange={(e) => setNowyPiksel(e.target.value)}
                    />
                    <Button type="button" variant="outline" onClick={utworzPiksel}>
                      <Plus className="h-3 w-3 mr-1" />
                      Utwórz piksel
                    </Button>
                  </div>
                  {form.creative.pixel_id && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Wklej ten identyfikator na stronie klienta:{" "}
                      <code>{form.creative.pixel_id}</code>. Formularz po wysłaniu ma zgłosić
                      zdarzenie <code>Lead</code>.
                    </div>
                  )}
                </div>
                <div>
                  <Label>Pod co optymalizować</Label>
                  <Select
                    value={form.creative.optymalizacja_www ?? "konwersje"}
                    onValueChange={(v) =>
                      setForm({ ...form, creative: { ...form.creative, optymalizacja_www: v } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="konwersje">
                        Zdarzenie Lead z piksela (gdy piksel już zbiera dane)
                      </SelectItem>
                      <SelectItem value="wejscia">
                        Wejścia na stronę (na start, zanim piksel się nauczy)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <Label>Budżet dzienny (PLN)</Label>
              <Input
                type="number"
                value={form.daily_budget}
                onChange={(e) => setForm({ ...form, daily_budget: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Po publikacji</Label>
              <Select
                value={form.creative.wlacz_od_razu ? "1" : "0"}
                onValueChange={(v) =>
                  setForm({ ...form, creative: { ...form.creative, wlacz_od_razu: v === "1" } })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">
                    Zostaw wstrzymaną (włączysz ręcznie w Menedżerze reklam)
                  </SelectItem>
                  <SelectItem value="1">Włącz od razu — reklama rusza i wydaje budżet</SelectItem>
                </SelectContent>
              </Select>
              {form.creative.wlacz_od_razu ? (
                <div className="text-xs text-destructive mt-1">
                  Kampania, zestaw i reklama powstaną jako ACTIVE — po akceptacji przez Meta zaczną
                  wydawać {Number(form.daily_budget).toFixed(2)} PLN dziennie.
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data startu</Label>
                <Input
                  type="datetime-local"
                  value={form.start_time?.slice(0, 16) ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      start_time: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
              <div>
                <Label>Data końca</Label>
                <Input
                  type="datetime-local"
                  value={form.end_time?.slice(0, 16) ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      end_time: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label>Wiek od</Label>
                <Input
                  type="number"
                  min={13}
                  max={65}
                  value={form.targeting.age_min}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targeting: { ...form.targeting, age_min: Number(e.target.value) },
                    })
                  }
                />
              </div>
              <div>
                <Label>Wiek do</Label>
                <Input
                  type="number"
                  min={13}
                  max={65}
                  value={form.targeting.age_max}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targeting: { ...form.targeting, age_max: Number(e.target.value) },
                    })
                  }
                />
              </div>
              <div>
                <Label>Płeć</Label>
                <Select
                  value={String(form.targeting.genders?.[0] ?? "0")}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      targeting: {
                        ...form.targeting,
                        genders: v === "0" ? undefined : [Number(v)],
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Wszyscy</SelectItem>
                    <SelectItem value="1">Mężczyźni</SelectItem>
                    <SelectItem value="2">Kobiety</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Zainteresowania</Label>
              <div className="flex gap-2">
                <Input
                  value={intSearch}
                  onChange={(e) => setIntSearch(e.target.value)}
                  placeholder="np. nieruchomości, kredyt hipoteczny"
                />
                <Button type="button" variant="outline" onClick={doSearchInterest}>
                  <Search className="h-3 w-3" />
                </Button>
              </div>
              {intResults.length > 0 && (
                <div className="border rounded mt-2 max-h-40 overflow-y-auto">
                  {intResults.map((i: any) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => addInterest(i)}
                      className="w-full text-left px-3 py-1 text-sm hover:bg-muted"
                    >
                      {i.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({(i.audience_size_lower_bound ?? 0).toLocaleString("pl-PL")}–
                        {(i.audience_size_upper_bound ?? 0).toLocaleString("pl-PL")})
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {(form.targeting.interests ?? []).map((i: any) => (
                  <Badge
                    key={i.id}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeInterest(i.id)}
                  >
                    {i.name} ×
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Lokalizacja</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={presetLoading}
                  onClick={wstawPreset}
                >
                  {presetLoading
                    ? "Pobieram…"
                    : `Preset: ${PRESET_LUBLIN_100KM.label} + buduje się`}
                </Button>
              </div>
              {(form.targeting.cities ?? []).length ? (
                <div className="space-y-1">
                  {(form.targeting.cities ?? []).map((c: Miasto) => (
                    <div key={c.key} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">
                        {c.name}
                        {c.region ? `, ${c.region}` : ""}
                      </span>
                      <Input
                        type="number"
                        min={10}
                        max={MAX_PROMIEN_KM}
                        className="w-24"
                        value={c.radius}
                        onChange={(e) => {
                          const radius = Number(e.target.value);
                          setForm((f: typeof form) => {
                            const cities = (f.targeting.cities ?? []).map((x: Miasto) =>
                              x.key === c.key ? { ...x, radius } : x,
                            );
                            return {
                              ...f,
                              targeting: {
                                ...f.targeting,
                                cities,
                                geo_locations: {
                                  cities: cities.map((x: Miasto) => ({
                                    key: x.key,
                                    radius: Math.min(MAX_PROMIEN_KM, Math.max(10, x.radius || 10)),
                                    distance_unit: "kilometer",
                                  })),
                                  location_types: ["home", "recent"],
                                },
                              },
                            };
                          });
                        }}
                      />
                      <span className="text-xs text-muted-foreground">km</span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setForm((f: typeof form) => {
                            const cities = (f.targeting.cities ?? []).filter(
                              (x: Miasto) => x.key !== c.key,
                            );
                            return {
                              ...f,
                              targeting: {
                                ...f.targeting,
                                cities,
                                geo_locations: cities.length
                                  ? {
                                      cities: cities.map((x: Miasto) => ({
                                        key: x.key,
                                        radius: x.radius,
                                        distance_unit: "kilometer",
                                      })),
                                      location_types: ["home", "recent"],
                                    }
                                  : { countries: ["PL"] },
                              },
                            };
                          })
                        }
                      >
                        usuń
                      </button>
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground">
                    Meta nie przyjmuje promienia większego niż {MAX_PROMIEN_KM} km wokół jednego
                    miasta — dlatego „+100 km" składamy z kilku mniejszych okręgów.
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Lokalizacja: Polska (domyślnie)</div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Umiejscowienia</Label>
                <Select
                  value={form.targeting.umiejscowienia ?? "glowne"}
                  onValueChange={(v) =>
                    setForm({ ...form, targeting: { ...form.targeting, umiejscowienia: v } })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="glowne">
                      Tylko główne kanały (aktualności FB + feed IG)
                    </SelectItem>
                    <SelectItem value="glowne_reels">Główne kanały + Reels</SelectItem>
                    <SelectItem value="auto">Automat Meta (tylko FB i IG)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground mt-1">
                  Audience Network i Messenger są wyłączone zawsze — to tam najczęściej przepalają
                  się wyświetlenia.
                </div>
              </div>
              <div>
                <Label>Poszerzanie grupy przez Meta</Label>
                <Select
                  value={form.targeting.poszerzanie_grupy ? "1" : "0"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      targeting: { ...form.targeting, poszerzanie_grupy: v === "1" },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Wyłączone (trzymamy się zainteresowań)</SelectItem>
                    <SelectItem value="1">Włączone (Advantage+ audience)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div>
              <Label>Nagłówek (max 40 zn.)</Label>
              <Input
                maxLength={40}
                value={form.creative.headline}
                onChange={(e) =>
                  setForm({ ...form, creative: { ...form.creative, headline: e.target.value } })
                }
              />
            </div>
            <div>
              <Label>Tekst główny</Label>
              <Textarea
                rows={4}
                value={form.creative.primary_text}
                onChange={(e) =>
                  setForm({ ...form, creative: { ...form.creative, primary_text: e.target.value } })
                }
              />
            </div>
            <div>
              <Label>Opis (max 30 zn.)</Label>
              <Input
                maxLength={30}
                value={form.creative.description}
                onChange={(e) =>
                  setForm({ ...form, creative: { ...form.creative, description: e.target.value } })
                }
              />
            </div>
            <div>
              <Label>Przycisk CTA</Label>
              <Select
                value={form.creative.cta_type}
                onValueChange={(v) =>
                  setForm({ ...form, creative: { ...form.creative, cta_type: v } })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIGN_UP">Zarejestruj się</SelectItem>
                  <SelectItem value="LEARN_MORE">Dowiedz się więcej</SelectItem>
                  <SelectItem value="APPLY_NOW">Złóż wniosek</SelectItem>
                  <SelectItem value="GET_QUOTE">Otrzymaj wycenę</SelectItem>
                  <SelectItem value="CONTACT_US">Skontaktuj się</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Zdjęcie reklamy</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                }}
              />
              {form.creative.image_url && (
                <img src={form.creative.image_url} alt="" className="mt-2 max-h-40 rounded" />
              )}
            </div>
          </div>
        )}

        {step === 5 && naStrone && (
          <div className="space-y-2 text-sm">
            <div className="rounded border p-3">
              Ta kampania nie tworzy formularza na Facebooku — reklama prowadzi na{" "}
              <strong>{form.creative.landing_url || "(brak adresu)"}</strong>, a konwersje liczy
              piksel <strong>{form.creative.pixel_id || "(brak)"}</strong>.
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                Na stronie musi być wpięty ten piksel, a formularz po wysłaniu ma zgłaszać zdarzenie{" "}
                <code>Lead</code>.
              </li>
              <li>Zgody i polityka prywatności obowiązują po stronie strony docelowej.</li>
            </ul>
          </div>
        )}

        {step === 5 && !naStrone && (
          <div className="space-y-3">
            <div>
              <Label>Nazwa formularza</Label>
              <Input
                value={form.lead_form.name}
                onChange={(e) =>
                  setForm({ ...form, lead_form: { ...form.lead_form, name: e.target.value } })
                }
              />
            </div>
            <div>
              <Label>URL polityki prywatności</Label>
              <Input
                value={form.lead_form.privacy_policy.url}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lead_form: {
                      ...form.lead_form,
                      privacy_policy: { ...form.lead_form.privacy_policy, url: e.target.value },
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>URL strony "dziękujemy"</Label>
              <Input
                value={form.lead_form.follow_up_action_url}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lead_form: { ...form.lead_form, follow_up_action_url: e.target.value },
                  })
                }
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Pola w formularzu: Email, Imię i nazwisko, Telefon (domyślnie).
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-2 text-sm">
            {(() => {
              const bledy = sprawdzKampanie({
                cel: naStrone ? "strona_www" : "formularz_fb",
                landingUrl: form.creative.landing_url,
                pixelId: form.creative.pixel_id,
                pageId: form.page_id,
                budzetDzienny: Number(form.daily_budget),
                politykaUrl: form.lead_form?.privacy_policy?.url,
              });
              return bledy.length ? (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-3">
                  <div className="font-medium text-destructive">
                    Do uzupełnienia przed publikacją:
                  </div>
                  <ul className="list-disc pl-5">
                    {bledy.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}
            <div>
              <strong>Nazwa:</strong> {form.name}
            </div>
            <div>
              <strong>Cel:</strong>{" "}
              {naStrone
                ? `formularz na stronie ${form.creative.landing_url || "—"} (piksel ${form.creative.pixel_id || "—"})`
                : `formularz błyskawiczny na Facebooku: ${
                    (form.lead_form?.questions ?? [])
                      .map((q: { type: string }) => q.type)
                      .join(", ") || "—"
                  }`}
            </div>
            <div>
              <strong>Po publikacji:</strong>{" "}
              {form.creative.wlacz_od_razu ? "od razu aktywna" : "wstrzymana"}
            </div>
            <div>
              <strong>Umiejscowienia:</strong>{" "}
              {form.targeting.umiejscowienia === "auto"
                ? "automat Meta (FB + IG)"
                : form.targeting.umiejscowienia === "glowne_reels"
                  ? "główne kanały + Reels"
                  : "tylko główne kanały"}
            </div>
            <div>
              <strong>Lokalizacje:</strong>{" "}
              {(form.targeting.cities ?? []).length
                ? (form.targeting.cities ?? [])
                    .map((c: Miasto) => `${c.name} +${c.radius} km`)
                    .join(", ")
                : "Polska"}
            </div>
            <div>
              <strong>Budżet:</strong> {form.daily_budget} PLN/dzień
            </div>
            <div>
              <strong>Wiek:</strong> {form.targeting.age_min}–{form.targeting.age_max}
            </div>
            <div>
              <strong>Zainteresowania:</strong>{" "}
              {(form.targeting.interests ?? []).map((i: any) => i.name).join(", ") || "—"}
            </div>
            <div>
              <strong>Nagłówek:</strong> {form.creative.headline}
            </div>
            <div>
              <strong>CTA:</strong> {form.creative.cta_type}
            </div>
            <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
              {JSON.stringify(form, null, 2)}
            </pre>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Wstecz
              </Button>
            )}
          </div>
          <div className="space-x-2">
            <Button variant="outline" onClick={onSave}>
              Zapisz szkic
            </Button>
            {step < 6 ? <Button onClick={() => setStep(step + 1)}>Dalej</Button> : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
