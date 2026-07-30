import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { usePanelBase } from "@/lib/panel-base";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/labels";
import {
  PhoneCall,
  MessageSquare,
  Mail,
  MessageCircle,
  StickyNote,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

// Kompaktowy podgląd komunikacji z klientem (lead_communications) w widoku
// wniosku — dla operatora / admina. Wniosek łączymy z leadem po
// loan_application_id (i pomocniczo client_id), bo cała historia kanałów
// (voicebot, SMS, e-mail, Messenger, notatki) wisi na leadzie.

const channelLabel: Record<string, string> = {
  voicebot_call: "Rozmowa voicebot",
  sms: "SMS",
  email: "E-mail",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  manual_note: "Notatka",
};

const channelIcon: Record<string, LucideIcon> = {
  voicebot_call: PhoneCall,
  sms: MessageSquare,
  email: Mail,
  messenger: MessageCircle,
  whatsapp: MessageCircle,
  manual_note: StickyNote,
};

type Comm = {
  id: string;
  channel: string;
  direction: string;
  status: string | null;
  subject: string | null;
  content: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export function ClientCommsPreview({
  loanApplicationId,
  clientId,
  limit = 8,
}: {
  loanApplicationId: string;
  clientId?: string | null;
  limit?: number;
}) {
  const base = usePanelBase();
  const [loading, setLoading] = useState(true);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [comms, setComms] = useState<Comm[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const ors = [`loan_application_id.eq.${loanApplicationId}`];
      if (clientId) ors.push(`client_id.eq.${clientId}`);
      const { data: leads } = await supabase
        .from("leads")
        .select("id, created_at")
        .or(ors.join(","))
        .order("created_at", { ascending: false });
      const ids = (leads ?? []).map((l) => l.id);
      let rows: Comm[] = [];
      let count = 0;
      if (ids.length) {
        const { data, count: c } = await supabase
          .from("lead_communications")
          .select(
            "id, channel, direction, status, subject, content, duration_seconds, created_at",
            {
              count: "exact",
            },
          )
          .in("lead_id", ids)
          .order("created_at", { ascending: false })
          .limit(limit);
        rows = (data ?? []) as Comm[];
        count = c ?? rows.length;
      }
      if (cancelled) return;
      setLeadId(ids[0] ?? null);
      setComms(rows);
      setTotal(count);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loanApplicationId, clientId, limit]);

  return (
    <Card className="overflow-hidden border-primary/10 shadow-sm">
      <CardHeader className="bg-gradient-to-br from-primary/5 via-primary/[0.03] to-transparent pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-primary" />
            Komunikacja z klientem
            <Badge variant="outline" className="text-xs font-normal">
              {total}
            </Badge>
          </CardTitle>
          {leadId && (
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link to={`${base}/leady/${leadId}` as any}>
                Pełna historia
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Ładowanie…</div>
        ) : comms.length === 0 ? (
          <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
            {leadId
              ? "Brak zarejestrowanej komunikacji z klientem."
              : "Wniosek nie ma powiązanego leada — historia komunikacji jest niedostępna."}
          </div>
        ) : (
          <div className="divide-y">
            {comms.map((c) => {
              const Icon = channelIcon[c.channel] ?? MessageSquare;
              const excerpt = c.content?.trim() || null;
              return (
                <div key={c.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {channelLabel[c.channel] ?? c.channel}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {c.direction === "inbound" ? "od klienta" : "do klienta"}
                      </Badge>
                      {c.duration_seconds != null && <span>{c.duration_seconds}s</span>}
                      <span className="ml-auto whitespace-nowrap">
                        {formatDateTime(c.created_at)}
                      </span>
                    </div>
                    {c.subject && (
                      <div className="mt-0.5 truncate text-sm font-medium">{c.subject}</div>
                    )}
                    {excerpt && (
                      <div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {excerpt}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ClientCommsPreview;
