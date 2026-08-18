import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Archive,
  Download,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Mic,
} from "lucide-react";
import { exportCommsHistoryZip, getCommsExportStats } from "@/lib/comms-export.functions";

export const Route = createFileRoute("/admin/eksport-historii")({
  component: EksportHistoriiPage,
});

function EksportHistoriiPage() {
  const statsFn = useServerFn(getCommsExportStats);
  const exportFn = useServerFn(exportCommsHistoryZip);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const statsQ = useQuery({
    queryKey: ["comms-export-stats"],
    queryFn: () => statsFn(),
  });

  const download = async () => {
    setBusy(true);
    try {
      toast.info("Przygotowuję paczkę ZIP — przy pełnej historii może to chwilę potrwać…");
      const r = await exportFn({
        data: { from: from || undefined, to: to || undefined },
      });
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      const c = r.counts;
      toast.success(
        `Pobrano paczkę (${Math.round(r.byteSize / 1024)} KB): ${c.voice} rozmów, ${c.sms} SMS, ${c.email} maili, ${c.messenger} wiadomości Messenger, ${c.applications} wniosków.`,
      );
      if (c.skippedTranscripts) {
        toast.warning(
          `Pominięto ${c.skippedTranscripts} transkrypcji — paczka osiągnęła limit 60 MB. Zawęź zakres dat, by je pobrać.`,
        );
      }
    } catch (e) {
      toast.error((e as Error)?.message ?? "Nie udało się przygotować paczki.");
    } finally {
      setBusy(false);
    }
  };

  const s = statsQ.data;
  const stats = [
    { icon: Mic, label: "Rozmowy voicebota", value: s?.voice },
    { icon: MessageSquare, label: "SMS-y", value: s?.sms },
    { icon: Mail, label: "Maile (in/out)", value: s?.email },
    { icon: MessageCircle, label: "Messenger / IG", value: s?.messenger },
    { icon: FileText, label: "Wnioski (także częściowe)", value: s?.applications },
    { icon: Archive, label: "Pozostałe kontakty", value: (s?.other ?? 0) + (s?.legacy ?? 0) },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">Eksport historii komunikacji</h1>
        <p className="text-sm text-muted-foreground">
          Jedna paczka ZIP z pełną historią rozmów voicebota (z transkrypcjami), SMS-ów, maili i
          Messengera — zestawiona z wnioskami klientów, również uzupełnionymi częściowo.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div className="mt-2 text-2xl font-bold">{statsQ.isLoading ? "…" : (value ?? 0)}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pobierz paczkę</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="export-from">Od (opcjonalnie)</Label>
              <Input
                id="export-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="export-to">Do (opcjonalnie)</Label>
              <Input
                id="export-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={download} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Pobierz paczkę ZIP
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Zawartość paczki:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>
                <code>00-zestawienie-klientow.csv</code> — każdy lead z wnioskiem i licznikami
                kontaktów per kanał
              </li>
              <li>
                <code>01-wnioski.csv</code> — wszystkie wnioski z kompletnością, brakującymi polami
                i próbami kontaktu
              </li>
              <li>
                <code>02-voicebot-rozmowy.csv</code> + katalog <code>transkrypcje/</code> — pełne
                transkrypcje rozmów
              </li>
              <li>
                <code>03-sms.csv</code>, <code>04-email.csv</code>, <code>05-messenger.csv</code> —
                do kogo, kiedy i co (przychodzące i wychodzące)
              </li>
              <li>
                <code>06-pozostale-kanaly.csv</code>, <code>07-kontakty-archiwalne.csv</code> —
                czat, WhatsApp, telefony ręczne, notatki, starszy rejestr
              </li>
            </ul>
            <p className="mt-2">
              Zakres dat dotyczy komunikacji; wnioski i zestawienie klientów zawsze obejmują całą
              bazę. Nagrania audio nie są dołączane (dostępne w <code>/admin/voicebot</code>). Limit
              paczki: 60 MB.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
