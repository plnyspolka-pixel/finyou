// Formularz profilu preferencji inwestora (moduł projektów). Aplikacja
// o dostęp nie ma już formularza — to jeden klik w module-gate.tsx.
// Walidacja ostateczna odbywa się po stronie serwera — tu tylko
// podstawowe sprawdzenia i wygodny UX.
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  SECURITY_OPTIONS,
} from "@/lib/projects/module-types";
import type { InvestorProfileInput } from "@/lib/projects/module-access.functions";

const RISK_PROFILES = [
  { value: "konserwatywny", label: "Konserwatywny — priorytet bezpieczeństwa" },
  { value: "zrownowazony", label: "Zrównoważony — balans ryzyka i zwrotu" },
  { value: "agresywny", label: "Podwyższone ryzyko za wyższy zwrot" },
];

function MultiCheck({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <Checkbox
            checked={value.includes(o.value)}
            onCheckedChange={(c) =>
              onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))
            }
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

const PROPERTY_OPTIONS = PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }));

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  suffix?: string;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={suffix ? "pr-12" : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function InvestorProfileForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Partial<InvestorProfileInput>;
  onSubmit: (values: InvestorProfileInput) => Promise<void>;
  submitting: boolean;
}) {
  const [capital, setCapital] = useState<number | "">(initial?.availableCapital ?? "");
  const [minInv, setMinInv] = useState<number | "">(initial?.minInvestment ?? "");
  const [maxInv, setMaxInv] = useState<number | "">(initial?.maxInvestment ?? "");
  const [maxLtv, setMaxLtv] = useState<number | "">(initial?.maxLtvPercent ?? 60);
  const [types, setTypes] = useState<string[]>(initial?.propertyTypes ?? []);
  const [locations, setLocations] = useState((initial?.locations ?? []).join(", "));
  const [periodMin, setPeriodMin] = useState<number | "">(initial?.periodMonthsMin ?? 6);
  const [periodMax, setPeriodMax] = useState<number | "">(initial?.periodMonthsMax ?? 36);
  const [expectedReturn, setExpectedReturn] = useState<number | "">(
    initial?.expectedReturnPercent ?? 12,
  );
  const [securities, setSecurities] = useState<string[]>(initial?.preferredSecurities ?? []);
  const [risk, setRisk] = useState(initial?.riskProfile ?? "");

  const submit = async () => {
    const locs = locations
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      capital === "" ||
      minInv === "" ||
      maxInv === "" ||
      maxLtv === "" ||
      periodMin === "" ||
      periodMax === "" ||
      expectedReturn === "" ||
      !types.length ||
      !locs.length ||
      !securities.length ||
      !risk
    ) {
      toast.error("Uzupełnij wszystkie pola profilu.");
      return;
    }
    await onSubmit({
      availableCapital: capital,
      minInvestment: minInv,
      maxInvestment: maxInv,
      maxLtvPercent: maxLtv,
      propertyTypes: types,
      locations: locs,
      periodMonthsMin: periodMin,
      periodMonthsMax: periodMax,
      expectedReturnPercent: expectedReturn,
      preferredSecurities: securities,
      riskProfile: risk,
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Dostępna kwota"
          value={capital}
          onChange={setCapital}
          suffix="zł"
          min={0}
        />
        <NumberField
          label="Oczekiwana rentowność (rocznie)"
          value={expectedReturn}
          onChange={setExpectedReturn}
          suffix="%"
          min={0}
        />
        <NumberField
          label="Minimalna kwota projektu"
          value={minInv}
          onChange={setMinInv}
          suffix="zł"
          min={0}
        />
        <NumberField
          label="Maksymalna kwota projektu"
          value={maxInv}
          onChange={setMaxInv}
          suffix="zł"
          min={0}
        />
        <NumberField
          label="Okres finansowania — od"
          value={periodMin}
          onChange={setPeriodMin}
          suffix="mies."
          min={1}
        />
        <NumberField
          label="Okres finansowania — do"
          value={periodMax}
          onChange={setPeriodMax}
          suffix="mies."
          min={1}
        />
        <NumberField
          label="Maksymalne LTV"
          value={maxLtv}
          onChange={setMaxLtv}
          suffix="%"
          min={1}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Typ nieruchomości</Label>
        <MultiCheck options={PROPERTY_OPTIONS} value={types} onChange={setTypes} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Lokalizacja (miejscowości / województwa / regiony)</Label>
        <Textarea
          placeholder="np. Lublin, lubelskie — oddziel przecinkami"
          value={locations}
          onChange={(e) => setLocations(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Preferowane zabezpieczenia</Label>
        <MultiCheck
          options={SECURITY_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          value={securities}
          onChange={setSecurities}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Akceptowany profil ryzyka</Label>
        <Select value={risk} onValueChange={setRisk}>
          <SelectTrigger>
            <SelectValue placeholder="Wybierz profil ryzyka" />
          </SelectTrigger>
          <SelectContent>
            {RISK_PROFILES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Zmiana preferencji wpływa na przyszłe dopasowania — nie zmienia automatycznie projektów już
        do Ciebie przypisanych.
      </p>

      <Button className="w-full" onClick={() => void submit()} disabled={submitting}>
        {submitting ? "Zapisywanie…" : "Zapisz preferencje"}
      </Button>
    </div>
  );
}
