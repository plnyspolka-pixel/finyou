import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  Building2,
  FileText,
  Landmark,
  CheckCircle2,
  Phone,
  AlertCircle,
} from "lucide-react";

export const businessStatusLabels: Record<string, string> = {
  prowadzi: "Prowadzi działalność",
  zamierza: "Zamierza rozpocząć",
  nie_zamierza: "Bez działalności",
};

export const legalFormLabels: Record<string, string> = {
  jdg: "JDG (jednoosobowa)",
  sp_zoo: "Sp. z o.o.",
  sa: "Spółka akcyjna",
  sp_jawna: "Sp. jawna",
  sp_komandytowa: "Sp. komandytowa",
  sp_partnerska: "Sp. partnerska",
  fundacja: "Fundacja",
  stowarzyszenie: "Stowarzyszenie",
  inne: "Inna forma",
};

export type AppBadgeData = {
  is_startup?: boolean | null;
  startup_funding_dependency?: boolean | null;
  business_status?: string | null;
  business_legal_form?: string | null;
  nip?: string | null;
  business_nip_verified_at?: string | null;
  investor_purpose?: string | null;
};

export type ClientBadgeData = {
  bik_report_uploaded_at?: string | null;
  bank_account_verified_at?: string | null;
  phone_verified_at?: string | null;
};

type Props = {
  app: AppBadgeData | null | undefined;
  client?: ClientBadgeData | null;
  loanApplicationId?: string | null;
  /** Visual density. compact = krótkie chipy bez tekstu negatywnego. */
  variant?: "full" | "compact";
};

/**
 * Spójny pasek info-chipów pokazywany przy wniosku/ofercie — dla admina i inwestora.
 * Pokazuje: startup, działalność, formę prawną, NIP (zweryfikowany), dokumenty dochodowe,
 * raport BIK, weryfikację rachunku bankowego i telefonu.
 */
export function ApplicationInfoBadges({ app, client, loanApplicationId, variant = "full" }: Props) {
  const [incomeDocsCount, setIncomeDocsCount] = useState<number | null>(null);
  const [fetchedClient, setFetchedClient] = useState<ClientBadgeData | null>(null);

  useEffect(() => {
    if (!loanApplicationId) return;
    void (async () => {
      const { data } = await supabase
        .from("documents")
        .select("document_type, loan_application_id, client_id")
        .eq("loan_application_id", loanApplicationId);
      const rows = data ?? [];
      const incomes = rows.filter((d) =>
        /doch[oó]d|income|pit|zaświadczen|wyciag|wyciąg/i.test(
          String((d as any).document_type ?? ""),
        ),
      );
      setIncomeDocsCount(incomes.length);

      if (!client && rows.length > 0) {
        const cid = (rows[0] as any).client_id;
        if (cid) {
          const { data: c } = await supabase
            .from("clients")
            .select("bik_report_uploaded_at, bank_account_verified_at, phone_verified_at")
            .eq("id", cid)
            .maybeSingle();
          if (c) setFetchedClient(c as any);
        }
      }
    })();
  }, [loanApplicationId, client]);

  const c = client ?? fetchedClient ?? {};
  const showNegative = variant === "full";

  if (!app) return null;

  const chips: Array<{ key: string; node: React.ReactNode }> = [];

  // Forma prawna
  if (app.business_legal_form) {
    chips.push({
      key: "form",
      node: (
        <Badge variant="outline" className="gap-1">
          <Building2 className="h-3 w-3" />
          {legalFormLabels[app.business_legal_form] ?? app.business_legal_form}
        </Badge>
      ),
    });
  }

  // Startup
  if (app.is_startup) {
    chips.push({
      key: "startup",
      node: (
        <Badge className="gap-1 bg-violet-600 hover:bg-violet-600/90">
          <Rocket className="h-3 w-3" />
          Startup
        </Badge>
      ),
    });
    if (app.startup_funding_dependency) {
      chips.push({
        key: "startup-dep",
        node: (
          <Badge
            variant="outline"
            className="gap-1 border-amber-500 text-amber-700 dark:text-amber-400"
          >
            <AlertCircle className="h-3 w-3" />
            Start uzależniony od finansowania
          </Badge>
        ),
      });
    }
  }

  // Dokumenty dochodowe – pokazujemy tylko gdy klient je dostarczył
  if (incomeDocsCount && incomeDocsCount > 0) {
    chips.push({
      key: "income",
      node: (
        <Badge variant="default" className="gap-1">
          <FileText className="h-3 w-3" />
          Dochody ({incomeDocsCount})
          <CheckCircle2 className="h-3 w-3" />
        </Badge>
      ),
    });
  }

  // Rachunek bankowy
  if (c.bank_account_verified_at) {
    chips.push({
      key: "bank",
      node: (
        <Badge variant="default" className="gap-1">
          <Landmark className="h-3 w-3" />
          Rachunek zweryfikowany
          <CheckCircle2 className="h-3 w-3" />
        </Badge>
      ),
    });
  }

  // Telefon
  if (c.phone_verified_at) {
    chips.push({
      key: "phone",
      node: (
        <Badge variant="outline" className="gap-1">
          <Phone className="h-3 w-3" />
          Telefon ✓
        </Badge>
      ),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span key={c.key}>{c.node}</span>
      ))}
    </div>
  );
}
