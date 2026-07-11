import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { AttachmentPreview } from "@/components/inbox/attachment-preview";
import { getLeadAttachmentUrls } from "@/lib/messenger-inbox.functions";

type Comm = {
  id: string;
  direction: string;
  subject: string | null;
  content: string | null;
  email: string | null;
  created_at: string;
  status: string | null;
  investor_id: string | null;
  attachments: any[] | null;
  metadata: any;
};

/**
 * Korespondencja z inwestorami dotycząca danego wniosku — wysłane oferty
 * i odpowiedzi instytucji (mapowane automatycznie przez webhook odbiorczy).
 */
export function InvestorCorrespondence({ applicationId }: { applicationId: string }) {
  const { data: comms } = useQuery({
    queryKey: ["investor-correspondence", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_communications")
        .select("id, direction, subject, content, email, created_at, status, investor_id, attachments, metadata")
        .eq("loan_application_id", applicationId)
        .eq("channel", "email")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Comm[];
    },
    refetchInterval: 60_000,
  });

  const investorIds = useMemo(
    () => Array.from(new Set((comms ?? []).map((c) => c.investor_id).filter(Boolean))) as string[],
    [comms],
  );
  const { data: investors } = useQuery({
    queryKey: ["investor-correspondence-investors", investorIds.join(",")],
    enabled: investorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investors")
        .select("id, first_name, last_name, company_name, investor_type")
        .in("id", investorIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const investorMap = useMemo(
    () => new Map((investors ?? []).map((i: any) => [i.id, i])),
    [investors],
  );

  // Podpisane URL-e do załączników (prywatny bucket).
  const attachFn = useServerFn(getLeadAttachmentUrls);
  const attachmentPaths = useMemo(() => {
    const paths: string[] = [];
    for (const c of comms ?? []) {
      for (const a of c.attachments ?? []) {
        if (a?.path && !paths.includes(a.path)) paths.push(a.path);
      }
    }
    return paths.slice(0, 50);
  }, [comms]);
  const { data: signedUrls } = useQuery({
    queryKey: ["investor-correspondence-urls", attachmentPaths.join("|")],
    enabled: attachmentPaths.length > 0,
    staleTime: 45 * 60_000,
    queryFn: async () => {
      const r = await attachFn({ data: { paths: attachmentPaths } });
      return r.urls as Record<string, string>;
    },
  });

  if (!comms || comms.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Korespondencja z inwestorami
        </CardTitle>
        <CardDescription>
          Oferty wysłane do inwestorów i ich odpowiedzi — mapowane automatycznie do tego wniosku.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {comms.map((c) => {
          const inbound = c.direction === "inbound";
          const inv = c.investor_id ? investorMap.get(c.investor_id) : null;
          const invLabel = inv
            ? (inv.company_name || `${inv.first_name ?? ""} ${inv.last_name ?? ""}`.trim())
            : ((c.metadata as any)?.investor_name ?? c.email ?? "Nieznany nadawca");
          return (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {inbound ? (
                  <Badge variant="secondary" className="gap-1">
                    <ArrowDownLeft className="h-3 w-3" /> Odpowiedź
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <ArrowUpRight className="h-3 w-3" /> Oferta wysłana
                  </Badge>
                )}
                <span className="font-medium">{invLabel}</span>
                {inv?.investor_type && (
                  <Badge variant="outline" className="text-[10px]">
                    {inv.investor_type === "instytucjonalny" ? "instytucja" : "prywatny"}
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString("pl-PL")}
                </span>
              </div>
              {c.subject && <div className="mt-1 text-sm font-semibold">{c.subject}</div>}
              {c.content && (
                <div className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground line-clamp-6">
                  {c.content.slice(0, 1200)}
                </div>
              )}
              {(c.attachments?.length ?? 0) > 0 && (
                <div className="mt-2">
                  <AttachmentPreview
                    attachments={(c.attachments ?? []).map((a: any) => ({
                      ...a,
                      url: a?.path ? signedUrls?.[a.path] ?? undefined : a?.url,
                    }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
