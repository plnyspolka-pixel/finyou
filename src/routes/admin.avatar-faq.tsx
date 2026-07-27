import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  listAllAvatarFaqs,
  upsertAvatarFaq,
  deleteAvatarFaq,
  startAvatarFaqGeneration,
  pollAvatarFaqStatus,
  setAvatarForAllFaqs,
  type AvatarFaqRow,
} from "@/lib/avatar-faq.functions";
import { HEYGEN_AVATARS } from "@/lib/heygen-avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Play, RefreshCw, Trash2, Wand2, Plus, Star, Check } from "lucide-react";

export const Route = createFileRoute("/admin/avatar-faq")({
  component: AvatarFaqPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Nie znaleziono.</div>,
});

function AvatarFaqPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAllAvatarFaqs);
  const upsert = useServerFn(upsertAvatarFaq);
  const remove = useServerFn(deleteAvatarFaq);
  const generate = useServerFn(startAvatarFaqGeneration);
  const poll = useServerFn(pollAvatarFaqStatus);
  const setAvatar = useServerFn(setAvatarForAllFaqs);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["avatar-faqs-admin"],
    queryFn: () => list(),
  });

  const upsertM = useMutation({
    mutationFn: (vars: Parameters<typeof upsertAvatarFaq>[0]["data"]) => upsert({ data: vars }),
    onSuccess: () => {
      toast.success("Zapisano");
      qc.invalidateQueries({ queryKey: ["avatar-faqs-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["avatar-faqs-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateM = useMutation({
    mutationFn: (id: string) => generate({ data: { id } }),
    onSuccess: () => {
      toast.success("Generowanie ruszyło — odśwież status za ~1 min.");
      qc.invalidateQueries({ queryKey: ["avatar-faqs-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pollM = useMutation({
    mutationFn: (id: string) => poll({ data: { id } }),
    onSuccess: (r) => {
      toast.message(`Status: ${r.status}`);
      qc.invalidateQueries({ queryKey: ["avatar-faqs-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAvatarM = useMutation({
    mutationFn: (avatar_id: string) => setAvatar({ data: { avatar_id } }),
    onSuccess: (r) => {
      toast.success(`Awatar zmieniony dla ${r.updated} FAQ. Wygeneruj wideo ponownie.`);
      qc.invalidateQueries({ queryKey: ["avatar-faqs-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-poll rendering rows every 20s
  useEffect(() => {
    const renderingIds = rows
      .filter((r) => r.video_status === "rendering" && r.video_id)
      .map((r) => r.id);
    if (!renderingIds.length) return;
    const t = setInterval(() => {
      renderingIds.forEach((id) => poll({ data: { id } }).catch(() => {}));
      qc.invalidateQueries({ queryKey: ["avatar-faqs-admin"] });
    }, 20000);
    return () => clearInterval(t);
  }, [rows, poll, qc]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Awatar FAQ — Filip na landingu</h1>
          <p className="text-sm text-muted-foreground">
            Pytania klientów + odpowiedzi nagrane awatarem HeyGen, głosem ElevenLabs. Generowanie
            ręczne (klikasz przycisk → ~1 min na render).
          </p>
        </div>
        <Button
          onClick={() =>
            upsertM.mutate({
              question: "Nowe pytanie",
              answer_text: "Odpowiedź…",
              sort_order: rows.length,
            })
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Dodaj
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wybór awatara HeyGen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Kliknij awatara, aby ustawić go dla WSZYSTKICH FAQ. Po zmianie musisz ponownie
            wygenerować wideo (przycisk „Wygeneruj ponownie" przy każdym FAQ).
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {HEYGEN_AVATARS.map((av) => {
              const active = rows.length > 0 && rows.every((r) => r.avatar_id === av.id);
              return (
                <button
                  key={av.id}
                  type="button"
                  disabled={setAvatarM.isPending}
                  onClick={() => {
                    if (confirm(`Ustawić "${av.name}" dla wszystkich FAQ?`)) {
                      setAvatarM.mutate(av.id);
                    }
                  }}
                  className={`group relative overflow-hidden rounded-lg border-2 text-left transition ${
                    active
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border hover:border-primary/50"
                  } ${setAvatarM.isPending ? "opacity-50" : ""}`}
                >
                  <img
                    src={av.previewImage}
                    alt={av.name}
                    className="aspect-[3/4] w-full object-cover"
                    loading="lazy"
                  />
                  {active && (
                    <div className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs font-semibold">{av.name}</p>
                    <p className="text-[10px] text-muted-foreground">{av.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Brak FAQ. Kliknij <strong>Dodaj</strong> lub uruchom seed z menu.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <FaqCard
              key={row.id}
              row={row}
              onSave={(d) => upsertM.mutate({ ...d, id: row.id })}
              onDelete={() => removeM.mutate(row.id)}
              onGenerate={() => generateM.mutate(row.id)}
              onPoll={() => pollM.mutate(row.id)}
              busy={
                generateM.isPending || removeM.isPending || upsertM.isPending || pollM.isPending
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FaqCard({
  row,
  onSave,
  onDelete,
  onGenerate,
  onPoll,
  busy,
}: {
  row: AvatarFaqRow;
  onSave: (d: {
    question: string;
    answer_text: string;
    sort_order: number;
    is_published: boolean;
    is_intro: boolean;
  }) => void;
  onDelete: () => void;
  onGenerate: () => void;
  onPoll: () => void;
  busy: boolean;
}) {
  const [q, setQ] = useState(row.question);
  const [a, setA] = useState(row.answer_text);
  const [order, setOrder] = useState(row.sort_order);
  const [pub, setPub] = useState(row.is_published);
  const [intro, setIntro] = useState(row.is_intro);
  const dirty =
    q !== row.question ||
    a !== row.answer_text ||
    order !== row.sort_order ||
    pub !== row.is_published ||
    intro !== row.is_intro;

  const statusBadge =
    row.video_status === "ready" ? (
      <Badge className="bg-green-600">Gotowe</Badge>
    ) : row.video_status === "rendering" ? (
      <Badge variant="secondary">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Renderuje
      </Badge>
    ) : row.video_status === "failed" ? (
      <Badge variant="destructive">Błąd</Badge>
    ) : row.video_status === "generating_audio" || row.video_status === "uploading" ? (
      <Badge variant="secondary">Przetwarza…</Badge>
    ) : (
      <Badge variant="outline">Brak wideo</Badge>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {intro && <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />}#{order} —{" "}
          {q.slice(0, 60)}
        </CardTitle>
        {statusBadge}
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div>
            <Label>Pytanie (widoczne dla klienta jako przycisk)</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <Label>Odpowiedź (to wypowie Filip)</Label>
            <Textarea
              value={a}
              onChange={(e) => setA(e.target.value)}
              rows={5}
              className="resize-y"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {a.length} znaków • {Math.ceil(a.length / 14)}s mowy
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor={`order-${row.id}`}>Kolejność</Label>
              <Input
                id={`order-${row.id}`}
                type="number"
                className="w-20"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={pub} onCheckedChange={setPub} id={`pub-${row.id}`} />
              <Label htmlFor={`pub-${row.id}`}>Opublikuj</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={intro} onCheckedChange={setIntro} id={`intro-${row.id}`} />
              <Label htmlFor={`intro-${row.id}`}>Wideo powitalne</Label>
            </div>
          </div>
          {row.last_error && (
            <p className="text-xs text-destructive">Ostatni błąd: {row.last_error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!dirty || busy}
              onClick={() =>
                onSave({
                  question: q,
                  answer_text: a,
                  sort_order: order,
                  is_published: pub,
                  is_intro: intro,
                })
              }
            >
              Zapisz
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={onGenerate}>
              <Wand2 className="mr-2 h-4 w-4" />
              {row.video_url ? "Wygeneruj ponownie" : "Generuj wideo"}
            </Button>
            {row.video_id && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onPoll}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sprawdź status
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (confirm("Usunąć to FAQ?")) onDelete();
              }}
              className="ml-auto text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {row.video_url ? (
            <video
              src={row.video_url}
              poster={row.thumbnail_url ?? undefined}
              controls
              className="w-full rounded-md border bg-black"
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              <Play className="mr-2 h-4 w-4" />
              Brak wideo
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
