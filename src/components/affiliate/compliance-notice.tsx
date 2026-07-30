import { ShieldCheck, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Stały komunikat zgodności programu pośredników (brak prowizji za zapraszanie). */
export function ComplianceNotice({ className }: { className?: string }) {
  return (
    <Alert className={className}>
      <ShieldCheck className="h-4 w-4" />
      <AlertDescription className="text-xs leading-relaxed">
        Program nie przewiduje prowizji za samo zapraszanie osób. Prowizje są naliczane wyłącznie od
        realnych zdarzeń gospodarczych: opłaconych kont lub skutecznie rozliczonych klientów.
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
        Opłacone konto pośrednika jest usługą/narzędziem Finance You. Prowizja może zostać naliczona
        wyłącznie od realnie opłaconego i nieanulowanego konta, nie za samą rejestrację osoby w
        programie.
      </AlertDescription>
    </Alert>
  );
}
