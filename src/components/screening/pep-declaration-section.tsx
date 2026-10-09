// Sekcja „Oświadczenie o statusie PEP” do formularzy wniosku i rejestracji
// inwestora. Stan trzyma rodzic (wartość + onChange) — formularze zapisują
// szkic i wysyłają oświadczenie razem z danymi.
import { Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CRIMINAL_LIABILITY_CLAUSE,
  FAMILY_RELATIONS,
  PEP_POSITION_CATEGORIES,
  type PepDeclarationValue,
} from "@/lib/screening/declaration";

export type PepDeclarationDraft = Omit<PepDeclarationValue, "criminal_liability_acknowledged"> & {
  criminal_liability_acknowledged: boolean;
};

type Tone = "dark" | "light";

function YesNo({
  name,
  value,
  onChange,
  tone,
}: {
  name: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  tone: Tone;
}) {
  const base =
    tone === "dark"
      ? "border-white/40 text-white data-[on=true]:bg-white data-[on=true]:text-foreground"
      : "border-input data-[on=true]:bg-primary data-[on=true]:text-primary-foreground";
  return (
    <div role="radiogroup" aria-label={name} className="flex shrink-0 gap-2">
      {[
        { v: false, label: "Nie" },
        { v: true, label: "Tak" },
      ].map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          data-on={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "min-w-14 rounded-md border px-3 py-1.5 text-sm font-medium transition",
            base,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PepDeclarationSection({
  value,
  onChange,
  tone = "light",
  inputClassName,
  subjectLabel = "Oświadczam",
}: {
  value: PepDeclarationDraft;
  onChange: (v: PepDeclarationDraft) => void;
  tone?: Tone;
  inputClassName?: string;
  subjectLabel?: string;
}) {
  const text = tone === "dark" ? "text-white" : "text-foreground";
  const muted = tone === "dark" ? "text-white/80" : "text-muted-foreground";
  const box =
    tone === "dark"
      ? "rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm"
      : "rounded-xl border bg-muted/30 p-4";
  const set = (patch: Partial<PepDeclarationDraft>) => onChange({ ...value, ...patch });

  const persons = value.related_persons;
  const setPerson = (i: number, patch: Partial<PepDeclarationDraft["related_persons"][number]>) =>
    set({ related_persons: persons.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const addPerson = (relation: "family" | "associate") =>
    set({
      related_persons: [
        ...persons,
        {
          relation,
          family_relation: relation === "family" ? "spouse" : null,
          first_name: "",
          last_name: "",
          position: "",
        },
      ],
    });
  const removePerson = (i: number) => set({ related_persons: persons.filter((_, j) => j !== i) });

  const toggle = (key: "is_family_member" | "is_close_associate", v: boolean) => {
    const relation = key === "is_family_member" ? "family" : "associate";
    let related = persons.filter((p) => v || p.relation !== relation);
    if (v && !related.some((p) => p.relation === relation)) {
      related = [
        ...related,
        {
          relation,
          family_relation: relation === "family" ? "spouse" : null,
          first_name: "",
          last_name: "",
          position: "",
        },
      ];
    }
    onChange({ ...value, [key]: v, related_persons: related });
  };

  const selectClass = cn(
    "h-10 w-full rounded-md border px-3 text-sm",
    tone === "dark" ? inputClassName : "border-input bg-background",
  );

  const personRows = (relation: "family" | "associate") =>
    persons.map((p, i) =>
      p.relation !== relation ? null : (
        <div key={i} className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2">
          {relation === "family" && (
            <div className="space-y-1 sm:col-span-2">
              <Label className={cn("text-xs", muted)}>Pokrewieństwo</Label>
              <select
                value={p.family_relation ?? "spouse"}
                onChange={(e) => setPerson(i, { family_relation: e.target.value as never })}
                className={selectClass}
              >
                {FAMILY_RELATIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className={cn("text-xs", muted)}>Imię osoby PEP *</Label>
            <Input
              value={p.first_name}
              onChange={(e) => setPerson(i, { first_name: e.target.value })}
              className={inputClassName}
            />
          </div>
          <div className="space-y-1">
            <Label className={cn("text-xs", muted)}>Nazwisko osoby PEP *</Label>
            <Input
              value={p.last_name}
              onChange={(e) => setPerson(i, { last_name: e.target.value })}
              className={inputClassName}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className={cn("text-xs", muted)}>Stanowisko tej osoby *</Label>
            <Input
              value={p.position}
              onChange={(e) => setPerson(i, { position: e.target.value })}
              placeholder="np. poseł na Sejm RP"
              className={inputClassName}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removePerson(i)}
              className={muted}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Usuń osobę
            </Button>
          </div>
        </div>
      ),
    );

  return (
    <section className={cn("space-y-4", box)} aria-labelledby="pep-decl-title">
      <div>
        <h3 id="pep-decl-title" className={cn("text-sm font-bold uppercase tracking-wide", text)}>
          Oświadczenie o statusie PEP *
        </h3>
        <p className={cn("mt-1 text-xs leading-relaxed", muted)}>
          Wymóg ustawy o przeciwdziałaniu praniu pieniędzy. PEP to osoba zajmująca eksponowane
          stanowisko polityczne (np. poseł, minister, sędzia sądu najwyższego, członek zarządu
          spółki Skarbu Państwa) — także przez 12 miesięcy po zakończeniu funkcji.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className={cn("text-sm", text)}>
            {subjectLabel}, że jestem osobą zajmującą eksponowane stanowisko polityczne (PEP).
          </p>
          <YesNo
            name="Czy jest PEP"
            value={value.is_pep}
            onChange={(v) => set({ is_pep: v })}
            tone={tone}
          />
        </div>
        {value.is_pep && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label className={cn("text-xs", muted)}>Kategoria stanowiska (krajowy wykaz) *</Label>
              <select
                value={value.pep_position_category ?? ""}
                onChange={(e) => set({ pep_position_category: e.target.value || null })}
                className={selectClass}
              >
                <option value="">— wybierz —</option>
                {PEP_POSITION_CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className={cn("text-xs", muted)}>Stanowisko (opcjonalnie)</Label>
              <Input
                value={value.pep_position_detail ?? ""}
                onChange={(e) => set({ pep_position_detail: e.target.value })}
                className={inputClassName}
              />
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <p className={cn("text-sm", text)}>
            {subjectLabel}, że jestem członkiem rodziny osoby PEP (małżonek lub partner, dziecko i
            jego małżonek, rodzic).
          </p>
          <YesNo
            name="Czy jest członkiem rodziny PEP"
            value={value.is_family_member}
            onChange={(v) => toggle("is_family_member", v)}
            tone={tone}
          />
        </div>
        {value.is_family_member && (
          <div className="space-y-2">
            {personRows("family")}
            <Button type="button" variant="outline" size="sm" onClick={() => addPerson("family")}>
              <Plus className="mr-1 h-4 w-4" /> Dodaj osobę
            </Button>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <p className={cn("text-sm", text)}>
            {subjectLabel}, że jestem osobą znaną jako bliski współpracownik osoby PEP.
          </p>
          <YesNo
            name="Czy jest bliskim współpracownikiem PEP"
            value={value.is_close_associate}
            onChange={(v) => toggle("is_close_associate", v)}
            tone={tone}
          />
        </div>
        {value.is_close_associate && (
          <div className="space-y-2">
            {personRows("associate")}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addPerson("associate")}
            >
              <Plus className="mr-1 h-4 w-4" /> Dodaj osobę
            </Button>
          </div>
        )}
      </div>

      <label className={cn("flex items-start gap-3 text-xs leading-relaxed", text)}>
        <Checkbox
          checked={value.criminal_liability_acknowledged}
          onCheckedChange={(v) => set({ criminal_liability_acknowledged: v === true })}
          className={cn(
            "mt-0.5 h-6 w-6 [&_svg]:size-5",
            tone === "dark" &&
              "border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground",
          )}
        />
        <span>{CRIMINAL_LIABILITY_CLAUSE} *</span>
      </label>
    </section>
  );
}
