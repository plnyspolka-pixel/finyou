import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Play,
  RefreshCw,
  User as UserIcon,
  Bot,
  ExternalLink,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  getVoicebotConversation,
  enrichOneVoicebotConversation,
  getVoicebotAudio,
} from "@/lib/voicebot.functions";
import { toast } from "sonner";

const SOURCE_LABELS: Record<string, string> = {
  meta_lead: "Meta Ads",
  wniosek_krok2: "Wniosek",
  manual: "Ręcznie",
  test: "Test",
};

const STATUS_LABELS: Record<string, string> = {
  oczekuje: "Oczekuje",
  w_trakcie: "W trakcie",
  zakonczona: "Zakończona",
  wykonane: "Odebrana",
  nieodebrana: "Nieodebrana",
  poczta_glosowa: "Poczta głosowa",
  blad: "Błąd",
  anulowana: "Anulowana",
};

function fmtPl(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", hour12: false });
}

function fmtDuration(secs: number | null | undefined): string {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtCost(credits: number | null | undefined): string {
  if (credits == null) return "—";
  if (credits >= 1000) return `${Math.round(credits / 100) / 10}k kr.`;
  return `${Math.round(credits)} kr.`;
}

export function VoicebotConversationCard({ row, onChanged }: { row: any; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  const getDetails = useServerFn(getVoicebotConversation);
  const enrichOne = useServerFn(enrichOneVoicebotConversation);
  const getAudio = useServerFn(getVoicebotAudio);

  const q = useQuery({
    queryKey: ["voicebot-conv", row.id],
    queryFn: () => getDetails({ data: { id: row.id } }),
    enabled: open,
  });

  const mEnrich = useMutation({
    mutationFn: async () => enrichOne({ data: { conversationId: row.conversation_id } }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Zaktualizowano z ElevenLabs");
      else toast.error("Nie udało się odświeżyć", { description: r?.error });
      onChanged?.();
      q.refetch();
    },
    onError: (e: any) => toast.error("Błąd", { description: e?.message }),
  });

  const handleLoadAudio = async () => {
    if (!row.conversation_id) return;
    setLoadingAudio(true);
    try {
      const r: any = await getAudio({ data: { conversationId: row.conversation_id } });
      setAudioSrc(`data:${r.contentType};base64,${r.base64}`);
    } catch (e: any) {
      toast.error("Nie udało się pobrać audio", { description: e?.message });
    } finally {
      setLoadingAudio(false);
    }
  };

  const outcomeColor =
    row.call_outcome === "answered"
      ? "bg-green-600 text-white"
      : row.call_outcome === "no_answer" || row.call_outcome === "busy"
        ? "bg-amber-500 text-white"
        : row.call_outcome === "voicemail"
          ? "bg-blue-500 text-white"
          : row.call_outcome === "failed"
            ? "bg-red-600 text-white"
            : "";

  const statusBadgeVariant: "default" | "destructive" | "secondary" | "outline" =
    row.status === "blad"
      ? "destructive"
      : row.status === "wykonane" || row.status === "zakonczona"
        ? "default"
        : "secondary";

  const detail = q.data as { queue: any; comm: any } | undefined;
  const turns: any[] = detail?.comm?.metadata?.transcript_full || detail?.comm?.transcript || [];
  const turnsArr = Array.isArray(turns) ? turns : [];
  const summary = detail?.comm?.metadata?.summary || detail?.queue?.result_summary || null;
  const analysis = detail?.comm?.metadata?.analysis || null;

  return (
    <Card className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-muted/40 rounded-md"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{row.phone_normalized}</span>
            <Badge variant="outline" className="text-[10px]">
              {SOURCE_LABELS[row.source] ?? row.source ?? "—"}
            </Badge>
            {row.call_outcome_label && (
              <Badge className={`text-[10px] ${outcomeColor}`}>{row.call_outcome_label}</Badge>
            )}
            {row.duration_seconds != null && (
              <span className="text-xs text-muted-foreground">
                {fmtDuration(row.duration_seconds)}
              </span>
            )}
            {row.cost_credits != null && (
              <span className="text-xs text-muted-foreground">{fmtCost(row.cost_credits)}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Próby: {row.attempts} • Utworzono: {fmtPl(row.created_at)}
            {row.started_at && <> • Start: {fmtPl(row.started_at)}</>}
          </div>
          {row.result_summary && (
            <div className="text-xs mt-1 line-clamp-2">{row.result_summary}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={statusBadgeVariant}>{STATUS_LABELS[row.status] ?? row.status}</Badge>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t p-3 space-y-3 bg-muted/20">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {row.conversation_id && (
              <span className="text-muted-foreground">
                conv: <code>{row.conversation_id}</code>
              </span>
            )}
            {row.lead_id && (
              <Link
                to="/admin/klienci/$id"
                params={{ id: row.lead_id }}
                className="text-primary inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" /> Karta klienta
              </Link>
            )}
            {row.loan_application_id && (
              <Link
                to="/admin/wnioski/$id"
                params={{ id: row.loan_application_id }}
                className="text-primary inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" /> Wniosek
              </Link>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7"
              disabled={!row.conversation_id || mEnrich.isPending}
              onClick={(e) => {
                e.stopPropagation();
                mEnrich.mutate();
              }}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${mEnrich.isPending ? "animate-spin" : ""}`} />
              Odśwież
            </Button>
          </div>

          {q.isLoading && <div className="text-xs text-muted-foreground">Ładowanie…</div>}

          {summary && (
            <div className="text-sm bg-background rounded p-2 border">
              <div className="text-xs text-muted-foreground mb-1">Podsumowanie AI</div>
              <div className="whitespace-pre-wrap">{summary}</div>
            </div>
          )}

          {row.conversation_id && (
            <div>
              {audioSrc ? (
                <audio controls src={audioSrc} className="w-full" />
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleLoadAudio}
                  disabled={loadingAudio}
                >
                  <Play className="h-3 w-3 mr-1" />
                  {loadingAudio ? "Pobieram nagranie…" : "Odtwórz nagranie"}
                </Button>
              )}
            </div>
          )}

          {turnsArr.length > 0 && (
            <div className="space-y-1 max-h-96 overflow-y-auto bg-background rounded p-2 border">
              <div className="text-xs text-muted-foreground mb-1">
                Transkrypt ({turnsArr.length} wypowiedzi)
              </div>
              {turnsArr.map((t: any, i: number) => {
                const role = String(t.role ?? t.speaker ?? "agent").toLowerCase();
                const isUser =
                  role.includes("user") || role.includes("client") || role.includes("caller");
                const msg = t.message ?? t.text ?? t.content ?? "";
                if (!msg) return null;
                return (
                  <div key={i} className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && <Bot className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />}
                    <div
                      className={`text-xs rounded-lg px-2 py-1 max-w-[80%] whitespace-pre-wrap ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      {msg}
                    </div>
                    {isUser && <UserIcon className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}

          {analysis?.evaluation_criteria_results && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Kryteria oceny rozmowy
              </summary>
              <pre className="mt-1 whitespace-pre-wrap bg-background border rounded p-2">
                {JSON.stringify(analysis.evaluation_criteria_results, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
