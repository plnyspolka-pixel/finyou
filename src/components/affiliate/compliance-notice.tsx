import { ShieldCheck, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Stały komunikat zgodności — dwa osobne programy:
 * pośrednik zarabia na uruchomionej pożyczce przyprowadzonego klienta,
 * partner na abonamencie nowego inwestora z jego linku.
 */
export function ComplianceNotice({
  className,
  kind = "partner",
}: {
  className?: string;
  kind?: "broker" | "partner";
}) {
  return (
    <Alert className={className}>
      <ShieldCheck className="h-4 w-4" />
      <AlertDescription className="text-xs leading-relaxed">
        {kind === "broker"
          ? "Pośrednik otrzymuje prowizję od każdej uruchomionej (wypłaconej) pożyczki klienta, którego przyprowadził. Nie ma prowizji za samo przekazanie wniosku ani za zapraszanie osób."
          : "Partner otrzymuje prowizję wyłącznie za nowego inwestora, który zarejestruje się z jego linku i opłaci abonament. Nie ma prowizji za samą rejestrację poleconej osoby."}
      </AlertDescription>
    </Alert>
  );
}

/** Komunikat przy materiałach marketingowych. */
export function MarketingComplianceNotice({ className }: { className?: string }) {
  return (
    <Alert className={className}>
      <Info className="h-4 w-4" />
      <AlertDescription className="text-xs leading-relaxed">
        Partner nie może gwarantować finansowania, obiecywać decyzji pozytywnej ani występować jako
        przedstawiciel Finance You bez odrębnego upoważnienia.
      </AlertDescription>
    </Alert>
  );
}

/** Komunikat przy koncie pośrednika. */
export function BrokerAccountComplianceNotice({ className }: { className?: string }) {
  return (
    <Alert className={className}>
      <Info className="h-4 w-4" />
      <AlertDescription className="text-xs leading-relaxed">
        Prowizja jest naliczana wyłącznie od realnych zdarzeń: uruchomionej pożyczki klienta
        (pośrednik) albo opłaconego i niezwróconego abonamentu poleconego inwestora (partner).
      </AlertDescription>
    </Alert>
  );
}
