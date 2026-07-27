import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, ThumbsUp, ThumbsDown, Search } from "lucide-react";
import {
  loanStatusLabels,
  formatPLN,
  formatDateTime,
  propertyTypeLabels,
  contactChannelLabels,
  contactDirectionLabels,
} from "@/lib/labels";
import { normalizeLoanStatus } from "@/lib/loan-status";
import { useAuth } from "@/hooks/use-auth";
import { leadSourceLabel } from "@/lib/lead-source";

import { RiskAssessmentSection } from "@/components/risk-assessment/risk-assessment-section";
import { KwContentSection } from "@/components/kw-content-section";
import { KwAnalysisSection } from "@/components/kw-analysis/kw-analysis-section";
import { LocationScoringSection } from "@/components/location-scoring/location-scoring-section";
import { KwPotentialBadge } from "@/components/location-scoring/kw-potential-badge";
import { ApplicationInfoBadges } from "@/components/application-info-badges";
import { FileThumb } from "@/components/media/FileThumb";
import { ClientFilesManager } from "@/components/media/ClientFilesManager";
import { EditableField } from "@/components/admin/EditableField";
import { signStoragePath } from "@/lib/property-photos";
import { CLIENT_FILES_LABEL } from "@/lib/storage-buckets";

export const Route = createFileRoute("/admin/wnioski/$id")({
  component: WniosekDetail,
});

// Etykiety kanałów/kierunków z lead_communications (inne wartości niż contact_events).
const commChannelLabels: Record<string, string> = {
  messenger: "Messenger",
  instagram: "Instagram",
  email: "E-mail",
  sms: "SMS",
  phone: "Telefon",
  call: "Telefon",
  voicebot: "Voicebot",
  whatsapp: "WhatsApp",
};
const commDirectionLabels: Record<string, string> = {
  inbound: "Przychodzący",
  outbound: "Wychodzący",
};

function WniosekDetail() {
  const { id } = Route.useParams();
  const { roles } = useAuth();
  const isAdmin = roles.includes("administrator");
  const [app, setApp] = useState<any | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [comms, setComms] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<any[]>([]);
  const [tabValue, setTabValue] = useState<string>(() => {
    if (typeof window === "undefined") return "dane";
    try {
      return sessionStorage.getItem(`wniosek-tab:${id}`) || "dane";
    } catch {
      return "dane";
    }
  });
  const [contact, setContact] = useState({
    channel: "telefon",
    direction: "wychodzacy",
    subject: "",
    content: "",
  });
  const [reason, setReason] = useState("");

  const load = async () => {
    const [a, c, d, o, au, am, di] = await Promise.all([
      supabase
        .from("loan_applications")
        .select("*, client:clients(*), properties(*)")
        .eq("id", id)
        .single(),
      supabase
        .from("contact_events")
        .select("*")
        .eq("loan_application_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("*")
        .eq("loan_application_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("investor_offers")
        .select("*, investor:investors(first_name,last_name,company_name)")
        .eq("loan_application_id", id),
      supabase
        .from("audit_logs")
        .select("*")
        .eq("object_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("automation_events")
        .select("*")
        .eq("loan_application_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("offer_distributions")
        .select("*, investor:investors(first_name,last_name,company_name)")
        .eq("loan_application_id", id),
    ]);
    setApp(a.data);
    setContacts(c.data ?? []);
    setDocs(d.data ?? []);
    setOffers(o.data ?? []);
    setAudit(au.data ?? []);
    setAutomations(am.data ?? []);
    setDistributions(di.data ?? []);

    // Historia kontaktu obejmuje też komunikację z fazy leada (Messenger/IG,
    // e-mail, SMS, voicebot) — także dopasowaną po telefonie/mailu klienta,
    // bo Messenger/IG często ląduje na osobnym leadzie bez loan_application_id.
    const client = (a.data as any)?.client;
    const { data: leadRows } = await supabase
      .from("leads")
      .select("id")
      .eq("loan_application_id", id);
    const leadIds = (leadRows ?? []).map((l: any) => l.id);

    const orParts: string[] = [];
    if (leadIds.length > 0) orParts.push(`lead_id.in.(${leadIds.join(",")})`);
    if (client?.phone) orParts.push(`phone_normalized.eq.${client.phone}`);
    if (client?.email) orParts.push(`email.eq.${client.email}`);

    if (orParts.length > 0) {
      const { data: lc } = await supabase
        .from("lead_communications")
        .select(
          "id, channel, direction, subject, content, created_at, status, attachments, recording_url",
        )
        .or(orParts.join(","))
        .order("created_at", { ascending: false })
        .limit(1000);
      const seen = new Set<string>();
      setComms((lc ?? []).filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true))));
    } else {
      setComms([]);
    }
  };
  useEffect(() => {
    void load();
  }, [id]);

  const changeStatus = async (newStatus: string) => {
    const prev = app?.status;
    const { error } = await supabase
      .from("loan_applications")
      .update({ status: newStatus as any })
      .eq("id", id);
    if (error) {
      toast.error("Błąd", { description: error.message });
      return;
    }
    await supabase.from("audit_logs").insert({
      object_type: "loan_application",
      object_id: id,
      action: "status_change",
      previous_value: { status: prev },
      new_value: { status: newStatus },
    });
    toast.success("Zmieniono status");
    void load();
  };

  const setDecision = async (
    decision: "szukamy_inwestora" | "zamkniete" | "kompletowanie_danych",
  ) => {
    const legacyDecision =
      decision === "szukamy_inwestora"
        ? "rokuje"
        : decision === "zamkniete"
          ? "nie_rokuje"
          : "do_analizy";
    const { error } = await supabase
      .from("loan_applications")
      .update({
        status: decision,
        admin_decision: legacyDecision,
        decision_reason: reason || null,
        decision_at: new Date().toISOString(),
        available_to_investors: decision === "szukamy_inwestora",
      })
      .eq("id", id);
    if (error) {
      toast.error("Błąd", { description: error.message });
      return;
    }
    toast.success("Zapisano decyzję");
    setReason("");
    void load();
  };

  const addContact = async () => {
    if (!contact.content) {
      toast.error("Wpisz treść");
      return;
    }
    const { error } = await supabase.from("contact_events").insert({
      loan_application_id: id,
      client_id: app?.client_id,
      channel: contact.channel as any,
      direction: contact.direction as any,
      subject: contact.subject || null,
      content: contact.content,
      completed_at: new Date().toISOString(),
    });
    if (error) {
      toast.error("Błąd", { description: error.message });
      return;
    }
    setContact({ channel: "telefon", direction: "wychodzacy", subject: "", content: "" });
    toast.success("Dodano zdarzenie");
    void load();
  };

  if (!app) return <div className="text-muted-foreground">Ładowanie…</div>;
  const c = app.client;
  const p = app.properties?.[0];

  return (
    <div className="space-y-6">
      <Link
        to="/admin/klienci"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Wróć
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{c ? `${c.first_name} ${c.last_name}` : "Wniosek"}</h1>
          <p className="text-sm text-muted-foreground">
            ID: {app.id} · Utworzono: {formatDateTime(app.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{loanStatusLabels[app.status] ?? app.status}</Badge>
          <Select value={normalizeLoanStatus(app.status)} onValueChange={changeStatus}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(loanStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ApplicationInfoBadges app={app} client={c} loanApplicationId={id} />

      <Tabs
        value={tabValue}
        onValueChange={(v) => {
          setTabValue(v);
          try {
            sessionStorage.setItem(`wniosek-tab:${id}`, v);
          } catch {}
        }}
      >
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dane">Dane</TabsTrigger>
          <TabsTrigger value="nieruchomosc">Nieruchomość</TabsTrigger>
          <TabsTrigger value="analiza-kw">Analiza KW</TabsTrigger>
          <TabsTrigger value="lokalizacja">Lokalizacja</TabsTrigger>
          <TabsTrigger value="ryzyko">Ocena ryzyka</TabsTrigger>
          <TabsTrigger value="dokumenty">
            {CLIENT_FILES_LABEL} ({docs.length})
          </TabsTrigger>
          <TabsTrigger value="kontakt">
            Historia kontaktu ({contacts.length + comms.length})
          </TabsTrigger>
          <TabsTrigger value="selekcja">Selekcja</TabsTrigger>
          <TabsTrigger value="dystrybucja">Dystrybucja ({distributions.length})</TabsTrigger>
          <TabsTrigger value="oferty">Oferty ({offers.length})</TabsTrigger>
          <TabsTrigger value="automatyzacje">Automatyzacje ({automations.length})</TabsTrigger>
          <TabsTrigger value="historia">Historia zmian ({audit.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dane" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Dane klienta</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {c ? (
                  <>
                    <EditableField
                      label="Imię"
                      value={c.first_name}
                      table="clients"
                      rowId={c.id}
                      column="first_name"
                      onSaved={load}
                    />
                    <EditableField
                      label="Nazwisko"
                      value={c.last_name}
                      table="clients"
                      rowId={c.id}
                      column="last_name"
                      onSaved={load}
                    />
                    <EditableField
                      label="PESEL"
                      value={c.pesel}
                      table="clients"
                      rowId={c.id}
                      column="pesel"
                      onSaved={load}
                    />
                    <EditableField
                      label="Telefon"
                      value={c.phone}
                      table="clients"
                      rowId={c.id}
                      column="phone"
                      type="tel"
                      onSaved={load}
                    />
                    <EditableField
                      label="E-mail"
                      value={c.email}
                      table="clients"
                      rowId={c.id}
                      column="email"
                      type="email"
                      onSaved={load}
                    />
                    <div>
                      <span className="text-muted-foreground">Źródło:</span>{" "}
                      <span title={c?.source ?? undefined}>{leadSourceLabel(c?.source)}</span>
                    </div>
                    <div className="pt-1 border-t mt-2">
                      <div className="text-muted-foreground text-xs mb-1">Zgody</div>
                      <EditableField
                        label="RODO"
                        value={c.consent_rodo}
                        table="clients"
                        rowId={c.id}
                        column="consent_rodo"
                        type="bool"
                        display={(v) => (v ? "✓" : "✗")}
                        onSaved={load}
                      />
                      <EditableField
                        label="E-mail"
                        value={c.consent_email}
                        table="clients"
                        rowId={c.id}
                        column="consent_email"
                        type="bool"
                        display={(v) => (v ? "✓" : "✗")}
                        onSaved={load}
                      />
                      <EditableField
                        label="Telefon"
                        value={c.consent_phone}
                        table="clients"
                        rowId={c.id}
                        column="consent_phone"
                        type="bool"
                        display={(v) => (v ? "✓" : "✗")}
                        onSaved={load}
                      />
                      <EditableField
                        label="SMS"
                        value={c.consent_sms}
                        table="clients"
                        rowId={c.id}
                        column="consent_sms"
                        type="bool"
                        display={(v) => (v ? "✓" : "✗")}
                        onSaved={load}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Brak danych klienta.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Wniosek</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <EditableField
                  label="Kwota (PLN)"
                  value={app.loan_amount}
                  table="loan_applications"
                  rowId={app.id}
                  column="loan_amount"
                  type="number"
                  display={(v) => <b>{formatPLN(v as number)}</b>}
                  onSaved={load}
                />
                {p ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <EditableField
                      label="Numer KW"
                      value={p.land_register_number}
                      table="properties"
                      rowId={p.id}
                      column="land_register_number"
                      onSaved={load}
                    />
                    {p.land_register_number && (
                      <KwPotentialBadge
                        applicationId={id}
                        kwNumber={p.land_register_number}
                        propertyType={p.property_type}
                      />
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="text-muted-foreground">Numer KW:</span> —
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="nieruchomosc" className="space-y-4">
          {p ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{propertyTypeLabels[p.property_type] ?? p.property_type}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <EditableField
                    label="Adres"
                    value={p.address}
                    table="properties"
                    rowId={p.id}
                    column="address"
                    onSaved={load}
                  />
                  <EditableField
                    label="Miasto"
                    value={p.city}
                    table="properties"
                    rowId={p.id}
                    column="city"
                    onSaved={load}
                  />
                  <EditableField
                    label="Województwo"
                    value={p.voivodeship}
                    table="properties"
                    rowId={p.id}
                    column="voivodeship"
                    onSaved={load}
                  />
                  <EditableField
                    label="Powierzchnia (m²)"
                    value={p.area_sqm}
                    table="properties"
                    rowId={p.id}
                    column="area_sqm"
                    type="number"
                    display={(v) => (v ? `${v} m²` : "—")}
                    onSaved={load}
                  />
                  <EditableField
                    label="Szacowana wartość"
                    value={p.estimated_value}
                    table="properties"
                    rowId={p.id}
                    column="estimated_value"
                    type="number"
                    display={(v) => formatPLN(v as number)}
                    onSaved={load}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <EditableField
                      label="Numer KW"
                      value={p.land_register_number}
                      table="properties"
                      rowId={p.id}
                      column="land_register_number"
                      onSaved={load}
                    />
                    {p.land_register_number && (
                      <KwPotentialBadge
                        applicationId={id}
                        kwNumber={p.land_register_number}
                        propertyType={p.property_type}
                      />
                    )}
                  </div>
                  <EditableField
                    label="Hipoteka"
                    value={p.has_mortgage}
                    table="properties"
                    rowId={p.id}
                    column="has_mortgage"
                    type="bool"
                    display={(v) => (v ? "Tak" : "Nie")}
                    onSaved={load}
                  />
                  <EditableField
                    label="Współwłaściciele"
                    value={p.has_co_owners}
                    table="properties"
                    rowId={p.id}
                    column="has_co_owners"
                    type="bool"
                    display={(v) => (v ? "Tak" : "Nie")}
                    onSaved={load}
                  />
                  <EditableField
                    label="Opis"
                    value={p.description}
                    table="properties"
                    rowId={p.id}
                    column="description"
                    onSaved={load}
                  />
                </CardContent>
              </Card>
              <KwContentSection applicationId={id} canFetch showKwNumber canImportOcr={isAdmin} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Brak danych o nieruchomości.</p>
          )}
        </TabsContent>

        <TabsContent value="analiza-kw" className="space-y-4">
          <KwAnalysisSection
            loanApplicationId={id}
            defaultKwNumber={p?.land_register_number ?? ""}
            defaultPropertyValue={p?.estimated_value ?? null}
            defaultLoanExposure={app.loan_amount ?? null}
          />
        </TabsContent>

        <TabsContent value="lokalizacja" className="space-y-4">
          <LocationScoringSection
            applicationId={id}
            kwNumber={p?.land_register_number ?? null}
            propertyType={p?.property_type ?? null}
          />
        </TabsContent>

        <TabsContent value="ryzyko" className="space-y-4">
          <RiskAssessmentSection applicationId={id} />
        </TabsContent>

        <TabsContent value="dokumenty">
          <ClientFilesManager loanApplicationId={id} onChanged={() => void load()} />
        </TabsContent>

        <TabsContent value="kontakt" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dodaj zdarzenie</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Select
                value={contact.channel}
                onValueChange={(v) => setContact({ ...contact, channel: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(contactChannelLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={contact.direction}
                onValueChange={(v) => setContact({ ...contact, direction: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(contactDirectionLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Temat"
                value={contact.subject}
                onChange={(e) => setContact({ ...contact, subject: e.target.value })}
                className="md:col-span-2"
              />
              <Textarea
                placeholder="Treść notatki / podsumowanie rozmowy"
                value={contact.content}
                onChange={(e) => setContact({ ...contact, content: e.target.value })}
                className="md:col-span-4"
              />
              <Button onClick={addContact} className="md:col-span-1">
                Dodaj
              </Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {[
              ...contacts.map((e) => ({ ...e, _kind: "event" as const })),
              ...comms.map((c) => ({ ...c, _kind: "comm" as const })),
            ]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((e) => (
                <Card key={`${e._kind}-${e.id}`}>
                  <CardContent className="py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {(e._kind === "event"
                          ? contactChannelLabels[e.channel]
                          : commChannelLabels[e.channel]) ?? e.channel}
                      </Badge>
                      <Badge variant="outline">
                        {(e._kind === "event"
                          ? contactDirectionLabels[e.direction]
                          : commDirectionLabels[e.direction]) ?? e.direction}
                      </Badge>
                      {e._kind === "comm" && (
                        <Badge variant="secondary" className="text-[10px]">
                          z rozmowy (lead)
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDateTime(e.created_at)}
                      </span>
                    </div>
                    {e.subject && <div className="font-medium mt-1">{e.subject}</div>}
                    {e.content && (
                      <div className="text-muted-foreground mt-1 whitespace-pre-wrap">
                        {e.content}
                      </div>
                    )}
                    {e._kind === "comm" &&
                      Array.isArray(e.attachments) &&
                      e.attachments.length > 0 && (
                        <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {e.attachments.map((att: any, i: number) => {
                            const path = att?.storage_path ?? att?.path;
                            const url = att?.url ?? att?.public_url;
                            if (!path && !url) return null;
                            return (
                              <FileThumb
                                key={i}
                                path={path ?? url}
                                name={att?.name ?? att?.file_name ?? `plik-${i + 1}`}
                                thumbnailPath={att?.thumbnail_path ?? null}
                                aspect="square"
                                onClick={async () => {
                                  const u =
                                    url ?? (path ? await signStoragePath(path, 3600) : null);
                                  if (u) window.open(u, "_blank", "noopener");
                                }}
                              />
                            );
                          })}
                        </div>
                      )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="selekcja">
          <Card>
            <CardHeader>
              <CardTitle>Decyzja administratora</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Moduł AI selekcji: <Badge variant="outline">Wyłączony (placeholder)</Badge>
              </div>
              <Label>Uzasadnienie (opcjonalne)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Uzasadnij decyzję…"
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => setDecision("szukamy_inwestora")}
                  className="bg-emerald-600 hover:bg-emerald-600/90"
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Rokuje → do inwestorów
                </Button>
                <Button onClick={() => setDecision("zamkniete")} variant="destructive">
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Nie rokuje → zamknij
                </Button>
                <Button onClick={() => setDecision("kompletowanie_danych")} variant="outline">
                  <Search className="mr-2 h-4 w-4" />
                  Wróć do kompletowania
                </Button>
              </div>
              {app.decision_reason && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Ostatnie uzasadnienie:</span>{" "}
                  {app.decision_reason}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dystrybucja">
          {distributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Wniosek nie został jeszcze rozesłany.</p>
          ) : (
            <div className="space-y-2">
              {distributions.map((d) => (
                <Card key={d.id}>
                  <CardContent className="py-3 text-sm flex items-center justify-between">
                    <div>
                      {d.investor?.company_name ??
                        `${d.investor?.first_name ?? ""} ${d.investor?.last_name ?? ""}`.trim()}
                    </div>
                    <Badge variant="secondary">{d.distribution_status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="oferty">
          {offers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak ofert.</p>
          ) : (
            <div className="space-y-2">
              {offers.map((o) => (
                <Card key={o.id}>
                  <CardContent className="py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">
                        {o.investor?.company_name ??
                          `${o.investor?.first_name ?? ""} ${o.investor?.last_name ?? ""}`.trim()}
                      </div>
                      <Badge variant="secondary">{o.offer_status}</Badge>
                    </div>
                    <div className="text-muted-foreground mt-1">
                      Kwota: {formatPLN(o.proposed_amount)} · Okres: {o.period_months} mies. · Zysk:{" "}
                      {o.expected_yearly_yield ?? "—"}%
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="automatyzacje">
          {automations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zdarzeń.</p>
          ) : (
            <div className="space-y-2">
              {automations.map((a) => (
                <Card key={a.id}>
                  <CardContent className="py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{a.automation_type}</div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(a.created_at)}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Status: {a.status ?? "—"} {a.error_message && `· Błąd: ${a.error_message}`}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historia">
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wpisów.</p>
          ) : (
            <div className="space-y-2">
              {audit.map((a) => (
                <Card key={a.id}>
                  <CardContent className="py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{a.action}</div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(a.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {JSON.stringify(a.new_value)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
