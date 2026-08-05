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
} from "@/lib/meta-ads-creator.functions";
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
import { Facebook, Plus, Pencil, Trash2, Rocket, Search, Film, ImageIcon } from "lucide-react";
import { unzip } from "fflate";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/fb-ads/kreator")({
  component: FbCreatorPage,
});

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;

function mediaKind(name: string): "image" | "video" | null {
  if (IMAGE_EXT.test(name)) return "image";
  if (VIDEO_EXT.test(name)) return "video";
  return null;
}

function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

function sanitizeName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_");
}

function captureVideoThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      const cleanup = (b: Blob | null) => {
        URL.revokeObjectURL(url);
        resolve(b);
      };
      v.preload = "auto";
      v.muted = true;
      v.src = url;
      v.onloadeddata = () => {
        v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      };
      v.onseeked = () => {
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        if (!c.width || !c.height) return cleanup(null);
        c.getContext("2d")?.drawImage(v, 0, 0);
        c.toBlob((b) => cleanup(b), "image/jpeg", 0.85);
      };
      v.onerror = () => cleanup(null);
      setTimeout(() => cleanup(null), 15_000);
    } catch {
      resolve(null);
    }
  });
}

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
        "Opublikować kampanię na Facebooku? (utworzy się jako PAUSED — wymaga ręcznej aktywacji)",
      )
    )
      return;
    try {
      await publish({ data: { id } });
      toast.success("Opublikowano (PAUSED)");
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
      age_min: 25,
      age_max: 65,
      genders: undefined,
      interests: [],
    },
    creative: {
      headline: "",
      primary_text: "",
      description: "",
      media_type: "image",
      image_url: "",
      video_url: "",
      video_thumbnail_url: "",
      cta_type: "SIGN_UP",
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

  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  const { data: library } = useQuery({
    queryKey: ["ad-creatives-library"],
    enabled: step === 4,
    queryFn: async () => {
      const { data: files, error } = await supabase.storage
        .from("ad-creatives")
        .list("creatives", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw new Error(error.message);
      return (files ?? [])
        .filter((f) => mediaKind(f.name))
        .map((f) => ({
          name: f.name,
          kind: mediaKind(f.name)!,
          url: supabase.storage.from("ad-creatives").getPublicUrl(`creatives/${f.name}`).data
            .publicUrl,
        }));
    },
  });

  const uploadToBucket = async (path: string, body: Blob | File, contentType?: string) => {
    const { error } = await supabase.storage
      .from("ad-creatives")
      .upload(path, body, contentType ? { contentType } : undefined);
    if (error) throw new Error(error.message);
    return supabase.storage.from("ad-creatives").getPublicUrl(path).data.publicUrl;
  };

  const setCreative = (patch: Record<string, unknown>) =>
    setForm((prev: any) => ({ ...prev, creative: { ...prev.creative, ...patch } }));

  const uploadImage = async (file: File) => {
    const url = await uploadToBucket(`creatives/${Date.now()}-${sanitizeName(file.name)}`, file);
    setCreative({ media_type: "image", image_url: url });
    toast.success("Zdjęcie zapisane");
  };

  const uploadVideo = async (file: File) => {
    const url = await uploadToBucket(`creatives/${Date.now()}-${sanitizeName(file.name)}`, file);
    const patch: Record<string, unknown> = { media_type: "video", video_url: url };
    const thumb = await captureVideoThumb(file);
    if (thumb) {
      patch.video_thumbnail_url = await uploadToBucket(
        `creatives/${Date.now()}-thumb.jpg`,
        thumb,
        "image/jpeg",
      );
    }
    setCreative(patch);
    toast.success(thumb ? "Wideo i miniatura zapisane" : "Wideo zapisane (bez miniatury)");
  };

  const uploadZip = async (file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
    });
    const media = Object.entries(entries).filter(([name, data]) => {
      const base = name.split("/").pop() ?? "";
      return (
        data.length > 0 && !name.includes("__MACOSX") && !base.startsWith(".") && mediaKind(base)
      );
    });
    if (!media.length) {
      toast.error("W ZIP-ie nie znaleziono grafik ani wideo");
      return;
    }
    let done = 0;
    const toastId = toast.loading(`Rozpakowywanie: 0/${media.length}`);
    try {
      const batch = Date.now();
      for (const [name, data] of media) {
        const base = sanitizeName(name.split("/").pop()!);
        await uploadToBucket(
          `creatives/${batch}${String(done).padStart(3, "0")}-${base}`,
          new Blob([data as BlobPart], { type: mimeFor(base) }),
        );
        done++;
        toast.loading(`Rozpakowywanie: ${done}/${media.length}`, { id: toastId });
      }
      toast.success(`Wgrano ${done} plików z ZIP-a do biblioteki`, { id: toastId });
    } catch (e: any) {
      toast.error(`Wgrano ${done}/${media.length} — błąd: ${e.message}`, { id: toastId });
    }
    qc.invalidateQueries({ queryKey: ["ad-creatives-library"] });
  };

  const onFilePicked = async (file: File) => {
    setUploading(true);
    try {
      if (/\.zip$/i.test(file.name)) await uploadZip(file);
      else if (file.type.startsWith("video/") || mediaKind(file.name) === "video")
        await uploadVideo(file);
      else await uploadImage(file);
      qc.invalidateQueries({ queryKey: ["ad-creatives-library"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const pickFromLibrary = (item: { url: string; kind: "image" | "video" }) => {
    if (item.kind === "video") {
      setCreative({ media_type: "video", video_url: item.url, video_thumbnail_url: "" });
    } else if (form.creative.media_type === "video" && form.creative.video_url) {
      setCreative({ video_thumbnail_url: item.url });
      toast.success("Ustawiono jako miniaturę wideo");
      return;
    } else {
      setCreative({ media_type: "image", image_url: item.url });
    }
    toast.success("Wybrano z biblioteki");
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
          {["Konto", "Budżet", "Targetowanie", "Kreacja", "Formularz", "Podgląd"].map(
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
              <Label>Nazwa kampanii</Label>
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
            <div className="text-xs text-muted-foreground">Lokalizacja: Polska (domyślnie)</div>
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
              <Label>Typ kreacji</Label>
              <Select
                value={form.creative.media_type ?? "image"}
                onValueChange={(v) => setCreative({ media_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Grafika</SelectItem>
                  <SelectItem value="video">Wideo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plik kreacji (grafika, wideo lub ZIP z wieloma kreacjami)</Label>
              <Input
                type="file"
                accept="image/*,video/*,.zip"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFilePicked(f);
                  e.target.value = "";
                }}
              />
              <div className="text-xs text-muted-foreground mt-1">
                Plik trafia bezpośrednio z przeglądarki do Supabase Storage. ZIP rozpakuje się
                automatycznie, a jego zawartość znajdziesz w bibliotece poniżej.
              </div>
              {uploading && <div className="text-xs text-muted-foreground mt-1">Wgrywanie…</div>}
              {form.creative.media_type !== "video" && form.creative.image_url && (
                <img src={form.creative.image_url} alt="" className="mt-2 max-h-40 rounded" />
              )}
              {form.creative.media_type === "video" && form.creative.video_url && (
                <div className="mt-2 space-y-1">
                  <video
                    src={form.creative.video_url}
                    controls
                    muted
                    className="max-h-40 rounded"
                  />
                  {form.creative.video_thumbnail_url ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Miniatura:</span>
                      <img
                        src={form.creative.video_thumbnail_url}
                        alt=""
                        className="h-10 rounded"
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Brak miniatury — kliknij grafikę w bibliotece, aby ją ustawić (albo Meta
                      wygeneruje ją automatycznie).
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label>Biblioteka kreacji</Label>
              {!library?.length ? (
                <div className="text-xs text-muted-foreground mt-1">
                  Brak plików. Wgraj grafikę, wideo lub ZIP-a powyżej.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1 max-h-64 overflow-y-auto">
                  {library.map((item) => (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => pickFromLibrary(item)}
                      className={`border rounded overflow-hidden text-left hover:ring-2 hover:ring-primary ${
                        item.url === form.creative.image_url || item.url === form.creative.video_url
                          ? "ring-2 ring-primary"
                          : ""
                      }`}
                    >
                      {item.kind === "video" ? (
                        <video src={item.url} muted className="h-20 w-full object-cover" />
                      ) : (
                        <img src={item.url} alt="" className="h-20 w-full object-cover" />
                      )}
                      <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-muted-foreground truncate">
                        {item.kind === "video" ? (
                          <Film className="h-3 w-3 shrink-0" />
                        ) : (
                          <ImageIcon className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">{item.name.replace(/^\d+-/, "")}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {form.creative.media_type === "video" && (
                <div className="text-xs text-muted-foreground mt-1">
                  Wskazówka: przy wybranym wideo kliknięcie grafiki w bibliotece ustawia ją jako
                  miniaturę.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 5 && (
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
            <div>
              <strong>Nazwa:</strong> {form.name}
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
