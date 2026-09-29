// Dialog „Publikuj" przy materiale marketingowym (/admin/materialy): wybór
// platform, tytuł i treść (z generatorem opisu AI), termin, widoczność
// YouTube i ekran publikacji TikToka. Trzy akcje: sam zapis opisu w
// materiale, dodanie do kolejki (cron co 10 min / wybrany termin) albo
// publikacja od ręki (wpis w kolejce + natychmiastowe przetworzenie).
//
// Plik trafia na platformy z publicznej kopii w buckecie `studio-media`
// (patrz src/lib/marketing-material-publish.server.ts) — panel nie musi
// niczego wgrywać ponownie.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, Save, Upload, Music2, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TiktokPostOptionsFields } from "@/components/admin/tiktok-post-options-fields";
import {
  getStudioStatus,
  publishSocialQueueItemNow,
  type StudioPlatform,
} from "@/lib/studio.functions";
import { publishYoutubeQueueItemNow } from "@/lib/youtube-shorts.functions";
import { getTiktokCreatorInfo } from "@/lib/tiktok.functions";
import { generateMaterialDescription } from "@/lib/marketing-materials.functions";
import {
  enqueueMaterialPublication,
  updateMaterialText,
} from "@/lib/marketing-material-publish.functions";
import {
  defaultPublishText,
  materialPlatformsError,
  type PublishableMaterial,
} from "@/lib/marketing-material-publish";
import {
  PLATFORM_LABELS,
  STUDIO_PLATFORMS,
  platformAvailability,
  platformsForMediaType,
} from "@/lib/studio-platforms";
import {
  EMPTY_TIKTOK_OPTIONS,
  tiktokOptionsError,
  type TiktokPostOptions,
} from "@/lib/tiktok-upload";

export type MaterialForPublish = PublishableMaterial & { audience: string };

type Props = {
  material: MaterialForPublish | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tytuł/opis zapisane w materiale — rodzic odświeża kartę bez przeładowania. */
  onTextSaved: (materialId: string, patch: { title: string; description: string | null }) => void;
  /** Coś trafiło do kolejki — rodzic odświeża listę publikacji przy kartach. */
  onQueued: () => void;
};

type Privacy = "public" | "unlisted" | "private";

export function MaterialPublishDialog({
  material,
  open,
  onOpenChange,
  onTextSaved,
  onQueued,
}: Props) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getStudioStatus);
  const creatorFn = useServerFn(getTiktokCreatorInfo);
  const genDescFn = useServerFn(generateMaterialDescription);
  const enqueueFn = useServerFn(enqueueMaterialPublication);
  const saveTextFn = useServerFn(updateMaterialText);
  const publishSocialNowFn = useServerFn(publishSocialQueueItemNow);
  const publishYoutubeNowFn = useServerFn(publishYoutubeQueueItemNow);

  const [platforms, setPlatforms] = useState<StudioPlatform[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [saveToMaterial, setSaveToMaterial] = useState(true);
  const [ttOptions, setTtOptions] = useState<TiktokPostOptions>(EMPTY_TIKTOK_OPTIONS);
  // „Publikuj teraz" ma kilka kroków (kolejka → przetworzenie per platforma);
  // trzymamy osobny znacznik, żeby oba przyciski blokowały się nawzajem.
  const [busy, setBusy] = useState<"queue" | "now" | null>(null);

  // Formularz startuje od tekstów materiału przy każdym otwarciu.
  useEffect(() => {
    if (!open || !material) return;
    const t = defaultPublishText(material);
    setTitle(t.title);
    setMessage(t.message);
    setPlatforms([]);
    setScheduledAt("");
    setPrivacy("public");
    setSaveToMaterial(true);
    setTtOptions(EMPTY_TIKTOK_OPTIONS);
    setBusy(null);
  }, [open, material]);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["studio-status"],
    queryFn: () => statusFn(),
    enabled: open,
    staleTime: 60_000,
  });
  const availability = useMemo(() => platformAvailability(status), [status]);
  const mediaType = material?.media_type ?? "video";
  const allowed = useMemo(() => platformsForMediaType(mediaType), [mediaType]);

  const ttSelected = platforms.includes("tiktok");
  const tiktokConnected = !!status?.tiktokConnected;
  const {
    data: ttCreator,
    isLoading: ttCreatorLoading,
    error: ttCreatorError,
  } = useQuery({
    queryKey: ["tiktok-creator-info"],
    queryFn: () => creatorFn(),
    enabled: open && ttSelected && tiktokConnected,
    staleTime: 60_000,
  });

  const togglePlatform = (p: StudioPlatform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const genDescM = useMutation({
    mutationFn: () =>
      genDescFn({
        data: {
          materialId: material!.id,
          audience: material!.audience,
          title: title || material!.title,
          userDescription: message || undefined,
        },
      }),
    onSuccess: (r) => {
      setMessage(r.ai_description);
      toast.success("Opis wygenerowany — możesz go poprawić przed publikacją.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTextM = useMutation({
    mutationFn: () =>
      saveTextFn({ data: { materialId: material!.id, title, description: message } }),
    onSuccess: (r) => {
      onTextSaved(material!.id, { title: r.title, description: r.description });
      toast.success("Opis materiału zapisany.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Blokady liczone tak samo jak na serwerze — panel nie przepuszcza tego,
  // co kolejka i tak odrzuci.
  const blocker = useMemo<string | null>(() => {
    if (!material) return "Brak materiału.";
    const p = materialPlatformsError(material.media_type, platforms);
    if (p) return p;
    if (platforms.includes("youtube") && !title.trim()) return "YouTube wymaga tytułu.";
    if (platforms.includes("x") && !message.trim() && !title.trim()) {
      return "Post na X wymaga treści (lub tytułu).";
    }
    if (ttSelected) {
      if (!tiktokConnected) return "Konto TikTok nie jest połączone.";
      if (!ttCreator) return "Czekam na ustawienia konta TikTok…";
      const e = tiktokOptionsError(ttOptions, ttCreator.privacyOptions);
      if (e) return e;
    }
    return null;
  }, [material, platforms, title, message, ttSelected, tiktokConnected, ttCreator, ttOptions]);

  const enqueue = async () => {
    const r = await enqueueFn({
      data: {
        materialId: material!.id,
        platforms,
        title,
        message,
        privacy_status: privacy,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        tiktok_post_options: ttSelected ? ttOptions : undefined,
        save_to_material: saveToMaterial,
      },
    });
    if (saveToMaterial) {
      onTextSaved(material!.id, {
        title: title.trim() || material!.title,
        description: message.trim() || null,
      });
    }
    qc.invalidateQueries({ queryKey: ["studio-social-queue"] });
    qc.invalidateQueries({ queryKey: ["yt-queue"] });
    onQueued();
    return r;
  };

  const runQueue = async () => {
    setBusy("queue");
    try {
      const r = await enqueue();
      toast.success(
        scheduledAt
          ? `Zaplanowano publikację na ${new Date(scheduledAt).toLocaleString("pl-PL")} (${r.queued} platform).`
          : `Dodano do kolejki (${r.queued} platform) — cron publikuje co 10 minut.`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się dodać do kolejki.");
    } finally {
      setBusy(null);
    }
  };

  // Publikacja od ręki: wpis w kolejce (żeby błędy i ponowienia działały jak
  // zwykle), a zaraz potem przetworzenie każdego wpisu — równolegle, bo
  // uploady wideo trwają. Wynik per platforma leci osobnym toastem.
  const runNow = async () => {
    setBusy("now");
    let r: Awaited<ReturnType<typeof enqueue>>;
    try {
      r = await enqueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się dodać do kolejki.");
      setBusy(null);
      return;
    }
    onOpenChange(false);
    const jobs: Promise<unknown>[] = [
      ...r.social.map((s) =>
        publishSocialNowFn({ data: { id: s.id } }).then(
          (res) =>
            res.preparing
              ? toast.info(
                  `${PLATFORM_LABELS[s.platform]}: wideo jest kompresowane do profilu publikacji — wpis wyjdzie automatycznie po zakończeniu.`,
                )
              : toast.success(
                  res.processing
                    ? `${PLATFORM_LABELS[s.platform]}: plik wysłany, platforma go przetwarza.`
                    : `${PLATFORM_LABELS[s.platform]}: opublikowano.`,
                ),
          (e: Error) =>
            toast.error(`${PLATFORM_LABELS[s.platform]}: ${e.message} (wpis został w kolejce)`),
        ),
      ),
      ...r.youtube.map((y) =>
        publishYoutubeNowFn({ data: { id: y.id } }).then(
          (res) =>
            res.preparing
              ? toast.info(
                  `${PLATFORM_LABELS.youtube}: wideo jest kompresowane do profilu publikacji — wpis wyjdzie automatycznie po zakończeniu.`,
                )
              : toast.success(`${PLATFORM_LABELS.youtube}: opublikowano.`),
          (e: Error) =>
            toast.error(`${PLATFORM_LABELS.youtube}: ${e.message} (wpis został w kolejce)`),
        ),
      ),
    ];
    await Promise.allSettled(jobs);
    qc.invalidateQueries({ queryKey: ["studio-social-queue"] });
    qc.invalidateQueries({ queryKey: ["yt-queue"] });
    onQueued();
    setBusy(null);
  };

  const anyBusy = busy !== null || saveTextM.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !anyBusy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publikuj: {material?.title ?? ""}</DialogTitle>
          <DialogDescription>
            {mediaType === "image"
              ? "Grafika może pójść jako post na Facebooku albo na X. Ustaw opis, wybierz platformy i dodaj do kolejki albo publikuj od razu."
              : "Film może pójść na YouTube (Short), Instagram i Facebook Reels, TikToka, jako post na Facebooku albo na X. Ustaw opis, wybierz platformy i dodaj do kolejki albo publikuj od razu."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Platformy
              {statusLoading && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> sprawdzam połączenia…
                </span>
              )}
            </Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {STUDIO_PLATFORMS.map((p) => {
                const allowedHere = allowed.includes(p);
                const ready = availability[p];
                const disabled = !allowedHere || !ready;
                return (
                  <label
                    key={p}
                    className={`flex items-center gap-2 text-sm ${
                      disabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"
                    }`}
                    title={
                      !allowedHere
                        ? "Ta platforma wymaga wideo."
                        : !ready
                          ? "Nie skonfigurowano / nie połączono — patrz Studio publikacji."
                          : undefined
                    }
                  >
                    <Checkbox
                      checked={platforms.includes(p)}
                      disabled={disabled}
                      onCheckedChange={() => togglePlatform(p)}
                    />
                    {p === "tiktok" && <Music2 className="h-4 w-4" />}
                    {p === "x" && <Twitter className="h-4 w-4" />}
                    {PLATFORM_LABELS[p]}
                    {allowedHere && !ready && <span className="text-xs">(nie połączono)</span>}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tytuł (YouTube / wideo na FB / TikTok)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={92} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Treść / opis (opis filmu, caption Reels, treść posta)</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => genDescM.mutate()}
                disabled={genDescM.isPending || !material}
              >
                {genDescM.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                Wygeneruj opis AI
              </Button>
            </div>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={saveToMaterial}
                onCheckedChange={(v) => setSaveToMaterial(v === true)}
              />
              Zapisz tytuł i opis także w materiale
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Termin publikacji (puste = najbliższy przebieg)</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            {platforms.includes("youtube") && (
              <div className="space-y-2">
                <Label>Widoczność (YouTube)</Label>
                <select
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as Privacy)}
                >
                  <option value="public">Publiczny</option>
                  <option value="unlisted">Niepubliczny (unlisted)</option>
                  <option value="private">Prywatny</option>
                </select>
              </div>
            )}
          </div>

          {ttSelected && (
            <TiktokPostOptionsFields
              value={ttOptions}
              onChange={setTtOptions}
              creator={tiktokConnected ? ttCreator : undefined}
              loading={tiktokConnected && ttCreatorLoading}
              error={
                !tiktokConnected
                  ? "Konto TikTok nie jest połączone — połącz je w Studiu publikacji."
                  : ttCreatorError
                    ? (ttCreatorError as Error).message
                    : null
              }
            />
          )}

          {blocker && platforms.length > 0 && (
            <p className="text-xs text-muted-foreground">{blocker}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => saveTextM.mutate()}
            disabled={anyBusy || !title.trim()}
          >
            {saveTextM.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Zapisz tylko opis
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={runQueue}
              disabled={anyBusy || !!blocker}
            >
              {busy === "queue" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1 h-4 w-4" />
              )}
              Dodaj do kolejki
            </Button>
            <Button
              type="button"
              onClick={runNow}
              disabled={anyBusy || !!blocker || !!scheduledAt}
              title={scheduledAt ? "Wyczyść termin, żeby publikować od razu." : undefined}
            >
              {busy === "now" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1 h-4 w-4" />
              )}
              Publikuj teraz
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
