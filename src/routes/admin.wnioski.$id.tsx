import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, ThumbsUp, ThumbsDown, Search } from "lucide-react";
import { loanStatusLabels, formatPLN, formatDate, formatDateTime, propertyTypeLabels, contactChannelLabels, contactDirectionLabels } from "@/lib/labels";
import { PropertyLocationAnalysis } from "@/components/property-location-analysis";
import { CollateralAnalysisSection } from "@/components/property-analysis/collateral-analysis-section";
import { KwContentSection } from "@/components/kw-content-section";
import { ApplicationInfoBadges } from "@/components/application-info-badges";

export const Route = createFileRoute("/admin/wnioski/$id")({
  component: WniosekDetail,
});

function WniosekDetail() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<any | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<any[]>([]);
  const [contact, setContact] = useState({ channel: "telefon", direction: "wychodzacy", subject: "", content: "" });
  const [reason, setReason] = useState("");

  const load = async () => {
    const [a, c, d, o, au, am, di] = await Promise.all([
      supabase.from("loan_applications").select("*, client:clients(*), properties(*)").eq("id", id).single(),
      supabase.from("contact_events").select("*").eq("loan_application_id", id).order("created_at", { ascending: false }),
      supabase.from("documents").select("*").eq("loan_application_id", id).order("created_at", { ascending: false }),
      supabase.from("investor_offers").select("*, investor:investors(first_name,last_name,company_name)").eq("loan_application_id", id),
      supabase.from("audit_logs").select("*").eq("object_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("automation_events").select("*").eq("loan_application_id", id).order("created_at", { ascending: false }),
      supabase.from("offer_distributions").select("*, investor:investors(first_name,last_name,company_name)").eq("loan_application_id", id),
    ]);
    setApp(a.data); setContacts(c.data ?? []); setDocs(d.data ?? []); setOffers(o.data ?? []);
    setAudit(au.data ?? []); setAutomations(am.data ?? []); setDistributions(di.data ?? []);
  };
  useEffect(() => { void load(); }, [id]);

  const changeStatus = async (newStatus: string) => {
    const prev = app?.status;
    const { error } = await supabase.from("loan_applications").update({ status: newStatus as any }).eq("id", id);
    if (error) { toast.error("Błąd", { description: error.message }); return; }
    await supabase.from("audit_logs").insert({ object_type: "loan_application", object_id: id, action: "status_change", previous_value: { status: prev }, new_value: { status: newStatus } });
    toast.success("Zmieniono status"); void load();
  };

  const setDecision = async (decision: "szukamy_inwestora" | "zamkniete" | "kompletowanie_danych") => {
    const legacyDecision = decision === "szukamy_inwestora" ? "rokuje" : decision === "zamkniete" ? "nie_rokuje" : "do_analizy";
    const { error } = await supabase.from("loan_applications").update({
      status: decision, admin_decision: legacyDecision, decision_reason: reason || null, decision_at: new Date().toISOString(),
      available_to_investors: decision === "szukamy_inwestora",
    }).eq("id", id);
    if (error) { toast.error("Błąd", { description: error.message }); return; }
    toast.success("Zapisano decyzję"); setReason(""); void load();
  };


  const addContact = async () => {
    if (!contact.content) { toast.error("Wpisz treść"); return; }
    const { error } = await supabase.from("contact_events").insert({
      loan_application_id: id, client_id: app?.client_id, channel: contact.channel as any,
      direction: contact.direction as any, subject: contact.subject || null, content: contact.content, completed_at: new Date().toISOString(),
    });
    if (error) { toast.error("Błąd", { description: error.message }); return; }
    setContact({ channel: "telefon", direction: "wychodzacy", subject: "", content: "" });
    toast.success("Dodano zdarzenie"); void load();
  };

  if (!app) return <div className="text-muted-foreground">Ładowanie…</div>;
  const c = app.client; const p = app.properties?.[0];

  return (
    <div className="space-y-6">
      <Link to="/admin/klienci" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /> Wróć</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{c ? `${c.first_name} ${c.last_name}` : "Wniosek"}</h1>
          <p className="text-sm text-muted-foreground">ID: {app.id} · Utworzono: {formatDateTime(app.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{loanStatusLabels[app.status] ?? app.status}</Badge>
          <Select value={app.status} onValueChange={changeStatus}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(loanStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <ApplicationInfoBadges app={app} client={c} loanApplicationId={id} />

      <Tabs defaultValue="dane">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dane">Dane</TabsTrigger>
          <TabsTrigger value="nieruchomosc">Nieruchomość</TabsTrigger>
          <TabsTrigger value="zabezpieczenie">Zabezpieczenie</TabsTrigger>
          <TabsTrigger value="dokumenty">Dokumenty ({docs.length})</TabsTrigger>
          <TabsTrigger value="kontakt">Historia kontaktu ({contacts.length})</TabsTrigger>
          <TabsTrigger value="selekcja">Selekcja</TabsTrigger>
          <TabsTrigger value="dystrybucja">Dystrybucja ({distributions.length})</TabsTrigger>
          <TabsTrigger value="oferty">Oferty ({offers.length})</TabsTrigger>
          <TabsTrigger value="automatyzacje">Automatyzacje ({automations.length})</TabsTrigger>
          <TabsTrigger value="historia">Historia zmian ({audit.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dane" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle>Dane klienta</CardTitle></CardHeader><CardContent className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Imię i nazwisko:</span> <b>{c?.first_name} {c?.last_name}</b></div>
              <div><span className="text-muted-foreground">Telefon:</span> {c?.phone ?? "—"}</div>
              <div><span className="text-muted-foreground">E-mail:</span> {c?.email ?? "—"}</div>
              <div><span className="text-muted-foreground">Źródło:</span> {c?.source ?? "—"}</div>
              <div><span className="text-muted-foreground">Zgody:</span> RODO {c?.consent_rodo ? "✓" : "✗"} · e-mail {c?.consent_email ? "✓" : "✗"} · tel {c?.consent_phone ? "✓" : "✗"} · SMS {c?.consent_sms ? "✓" : "✗"}</div>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Wniosek</CardTitle></CardHeader><CardContent className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Kwota:</span> <b>{formatPLN(app.loan_amount)}</b></div>
              <div><span className="text-muted-foreground">Okres:</span> {app.preferred_period_months ? `${app.preferred_period_months} mies.` : "—"}</div>
              <div><span className="text-muted-foreground">Szybka decyzja:</span> {app.fast_decision ? "Tak" : "Nie"}</div>
              <div><span className="text-muted-foreground">Kompletność:</span> {app.completeness_percent}%</div>
              <div><span className="text-muted-foreground">LTV:</span> {app.estimated_ltv ?? "—"}</div>
              <div><span className="text-muted-foreground">Sytuacja:</span> {app.situation_description ?? "—"}</div>
            </CardContent></Card>
          </div>
        </TabsContent>
        <TabsContent value="nieruchomosc" className="space-y-4">
          {p ? (
            <>
              <Card><CardHeader><CardTitle>{propertyTypeLabels[p.property_type] ?? p.property_type}</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Adres:</span> {[p.address, p.city, p.voivodeship].filter(Boolean).join(", ") || "—"}</div>
                  <div><span className="text-muted-foreground">Powierzchnia:</span> {p.area_sqm ? `${p.area_sqm} m²` : "—"}</div>
                  <div><span className="text-muted-foreground">Szacowana wartość:</span> {formatPLN(p.estimated_value)}</div>
                  <div><span className="text-muted-foreground">KW:</span> {p.land_register_number ?? "—"}</div>
                  <div><span className="text-muted-foreground">Hipoteka:</span> {p.has_mortgage ? "Tak" : "Nie"} · Współwłaściciele: {p.has_co_owners ? "Tak" : "Nie"}</div>
                  <div><span className="text-muted-foreground">Opis:</span> {p.description ?? "—"}</div>
                </CardContent>
              </Card>
              <PropertyLocationAnalysis
                propertyAddress={[p.address, p.street].filter(Boolean).join(" ") || p.address}
                city={p.city}
                postalCode={p.postal_code}
                propertyType={p.property_type}
              />
              <KwContentSection applicationId={id} canFetch showKwNumber />
            </>
          ) : <p className="text-sm text-muted-foreground">Brak danych o nieruchomości.</p>}
        </TabsContent>

        <TabsContent value="zabezpieczenie" className="space-y-4">
          <CollateralAnalysisSection applicationId={id} />
        </TabsContent>



        <TabsContent value="dokumenty">
          {docs.length === 0 ? <p className="text-sm text-muted-foreground">Brak dokumentów.</p> :
            <div className="space-y-2">{docs.map((d) => (
              <Card key={d.id}><CardContent className="py-3 text-sm flex items-center justify-between">
                <div><div className="font-medium">{d.file_name}</div><div className="text-xs text-muted-foreground">{d.document_type} · {formatDate(d.created_at)}</div></div>
                {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Pobierz</a>}
              </CardContent></Card>
            ))}</div>}
        </TabsContent>

        <TabsContent value="kontakt" className="space-y-4">
          <Card><CardHeader><CardTitle>Dodaj zdarzenie</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Select value={contact.channel} onValueChange={(v) => setContact({ ...contact, channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(contactChannelLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={contact.direction} onValueChange={(v) => setContact({ ...contact, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(contactDirectionLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Temat" value={contact.subject} onChange={(e) => setContact({ ...contact, subject: e.target.value })} className="md:col-span-2" />
              <Textarea placeholder="Treść notatki / podsumowanie rozmowy" value={contact.content} onChange={(e) => setContact({ ...contact, content: e.target.value })} className="md:col-span-4" />
              <Button onClick={addContact} className="md:col-span-1">Dodaj</Button>
            </CardContent></Card>
          <div className="space-y-2">
            {contacts.map((e) => (
              <Card key={e.id}><CardContent className="py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{contactChannelLabels[e.channel]}</Badge>
                  <Badge variant="outline">{contactDirectionLabels[e.direction]}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(e.created_at)}</span>
                </div>
                {e.subject && <div className="font-medium mt-1">{e.subject}</div>}
                {e.content && <div className="text-muted-foreground mt-1">{e.content}</div>}
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="selekcja">
          <Card><CardHeader><CardTitle>Decyzja administratora</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">Moduł AI selekcji: <Badge variant="outline">Wyłączony (placeholder)</Badge></div>
              <Label>Uzasadnienie (opcjonalne)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Uzasadnij decyzję…" />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => setDecision("szukamy_inwestora")} className="bg-emerald-600 hover:bg-emerald-600/90"><ThumbsUp className="mr-2 h-4 w-4" />Rokuje → do inwestorów</Button>
                <Button onClick={() => setDecision("zamkniete")} variant="destructive"><ThumbsDown className="mr-2 h-4 w-4" />Nie rokuje → zamknij</Button>
                <Button onClick={() => setDecision("kompletowanie_danych")} variant="outline"><Search className="mr-2 h-4 w-4" />Wróć do kompletowania</Button>

              </div>
              {app.decision_reason && <p className="text-sm"><span className="text-muted-foreground">Ostatnie uzasadnienie:</span> {app.decision_reason}</p>}
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="dystrybucja">
          {distributions.length === 0 ? <p className="text-sm text-muted-foreground">Wniosek nie został jeszcze rozesłany.</p> :
            <div className="space-y-2">{distributions.map((d) => (
              <Card key={d.id}><CardContent className="py-3 text-sm flex items-center justify-between">
                <div>{d.investor?.company_name ?? `${d.investor?.first_name ?? ""} ${d.investor?.last_name ?? ""}`.trim()}</div>
                <Badge variant="secondary">{d.distribution_status}</Badge>
              </CardContent></Card>
            ))}</div>}
        </TabsContent>

        <TabsContent value="oferty">
          {offers.length === 0 ? <p className="text-sm text-muted-foreground">Brak ofert.</p> :
            <div className="space-y-2">{offers.map((o) => (
              <Card key={o.id}><CardContent className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{o.investor?.company_name ?? `${o.investor?.first_name ?? ""} ${o.investor?.last_name ?? ""}`.trim()}</div>
                  <Badge variant="secondary">{o.offer_status}</Badge>
                </div>
                <div className="text-muted-foreground mt-1">Kwota: {formatPLN(o.proposed_amount)} · Okres: {o.period_months} mies. · Zysk: {o.expected_yearly_yield ?? "—"}%</div>
              </CardContent></Card>
            ))}</div>}
        </TabsContent>

        <TabsContent value="automatyzacje">
          {automations.length === 0 ? <p className="text-sm text-muted-foreground">Brak zdarzeń.</p> :
            <div className="space-y-2">{automations.map((a) => (
              <Card key={a.id}><CardContent className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{a.automation_type}</div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                </div>
                <div className="text-muted-foreground">Status: {a.status ?? "—"} {a.error_message && `· Błąd: ${a.error_message}`}</div>
              </CardContent></Card>
            ))}</div>}
        </TabsContent>

        <TabsContent value="historia">
          {audit.length === 0 ? <p className="text-sm text-muted-foreground">Brak wpisów.</p> :
            <div className="space-y-2">{audit.map((a) => (
              <Card key={a.id}><CardContent className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{a.action}</div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{JSON.stringify(a.new_value)}</div>
              </CardContent></Card>
            ))}</div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
