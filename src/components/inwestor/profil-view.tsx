import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Loader2,
  Download,
  RefreshCw,
  AlertTriangle,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { gusCompanyLookup } from "@/lib/gus-bir.functions";
import { krsCompanyLookup, type KrsCompany } from "@/lib/krs.functions";
import { companyRepresentationAutoEnrichment } from "@/lib/krs-enrichment.functions";
import {
  formatBoardMember,
  formatProxy,
  formatShareholder,
  labelContainsMask,
  extractMaskedNamePart,
  extractFunctionPart,
} from "@/lib/krs-format";
import {
  detectPolishBankAccount,
  maskAccount,
  logSafeAccount,
  type BankDetectResult,
} from "@/lib/polish-bank";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { investorEntityVariant, type EntityVariant } from "@/lib/investor-party";

export function InwestorProfil() {
  const { user } = useAuth();

  const [inv, setInv] = useState<any | null>(null);
  // Rodzaj podmiotu z wczytanego profilu — dane reprezentacji czyścimy tylko
  // po świadomej zmianie rodzaju w tej sesji (starszy profil mógł zostać
  // rozpoznany niedokładnie, a jego reprezentacji nie wolno zgubić).
  const [loadedVariant, setLoadedVariant] = useState<EntityVariant | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchingKrs, setFetchingKrs] = useState(false);
  const [krsData, setKrsData] = useState<KrsCompany | null>(null);
  const [bankInfo, setBankInfo] = useState<BankDetectResult | null>(null);
  const [showFullAccount, setShowFullAccount] = useState(false);
  const [bankOverride, setBankOverride] = useState(false);

  const [f, setF] = useState({
    // Rodzaj podmiotu zapisywany w entity_variant (pipeline i profil zgodnie);
    // entity_type ma w bazie DEFAULT 'osoba_fizyczna', więc go nie czytamy.
    entity_variant: "osoba_fizyczna" as EntityVariant,
    // osoba fizyczna (i właściciel JDG)
    first_name: "",
    last_name: "",
    pesel: "",
    // firma
    company_name: "",
    nip: "",
    krs: "",
    regon: "",
    legal_form: "",
    // reprezentant (firma)
    representative_first_name: "",
    representative_last_name: "",
    representative_role: "",
    // kontakt
    phone: "",
    email: "",
    // adres
    street: "",
    postal_code: "",
    city: "",
    country: "Polska",
    // bank
    bank_account: "",
  });

  useEffect(() => {
    if (!user) return;
    void (async () => {
      // user_id w investors nie jest unikalne — najnowszy wiersz.
      const { data } = await supabase
        .from("investors")
        .select("*")
        .eq("user_id", user.id)
        .order("lender_data_completed_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setInv(data);
      if (data) setLoadedVariant(investorEntityVariant(data));
      if (data)
        setF({
          entity_variant: investorEntityVariant(data),
          first_name: data.first_name ?? "",
          last_name: data.last_name ?? "",
          pesel: data.pesel ?? "",
          company_name: data.company_name ?? "",
          nip: data.nip ?? "",
          krs: data.krs ?? "",
          regon: data.regon ?? "",
          legal_form: data.legal_form ?? "",
          representative_first_name: data.representative_first_name ?? "",
          representative_last_name: data.representative_last_name ?? "",
          representative_role: data.representative_role ?? "",
          phone: data.phone ?? "",
          email: data.email ?? user.email ?? "",
          street: data.street ?? "",
          postal_code: data.postal_code ?? "",
          city: data.city ?? "",
          country: data.country ?? "Polska",
          bank_account: data.bank_account ?? "",
        });
      else setF((x) => ({ ...x, email: user.email ?? "" }));
    })();
  }, [user]);

  const autoFill = async () => {
    const payload: { nip?: string; regon?: string; krs?: string } = {};
    if (f.nip.replace(/\D/g, "")) payload.nip = f.nip.replace(/\D/g, "");
    else if (f.regon.replace(/\D/g, "")) payload.regon = f.regon.replace(/\D/g, "");
    else if (f.krs.replace(/\D/g, "")) payload.krs = f.krs.replace(/\D/g, "");
    else {
      toast.error("Wpisz NIP, REGON albo KRS");
      return;
    }

    setFetching(true);
    const t = toast.loading("Pobieram dane firmy z GUS…");
    try {
      const res: any = await gusCompanyLookup({ data: payload });
      if (!res?.success) {
        toast.error(res?.message ?? "Nie udało się pobrać danych", { id: t });
        return;
      }
      const c = res.company;
      setF((x) => ({
        ...x,
        company_name: c.name || x.company_name,
        nip: c.nip || x.nip,
        regon: c.regon || x.regon,
        krs: c.krs || x.krs,
        legal_form: c.legalForm || x.legal_form,
        phone: c.contact.phone || x.phone,
        email: c.contact.email || x.email,
        street:
          [c.address.street, c.address.buildingNumber].filter(Boolean).join(" ") +
            (c.address.apartmentNumber ? `/${c.address.apartmentNumber}` : "") || x.street,
        postal_code: c.address.postalCode || x.postal_code,
        city: c.address.city || x.city,
        country: c.address.country || x.country,
        // GUS: "F"/"LF" = osoba fizyczna prowadząca działalność (JDG), "P"/"LP" = osoba prawna.
        entity_variant:
          c.entityType === "F" || c.entityType === "LF"
            ? "jdg"
            : c.entityType === "P" || c.entityType === "LP"
              ? "osoba_prawna"
              : x.entity_variant,
      }));
      // Jeśli mamy numer KRS — zawsze próbujemy pobrać pełny odpis, żeby zaciągnąć zarząd i sposób reprezentacji.
      const krsNumber = (c.krs || "").replace(/\D/g, "");
      if (krsNumber) {
        toast.success("Dane firmy z GUS. Pobieram odpis KRS…", { id: t });
        void autoFillKrs(false, krsNumber);
      } else {
        toast.success("Dane firmy zostały pobrane z GUS.", { id: t });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się połączyć z usługą GUS REGON.", { id: t });
    } finally {
      setFetching(false);
    }
  };

  const autoFillKrs = async (forceRefresh = false, krsOverride?: string) => {
    const raw = (krsOverride ?? f.krs ?? "").trim();
    if (!raw) {
      toast.error("Wpisz numer KRS");
      return;
    }

    setFetchingKrs(true);
    const t = toast.loading(forceRefresh ? "Odświeżam dane z KRS…" : "Pobieram dane z KRS…");
    try {
      const res: any = await krsCompanyLookup({ data: { krs: raw, forceRefresh } });
      if (!res?.success) {
        toast.error(res?.message ?? "Nie udało się pobrać danych z KRS.", { id: t });
        return;
      }
      const c: KrsCompany = res.company;
      setKrsData(c);
      const street =
        [c.address.street, c.address.buildingNumber].filter(Boolean).join(" ") +
        (c.address.apartmentNumber ? `/${c.address.apartmentNumber}` : "");
      // sposób reprezentacji — krótki opis do pola "representative_role"
      const repSummary =
        c.representation.method ||
        (c.managementBoard[0]
          ? `Reprezentacja przez ${c.managementBoard[0].role ?? "członka zarządu"}`
          : "");
      const firstBoardMember = c.managementBoard[0];
      setF((x) => ({
        ...x,
        company_name: c.name || x.company_name,
        krs: c.krs || x.krs,
        nip: c.nip || x.nip,
        regon: c.regon || x.regon,
        legal_form: c.legalForm || x.legal_form,
        street: street || x.street,
        postal_code: c.address.postalCode || x.postal_code,
        city: c.address.city || x.city,
        country: c.address.country || x.country,
        representative_first_name: firstBoardMember?.firstName || x.representative_first_name,
        representative_last_name: firstBoardMember?.lastName || x.representative_last_name,
        representative_role: repSummary || x.representative_role,
      }));
      toast.success(
        res.cached && !forceRefresh
          ? "Dane spółki z cache KRS."
          : "Dane spółki zostały pobrane z KRS.",
        { id: t },
      );

      // Auto-uzupełnienie zamaskowanych danych reprezentanta z wyszukiwania w sieci (KRS oddaje tylko inicjały).
      const fn1 = firstBoardMember?.firstName || "";
      const ln1 = firstBoardMember?.lastName || "";
      if (firstBoardMember && (/\*/.test(fn1) || /\*/.test(ln1))) {
        const masked = [fn1, ln1].filter(Boolean).join(" ").trim();
        const tt = toast.loading("Uzupełniam dane reprezentanta z internetu…");
        try {
          const enr: any = await companyRepresentationAutoEnrichment({
            data: {
              companyName: c.name || "",
              nip: c.nip || "",
              krs: c.krs || "",
              maskedPerson: masked,
              function: firstBoardMember.role || "",
              representationMethodRaw: c.representation.method || "",
            },
          });
          if (enr?.enriched && enr?.fullName) {
            const parts = String(enr.fullName).trim().split(/\s+/);
            const last = parts.pop() || "";
            const first = parts.join(" ");
            setF((x) => ({
              ...x,
              representative_first_name: first || x.representative_first_name,
              representative_last_name: last || x.representative_last_name,
            }));
            toast.success("Uzupełniono dane reprezentanta.", { id: tt });
          } else {
            toast.message("Nie znaleziono jednoznacznych danych reprezentanta.", { id: tt });
          }
        } catch (e: any) {
          toast.error(e?.message ?? "Nie udało się uzupełnić danych reprezentanta.", { id: tt });
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się połączyć z API KRS.", { id: t });
    } finally {
      setFetchingKrs(false);
    }
  };

  // Live walidacja rachunku bankowego — lokalnie, z debounce 400 ms.
  useEffect(() => {
    const raw = f.bank_account ?? "";
    setShowFullAccount(false);
    if (!raw.trim()) {
      setBankInfo(null);
      setBankOverride(false);
      return;
    }
    const id = setTimeout(() => {
      const res = detectPolishBankAccount(raw);
      setBankInfo(res);
      setBankOverride(false);
    }, 400);
    return () => clearTimeout(id);
  }, [f.bank_account]);

  const save = async () => {
    if (!user) return;
    const isFirma = f.entity_variant !== "osoba_fizyczna";
    if (isFirma && f.nip && !/^\d{10}$/.test(f.nip.replace(/\D/g, ""))) {
      toast.error("NIP musi mieć 10 cyfr");
      return;
    }
    const pesel = f.pesel.replace(/\D/g, "");
    if (!isFirma && pesel && pesel.length !== 11) {
      toast.error("PESEL musi mieć 11 cyfr");
      return;
    }
    // Walidacja rachunku przed zapisem — wymagaj potwierdzenia jeśli niepoprawny.
    if (f.bank_account.trim()) {
      const check = detectPolishBankAccount(f.bank_account);
      if (!check.success && !bankOverride) {
        toast.error(
          "Numer rachunku bankowego jest nieprawidłowy. Popraw albo potwierdź kontynuację mimo błędu.",
        );
        return;
      }
    }
    const showRepresentation = f.entity_variant === "osoba_prawna";
    const detectedAccount = detectPolishBankAccount(f.bank_account);
    const normalizedAccount = detectedAccount.success
      ? detectedAccount.normalized
      : f.bank_account.replace(/[\s-]/g, "").toUpperCase() || null;
    // Nowy numer rachunku wymaga ponownego potwierdzenia (porównanie po cyfrach: NRB = IBAN).
    const accountChanged =
      (normalizedAccount ?? "").replace(/\D/g, "") !==
      String(inv?.bank_account ?? "").replace(/\D/g, "");
    const representation = showRepresentation
      ? {
          representative_first_name: f.representative_first_name.trim() || null,
          representative_last_name: f.representative_last_name.trim() || null,
          representative_role: f.representative_role.trim() || null,
        }
      : f.entity_variant !== loadedVariant
        ? {
            representative_first_name: null,
            representative_last_name: null,
            representative_role: null,
          }
        : {};
    // Map wariant → legacy investor_type (NOT NULL column)
    const investorType = isFirma ? "instytucjonalny" : "indywidualny";
    const payload: any = {
      entity_variant: f.entity_variant,
      entity_type: isFirma ? "firma" : "osoba_fizyczna",
      investor_type: investorType,
      first_name: f.first_name.trim() || null,
      last_name: f.last_name.trim() || null,
      // PESEL edytowalny tylko dla osoby fizycznej — przy firmie zostaje zapisany.
      ...(isFirma ? {} : { pesel: pesel || null }),
      company_name: isFirma ? f.company_name.trim() || null : null,
      nip: isFirma ? f.nip.replace(/\D/g, "") || null : null,
      krs: isFirma ? f.krs.trim() || null : null,
      regon: isFirma ? f.regon.trim() || null : null,
      legal_form: isFirma ? f.legal_form.trim() || null : null,
      ...representation,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      street: f.street.trim() || null,
      postal_code: f.postal_code.trim() || null,
      city: f.city.trim() || null,
      country: f.country.trim() || null,
      bank_account: normalizedAccount,
      ...(accountChanged
        ? {
            bank_account_confirmed_at: null,
            bank_account_bank_name: detectedAccount.success
              ? (detectedAccount.bankName ?? null)
              : null,
          }
        : {}),
    };
    // Zapisany wiersz wraca do stanu — kolejny zapis aktualizuje go zamiast
    // wstawiać drugi profil (user_id w investors nie jest unikalne).
    const { data: saved, error } = inv
      ? await supabase.from("investors").update(payload).eq("id", inv.id).select("*").maybeSingle()
      : await supabase
          .from("investors")
          .insert({ ...payload, user_id: user.id })
          .select("*")
          .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (saved) {
      setInv(saved);
      setLoadedVariant(f.entity_variant);
    }
    // Bezpieczne logowanie — bez pełnego numeru rachunku.
    if (normalizedAccount)
      console.info("[profil] zapisano rachunek", logSafeAccount(normalizedAccount));
    if (accountChanged && normalizedAccount && inv?.bank_account_confirmed_at)
      toast.success("Zapisano", {
        description:
          "Nowy rachunek wymaga ponownego potwierdzenia w kroku „Rachunek do spłaty” w zakładce „Złóż zlecenie”.",
      });
    else toast.success("Zapisano");
  };

  const isFirma = f.entity_variant !== "osoba_fizyczna";
  const isJdg = f.entity_variant === "jdg";

  return (
    <div className="space-y-6 max-w-2xl">
      <FancyPageHeader
        eyebrow="Twoje konto"
        title="Profil inwestora"
        subtitle="Dane wykorzystywane do przygotowania umów pożyczki."
      />

      <Card>
        <CardHeader>
          <CardTitle>Status prawny</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={f.entity_variant}
            onValueChange={(v) => setF({ ...f, entity_variant: v as EntityVariant })}
            className="flex flex-wrap gap-x-6 gap-y-2"
          >
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="osoba_fizyczna" id="ef-of" />
              <span>Osoba fizyczna</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="jdg" id="ef-jdg" />
              <span>Jednoosobowa działalność (JDG)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="osoba_prawna" id="ef-op" />
              <span>Spółka / osoba prawna</span>
            </label>
          </RadioGroup>
          <p className="mt-2 text-xs text-muted-foreground">
            Te dane trafiają do umów oraz pism windykacyjnych wystawianych w Twoim imieniu.
          </p>
        </CardContent>
      </Card>

      {isFirma && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Dane firmy</span>
              <Button
                size="sm"
                variant="outline"
                onClick={autoFill}
                disabled={fetching || fetchingKrs}
              >
                {fetching || fetchingKrs ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Pobierz dane
              </Button>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Wpisz NIP, REGON albo KRS — aplikacja pobierze dane z GUS i (jeśli to spółka) odpis z
              KRS.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>NIP</Label>
              <Input
                maxLength={13}
                value={f.nip}
                onChange={(e) => setF({ ...f, nip: e.target.value })}
                placeholder="10 cyfr"
              />
            </div>
            <div>
              <Label>KRS</Label>
              <div className="flex gap-2">
                <Input
                  maxLength={20}
                  value={f.krs}
                  onChange={(e) => setF({ ...f, krs: e.target.value })}
                  placeholder="np. 0000123456"
                />
                {krsData && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => autoFillKrs(true)}
                    disabled={fetchingKrs}
                    className="shrink-0"
                    title="Odśwież dane z KRS (pomiń cache)"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <Label>Nazwa firmy</Label>
              <Input
                maxLength={200}
                value={f.company_name}
                onChange={(e) => setF({ ...f, company_name: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>REGON</Label>
              <Input
                maxLength={20}
                value={f.regon}
                onChange={(e) => setF({ ...f, regon: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isFirma && krsData && <KrsRegisterCard data={krsData} />}

      {isFirma && !isJdg ? (
        <Card>
          <CardHeader>
            <CardTitle>Reprezentacja</CardTitle>
            <p className="text-xs text-muted-foreground">
              Sekcja widoczna tylko dla spółek wpisanych do KRS. Dla JDG się nie wyświetla.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Imię reprezentanta</Label>
              <Input
                maxLength={100}
                value={f.representative_first_name}
                onChange={(e) => setF({ ...f, representative_first_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Nazwisko reprezentanta</Label>
              <Input
                maxLength={100}
                value={f.representative_last_name}
                onChange={(e) => setF({ ...f, representative_last_name: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Funkcja / sposób reprezentacji</Label>
              <Input
                maxLength={500}
                value={f.representative_role}
                onChange={(e) => setF({ ...f, representative_role: e.target.value })}
                placeholder="np. Prezes Zarządu — reprezentacja jednoosobowa"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{isJdg ? "Właściciel firmy (opcjonalnie)" : "Dane osobowe"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Imię</Label>
              <Input
                maxLength={100}
                value={f.first_name}
                onChange={(e) => setF({ ...f, first_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Nazwisko</Label>
              <Input
                maxLength={100}
                value={f.last_name}
                onChange={(e) => setF({ ...f, last_name: e.target.value })}
              />
            </div>
            {!isJdg && (
              <div>
                <Label>PESEL</Label>
                <Input
                  inputMode="numeric"
                  maxLength={11}
                  value={f.pesel}
                  onChange={(e) => setF({ ...f, pesel: e.target.value })}
                  placeholder="11 cyfr"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Potrzebny we wnioskach do sądu i komornika.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dane kontaktowe</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              maxLength={255}
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Telefon</Label>
            <Input
              maxLength={32}
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isFirma ? "Adres siedziby" : "Adres"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Ulica i numer</Label>
            <Input
              maxLength={255}
              value={f.street}
              onChange={(e) => setF({ ...f, street: e.target.value })}
              placeholder="np. Marszałkowska 1/2"
            />
          </div>
          <div>
            <Label>Kod pocztowy</Label>
            <Input
              maxLength={10}
              value={f.postal_code}
              onChange={(e) => setF({ ...f, postal_code: e.target.value })}
              placeholder="00-000"
            />
          </div>
          <div>
            <Label>Miasto</Label>
            <Input
              maxLength={100}
              value={f.city}
              onChange={(e) => setF({ ...f, city: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Kraj</Label>
            <Input
              maxLength={100}
              value={f.country}
              onChange={(e) => setF({ ...f, country: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rachunek bankowy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div>
            <Label>Numer konta (IBAN / NRB)</Label>
            <div className="flex gap-2 items-center">
              <Input
                maxLength={40}
                value={
                  inv && !showFullAccount && f.bank_account && bankInfo?.success
                    ? maskAccount(f.bank_account)
                    : f.bank_account
                }
                onChange={(e) => setF({ ...f, bank_account: e.target.value })}
                onFocus={() => setShowFullAccount(true)}
                placeholder="PL00 0000 0000 0000 0000 0000 0000"
                className={
                  bankInfo?.success === false
                    ? "border-destructive"
                    : bankInfo?.success === true
                      ? "border-green-500"
                      : ""
                }
              />
              {inv && f.bank_account && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowFullAccount((v) => !v)}
                  title={showFullAccount ? "Ukryj pełny numer" : "Pokaż pełny numer"}
                >
                  {showFullAccount ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
            </div>
            {bankInfo === null && (
              <p className="text-xs text-muted-foreground mt-1">
                Wpisz 26-cyfrowy numer rachunku albo IBAN.
              </p>
            )}
            {bankInfo?.success === false && (
              <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <XCircle className="h-3 w-3" /> {bankInfo.message}
              </div>
            )}
            {bankInfo?.success === true && (
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {bankInfo.bankName
                    ? `Bank: ${bankInfo.bankName}`
                    : "Numer rachunku jest poprawny, ale bank nie został rozpoznany."}
                </div>
                <div className="text-xs text-muted-foreground">
                  Format: {bankInfo.format} · Identyfikator banku: {bankInfo.bankIdentifier} · Nr
                  rozliczeniowy: {bankInfo.clearingNumber}
                </div>
              </div>
            )}
            {bankInfo?.success === false && (
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={bankOverride}
                  onChange={(e) => setBankOverride(e.target.checked)}
                />
                Rozumiem, że numer rachunku może być nieprawidłowy.
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <Button onClick={save}>Zapisz</Button>
    </div>
  );
}

function KrsRegisterCard({ data }: { data: KrsCompany }) {
  const alerts: Array<{ title: string; body?: string; variant?: "default" | "destructive" }> = [];
  if (data.flags.liquidation)
    alerts.push({ title: "Uwaga: podmiot znajduje się w likwidacji.", variant: "destructive" });
  if (data.flags.bankruptcy)
    alerts.push({
      title: "Uwaga: wobec podmiotu ujawniono informację o upadłości.",
      variant: "destructive",
    });
  if (data.flags.restructuring)
    alerts.push({
      title: "Uwaga: wobec podmiotu ujawniono informację o restrukturyzacji.",
      variant: "destructive",
    });
  if (data.flags.suspended) alerts.push({ title: "Uwaga: działalność podmiotu jest zawieszona." });
  if (data.flags.deleted)
    alerts.push({ title: "Uwaga: podmiot został wykreślony z KRS.", variant: "destructive" });
  if (data.flags.section4HasEntries)
    alerts.push({
      title:
        "Uwaga: w KRS występują wpisy mogące wskazywać na zaległości lub obciążenia (dział 4).",
    });
  if (data.flags.representationMissing)
    alerts.push({
      title:
        "Nie udało się jednoznacznie ustalić sposobu reprezentacji. Zweryfikuj ręcznie odpis KRS.",
    });

  // Zbieramy etykiety osób — formatery są odporne na [object Object].
  const boardLabels = data.managementBoard.map((p) => formatBoardMember(p));
  const proxyLabels = data.proxies.map((p) => formatProxy(p));
  const shareholderLabels = data.partnersOrShareholders.map((w) => formatShareholder(w));

  // Auto-enrichment: dla zamaskowanych etykiet wysyłamy zapytanie do backendu.
  const [enriched, setEnriched] = useState<Record<string, string>>({});

  useEffect(() => {
    const all = [...boardLabels, ...proxyLabels, ...shareholderLabels];
    const toEnrich = Array.from(new Set(all.filter((l) => labelContainsMask(l))));
    if (!toEnrich.length) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const label of toEnrich) {
        try {
          const masked = extractMaskedNamePart(label);
          const fn = extractFunctionPart(label);
          const res: any = await companyRepresentationAutoEnrichment({
            data: {
              companyName: data.name || "",
              nip: data.nip || "",
              krs: data.krs || "",
              maskedPerson: masked,
              function: fn,
              representationMethodRaw: data.representation.method || "",
            },
          });
          if (res?.enriched && res?.displayValue) {
            updates[label] = res.displayValue;
          }
        } catch {
          // bezgłośnie — zostawiamy maskę
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setEnriched((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.krs]);

  const display = (label: string) => enriched[label] ?? label;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dane rejestrowe KRS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {alerts.map((a, i) => (
          <Alert key={i} variant={a.variant ?? "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{a.title}</AlertTitle>
            {a.body && <AlertDescription>{a.body}</AlertDescription>}
          </Alert>
        ))}

        <div className="grid gap-2 md:grid-cols-2 text-sm">
          <div>
            <span className="text-muted-foreground">Status:</span>{" "}
            <strong>{data.status || "—"}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Sąd rejestrowy:</span> {data.court || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Data rejestracji:</span>{" "}
            {data.registrationDate || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Kapitał zakładowy:</span>{" "}
            {data.shareCapital || "—"}
          </div>
          <div className="md:col-span-2">
            <span className="text-muted-foreground">Sposób reprezentacji:</span>{" "}
            {data.representation.method || "—"}
          </div>
          <div className="md:col-span-2">
            <span className="text-muted-foreground">PKD główne:</span> {data.pkd.main || "—"}
          </div>
        </div>

        {boardLabels.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-1">Zarząd</div>
            <ul className="text-sm list-disc pl-5">
              {boardLabels.map((l, i) => (
                <li key={i}>{display(l)}</li>
              ))}
            </ul>
          </div>
        )}

        {proxyLabels.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-1">Prokurenci</div>
            <ul className="text-sm list-disc pl-5">
              {proxyLabels.map((l, i) => (
                <li key={i}>{display(l)}</li>
              ))}
            </ul>
          </div>
        )}

        {shareholderLabels.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-1">Wspólnicy / udziałowcy</div>
            <ul className="text-sm list-disc pl-5">
              {shareholderLabels.map((l, i) => (
                <li key={i}>{display(l)}</li>
              ))}
            </ul>
          </div>
        )}

        {data.pkd.additional.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-1">Pozostałe PKD</div>
            <ul className="text-sm list-disc pl-5">
              {data.pkd.additional.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
