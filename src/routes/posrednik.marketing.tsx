import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Sparkles,
  Download,
  Copy,
  Link as LinkIcon,
  Facebook,
  Linkedin,
  Twitter,
  MessageCircle,
  Send,
  Mail,
  ImageIcon,
  Video as VideoIcon,
  Youtube,
  Instagram,

} from "lucide-react";
import { generateMaterialDescription, ensureMyReferralCode } from "@/lib/marketing-materials.functions";

function TikTokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V9.01a8.16 8.16 0 0 0 4.77 1.52V7.1a4.85 4.85 0 0 1-1.84-.41z" />
    </svg>
  );
}

export const Route = createFileRoute("/posrednik/marketing")({
  component: BrokerMarketingPage,
});

type Audience = "klient" | "inwestor" | "posrednik";
type MediaType = "image" | "video";

type Material = {
  id: string;
  title: string;
  description: string | null;
  ai_description: string | null;
  audience: Audience;
  media_type: MediaType;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "klient", label: "Dla klienta" },
  { value: "inwestor", label: "Dla inwestora" },
  { value: "posrednik", label: "Dla pośrednika" },
];

const BUCKET = "marketing-materials";

const SITE_BASE = typeof window !== "undefined" ? window.location.origin : "https://financeyou.pl";

function refLink(role: Audience, code: string) {
  // Lands on path-picker / signup with role + broker ref
  if (role === "klient") return `${SITE_BASE}/?ref=${code}&role=klient`;
  if (role === "inwestor") return `${SITE_BASE}/inwestor?ref=${code}`;
  return `${SITE_BASE}/rejestracja?ref=${code}&role=posrednik`;
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Skopiowano do schowka");
}

async function shareOrCopy({
  title,
  text,
  url,
  channel,
}: {
  title: string;
  text: string;
  url: string;
  channel: string;
}) {
  const message = `${text}\n\n${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      toast.success(`Udostępnianie: ${channel}`);
      return;
    }
    await navigator.clipboard.writeText(message);
    toast.success(`Skopiowano treść dla: ${channel}`);
  } catch (error: any) {
    if (error?.name === "AbortError") return;
    await navigator.clipboard.writeText(message);
    toast.success(`Skopiowano treść dla: ${channel}`);
  }
}

function BrokerMarketingPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Audience>("klient");
  const [busy, setBusy] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string>("");

  const genDesc = useServerFn(generateMaterialDescription);
  const ensureCode = useServerFn(ensureMyReferralCode);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketing_materials")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Nie udało się pobrać materiałów");
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Material[];
    setItems(list);
    const signed: Record<string, string> = {};
    await Promise.all(
      list.map(async (m) => {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 3600);
        if (s?.signedUrl) signed[m.id] = s.signedUrl;
      }),
    );
    setUrls(signed);
    setLoading(false);
  };

  useEffect(() => {
    load();
    ensureCode({}).then((r) => setRefCode(r.code)).catch(() => {});
  }, []);

  const handleGenerate = async (m: Material) => {
    setBusy(m.id);
    try {
      const r = await genDesc({
        data: {
          materialId: m.id,
          audience: m.audience,
          title: m.title,
          userDescription: m.description ?? undefined,
        },
      });
      setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, ai_description: r.ai_description } : x)));
      toast.success("Opis wygenerowany");
    } catch (e: any) {
      toast.error(e.message ?? "Błąd AI");
    } finally {
      setBusy(null);
    }
  };

  const filtered = items.filter((i) => i.audience === tab);

  const links = refCode
    ? [
        { role: "klient" as const, label: "Reflink — klient (pożyczkobiorca)", url: refLink("klient", refCode) },
        { role: "inwestor" as const, label: "Reflink — inwestor", url: refLink("inwestor", refCode) },
        { role: "posrednik" as const, label: "Reflink — pośrednik (poleć kolegę)", url: refLink("posrednik", refCode) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Materiały marketingowe</h1>
        <p className="text-sm text-muted-foreground">
          Pobieraj, generuj opisy AI i udostępniaj w social media. Wszystkie kliknięcia z Twoich reflinków
          przypisują nowych klientów / inwestorów / pośredników do Twojego konta.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LinkIcon className="h-4 w-4" /> Twoje reflinki {refCode && <Badge variant="secondary">{refCode}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!refCode && <p className="text-sm text-muted-foreground">Generuję kod...</p>}
          {links.map((l) => (
            <div key={l.role} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{l.label}</p>
                <p className="font-mono text-sm truncate">{l.url}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => copy(l.url)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Audience)}>
        <TabsList>
          {AUDIENCES.map((a) => {
            const count = items.filter((i) => i.audience === a.value).length;
            return (
              <TabsTrigger key={a.value} value={a.value}>
                {a.label} <Badge variant="secondary" className="ml-2">{count}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
        {AUDIENCES.map((a) => (
          <TabsContent key={a.value} value={a.value} className="mt-4">
            {loading ? (
              <p className="text-muted-foreground">Ładowanie...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground">Brak materiałów w tej kategorii.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((m) => {
                  const url = urls[m.id];
                  const shareUrl = refCode ? refLink(tab, refCode) : SITE_BASE;
                  const shareText = m.ai_description || m.description || m.title;
                  const handleShare = (channel: string) => shareOrCopy({ title: m.title, text: shareText, url: shareUrl, channel });
                  return (
                    <Card key={m.id} className="overflow-hidden">
                      <div className="aspect-video bg-black flex items-center justify-center overflow-hidden">
                        {!url ? (
                          <div className="text-muted-foreground">...</div>
                        ) : m.media_type === "image" ? (
                          <img src={url} alt={m.title} className="w-full h-full object-contain" />
                        ) : (
                          <video src={url} controls preload="none" playsInline className="w-full h-full object-contain bg-black" />
                        )}
                      </div>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate">{m.title}</h3>
                            {m.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                            )}
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {m.media_type === "image" ? (
                              <ImageIcon className="h-3 w-3 mr-1" />
                            ) : (
                              <VideoIcon className="h-3 w-3 mr-1" />
                            )}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Opis do social (AI)</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleGenerate(m)}
                              disabled={busy === m.id}
                              className="h-7"
                            >
                              <Sparkles className="h-3 w-3 mr-1" />
                              {m.ai_description ? "Regeneruj" : "Wygeneruj"}
                            </Button>
                          </div>
                          <Textarea
                            rows={3}
                            value={m.ai_description ?? ""}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, ai_description: e.target.value } : x)),
                              )
                            }
                            onBlur={async (e) => {
                              await supabase
                                .from("marketing_materials")
                                .update({ ai_description: e.target.value || null })
                                .eq("id", m.id);
                            }}
                            placeholder={`Kliknij „Wygeneruj" lub wpisz własny opis...`}
                            className="text-sm"
                          />
                          {m.ai_description && (
                            <Button size="sm" variant="outline" className="w-full" onClick={() => copy(m.ai_description!)}>
                              <Copy className="h-3 w-3 mr-1" /> Kopiuj opis
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          <Button size="sm" variant="outline" title="Facebook — skopiuj / udostępnij" onClick={() => handleShare("Facebook")}>
                            <Facebook className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" title="LinkedIn — skopiuj / udostępnij" onClick={() => handleShare("LinkedIn")}>
                            <Linkedin className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" title="X — skopiuj / udostępnij" onClick={() => handleShare("X")}>
                            <Twitter className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" title="WhatsApp — skopiuj / udostępnij" onClick={() => handleShare("WhatsApp")}>
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" title="Telegram — skopiuj / udostępnij" onClick={() => handleShare("Telegram")}>
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" title="E-mail — skopiuj treść wiadomości" onClick={() => handleShare("E-mail")}>
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Instagram — skopiuj opis i link"
                            onClick={() => handleShare("Instagram")}
                          >
                            <Instagram className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="YouTube — skopiuj opis i link"
                            onClick={() => handleShare("YouTube")}
                          >
                            <Youtube className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="TikTok — skopiuj opis i link"
                            onClick={() => handleShare("TikTok")}
                          >
                            <TikTokIcon />
                          </Button>
                        </div>



                        {url && (
                          <Button asChild size="sm" variant="secondary" className="w-full">
                            <a href={url} target="_blank" rel="noreferrer" download>
                              <Download className="h-4 w-4 mr-1" /> Pobierz plik
                            </a>
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
