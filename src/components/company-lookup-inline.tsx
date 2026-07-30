// Reużywalny mały widget: pole NIP/REGON/KRS + przycisk „Pobierz z GUS/KRS".
// Woła gusCompanyLookup (i doczyta KRS, jeżeli dostępny), zwraca znormalizowane pola.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { gusCompanyLookup } from "@/lib/gus-bir.functions";
import { krsCompanyLookup } from "@/lib/krs.functions";
import { getCrbrForCompany } from "@/lib/crbr.functions";
import { CrbrBeneficiariesCard } from "@/components/crbr-beneficiaries";

export type ResolvedCompany = {
  name: string;
  nip: string;
  regon: string;
  krs: string;
  street: string;
  postalCode: string;
  city: string;
  fullAddress: string;
  email: string;
  phone: string;
};

type Props = {
  value: { nip?: string; regon?: string; krs?: string };
  onChange: (v: { nip?: string; regon?: string; krs?: string }) => void;
  onResolved: (c: ResolvedCompany) => void;
  compact?: boolean;
  showRegon?: boolean;
  showKrs?: boolean;
};

export function CompanyLookupInline({
  value,
  onChange,
  onResolved,
  compact = false,
  showRegon = true,
  showKrs = true,
  showCrbr = true,
}: Props & { showCrbr?: boolean }) {
  const gusFn = useServerFn(gusCompanyLookup);
  const krsFn = useServerFn(krsCompanyLookup);
  const crbrFn = useServerFn(getCrbrForCompany);
  const [busy, setBusy] = useState(false);
  const [crbrData, setCrbrData] = useState<any>(null);
  const [lastNip, setLastNip] = useState<string>("");

  const run = async () => {
    const nip = (value.nip || "").replace(/\D/g, "");
    const regon = (value.regon || "").replace(/\D/g, "");
    const krs = (value.krs || "").replace(/\D/g, "");
    const payload: { nip?: string; regon?: string; krs?: string } = {};
    if (nip) payload.nip = nip;
    else if (regon) payload.regon = regon;
    else if (krs) payload.krs = krs;
    else return toast.error("Wpisz NIP, REGON lub KRS");

    setBusy(true);
    const t = toast.loading("Pobieram dane z GUS…");
    try {
      const res: any = await gusFn({ data: payload });
      if (!res?.success) {
        toast.error(res?.message ?? "Nie udało się pobrać danych", { id: t });
        return;
      }
      const c = res.company;
      const streetLine =
        [c.address?.street, c.address?.buildingNumber].filter(Boolean).join(" ") +
        (c.address?.apartmentNumber ? `/${c.address.apartmentNumber}` : "");
      let name = c.name || "";
      const krsFound = (c.krs || "").replace(/\D/g, "");
      if (krsFound) {
        toast.loading("Dane z GUS. Weryfikuję odpis KRS…", { id: t });
        try {
          const kres: any = await krsFn({ data: { krs: krsFound, forceRefresh: false } });
          if (kres?.success && kres.company?.name) name = kres.company.name;
        } catch {
          /* KRS opcjonalnie */
        }
      }
      const resolved: ResolvedCompany = {
        name,
        nip: c.nip || nip,
        regon: c.regon || regon,
        krs: c.krs || krs,
        street: streetLine,
        postalCode: c.address?.postalCode || "",
        city: c.address?.city || "",
        fullAddress: c.address?.fullAddress || "",
        email: c.contact?.email || "",
        phone: c.contact?.phone || "",
      };
      onResolved(resolved);
      toast.success(krsFound ? "Dane z GUS + KRS zaciągnięte" : "Dane z GUS zaciągnięte", {
        id: t,
      });

      // Doczytaj CRBR (best-effort) — cache 90 dni po stronie serwera.
      if (showCrbr && resolved.nip) {
        setLastNip(resolved.nip);
        try {
          const cres: any = await crbrFn({ data: { nip: resolved.nip } });
          setCrbrData(cres);
        } catch (err) {
          console.warn("[crbr] lookup failed", err);
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd pobierania danych firmy", { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={
          compact ? "flex flex-wrap items-end gap-2" : "grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        }
      >
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">NIP</label>
          <Input
            value={value.nip ?? ""}
            onChange={(e) => onChange({ ...value, nip: e.target.value })}
            placeholder="10 cyfr"
            inputMode="numeric"
          />
        </div>
        {showRegon && (
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">REGON</label>
            <Input
              value={value.regon ?? ""}
              onChange={(e) => onChange({ ...value, regon: e.target.value })}
              placeholder="9 lub 14 cyfr"
              inputMode="numeric"
            />
          </div>
        )}
        {showKrs && (
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">KRS</label>
            <Input
              value={value.krs ?? ""}
              onChange={(e) => onChange({ ...value, krs: e.target.value })}
              placeholder="10 cyfr"
              inputMode="numeric"
            />
          </div>
        )}
        <Button type="button" variant="secondary" onClick={run} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Pobierz z GUS/KRS
        </Button>
      </div>
      {showCrbr && lastNip && crbrData && (
        <CrbrBeneficiariesCard nip={lastNip} initialData={crbrData} />
      )}
    </div>
  );
}

export function VerifiedBadge({ verified }: { verified?: boolean }) {
  if (!verified) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
      <ShieldCheck className="h-3 w-3" /> Zweryfikowano w GUS
    </span>
  );
}
