// Ustawienia AML — osoba odpowiedzialna (domyślnie z profilu inwestora),
// dodatkowa osoba uprawniona, osoba podpisująca, dane instytucji, środowisko
// SI*GIIF oraz nieusuwalna historia audytu.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getAmlSettings,
  updateAmlSettings,
  type AmlSettingsView,
} from "@/lib/aml/aml-settings.functions";
import { listAmlAudit } from "@/lib/aml/aml-cases.functions";
import {
  GIIF_CONNECTION_LABELS,
  type AmlGiifConnectionStatus,
  type AmlPerson,
} from "@/lib/aml/aml-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Settings2 } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/ustawienia")({
  component: AmlSettingsScreen,
});

const EMPTY_PERSON: AmlPerson = { firstName: "", lastName: "", jobTitle: "", email: "", phone: "" };

function PersonFields({
  value,
  onChange,
  disabled,
}: {
  value: AmlPerson;
  onChange: (p: AmlPerson) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label>Imię</Label>
        <Input
          disabled={disabled}
          value={value.firstName}
          onChange={(e) => onChange({ ...value, firstName: e.target.value })}
        />
      </div>
      <div>
        <Label>Nazwisko</Label>
        <Input
          disabled={disabled}
          value={value.lastName}
          onChange={(e) => onChange({ ...value, lastName: e.target.value })}
        />
      </div>
      <div>
        <Label>Stanowisko</Label>
        <Input
          disabled={disabled}
          value={value.jobTitle ?? ""}
          onChange={(e) => onChange({ ...value, jobTitle: e.target.value })}
        />
      </div>
      <div>
        <Label>E-mail</Label>
        <Input
          disabled={disabled}
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <Label>Telefon</Label>
        <Input
          disabled={disabled}
          value={value.phone}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
      </div>
    </div>
  );
}

function AmlSettingsScreen() {
  const fetchSettings = useServerFn(getAmlSettings);
  const save = useServerFn(updateAmlSettings);
  const fetchAudit = useServerFn(listAmlAudit);

  const [settings, setSettings] = useState<AmlSettingsView | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sameSigner, setSameSigner] = useState(true);
  const [hasAdditional, setHasAdditional] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Pierwsze wejście tworzy ustawienia automatycznie z profilu inwestora.
        const s = await fetchSettings();
        setSettings(s);
        setSameSigner(!s.signerPerson);
        setHasAdditional(Boolean(s.additionalPerson));
        const a = await fetchAudit({ data: {} });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
        setAudit(a.audit as any[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd wczytywania ustawień");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const updated = await save({
        data: {
          responsiblePerson: settings.responsiblePerson,
          additionalPerson: hasAdditional ? (settings.additionalPerson ?? EMPTY_PERSON) : null,
          signerPerson: sameSigner ? null : (settings.signerPerson ?? EMPTY_PERSON),
          institution: settings.institution,
          giifEnvironment: settings.giifEnvironment,
        },
      });
      setSettings(updated);
      toast.success("Zapisano ustawienia AML");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Settings2 className="h-5 w-5" /> Ustawienia AML
      </h2>

      {!settings.profileGaps.ready && (
        <p className="text-sm text-amber-600">
          Braki do uzupełnienia przed finalnym zgłoszeniem:{" "}
          {settings.profileGaps.missing.join(", ")}. Nie blokują one korzystania z modułu.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Osoba odpowiedzialna za AML</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Domyślnie pobrana automatycznie z profilu inwestora — możesz ją zmienić.
            </p>
            <PersonFields
              value={settings.responsiblePerson}
              onChange={(p) => setSettings({ ...settings, responsiblePerson: p })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Organizacja (instytucja obowiązana)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nazwa</Label>
              <Input
                value={settings.institution.name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    institution: { ...settings.institution, name: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <Label>NIP</Label>
              <Input
                value={settings.institution.nip}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    institution: { ...settings.institution, nip: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <Label>KRS</Label>
              <Input
                value={settings.institution.krs ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    institution: { ...settings.institution, krs: e.target.value },
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Adres</Label>
              <Input
                value={settings.institution.address}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    institution: { ...settings.institution, address: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <Label>Kod pocztowy</Label>
              <Input
                value={settings.institution.postalCode ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    institution: { ...settings.institution, postalCode: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <Label>Miejscowość</Label>
              <Input
                value={settings.institution.city ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    institution: { ...settings.institution, city: e.target.value },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dodatkowa osoba uprawniona</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={hasAdditional}
                onCheckedChange={(v) => setHasAdditional(Boolean(v))}
              />
              Wskaż dodatkową osobę uprawnioną
            </label>
            {hasAdditional && (
              <PersonFields
                value={settings.additionalPerson ?? EMPTY_PERSON}
                onChange={(p) => setSettings({ ...settings, additionalPerson: p })}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Osoba podpisująca zgłoszenia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sameSigner} onCheckedChange={(v) => setSameSigner(Boolean(v))} />
              Ta sama, co osoba odpowiedzialna
            </label>
            {!sameSigner && (
              <PersonFields
                value={settings.signerPerson ?? EMPTY_PERSON}
                onChange={(p) => setSettings({ ...settings, signerPerson: p })}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Do wysyłki zgłoszeń wymagany jest kwalifikowany podpis elektroniczny osoby
              podpisującej. Profil Zaufany ani podpis zaufany nie zastępują kwalifikowanego podpisu
              elektronicznego wymaganego przez SI*GIIF. Finance You nie przechowuje podpisu, PIN-u
              ani klucza prywatnego.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Połączenie SI*GIIF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {GIIF_CONNECTION_LABELS[settings.giifConnectionStatus as AmlGiifConnectionStatus] ??
                  settings.giifConnectionStatus}
              </Badge>
              {settings.giifConnectionStatus === "not_connected" && (
                <span className="text-xs text-muted-foreground">to normalny stan startowy</span>
              )}
            </div>
            {settings.giifInstitutionId && (
              <p className="text-xs text-muted-foreground font-mono">
                ID instytucji: {settings.giifInstitutionId}
              </p>
            )}

            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-2">
              <p className="font-medium text-sm">Co masz zrobić — i dlaczego</p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Teraz: nic.</span> Cały moduł AML —
                klienci, oceny ryzyka, transakcje, sprawy i przygotowanie zgłoszeń — działa bez
                połączenia z SI*GIIF. Połączenie jest potrzebne dopiero przy{" "}
                <span className="font-medium text-foreground">pierwszej wysyłce zgłoszenia</span> do
                GIIF. Wtedy z ekranu zgłoszenia sam uruchomi się kreator, który przeprowadzi Cię
                krok po kroku:
              </p>
              <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Rejestracja instytucji</span> w
                  SI*GIIF — dane pobierzemy z Twojego profilu, Ty je tylko potwierdzasz.
                </li>
                <li>
                  <span className="font-medium text-foreground">Klucz i wniosek o certyfikat</span>{" "}
                  — generujemy je za Ciebie; klucz prywatny nigdy nie opuszcza platformy w postaci
                  jawnej.
                </li>
                <li>
                  <span className="font-medium text-foreground">Podpis kwalifikowany</span> osoby
                  podpisującej — wymaga go GIIF (Profil Zaufany nie wystarcza). Platforma nie
                  przechowuje Twojego podpisu, PIN-u ani klucza.
                </li>
                <li>
                  <span className="font-medium text-foreground">Certyfikat komunikacyjny</span>{" "}
                  wydaje operator GIIF — po jego otrzymaniu testujemy połączenie i wracamy do
                  Twojego zgłoszenia.
                </li>
              </ol>
              <p className="text-muted-foreground">
                Dlatego połączenie nie „zestawia się samo" — część kroków (podpis, wydanie
                certyfikatu) leży po stronie Twojej i urzędu.
              </p>
            </div>

            <div className="w-full max-w-sm">
              <Label>Środowisko</Label>
              <Select
                value={settings.giifEnvironment}
                onValueChange={(v) =>
                  setSettings({ ...settings, giifEnvironment: v as "test" | "production" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Testowe (test.giif.mofnet.gov.pl)</SelectItem>
                  <SelectItem value="production">Produkcyjne (www.giif.mofnet.gov.pl)</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                „Testowe" służy do próbnej wysyłki bez skutków prawnych. „Produkcyjne" wysyła
                zgłoszenia realnie do GIIF — wybierz je dopiero, gdy masz wydany certyfikat
                komunikacyjny.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Klucze Twoich certyfikatów komunikacyjnych przechowujemy wyłącznie w postaci
              zaszyfrowanej (zarządzany sekret) i nigdy nie pokazujemy ich w przeglądarce.
            </p>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => void submit()} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Zapisz ustawienia
      </Button>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historia i audyt (nieusuwalne)</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wpisów.</p>
          ) : (
            <ul className="text-xs text-muted-foreground space-y-1 max-h-80 overflow-y-auto">
              {audit.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className="whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString("pl-PL")}
                  </span>
                  <span className="font-mono">{a.entity_type}</span>
                  <span>{a.action}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
