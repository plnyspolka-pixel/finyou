import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientProfileSections } from "@/components/client/ClientProfileSections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Building2, Rocket, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/klient/profil")({
  component: KlientProfil,
});

type CompanyChoice = "none" | "have" | "starting";

function KlientProfil() {
  const [choice, setChoice] = useState<CompanyChoice>("none");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Dane osobowe i kontaktowe</h1>
        <p className="text-sm text-muted-foreground">
          Zaktualizuj swoje dane — imię, nazwisko, e-mail, telefon i adres.
        </p>
      </div>
      <ClientProfileSections onlyPersonal includePersonal showPasswordCard={false} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Działalność gospodarcza
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Wszystkie pożyczki na portalu są pożyczkami na działalność gospodarczą. Do{" "}
            <strong>złożenia</strong> wniosku firma nie jest wymagana, ale do{" "}
            <strong>uruchomienia</strong> pożyczki musisz podać numer NIP.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={choice} onValueChange={(v) => setChoice(v as CompanyChoice)}>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value="have" id="have" className="mt-1" />
              <div className="flex-1">
                <Label
                  htmlFor="have"
                  className="text-sm font-medium cursor-pointer flex items-center gap-2"
                >
                  <Building2 className="h-4 w-4" /> Mam firmę
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Podaj NIP — pobierzemy nazwę, adres i REGON automatycznie z GUS.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value="starting" id="starting" className="mt-1" />
              <div className="flex-1">
                <Label
                  htmlFor="starting"
                  className="text-sm font-medium cursor-pointer flex items-center gap-2"
                >
                  <Rocket className="h-4 w-4" /> Zakładam firmę
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Możesz złożyć wniosek już teraz — założysz firmę przed wypłatą środków.
                </p>
              </div>
            </div>
          </RadioGroup>

          {choice === "have" && (
            <div className="pt-2">
              <ClientProfileSections
                includePersonal={false}
                showPasswordCard={false}
                sections={["company"]}
                hideChrome
              />
            </div>
          )}

          {choice === "starting" && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="space-y-3">
                <p>
                  Do <strong>złożenia</strong> wniosku działalność gospodarcza nie jest wymagana —
                  możesz spokojnie przejść cały proces szukania inwestora i akceptacji warunków.
                </p>
                <p>
                  Pamiętaj jednak: wszystkie pożyczki na portalu to pożyczki dla przedsiębiorców.
                  Aby
                  <strong> uruchomić pożyczkę</strong> (podpisać umowę i otrzymać wypłatę) trzeba
                  podać numer NIP zarejestrowanej firmy.
                </p>
                <p>Firmę jednoosobową założysz online w kilkanaście minut na portalu rządowym:</p>
                <a
                  href="https://www.biznes.gov.pl/pl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline"
                >
                  biznes.gov.pl <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <p className="text-xs text-muted-foreground">
                  Po założeniu firmy wróć tutaj, zaznacz „Mam firmę" i podaj NIP.
                </p>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
