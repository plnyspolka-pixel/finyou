// Studio publikacji — jedno miejsce do: publikacji wideo (YouTube / Instagram
// Reels / Facebook Reels / TikTok / post na Facebooku), generowania wideo HeyGen
// z promptu, generatora promptów i generatora grafik AI.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getStudioStatus,
  listSocialQueue,
  enqueueStudioPublish,
  deleteSocialQueueItem,
  cancelSocialQueueItem,
  retrySocialQueueItem,
  publishSocialQueueItemNow,
  listStudioVideoSources,
  listStudioVideoJobs,
  listStudioVoices,
  listStudioAvatars,
  generateStudioScript,
  startStudioVideo,
  enqueueStudioVideoBatch,
  processStudioVideoQueueNow,
  pollStudioVideoJob,
  deleteStudioVideoJob,
  generateStudioPrompts,
  listStudioImages,
  generateStudioImageFn,
  deleteStudioImage,
  listStudioDefaultAvatars,
  saveStudioDefaultAvatars,
  listStudioBroll,
  addStudioBroll,
  setStudioBrollActive,
  deleteStudioBroll,
  seedStudioBroll,
  type StudioPlatform,
  type StudioVideoJob,
  type StudioAvatar,
  type StudioBrollAsset,
} from "@/lib/studio.functions";
import { captionBadgeLabel } from "@/lib/studio-captions";
import { describeScenePlan } from "@/lib/studio-scenes";
import { listYoutubeQueue, type YoutubeQueueItem } from "@/lib/youtube-shorts.functions";
import { getTiktokIntegrationStatus, getTiktokCreatorInfo } from "@/lib/tiktok.functions";
import { TiktokPostOptionsFields } from "@/components/admin/tiktok-post-options-fields";
import { TiktokConnectionCard } from "@/components/admin/tiktok-connection-card";
import {
  EMPTY_TIKTOK_OPTIONS,
  tiktokOptionsError,
  type TiktokPostOptions,
} from "@/lib/tiktok-upload";
import { HEYGEN_AVATARS, FILIP_VOICE_ID } from "@/lib/heygen-avatars";
import {
  SHORTS_QUESTIONS,
  SHORTS_SECTIONS,
  SHORTS_CATEGORY_LABELS,
  shortsPromptForQuestion,
  parseShortsPromptTag,
  type ShortsCategory,
} from "@/lib/shorts-question-bank";
import { buildShortsScript, joinShortsScript, SHORTS_DYNAMIC_ELEMENTS } from "@/lib/shorts-script";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Clapperboard,
  Upload,
  RefreshCw,
  Trash2,
  Ban,
  ExternalLink,
  Sparkles,
  ImageIcon,
  Video,
  Wand2,
  Copy,
  Send,
  BookOpen,
  CheckCircle2,
  Captions,
  Film,
  Play,
  Maximize2,
  Music2,
  Unplug,
  Star,
  Library,
  Layers,
  Plus,
  Eye,
  EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/admin/studio-publikacji")({
  component: StudioPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Nie znaleziono.</div>,
});

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube Short",
  facebook_post: "Post na Facebooku",
  facebook_reels: "Facebook Reels",
  instagram_reels: "Instagram Reels",
  tiktok: "TikTok",
};

// Zgodne z MAX_ATTEMPTS w src/lib/studio-publishing.server.ts — chwilowe błędy
// (limity Meta) prób nie zużywają, więc licznik pokazuje realne podejścia.
const MAX_PUBLISH_ATTEMPTS = 3;

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Zaplanowany", variant: "secondary" },
  publishing: { label: "Publikowanie…", variant: "outline" },
  uploading: { label: "Wysyłanie…", variant: "outline" },
  processing: { label: "Przetwarzanie (Meta)…", variant: "outline" },
  published: { label: "Opublikowany", variant: "default" },
  failed: { label: "Błąd", variant: "destructive" },
  cancelled: { label: "Anulowany", variant: "outline" },
};

const VIDEO_STATUS_LABELS: Record<string, string> = {
  pending: "Oczekuje",
  queued: "W kolejce",
  generating_script: "Generuję scenariusz…",
  generating_audio: "Generuję lektora…",
  uploading: "Wysyłam audio…",
  rendering: "Renderowanie w HeyGen…",
  ready: "Gotowe",
  failed: "Błąd",
};

const AUTO_PLATFORM_SHORT: Record<string, string> = {
  youtube: "YouTube",
  facebook_reels: "FB Reels",
  instagram_reels: "IG Reels",
  facebook_post: "Post FB",
  tiktok: "TikTok",
};

// Etapy TikTok Content Posting API (kolumna tiktok_status w kolejce).
const TIKTOK_STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "TikTok: start", variant: "secondary" },
  uploading: { label: "TikTok: wysyłanie chunków…", variant: "outline" },
  processing: { label: "TikTok: przetwarzanie…", variant: "outline" },
  publish_complete: { label: "TikTok: opublikowano", variant: "default" },
  failed: { label: "TikTok: błąd", variant: "destructive" },
};

function externalUrl(platform: string, externalId: string | null): string | null {
  if (!externalId) return null;
  if (platform === "facebook_post" || platform === "facebook_reels") {
    return `https://www.facebook.com/${externalId}`;
  }
  return null;
}

function StudioPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getStudioStatus);
  const socialQueueFn = useServerFn(listSocialQueue);
  const ytQueueFn = useServerFn(listYoutubeQueue);
  const enqueueFn = useServerFn(enqueueStudioPublish);
  const deleteQFn = useServerFn(deleteSocialQueueItem);
  const cancelQFn = useServerFn(cancelSocialQueueItem);
  const retryQFn = useServerFn(retrySocialQueueItem);
  const publishNowFn = useServerFn(publishSocialQueueItemNow);
  const sourcesFn = useServerFn(listStudioVideoSources);
  const videoJobsFn = useServerFn(listStudioVideoJobs);
  const voicesFn = useServerFn(listStudioVoices);
  const avatarsFn = useServerFn(listStudioAvatars);
  const genScriptFn = useServerFn(generateStudioScript);
  const startVideoFn = useServerFn(startStudioVideo);
  const batchFn = useServerFn(enqueueStudioVideoBatch);
  const processQueueFn = useServerFn(processStudioVideoQueueNow);
  const pollVideoFn = useServerFn(pollStudioVideoJob);
  const deleteVideoFn = useServerFn(deleteStudioVideoJob);
  const genPromptsFn = useServerFn(generateStudioPrompts);
  const imagesFn = useServerFn(listStudioImages);
  const genImageFn = useServerFn(generateStudioImageFn);
  const deleteImageFn = useServerFn(deleteStudioImage);
  const defaultAvatarsFn = useServerFn(listStudioDefaultAvatars);
  const saveDefaultAvatarsFn = useServerFn(saveStudioDefaultAvatars);
  const brollFn = useServerFn(listStudioBroll);
  const addBrollFn = useServerFn(addStudioBroll);
  const brollActiveFn = useServerFn(setStudioBrollActive);
  const deleteBrollFn = useServerFn(deleteStudioBroll);
  const seedBrollFn = useServerFn(seedStudioBroll);
  const tiktokStatusFn = useServerFn(getTiktokIntegrationStatus);
  const tiktokCreatorFn = useServerFn(getTiktokCreatorInfo);

  const [tab, setTab] = useState("publikacja");

  const { data: status } = useQuery({ queryKey: ["studio-status"], queryFn: () => statusFn() });
  const { data: socialQueue = [] } = useQuery({
    queryKey: ["studio-social-queue"],
    queryFn: () => socialQueueFn(),
    refetchInterval: 30_000,
  });
  const { data: ytQueue = [] } = useQuery({
    queryKey: ["yt-queue"],
    queryFn: () => ytQueueFn(),
    refetchInterval: 30_000,
  });
  const { data: sources = [] } = useQuery({
    queryKey: ["studio-sources"],
    queryFn: () => sourcesFn(),
  });
  const { data: videoJobs = [] } = useQuery({
    queryKey: ["studio-video-jobs"],
    queryFn: () => videoJobsFn(),
    refetchInterval: 20_000,
  });
  const { data: voices = [] } = useQuery({
    queryKey: ["studio-voices"],
    queryFn: () => voicesFn(),
    staleTime: 5 * 60_000,
  });
  const { data: avatars = [], isLoading: avatarsLoading } = useQuery({
    queryKey: ["studio-avatars"],
    queryFn: () => avatarsFn(),
    staleTime: 5 * 60_000,
  });
  const { data: images = [] } = useQuery({
    queryKey: ["studio-images"],
    queryFn: () => imagesFn(),
  });
  // Stały zestaw domyślnych awatarów — rotacja a-rolli w strukturze rolki.
  const { data: defaultAvatars = [] } = useQuery({
    queryKey: ["studio-default-avatars"],
    queryFn: () => defaultAvatarsFn(),
  });
  const { data: brollAssets = [], isLoading: brollLoading } = useQuery({
    queryKey: ["studio-broll"],
    queryFn: () => brollFn({ data: {} }),
  });
  const { data: tiktokStatus, isLoading: tiktokLoading } = useQuery({
    queryKey: ["tiktok-status"],
    queryFn: () => tiktokStatusFn(),
  });
  // Ustawienia konta twórcy pod ekran publikacji. Wytyczne TikToka wymagają,
  // żeby ekran odzwierciedlał creator_info, więc pobieramy je przy każdym
  // wejściu (opcje prywatności potrafią się zmienić) — tylko gdy TikTok jest
  // faktycznie wybrany, żeby nie pukać do API bez potrzeby.
  const tiktokConnected = !!tiktokStatus?.connected;

  // Automatyczny polling HeyGen dla jobów w trakcie renderowania.
  useEffect(() => {
    const rendering = videoJobs.filter((j) => j.status === "rendering");
    if (!rendering.length) return;
    const t = setInterval(() => {
      rendering.forEach((j) =>
        pollVideoFn({ data: { id: j.id } })
          .then(() => qc.invalidateQueries({ queryKey: ["studio-video-jobs"] }))
          .catch(() => {}),
      );
    }, 15_000);
    return () => clearInterval(t);
  }, [videoJobs, pollVideoFn, qc]);

  // Otwarty panel napędza kolejkę wsadową (joby 'queued') — jeden job na raz,
  // sekwencyjnie. Przy zamkniętym panelu kolejkę i tak przetworzy cron tick.
  const queueDriverBusy = useRef(false);
  const queuedCount = videoJobs.filter((j) => j.status === "queued").length;
  useEffect(() => {
    if (!queuedCount || queueDriverBusy.current) return;
    queueDriverBusy.current = true;
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < 30 && !cancelled; i++) {
          const r = await processQueueFn();
          qc.invalidateQueries({ queryKey: ["studio-video-jobs"] });
          if (!r.remaining) break;
        }
      } catch {
        // Błąd pojedynczego joba jest zapisany w jego last_error.
      } finally {
        queueDriverBusy.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queuedCount, processQueueFn, qc]);

  // ── Publikacja ─────────────────────────────────────────────────────────────
  const [platforms, setPlatforms] = useState<StudioPlatform[]>([]);
  const [ttOptions, setTtOptions] = useState<TiktokPostOptions>(EMPTY_TIKTOK_OPTIONS);
  const ttSelected = platforms.includes("tiktok");
  const {
    data: ttCreator,
    isLoading: ttCreatorLoading,
    error: ttCreatorError,
  } = useQuery({
    queryKey: ["tiktok-creator-info"],
    queryFn: () => tiktokCreatorFn(),
    enabled: ttSelected && tiktokConnected,
    staleTime: 60_000,
  });
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [scheduledAt, setScheduledAt] = useState("");

  const togglePlatform = (p: StudioPlatform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const enqueueM = useMutation({
    mutationFn: () =>
      enqueueFn({
        data: {
          platforms,
          title,
          message,
          video_url: videoUrl || undefined,
          image_url: imageUrl || undefined,
          privacy_status: privacy,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          tiktok_post_options: ttSelected ? ttOptions : undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Dodano do kolejki (${r.queued} platform)`);
      qc.invalidateQueries({ queryKey: ["studio-social-queue"] });
      qc.invalidateQueries({ queryKey: ["yt-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rowActionOpts = (okMsg: string) => ({
    onSuccess: () => {
      toast.success(okMsg);
      qc.invalidateQueries({ queryKey: ["studio-social-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteQM = useMutation({
    mutationFn: (id: string) => deleteQFn({ data: { id } }),
    ...rowActionOpts("Usunięto"),
  });
  const cancelQM = useMutation({
    mutationFn: (id: string) => cancelQFn({ data: { id } }),
    ...rowActionOpts("Anulowano"),
  });
  const retryQM = useMutation({
    mutationFn: (id: string) => retryQFn({ data: { id } }),
    ...rowActionOpts("Wpis wróci do kolejki"),
  });
  const publishNowM = useMutation({
    mutationFn: (id: string) => publishNowFn({ data: { id } }),
    ...rowActionOpts("Publikacja uruchomiona"),
  });

  // ── Wideo AI ───────────────────────────────────────────────────────────────
  const [videoPrompt, setVideoPrompt] = useState("");
  // Scenariusz rozbity na sekcje; lektor czyta sklejkę hook + treść + CTA.
  const [scriptHook, setScriptHook] = useState("");
  const [scriptContent, setScriptContent] = useState("");
  const [scriptCta, setScriptCta] = useState("");
  const fullScript = joinShortsScript({
    hook: scriptHook,
    content: scriptContent,
    cta: scriptCta,
  });
  const [avatarId, setAvatarId] = useState(HEYGEN_AVATARS[0].id);
  const [voiceId, setVoiceId] = useState(FILIP_VOICE_ID);
  // Shorty i rolki ogląda się bez dźwięku — napisy domyślnie włączone.
  const [captionsOn, setCaptionsOn] = useState(true);
  // Montaż rolki: pojedyncze ujęcie | przebitki wskazane przez AI | stała
  // struktura (ujęcie → wizual hook → przebitka → a-roll innego awatara).
  const [montage, setMontage] = useState<"single" | "ai" | "structure">("single");
  const dynamicScenesOn = montage !== "single";
  const reelStructureOn = montage === "structure";

  // ── Wybór awatara (katalog HeyGen) ─────────────────────────────────────────
  const [avatarSearch, setAvatarSearch] = useState("");
  const [avatarOnlyMine, setAvatarOnlyMine] = useState(true);
  const hasMineAvatars = useMemo(() => avatars.some((a) => a.mine), [avatars]);
  const filteredAvatars = useMemo(() => {
    const needle = avatarSearch.trim().toLowerCase();
    return avatars.filter(
      (a) =>
        (!avatarOnlyMine || !hasMineAvatars || a.mine) &&
        (!needle ||
          a.name.toLowerCase().includes(needle) ||
          (a.group ?? "").toLowerCase().includes(needle)),
    );
  }, [avatars, avatarSearch, avatarOnlyMine, hasMineAvatars]);
  const selectedAvatar: StudioAvatar | undefined = useMemo(
    () => avatars.find((a) => a.id === avatarId),
    [avatars, avatarId],
  );
  const AVATAR_DISPLAY_CAP = 60;

  // ── Stały zestaw domyślnych awatarów ───────────────────────────────────────
  // Zaznaczenie gwiazdką jest robocze; dopiero przycisk „Ustaw jako domyślne"
  // zapisuje zestaw na stałe (do bazy) — korzysta z niego także kolejka i cron.
  const [avatarPicks, setAvatarPicks] = useState<string[]>([]);
  const savedDefaultIds = useMemo(() => defaultAvatars.map((a) => a.avatar_id), [defaultAvatars]);
  // Zapisany zestaw wchodzi do panelu raz — potem rządzi to, co klika człowiek.
  const defaultsLoaded = useRef(false);
  useEffect(() => {
    if (defaultsLoaded.current || !savedDefaultIds.length) return;
    defaultsLoaded.current = true;
    setAvatarPicks(savedDefaultIds);
    setAvatarId((current) => (savedDefaultIds.includes(current) ? current : savedDefaultIds[0]));
  }, [savedDefaultIds]);

  const toggleAvatarPick = (id: string) =>
    setAvatarPicks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const picksDirty =
    avatarPicks.length !== savedDefaultIds.length ||
    avatarPicks.some((id, i) => savedDefaultIds[i] !== id);

  const avatarName = (id: string) =>
    avatars.find((a) => a.id === id)?.name ??
    defaultAvatars.find((a) => a.avatar_id === id)?.name ??
    HEYGEN_AVATARS.find((a) => a.id === id)?.name ??
    id.slice(0, 8);

  const saveDefaultsM = useMutation({
    mutationFn: () => saveDefaultAvatarsFn({ data: { avatar_ids: avatarPicks } }),
    onSuccess: (r) => {
      toast.success(
        r.saved
          ? `Zapisano ${r.saved} domyślnych awatarów — rotacja a-rolli działa też w serii i cronie`
          : "Wyczyszczono zestaw domyślnych awatarów",
      );
      qc.invalidateQueries({ queryKey: ["studio-default-avatars"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Rotacja wysyłana z generatorem: wybrany awatar prowadzi, reszta zestawu
  // przejmuje kolejne a-rolle.
  const avatarRotation = useMemo(
    () => [...new Set([avatarId, ...avatarPicks])],
    [avatarId, avatarPicks],
  );

  // ── Bank b-rolli ───────────────────────────────────────────────────────────
  const [brollKindFilter, setBrollKindFilter] = useState<"all" | "broll" | "hook">("all");
  const [brollSearch, setBrollSearch] = useState("");
  const [newBrollUrl, setNewBrollUrl] = useState("");
  const [newBrollTitle, setNewBrollTitle] = useState("");
  const [newBrollTags, setNewBrollTags] = useState("");
  const [newBrollKind, setNewBrollKind] = useState<"broll" | "hook">("broll");

  const filteredBroll = useMemo(() => {
    const needle = brollSearch.trim().toLowerCase();
    return brollAssets.filter(
      (a) =>
        (brollKindFilter === "all" || a.kind === brollKindFilter) &&
        (!needle ||
          a.title.toLowerCase().includes(needle) ||
          a.source_query.toLowerCase().includes(needle) ||
          a.tags.some((t) => t.includes(needle))),
    );
  }, [brollAssets, brollKindFilter, brollSearch]);

  const brollCounts = useMemo(
    () => ({
      broll: brollAssets.filter((a) => a.kind === "broll" && a.active).length,
      hook: brollAssets.filter((a) => a.kind === "hook" && a.active).length,
    }),
    [brollAssets],
  );

  const refreshBroll = () => qc.invalidateQueries({ queryKey: ["studio-broll"] });

  const addBrollM = useMutation({
    mutationFn: () =>
      addBrollFn({
        data: {
          url: newBrollUrl.trim(),
          kind: newBrollKind,
          title: newBrollTitle.trim(),
          tags: newBrollTags,
        },
      }),
    onSuccess: () => {
      toast.success("Dodano do banku (plik skopiowany do naszego Storage)");
      setNewBrollUrl("");
      setNewBrollTitle("");
      setNewBrollTags("");
      refreshBroll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedBrollM = useMutation({
    mutationFn: () => seedBrollFn({ data: {} }),
    onSuccess: (r) => {
      toast.success(
        `Bank uzupełniony: +${r.added}` +
          (r.skipped ? `, pominięto ${r.skipped} (już są)` : "") +
          (r.failed ? `, nieudane ${r.failed}` : ""),
      );
      refreshBroll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const brollActiveM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => brollActiveFn({ data: v }),
    onSuccess: refreshBroll,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBrollM = useMutation({
    mutationFn: (id: string) => deleteBrollFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto z banku");
      refreshBroll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Auto-publikacja po wygenerowaniu ───────────────────────────────────────
  const [autoPublishOn, setAutoPublishOn] = useState(false);
  const [autoPlatforms, setAutoPlatforms] = useState<StudioPlatform[]>(["youtube"]);
  const [autoTtOptions, setAutoTtOptions] = useState<TiktokPostOptions>(EMPTY_TIKTOK_OPTIONS);
  const [autoPrivacy, setAutoPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const toggleAutoPlatform = (p: StudioPlatform) =>
    setAutoPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const effectiveAutoPlatforms = autoPublishOn ? autoPlatforms : [];
  const autoTtSelected = effectiveAutoPlatforms.includes("tiktok");
  // Osobne zapytanie od publikacji ręcznej (inny moment w formularzu), ten sam
  // cache — creator_info to te same dane konta.
  const {
    data: autoTtCreator,
    isLoading: autoTtCreatorLoading,
    error: autoTtCreatorError,
  } = useQuery({
    queryKey: ["tiktok-creator-info"],
    queryFn: () => tiktokCreatorFn(),
    enabled: autoTtSelected && tiktokConnected,
    staleTime: 60_000,
  });
  // Auto-publikacja na TikToka bez kompletnych wyborów twórcy jest zablokowana.
  const autoTtBlocked =
    autoTtSelected &&
    (!autoTtCreator || !!tiktokOptionsError(autoTtOptions, autoTtCreator.privacyOptions));

  // ── Baza 250 pytań do shortów ──────────────────────────────────────────────
  const [bankCategory, setBankCategory] = useState<"all" | ShortsCategory>("all");
  const [bankSection, setBankSection] = useState("all");
  const [bankSearch, setBankSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Prompt z prefiksem "#N · " oznacza pytanie z bazy — wtedy scenariusz
  // dostaje obowiązkowe otwarcie rolki (znacznik kategorii).
  const selectedQuestionId = parseShortsPromptTag(videoPrompt);
  const selectedBankQuestion =
    selectedQuestionId != null
      ? SHORTS_QUESTIONS.find((q) => q.id === selectedQuestionId)
      : undefined;

  // Pytania, dla których istnieje już job (żeby nie robić dubli).
  const doneQuestionIds = useMemo(() => {
    const ids = new Set<number>();
    for (const j of videoJobs) {
      const id = parseShortsPromptTag(j.prompt);
      if (id != null && j.status !== "failed") ids.add(id);
    }
    return ids;
  }, [videoJobs]);

  const bankQuestions = useMemo(() => {
    const needle = bankSearch.trim().toLowerCase();
    return SHORTS_QUESTIONS.filter(
      (q) =>
        (bankCategory === "all" || q.category === bankCategory) &&
        (bankSection === "all" || q.section === bankSection) &&
        (!needle ||
          q.question.toLowerCase().includes(needle) ||
          q.thesis.toLowerCase().includes(needle) ||
          String(q.id) === needle.replace(/^#/, "")),
    );
  }, [bankCategory, bankSection, bankSearch]);

  const bankSections = useMemo(
    () =>
      bankCategory === "all"
        ? SHORTS_SECTIONS
        : [
            ...new Set(
              SHORTS_QUESTIONS.filter((q) => q.category === bankCategory).map((q) => q.section),
            ),
          ],
    [bankCategory],
  );

  // Pytanie z paczki ma gotowy, sprawdzony scenariusz — podstawiamy go
  // od razu (bez AI) w rozbiciu na sekcje; wszystko edytowalne przed generacją.
  const applyBankQuestion = (id: number) => {
    const q = SHORTS_QUESTIONS.find((x) => x.id === id);
    if (!q) return;
    const gen = buildShortsScript(q);
    setVideoPrompt(shortsPromptForQuestion(q));
    setScriptHook(gen.hook);
    setScriptContent(gen.content);
    setScriptCta(gen.cta);
    if (!title) setTitle(gen.title);
    if (!message) setMessage([gen.description, gen.hashtags.join(" ")].join("\n\n"));
    toast.success(`Pytanie #${q.id} — gotowy scenariusz z paczki podstawiony`);
  };

  const genScriptM = useMutation({
    mutationFn: () =>
      genScriptFn({
        data: { prompt: videoPrompt, question_id: selectedQuestionId ?? undefined },
      }),
    onSuccess: (r) => {
      // Pytanie z paczki: gotowe sekcje 1:1 z pliku; własny prompt: tekst AI
      // w treści, hook/CTA puste.
      setScriptHook(r.hook);
      setScriptContent(r.content);
      setScriptCta(r.cta);
      if (r.title && !title) setTitle(r.title);
      if (r.description && !message) setMessage([r.description, r.hashtags.join(" ")].join("\n\n"));
      toast.success("Scenariusz gotowy — możesz go edytować przed generacją");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const startVideoM = useMutation({
    mutationFn: () =>
      startVideoFn({
        data: {
          prompt: videoPrompt,
          script: fullScript,
          avatar_id: avatarId,
          voice_id: voiceId,
          captions: captionsOn,
          dynamic_scenes: dynamicScenesOn,
          reel_structure: reelStructureOn,
          avatar_ids: avatarRotation,
          auto_publish_platforms: effectiveAutoPlatforms,
          publish_privacy: autoPrivacy,
          publish_title: title,
          publish_description: message,
          tiktok_post_options: autoTtSelected ? autoTtOptions : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(
        effectiveAutoPlatforms.length
          ? "Generacja uruchomiona — po wyrenderowaniu wideo trafi do publikacji"
          : "Generacja wideo uruchomiona — status w tabeli poniżej",
      );
      qc.invalidateQueries({ queryKey: ["studio-video-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const batchM = useMutation({
    mutationFn: () =>
      batchFn({
        data: {
          question_ids: [...selectedIds],
          avatar_id: avatarId,
          voice_id: voiceId,
          captions: captionsOn,
          dynamic_scenes: dynamicScenesOn,
          reel_structure: reelStructureOn,
          avatar_ids: avatarRotation,
          auto_publish_platforms: effectiveAutoPlatforms,
          publish_privacy: autoPrivacy,
          tiktok_post_options: autoTtSelected ? autoTtOptions : undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `Dodano ${r.queued} pytań do kolejki generowania` +
          (r.skipped ? `, pominięto ${r.skipped} (mają już wideo)` : ""),
      );
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["studio-video-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Zaznacza kolejne (do 5) pytania bez wideo z aktualnie przefiltrowanej listy.
  const selectNextUnproduced = () => {
    const next = bankQuestions
      .filter((q) => !doneQuestionIds.has(q.id) && !selectedIds.has(q.id))
      .slice(0, 5)
      .map((q) => q.id);
    if (!next.length) {
      toast.info("Wszystkie przefiltrowane pytania mają już wideo lub są zaznaczone.");
      return;
    }
    setSelectedIds((prev) => new Set([...prev, ...next]));
  };
  const deleteVideoM = useMutation({
    mutationFn: (id: string) => deleteVideoFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["studio-video-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Wideo otwarte w dużym odtwarzaczu (modal) — podgląd bez wychodzenia z panelu.
  const [previewJob, setPreviewJob] = useState<StudioVideoJob | null>(null);

  const applyVideoToPublish = (url: string) => {
    setVideoUrl(url);
    setTab("publikacja");
    toast.success("Wideo podstawione do formularza publikacji");
  };

  // ── Prompty ────────────────────────────────────────────────────────────────
  const [promptTopic, setPromptTopic] = useState("");
  const [promptKind, setPromptKind] = useState<"video" | "image" | "social">("video");
  const [promptIdeas, setPromptIdeas] = useState<string[]>([]);

  const genPromptsM = useMutation({
    mutationFn: () => genPromptsFn({ data: { topic: promptTopic, kind: promptKind } }),
    onSuccess: (r) => setPromptIdeas(r.prompts),
    onError: (e: Error) => toast.error(e.message),
  });

  const applyPromptIdea = (p: string) => {
    if (promptKind === "image") {
      setImagePrompt(p);
      setTab("grafiki");
    } else {
      setVideoPrompt(p);
      setTab("wideo");
    }
    toast.success("Prompt podstawiony");
  };

  // ── Grafiki ────────────────────────────────────────────────────────────────
  const [imagePrompt, setImagePrompt] = useState("");

  const genImageM = useMutation({
    mutationFn: () => genImageFn({ data: { prompt: imagePrompt } }),
    onSuccess: () => {
      toast.success("Grafika wygenerowana");
      qc.invalidateQueries({ queryKey: ["studio-images"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteImageM = useMutation({
    mutationFn: (id: string) => deleteImageFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["studio-images"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyImageToPublish = (url: string) => {
    setImageUrl(url);
    if (!platforms.includes("facebook_post")) togglePlatform("facebook_post");
    setTab("publikacja");
    toast.success("Grafika podstawiona do posta na Facebooku");
  };

  const needsVideo = platforms.some((p) => p !== "facebook_post");

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-6 w-6 shrink-0 text-primary" />
        <h1 className="text-xl font-semibold sm:text-2xl">Studio publikacji</h1>
      </div>

      {status && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={status.youtubeConnected ? "default" : "outline"}>
            YouTube {status.youtubeConnected ? "połączony" : "niepołączony"}
          </Badge>
          <Badge variant={status.facebookConfigured ? "default" : "outline"}>
            Facebook {status.facebookConfigured ? "skonfigurowany" : "brak konfiguracji"}
          </Badge>
          <Badge variant={status.instagramConfigured ? "default" : "outline"}>
            Instagram {status.instagramConfigured ? "skonfigurowany" : "brak konfiguracji"}
          </Badge>
          <Badge variant={status.tiktokConnected ? "default" : "outline"}>
            TikTok{" "}
            {status.tiktokConnected
              ? "połączony"
              : status.tiktokConfigured
                ? "niepołączony"
                : "brak konfiguracji"}
          </Badge>
          <Badge variant={status.heygenConfigured ? "default" : "outline"}>
            HeyGen {status.heygenConfigured ? "OK" : "brak klucza"}
          </Badge>
          <Badge variant={status.aiConfigured ? "default" : "outline"}>
            AI {status.aiConfigured ? "OK" : "brak klucza"}
          </Badge>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        {/* h-auto + flex-wrap: na telefonie zakładki mają się zawijać,
            a nie ściskać do nieczytelnych, nachodzących na siebie napisów. */}
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="publikacja">
            <Send className="mr-1 h-4 w-4" /> Publikacja
          </TabsTrigger>
          <TabsTrigger value="wideo">
            <Video className="mr-1 h-4 w-4" /> Wideo AI (HeyGen)
          </TabsTrigger>
          <TabsTrigger value="b-rolle">
            <Library className="mr-1 h-4 w-4" /> B-rolle
          </TabsTrigger>
          <TabsTrigger value="grafiki">
            <ImageIcon className="mr-1 h-4 w-4" /> Grafiki AI
          </TabsTrigger>
          <TabsTrigger value="prompty">
            <Wand2 className="mr-1 h-4 w-4" /> Generator promptów
          </TabsTrigger>
        </TabsList>

        {/* ── PUBLIKACJA ─────────────────────────────────────────────────── */}
        <TabsContent value="publikacja" className="space-y-6">
          {/* Połączenie konta TikTok — ten sam komponent renderuje się
              w /admin/ustawienia, więc obie strony pokazują jeden stan. */}
          <TiktokConnectionCard />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Opublikuj na wielu platformach naraz</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    "youtube",
                    "instagram_reels",
                    "facebook_reels",
                    "tiktok",
                    "facebook_post",
                  ] as const
                ).map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={platforms.includes(p)}
                      onCheckedChange={() => togglePlatform(p)}
                    />
                    {p === "tiktok" && <Music2 className="h-4 w-4" />}
                    {PLATFORM_LABELS[p]}
                  </label>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tytuł (YouTube / wideo na FB)</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={92} />
                </div>
                <div className="space-y-2">
                  <Label>URL wideo MP4 (pion 9:16 dla Reels/Shorts)</Label>
                  <Input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  {sources.length > 0 && (
                    <select
                      className="w-full rounded-md border bg-background p-2 text-sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setVideoUrl(e.target.value);
                      }}
                    >
                      <option value="">…lub wybierz wygenerowane wideo</option>
                      {sources.map((s) => (
                        <option key={s.video_url} value={s.video_url}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {videoUrl.trim() && (
                    <video
                      src={videoUrl.trim()}
                      controls
                      playsInline
                      preload="none"
                      className="aspect-[9/16] w-28 rounded-md border bg-black object-cover"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Treść / opis (opis filmu, caption Reels, treść posta)</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Grafika do posta FB (opcjonalnie)</Label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  {images.length > 0 && (
                    <select
                      className="w-full rounded-md border bg-background p-2 text-sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setImageUrl(e.target.value);
                      }}
                    >
                      <option value="">…lub wybierz wygenerowaną grafikę</option>
                      {images.map((im) => (
                        <option key={im.id} value={im.image_url}>
                          {im.prompt.slice(0, 80)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Publikacja (puste = najbliższy przebieg)</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Widoczność (YouTube)</Label>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
                  >
                    <option value="public">Publiczny</option>
                    <option value="unlisted">Niepubliczny (unlisted)</option>
                    <option value="private">Prywatny</option>
                  </select>
                </div>
              </div>

              {/* Ekran publikacji TikToka — wymagane przez audyt kontrolki
                  twórcy (prywatność, interakcje, ujawnienie komercyjne)
                  i deklaracja zgody na muzykę, wszystko NAD przyciskiem. */}
              {ttSelected && (
                <TiktokPostOptionsFields
                  value={ttOptions}
                  onChange={setTtOptions}
                  creator={tiktokConnected ? ttCreator : undefined}
                  loading={tiktokConnected && ttCreatorLoading}
                  error={
                    !tiktokConnected
                      ? "Konto TikTok nie jest połączone — połącz je w karcie TikTok powyżej."
                      : ttCreatorError
                        ? (ttCreatorError as Error).message
                        : null
                  }
                />
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => enqueueM.mutate()}
                  disabled={
                    enqueueM.isPending ||
                    !platforms.length ||
                    (needsVideo && !videoUrl.trim()) ||
                    // TikTok bez kompletnych wyborów twórcy nie idzie dalej.
                    (ttSelected &&
                      (!ttCreator || !!tiktokOptionsError(ttOptions, ttCreator.privacyOptions)))
                  }
                >
                  {enqueueM.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  Dodaj do kolejki publikacji
                </Button>
                <p className="text-xs text-muted-foreground">
                  Cron publikuje co 10 minut. Uwaga: URL-e wideo z HeyGen wygasają — przy publikacji
                  planowanej z wyprzedzeniem wgraj plik do Storage.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Kolejka publikacji</CardTitle>
            </CardHeader>
            <CardContent>
              {socialQueue.length === 0 && ytQueue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Kolejka jest pusta.</p>
              ) : (
                <div className="space-y-3">
                  {ytQueue.map((item: YoutubeQueueItem) => {
                    const st = STATUS_LABELS[item.status] ?? {
                      label: item.status,
                      variant: "outline" as const,
                    };
                    return (
                      <div
                        key={`yt-${item.id}`}
                        className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">YouTube Short</Badge>
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </div>
                          <p className="break-words font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.status === "published" && item.published_at
                              ? `Opublikowano ${new Date(item.published_at).toLocaleString("pl-PL")}`
                              : `Plan: ${new Date(item.scheduled_at).toLocaleString("pl-PL")}`}
                          </p>
                          {item.last_error && (
                            <p className="break-words text-xs text-destructive">
                              {item.last_error}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:justify-end">
                          {item.youtube_video_id && (
                            <a
                              href={`https://www.youtube.com/shorts/${item.youtube_video_id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button variant="outline" size="sm">
                                <ExternalLink className="mr-1 h-4 w-4" /> Zobacz
                              </Button>
                            </a>
                          )}
                          <a href="/admin/youtube-shorts">
                            <Button variant="ghost" size="sm">
                              Zarządzaj
                            </Button>
                          </a>
                        </div>
                      </div>
                    );
                  })}

                  {socialQueue.map((item) => {
                    const st = STATUS_LABELS[item.status] ?? {
                      label: item.status,
                      variant: "outline" as const,
                    };
                    const link = externalUrl(item.platform, item.external_post_id);
                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {PLATFORM_LABELS[item.platform] ?? item.platform}
                            </Badge>
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {item.platform === "tiktok" &&
                              item.tiktok_status &&
                              (() => {
                                const tt = TIKTOK_STATUS_LABELS[item.tiktok_status] ?? {
                                  label: `TikTok: ${item.tiktok_status}`,
                                  variant: "outline" as const,
                                };
                                return (
                                  <Badge
                                    variant={tt.variant}
                                    // fail_reason w tooltipie (natywny title — bez
                                    // zależności od TooltipProvider w tym drzewie).
                                    title={item.tiktok_fail_reason ?? undefined}
                                  >
                                    {tt.label}
                                  </Badge>
                                );
                              })()}
                          </div>
                          {item.platform === "tiktok" && item.tiktok_fail_reason && (
                            <p className="break-words text-xs text-destructive">
                              Powód odrzucenia: {item.tiktok_fail_reason}
                            </p>
                          )}
                          <p className="break-words font-medium">
                            {item.title || item.message.slice(0, 60) || "(bez tytułu)"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.status === "published" && item.published_at
                              ? `Opublikowano ${new Date(item.published_at).toLocaleString("pl-PL")}`
                              : `${item.attempt_count > 0 ? "Kolejna próba" : "Plan"}: ${new Date(
                                  item.scheduled_at,
                                ).toLocaleString("pl-PL")}`}
                            {item.attempt_count > 0 &&
                              ` • próby: ${item.attempt_count}/${MAX_PUBLISH_ATTEMPTS}`}
                          </p>
                          {item.last_error && (
                            <p className="break-words text-xs text-destructive">
                              {item.last_error}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:justify-end">
                          {link && (
                            <a href={link} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm">
                                <ExternalLink className="mr-1 h-4 w-4" /> Zobacz
                              </Button>
                            </a>
                          )}
                          {item.status === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => publishNowM.mutate(item.id)}
                                disabled={publishNowM.isPending}
                              >
                                <Upload className="mr-1 h-4 w-4" /> Publikuj teraz
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cancelQM.mutate(item.id)}
                                disabled={cancelQM.isPending}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(item.status === "failed" ||
                            item.status === "cancelled" ||
                            item.status === "processing") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryQM.mutate(item.id)}
                              disabled={retryQM.isPending}
                              title="Ponawia próbę od razu i zeruje licznik prób"
                            >
                              <RefreshCw className="mr-1 h-4 w-4" /> Ponów
                            </Button>
                          )}
                          {item.status !== "publishing" && item.status !== "processing" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteQM.mutate(item.id)}
                              disabled={deleteQM.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WIDEO AI ───────────────────────────────────────────────────── */}
        <TabsContent value="wideo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5" /> Baza pytań do shortów ({SHORTS_QUESTIONS.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Kategoria</Label>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={bankCategory}
                    onChange={(e) => {
                      setBankCategory(e.target.value as typeof bankCategory);
                      setBankSection("all");
                    }}
                  >
                    <option value="all">Wszystkie</option>
                    <option value="klient">{SHORTS_CATEGORY_LABELS.klient}</option>
                    <option value="inwestor">{SHORTS_CATEGORY_LABELS.inwestor}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Sekcja</Label>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={bankSection}
                    onChange={(e) => setBankSection(e.target.value)}
                  >
                    <option value="all">Wszystkie</option>
                    {bankSections.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Szukaj (treść lub nr pytania)</Label>
                  <Input
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    placeholder="np. hipoteka, LTV, 58…"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
                <Button
                  size="sm"
                  onClick={() => batchM.mutate()}
                  disabled={batchM.isPending || selectedIds.size === 0 || autoTtBlocked}
                >
                  {batchM.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="mr-1 h-4 w-4" />
                  )}
                  Generuj zaznaczone ({selectedIds.size})
                </Button>
                <Button variant="outline" size="sm" onClick={selectNextUnproduced}>
                  Zaznacz 5 kolejnych bez wideo
                </Button>
                {selectedIds.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Wyczyść zaznaczenie
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  Seria używa wybranego niżej awatara, głosu i ustawień auto-publikacji; scenariusze
                  to gotowa treść z paczki (bez AI).
                  {queuedCount > 0 && ` W kolejce: ${queuedCount}.`}
                </span>
              </div>

              <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border p-2">
                {bankQuestions.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">Brak pytań dla tych filtrów.</p>
                ) : (
                  bankQuestions.map((q) => (
                    <div
                      key={q.id}
                      className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                        selectedQuestionId === q.id ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <Checkbox
                        className="mt-1"
                        checked={selectedIds.has(q.id)}
                        onCheckedChange={() => toggleSelected(q.id)}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">#{q.id}</Badge>
                          <Badge variant={q.category === "klient" ? "secondary" : "default"}>
                            {q.category === "klient" ? "Klient" : "Inwestor"}
                          </Badge>
                          {doneQuestionIds.has(q.id) && (
                            <Badge variant="outline" className="gap-1 text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> wideo istnieje
                            </Badge>
                          )}
                        </div>
                        <p className="break-words text-sm font-medium">{q.question}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{q.thesis}</p>
                      </div>
                      <Button
                        variant={selectedQuestionId === q.id ? "default" : "outline"}
                        size="sm"
                        className="shrink-0"
                        onClick={() => applyBankQuestion(q.id)}
                      >
                        <Send className="mr-1 h-4 w-4" /> Użyj
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Pytania z pliku „Pożyczki prywatne — 250 pytań do shortów" (docs/shorts). „Użyj"
                podstawia GOTOWY, sprawdzony scenariusz z paczki (znacznik kategorii → pytanie →
                teza → CTA) — AI nic nie przepisuje; tekst możesz jeszcze ręcznie poprawić przed
                generacją. Zielony znaczek = dla pytania istnieje już wygenerowane wideo w
                bibliotece poniżej.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <Send className="h-5 w-5" /> Auto-publikacja po wygenerowaniu
                </span>
                <Switch checked={autoPublishOn} onCheckedChange={setAutoPublishOn} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {autoPublishOn ? (
                <>
                  <div className="flex flex-wrap gap-4">
                    {(["youtube", "instagram_reels", "facebook_reels", "tiktok"] as const).map(
                      (p) => (
                        <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={autoPlatforms.includes(p)}
                            onCheckedChange={() => toggleAutoPlatform(p)}
                          />
                          {p === "tiktok" && <Music2 className="h-4 w-4" />}
                          {PLATFORM_LABELS[p]}
                        </label>
                      ),
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Label className="text-sm font-normal">Widoczność (YouTube):</Label>
                      <select
                        className="rounded-md border bg-background p-1.5 text-sm"
                        value={autoPrivacy}
                        onChange={(e) => setAutoPrivacy(e.target.value as typeof autoPrivacy)}
                      >
                        <option value="public">Publiczny</option>
                        <option value="unlisted">Niepubliczny (unlisted)</option>
                        <option value="private">Prywatny</option>
                      </select>
                    </div>
                  </div>
                  {/* Auto-publikacja na TikToka też wymaga wyborów twórcy —
                      tick nie ma prawa dobrać prywatności sam. */}
                  {autoTtSelected && (
                    <TiktokPostOptionsFields
                      deferred
                      value={autoTtOptions}
                      onChange={setAutoTtOptions}
                      creator={tiktokConnected ? autoTtCreator : undefined}
                      loading={tiktokConnected && autoTtCreatorLoading}
                      error={
                        !tiktokConnected
                          ? "Konto TikTok nie jest połączone — połącz je w zakładce Publikacja."
                          : autoTtCreatorError
                            ? (autoTtCreatorError as Error).message
                            : null
                      }
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Gdy render w HeyGen się skończy, wideo trafi automatycznie do kolejek publikacji
                    zaznaczonych platform (tytuł i opis generuje AI razem ze scenariuszem). Działa
                    też przy zamkniętej przeglądarce — dogląda tego cron co 10 minut.
                    {autoPublishOn &&
                      !autoPlatforms.length &&
                      " Zaznacz co najmniej jedną platformę."}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Wyłączona — gotowe wideo poczeka w bibliotece, publikujesz ręcznie przyciskiem
                  „Publikuj".
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Wygeneruj wideo HeyGen z promptu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Prompt (o czym ma być wideo)</Label>
                <Textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  rows={2}
                  placeholder="np. Dlaczego pożyczka pod nieruchomość bywa szybsza niż kredyt bankowy"
                />
                {selectedQuestionId != null && (
                  <p className="text-xs text-muted-foreground">
                    Pytanie #{selectedQuestionId} z paczki — scenariusz poniżej to gotowa,
                    sprawdzona treść (bez AI); „Wygeneruj scenariusz" przywraca oryginał z paczki.
                  </p>
                )}
                <Button
                  variant="outline"
                  onClick={() => genScriptM.mutate()}
                  disabled={genScriptM.isPending || !videoPrompt.trim()}
                >
                  {genScriptM.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-4 w-4" />
                  )}
                  Wygeneruj scenariusz
                </Button>
              </div>

              <div className="space-y-3">
                <Label>Scenariusz (tekst mówiony — możesz edytować każdą sekcję)</Label>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Hook — znacznik kategorii + pytanie (mówione otwarcie rolki)
                  </Label>
                  <Textarea
                    value={scriptHook}
                    onChange={(e) => setScriptHook(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Treść — teza odpowiedzi (merytoryka rolki)
                  </Label>
                  <Textarea
                    value={scriptContent}
                    onChange={(e) => setScriptContent(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">CTA — zamknięcie rolki</Label>
                  <Textarea
                    value={scriptCta}
                    onChange={(e) => setScriptCta(e.target.value)}
                    rows={2}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Lektor przeczyta sklejkę: hook → treść → CTA (
                  {fullScript.trim().split(/\s+/).filter(Boolean).length} słów).
                </p>

                {selectedBankQuestion && (
                  <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">
                        Elementy dynamiczne — ekran (lektor ich NIE czyta; do montażu)
                      </Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            SHORTS_DYNAMIC_ELEMENTS[selectedBankQuestion.category]
                              .map((e) => `• ${e}`)
                              .join("\n"),
                          );
                          toast.success("Skopiowano elementy dynamiczne");
                        }}
                      >
                        <Copy className="mr-1 h-4 w-4" /> Kopiuj
                      </Button>
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {SHORTS_DYNAMIC_ELEMENTS[selectedBankQuestion.category].map((el, i) => (
                        <li key={i}>{el}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>
                    Awatar (HeyGen)
                    {selectedAvatar && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        wybrany: {selectedAvatar.name}
                        {selectedAvatar.group ? ` (${selectedAvatar.group})` : ""}
                      </span>
                    )}
                  </Label>
                  <div className="flex items-center gap-3">
                    {hasMineAvatars && (
                      <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox
                          checked={avatarOnlyMine}
                          onCheckedChange={(v) => setAvatarOnlyMine(v === true)}
                        />
                        Tylko moje
                      </label>
                    )}
                    <Input
                      className="h-8 w-48"
                      value={avatarSearch}
                      onChange={(e) => setAvatarSearch(e.target.value)}
                      placeholder="Szukaj awatara…"
                    />
                  </div>
                </div>
                {avatarsLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Wczytuję awatary z konta HeyGen…
                  </p>
                ) : filteredAvatars.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Brak awatarów dla tych filtrów — zmień wyszukiwanie lub odznacz „Tylko moje".
                  </p>
                ) : (
                  <>
                    <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto rounded-md border p-2 sm:grid-cols-3 lg:grid-cols-5">
                      {filteredAvatars.slice(0, AVATAR_DISPLAY_CAP).map((a) => {
                        const pickIndex = avatarPicks.indexOf(a.id);
                        return (
                          <div key={a.id} className="relative">
                            <button
                              type="button"
                              onClick={() => setAvatarId(a.id)}
                              className={`w-full rounded-lg border p-2 text-left transition-colors ${
                                avatarId === a.id
                                  ? "border-primary ring-2 ring-primary"
                                  : "hover:border-muted-foreground/50"
                              }`}
                            >
                              {a.preview ? (
                                <img
                                  src={a.preview}
                                  alt={a.name}
                                  className="aspect-square w-full rounded-md object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                                  brak podglądu
                                </div>
                              )}
                              <p className="mt-1 truncate text-xs font-medium">{a.name}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {a.mine ? "Mój" : "Publiczny"}
                                {a.kind === "talking_photo" ? " • foto" : ""}
                                {a.group ? ` • ${a.group}` : ""}
                              </p>
                            </button>
                            {/* Gwiazdka = kandydat na domyślnego; numer pokazuje
                                miejsce w rotacji a-rolli. Zapisuje dopiero
                                przycisk „Ustaw jako domyślne". */}
                            <button
                              type="button"
                              onClick={() => toggleAvatarPick(a.id)}
                              title={
                                pickIndex >= 0
                                  ? `W zestawie domyślnych (${pickIndex + 1}. w rotacji) — kliknij, by usunąć`
                                  : "Dodaj do zestawu domyślnych"
                              }
                              aria-label={
                                pickIndex >= 0
                                  ? `Usuń ${a.name} z domyślnych`
                                  : `Dodaj ${a.name} do domyślnych`
                              }
                              className={`absolute right-1 top-1 flex h-7 min-w-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold shadow-sm transition-colors ${
                                pickIndex >= 0
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background/85 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${pickIndex >= 0 ? "fill-current" : ""}`}
                              />
                              {pickIndex >= 0 ? pickIndex + 1 : ""}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {filteredAvatars.length > AVATAR_DISPLAY_CAP && (
                      <p className="text-xs text-muted-foreground">
                        Pokazuję {AVATAR_DISPLAY_CAP} z {filteredAvatars.length} — zawęź
                        wyszukiwaniem.
                      </p>
                    )}
                  </>
                )}

                {/* Stały zestaw domyślnych awatarów — jeden przycisk zapisuje
                    go do bazy, więc obowiązuje też serię wsadową i crona. */}
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="flex items-center gap-2">
                      <Star className="h-4 w-4" /> Domyślne awatary (rotacja a-rolli)
                    </Label>
                    <div className="flex items-center gap-2">
                      {avatarPicks.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAvatarPicks([])}
                          disabled={saveDefaultsM.isPending}
                        >
                          Wyczyść wybór
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => saveDefaultsM.mutate()}
                        disabled={saveDefaultsM.isPending || !picksDirty}
                      >
                        {saveDefaultsM.isPending ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Star className="mr-1 h-4 w-4" />
                        )}
                        Ustaw jako domyślne
                      </Button>
                    </div>
                  </div>
                  {avatarPicks.length ? (
                    <div className="flex flex-wrap gap-1">
                      {avatarPicks.map((id, i) => (
                        <Badge key={id} variant="secondary" className="gap-1">
                          {i + 1}. {avatarName(id)}
                          <button
                            type="button"
                            onClick={() => toggleAvatarPick(id)}
                            aria-label={`Usuń ${avatarName(id)} z domyślnych`}
                            className="ml-1 text-muted-foreground hover:text-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Zaznacz gwiazdką kilka awatarów w siatce powyżej (kolejność klikania =
                      kolejność wchodzenia na ekran) i kliknij „Ustaw jako domyślne".
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {savedDefaultIds.length
                      ? `Zapisany zestaw: ${savedDefaultIds.map(avatarName).join(" → ")}.`
                      : "Zapisanego zestawu jeszcze nie ma."}{" "}
                    Zestaw obowiązuje na stałe — bierze go z niego także generowanie wsadowe i cron.
                    W strukturze rolki kolejne a-rolle mówi kolejny awatar z listy.
                    {picksDirty && " Masz niezapisane zmiany."}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Głos lektora (ElevenLabs)</Label>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                  >
                    {(voices.length
                      ? voices
                      : [{ id: FILIP_VOICE_ID, name: "Filip (domyślny)", description: "" }]
                    ).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.description ? ` — ${v.description}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Captions className="h-4 w-4" /> Napisy na wideo
                  </Label>
                  <div className="flex h-10 items-center gap-3 rounded-md border bg-muted/40 px-3">
                    <Switch checked={captionsOn} onCheckedChange={setCaptionsOn} />
                    <span className="text-sm text-muted-foreground">
                      {captionsOn ? "Włączone (zalecane)" : "Wyłączone"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clapperboard className="h-4 w-4" /> Montaż rolki
                  </Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background p-2 text-sm"
                    value={montage}
                    onChange={(e) => setMontage(e.target.value as typeof montage)}
                  >
                    <option value="single">Pojedyncze ujęcie (gadająca głowa)</option>
                    <option value="ai">Przebitki — miejsca cięć wskazuje AI</option>
                    <option value="structure">
                      Struktura: ujęcie → wizual hook → b-roll → a-roll innego awatara
                    </option>
                  </select>
                </div>
              </div>
              {montage === "ai" && (
                <p className="text-xs text-muted-foreground">
                  Scenariusz zostanie pocięty na sceny (zdaniami — treść bez zmian), a AI wskaże
                  fragmenty do zilustrowania pełnoekranową grafiką z banku b-rolli (czego w banku
                  nie ma, bank dociąga ze stocku i u siebie zapisuje); lektor mówi przez nie dalej.
                  Hook i CTA zawsze zostają na awatarze. Gdy nie znajdzie się sensowna ilustracja,
                  rolka wychodzi jako pojedyncze ujęcie — z powodem w tabeli.
                </p>
              )}
              {montage === "structure" && (
                <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Stały rytm: ujęcie → wizual hook → b-roll → a-roll innego domyślnego awatara (i
                    tak w kółko; CTA zawsze wraca na twarz).
                  </p>
                  <p>
                    Miejsca cięć są z góry ustalone — AI dobiera już tylko, czym zilustrować
                    przebitkę. Wizual hooki i b-rolle lecą z banku (zakładka „B-rolle”:{" "}
                    {brollCounts.hook} hooków, {brollCounts.broll} przebitek).
                  </p>
                  <p>
                    Rotacja twarzy:{" "}
                    {avatarRotation.length > 1
                      ? avatarRotation.map(avatarName).join(" → ")
                      : `${avatarName(avatarId)} (dodaj więcej domyślnych awatarów, żeby a-roll mówiła inna twarz)`}
                    .
                  </p>
                  {!brollCounts.hook && (
                    <p className="text-amber-600 dark:text-amber-500">
                      Bank nie ma jeszcze wizual hooków — uzupełnij go w zakładce „B-rolle”, inaczej
                      te sceny spadną z powrotem na awatara.
                    </p>
                  )}
                </div>
              )}

              <Button
                onClick={() => startVideoM.mutate()}
                disabled={startVideoM.isPending || !fullScript.trim() || autoTtBlocked}
              >
                {startVideoM.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Video className="mr-1 h-4 w-4" />
                )}
                Generuj wideo
              </Button>
              <p className="text-xs text-muted-foreground">
                Pipeline: scenariusz → lektor ElevenLabs → awatar HeyGen (pion 9:16, 720p, napisy
                wypalane przez HeyGen). Renderowanie trwa zwykle 2-10 minut; status odświeża się
                automatycznie. Ustawienie napisów obowiązuje też dla generowania wsadowego.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Biblioteka wygenerowanych wideo ({videoJobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {videoJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak wygenerowanych wideo.</p>
              ) : (
                <div className="space-y-3">
                  {videoJobs.map((j: StudioVideoJob) => {
                    const avatar =
                      avatars.find((a) => a.id === j.avatar_id) ??
                      HEYGEN_AVATARS.find((a) => a.id === j.avatar_id);
                    const voice = voices.find((v) => v.id === j.voice_id);
                    return (
                      <div
                        key={j.id}
                        className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-1 gap-3">
                          {j.video_url ? (
                            // Odtwarzacz w liście — preload="none", więc plik pobiera się
                            // dopiero po kliknięciu play (miniatura jako poster).
                            <div className="shrink-0 space-y-1">
                              <video
                                src={j.video_url}
                                poster={j.thumbnail_url ?? undefined}
                                controls
                                playsInline
                                preload="none"
                                className="aspect-[9/16] w-24 rounded-md border bg-black object-cover"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-24 px-1 text-xs"
                                onClick={() => setPreviewJob(j)}
                              >
                                <Maximize2 className="mr-1 h-3 w-3" /> Duży
                              </Button>
                            </div>
                          ) : (
                            j.thumbnail_url && (
                              <img
                                src={j.thumbnail_url}
                                alt=""
                                className="h-16 w-10 shrink-0 rounded-md object-cover"
                                loading="lazy"
                              />
                            )
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant={
                                  j.status === "ready"
                                    ? "default"
                                    : j.status === "failed"
                                      ? "destructive"
                                      : "outline"
                                }
                              >
                                {VIDEO_STATUS_LABELS[j.status] ?? j.status}
                              </Badge>
                              <Badge variant="outline" className="gap-1">
                                <Captions className="h-3 w-3" />
                                {captionBadgeLabel(j)}
                              </Badge>
                              {j.reel_structure && (
                                <Badge variant="secondary" className="gap-1">
                                  <Layers className="h-3 w-3" /> struktura rolki
                                </Badge>
                              )}
                              {j.scene_plan?.length ? (
                                <Badge
                                  variant="outline"
                                  className="gap-1"
                                  title={j.scene_plan
                                    .map((s, i) =>
                                      s.kind === "broll"
                                        ? `${i + 1}. przebitka: ${s.query ?? "z banku"}`
                                        : s.kind === "hook"
                                          ? `${i + 1}. wizual hook`
                                          : `${i + 1}. awatar${
                                              s.avatarId ? `: ${avatarName(s.avatarId)}` : ""
                                            }`,
                                    )
                                    .join("\n")}
                                >
                                  <Clapperboard className="h-3 w-3" />
                                  {describeScenePlan(j.scene_plan)}
                                </Badge>
                              ) : (
                                j.dynamic_scenes && (
                                  <Badge variant="outline" className="gap-1">
                                    <Clapperboard className="h-3 w-3" /> jedno ujęcie
                                  </Badge>
                                )
                              )}
                            </div>
                            <p className="break-words font-medium">{j.prompt.slice(0, 90)}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(j.created_at).toLocaleString("pl-PL")}
                              {avatar ? ` • ${avatar.name}` : ""}
                              {voice ? ` • głos: ${voice.name}` : ""}
                              {j.auto_publish_platforms.length > 0 &&
                                ` • auto: ${j.auto_publish_platforms
                                  .map((p) => AUTO_PLATFORM_SHORT[p] ?? p)
                                  .join(", ")}${
                                  j.auto_published_at
                                    ? ` (wysłano do publikacji ${new Date(
                                        j.auto_published_at,
                                      ).toLocaleString("pl-PL")})`
                                    : ""
                                }`}
                            </p>
                            {j.last_error && (
                              <p className="break-words text-xs text-destructive">{j.last_error}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:justify-end">
                          {j.video_url && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => setPreviewJob(j)}>
                                <Play className="mr-1 h-4 w-4" /> Odtwórz
                              </Button>
                              <a href={j.video_url} target="_blank" rel="noreferrer">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  title="Otwórz plik MP4 w nowej karcie"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </a>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => applyVideoToPublish(j.video_url!)}
                              >
                                <Send className="mr-1 h-4 w-4" /> Publikuj
                              </Button>
                            </>
                          )}
                          {j.video_url_clean && (
                            <a href={j.video_url_clean} target="_blank" rel="noreferrer">
                              <Button
                                variant="outline"
                                size="sm"
                                title="Ten sam render bez wypalonych napisów (do montażu)"
                              >
                                <Film className="mr-1 h-4 w-4" /> Bez napisów
                              </Button>
                            </a>
                          )}
                          {j.subtitle_url && (
                            <a href={j.subtitle_url} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm" title="Plik napisów (SRT)">
                                <Captions className="mr-1 h-4 w-4" /> SRT
                              </Button>
                            </a>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteVideoM.mutate(j.id)}
                            disabled={deleteVideoM.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Duży odtwarzacz — pion 9:16, mieści się na ekranie telefonu. */}
          <Dialog open={!!previewJob} onOpenChange={(open) => !open && setPreviewJob(null)}>
            <DialogContent className="max-w-[min(28rem,95vw)]">
              <DialogHeader>
                <DialogTitle className="pr-6 text-left text-base leading-snug">
                  {previewJob?.prompt.slice(0, 120) ?? "Podgląd wideo"}
                </DialogTitle>
              </DialogHeader>
              {previewJob?.video_url && (
                <>
                  <video
                    key={previewJob.id}
                    src={previewJob.video_url}
                    poster={previewJob.thumbnail_url ?? undefined}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[70vh] w-full rounded-md bg-black"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        applyVideoToPublish(previewJob.video_url!);
                        setPreviewJob(null);
                      }}
                    >
                      <Send className="mr-1 h-4 w-4" /> Publikuj
                    </Button>
                    <a href={previewJob.video_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="mr-1 h-4 w-4" /> Otwórz plik
                      </Button>
                    </a>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ── GRAFIKI ────────────────────────────────────────────────────── */}
        {/* ── Bank b-rolli ──────────────────────────────────────────────── */}
        <TabsContent value="b-rolle" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bank b-rolli i wizual hooków</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  <Film className="mr-1 h-3.5 w-3.5" /> {brollCounts.broll} przebitek
                </Badge>
                <Badge variant="secondary">
                  <Layers className="mr-1 h-3.5 w-3.5" /> {brollCounts.hook} wizual hooków
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => seedBrollM.mutate()}
                  disabled={seedBrollM.isPending}
                >
                  {seedBrollM.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-4 w-4" />
                  )}
                  Uzupełnij bank ze stocku
                </Button>
                <Button size="sm" variant="ghost" onClick={refreshBroll}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Odśwież
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Materiały z banku trafiają do rolek: przebitki dobierane są po tagach do frazy
                planera, a wizual hooki rotują od najdawniej użytego. Każdy plik kopiujemy do
                naszego bucketu <code>studio-media</code> — HeyGen i Meta czytają trwały URL, a nie
                wygasający link stocku. „Uzupełnij bank ze stocku” pobiera startowy zestaw (Pexels,
                gdy jest klucz <code>PEXELS_API_KEY</code>, inaczej biblioteka HeyGena) i pomija
                frazy, które już masz.
              </p>

              <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-2 md:col-span-2">
                  <Label>Dodaj własny materiał (publiczny URL grafiki)</Label>
                  <Input
                    value={newBrollUrl}
                    onChange={(e) => setNewBrollUrl(e.target.value)}
                    placeholder="https://…/przebitka.jpg"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rodzaj</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background p-2 text-sm"
                    value={newBrollKind}
                    onChange={(e) => setNewBrollKind(e.target.value as "broll" | "hook")}
                  >
                    <option value="broll">Przebitka (b-roll)</option>
                    <option value="hook">Wizual hook</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Nazwa / opis</Label>
                  <Input
                    value={newBrollTitle}
                    onChange={(e) => setNewBrollTitle(e.target.value)}
                    placeholder="np. signing mortgage contract"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tagi (po przecinku)</Label>
                  <Input
                    value={newBrollTags}
                    onChange={(e) => setNewBrollTags(e.target.value)}
                    placeholder="mortgage, contract, umowa"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => addBrollM.mutate()}
                    disabled={addBrollM.isPending || !newBrollUrl.trim()}
                  >
                    {addBrollM.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1 h-4 w-4" />
                    )}
                    Dodaj
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tagi decydują o doborze — wpisuj je tak, jak planer opisuje kadr (po angielsku), a
                dla wygody także po polsku. Nazwa i tagi same wchodzą do słów kluczowych.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Biblioteka</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={brollKindFilter}
                  onChange={(e) => setBrollKindFilter(e.target.value as "all" | "broll" | "hook")}
                >
                  <option value="all">Wszystko</option>
                  <option value="broll">Tylko przebitki</option>
                  <option value="hook">Tylko wizual hooki</option>
                </select>
                <Input
                  className="h-9 w-56"
                  value={brollSearch}
                  onChange={(e) => setBrollSearch(e.target.value)}
                  placeholder="Szukaj po nazwie lub tagu…"
                />
              </div>

              {brollLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Wczytuję bank…
                </p>
              ) : filteredBroll.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Bank jest pusty dla tych filtrów. Kliknij „Uzupełnij bank ze stocku” albo dodaj
                  własny materiał powyżej.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {filteredBroll.map((a: StudioBrollAsset) => (
                    <div
                      key={a.id}
                      className={`space-y-2 rounded-lg border p-3 ${a.active ? "" : "opacity-60"}`}
                    >
                      <img
                        src={a.media_url}
                        alt={a.title}
                        className="aspect-[9/16] w-full rounded-md object-cover"
                        loading="lazy"
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={a.kind === "hook" ? "default" : "secondary"}>
                          {a.kind === "hook" ? "wizual hook" : "przebitka"}
                        </Badge>
                        {!a.active && <Badge variant="outline">wyłączony</Badge>}
                        <span className="text-[11px] text-muted-foreground">
                          użyć: {a.use_count}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs font-medium">{a.title}</p>
                      {a.tags.length > 0 && (
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">
                          {a.tags.slice(0, 6).join(" · ")}
                        </p>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          title={a.active ? "Wyłącz z doboru" : "Włącz do doboru"}
                          onClick={() => brollActiveM.mutate({ id: a.id, active: !a.active })}
                          disabled={brollActiveM.isPending}
                        >
                          {a.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title="Kopiuj URL"
                          onClick={() => {
                            navigator.clipboard.writeText(a.media_url);
                            toast.success("Skopiowano URL");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Usuń z banku"
                          onClick={() => deleteBrollM.mutate(a.id)}
                          disabled={deleteBrollM.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grafiki" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Wygeneruj grafikę z promptu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Prompt (najlepiej po angielsku — opis sceny, stylu, kolorów)</Label>
                <Textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={3}
                  placeholder="np. Modern flat illustration of a house with rising coins, navy and gold palette, no text"
                />
              </div>
              <Button
                onClick={() => genImageM.mutate()}
                disabled={genImageM.isPending || !imagePrompt.trim()}
              >
                {genImageM.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                Generuj grafikę
              </Button>
              <p className="text-xs text-muted-foreground">
                Grafiki zapisują się w Supabase Storage (bucket studio-media) z trwałym publicznym
                URL — od razu gotowe do posta na Facebooku.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Galeria</CardTitle>
            </CardHeader>
            <CardContent>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak wygenerowanych grafik.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {images.map((im) => (
                    <div key={im.id} className="space-y-2 rounded-lg border p-3">
                      <img
                        src={im.image_url}
                        alt={im.prompt}
                        className="aspect-square w-full rounded-md object-cover"
                        loading="lazy"
                      />
                      <p className="line-clamp-2 text-xs text-muted-foreground">{im.prompt}</p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => applyImageToPublish(im.image_url)}
                        >
                          <Send className="mr-1 h-4 w-4" /> Do posta
                        </Button>
                        {/* Grafika AI nadaje się na przebitkę — jedno kliknięcie
                            i wpada do banku, z którego jadą rolki. */}
                        <Button
                          variant="outline"
                          size="sm"
                          title="Dodaj do banku b-rolli"
                          onClick={() =>
                            addBrollFn({
                              data: {
                                url: im.image_url,
                                kind: "broll",
                                title: im.prompt.slice(0, 120),
                              },
                            })
                              .then(() => {
                                toast.success("Dodano do banku b-rolli");
                                refreshBroll();
                              })
                              .catch((e: Error) => toast.error(e.message))
                          }
                        >
                          <Library className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(im.image_url);
                            toast.success("Skopiowano URL");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteImageM.mutate(im.id)}
                          disabled={deleteImageM.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PROMPTY ────────────────────────────────────────────────────── */}
        <TabsContent value="prompty" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Generator promptów</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>Temat / obszar</Label>
                  <Input
                    value={promptTopic}
                    onChange={(e) => setPromptTopic(e.target.value)}
                    placeholder="np. pożyczki pod zastaw nieruchomości dla firm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rodzaj promptów</Label>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={promptKind}
                    onChange={(e) => setPromptKind(e.target.value as typeof promptKind)}
                  >
                    <option value="video">Wideo (Shorts/Reels)</option>
                    <option value="image">Grafiki AI</option>
                    <option value="social">Posty social media</option>
                  </select>
                </div>
              </div>
              <Button
                onClick={() => genPromptsM.mutate()}
                disabled={genPromptsM.isPending || !promptTopic.trim()}
              >
                {genPromptsM.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-1 h-4 w-4" />
                )}
                Generuj prompty
              </Button>

              {promptIdeas.length > 0 && (
                <div className="space-y-2">
                  {promptIdeas.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <p className="flex-1 text-sm">{p}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {promptKind !== "social" && (
                          <Button variant="outline" size="sm" onClick={() => applyPromptIdea(p)}>
                            <Send className="mr-1 h-4 w-4" /> Użyj
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(p);
                            toast.success("Skopiowano");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Prompty na posty social wykorzystasz w module{" "}
                <a className="underline" href="/admin/marketing/social">
                  Social Media AI
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
