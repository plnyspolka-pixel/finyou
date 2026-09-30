// Przygotowanie inwestora do wysyłki zgłoszeń w SI*GIIF — każdy inwestor
// wysyła zgłoszenia sam, własnym kwalifikowanym podpisem elektronicznym
// (lub kwalifikowaną pieczęcią swojej spółki). Przewodnik: 1) podpis,
// 2) rejestracja instytucji w SI*GIIF, 3) wysyłka zgłoszeń z modułu.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { setAmlGiifReadiness } from "@/lib/aml/aml-settings.functions";
import {
  NCCERT_URL,
  SI_GIIF_URL,
  type AmlGiifReadiness,
  type AmlInstitution,
  type AmlPerson,
} from "@/lib/aml/aml-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";

function Step({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      {done ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="space-y-1 text-sm">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground space-y-1">{children}</div>
      </div>
    </div>
  );
}

export function GiifReadinessGuide({
  readiness,
  institution,
  responsiblePerson,
  onChange,
  compactWhenReady = false,
}: {
  readiness: AmlGiifReadiness;
  institution?: AmlInstitution;
  responsiblePerson?: AmlPerson;
  onChange?: (r: AmlGiifReadiness) => void;
  /** Gdy wszystko gotowe — pokaż tylko jedną linię (np. na Przeglądzie). */
  compactWhenReady?: boolean;
}) {
  const save = useServerFn(setAmlGiifReadiness);
  const [busy, setBusy] = useState(false);
  const ready = readiness.hasQualifiedSignature && readiness.registeredInSiGiif;

  const update = async (next: AmlGiifReadiness) => {
    setBusy(true);
    try {
      const view = await save({ data: next });
      onChange?.(view.giifReadiness);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  };

  if (ready && compactWhenReady) {
    return (
      <Card className="border-emerald-300 dark:border-emerald-800">
        <CardContent className="py-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Gotowe do wysyłki zgłoszeń w SI*GIIF — masz podpis kwalifikowany i zarejestrowaną
          instytucję.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={ready ? undefined : "border-amber-300 dark:border-amber-700"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          Przygotowanie do wysyłki zgłoszeń (SI*GIIF)
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Zgłoszenia do GIIF wysyłasz sam, jako instytucja obowiązana — Finance You nie może ich
          podpisać za Ciebie. Zrób to zawczasu: zawiadomienie o podejrzeniu (art. 74) trzeba
          przekazać w ciągu 2 dni roboczych.
        </p>

        <Step done={readiness.hasQualifiedSignature} title="1. Kwalifikowany podpis elektroniczny">
          <p>
            Kupujesz go u kwalifikowanego dostawcy usług zaufania (lista w rejestrze{" "}
            <a href={NCCERT_URL} target="_blank" rel="noreferrer" className="underline">
              NCCert
            </a>
            , np. Certum, KIR, EuroCert, Cencert). Najwygodniejszy jest podpis zdalny (w chmurze,
            weryfikacja tożsamości online, bez czytnika). Orientacyjnie kosztuje kilkaset złotych za
            2 lata.
          </p>
          <p>
            Podpisuje osoba uprawniona do reprezentacji instytucji. Spółka może zamiast tego użyć
            kwalifikowanej pieczęci elektronicznej. Profil zaufany i podpis osobisty nie wystarczą.
          </p>
          <label className="flex items-center gap-2 pt-1 text-foreground">
            <Checkbox
              disabled={busy || readiness.registeredInSiGiif}
              checked={readiness.hasQualifiedSignature}
              onCheckedChange={(v) =>
                void update({ ...readiness, hasQualifiedSignature: Boolean(v) })
              }
            />
            Mam kwalifikowany podpis elektroniczny (lub pieczęć)
          </label>
        </Step>

        <Step done={readiness.registeredInSiGiif} title="2. Rejestracja instytucji w SI*GIIF">
          <p>
            Zaloguj się do{" "}
            <a
              href={SI_GIIF_URL}
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              SI*GIIF <ExternalLink className="h-3 w-3" />
            </a>
            , wypełnij formularz identyfikujący instytucję obowiązaną i podpisz go podpisem
            kwalifikowanym. Robisz to raz; zmiany danych zgłaszasz aktualizacją formularza.
          </p>
          {institution && (
            <div className="rounded-md bg-muted/50 p-2 text-xs">
              <p className="font-medium text-foreground">Dane do formularza (z Twojego profilu):</p>
              <p>
                {institution.name || "—"} · NIP {institution.nip || "—"}
                {institution.krs ? ` · KRS ${institution.krs}` : ""}
                {institution.regon ? ` · REGON ${institution.regon}` : ""}
              </p>
              <p>
                {[institution.address, institution.postalCode, institution.city]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
              {responsiblePerson && (
                <p>
                  Osoba odpowiedzialna: {responsiblePerson.firstName} {responsiblePerson.lastName}
                  {responsiblePerson.email ? ` · ${responsiblePerson.email}` : ""}
                  {responsiblePerson.phone ? ` · ${responsiblePerson.phone}` : ""}
                </p>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 pt-1 text-foreground">
            <Checkbox
              disabled={busy}
              checked={readiness.registeredInSiGiif}
              onCheckedChange={(v) =>
                void update({
                  hasQualifiedSignature: readiness.hasQualifiedSignature || Boolean(v),
                  registeredInSiGiif: Boolean(v),
                })
              }
            />
            Moja instytucja jest zarejestrowana w SI*GIIF
          </label>
        </Step>

        <Step done={ready} title="3. Wysyłka zgłoszeń">
          <p>
            W zakładce „Zgłoszenia GIIF” przygotujesz zgłoszenie, pobierzesz XML i PDF, wyślesz je w
            SI*GIIF i dołączysz UPO. Gdy wysyłka elektroniczna nie jest możliwa, możesz awaryjnie
            wysłać zawiadomienie papierowe.
          </p>
        </Step>
      </CardContent>
    </Card>
  );
}
