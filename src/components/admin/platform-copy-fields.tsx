// Opisy publikacji PER PLATFORMA — jedna platforma, jeden opis. Każda
// zaznaczona platforma dostaje własną kartę z polami, jakie naprawdę
// publikuje (tytuł i/lub treść), licznikiem w jednostce, w której liczy limit
// (znaki / bajty UTF-8 / wagi X), licznikiem hashtagów i podpowiedzią
// o wymaganiach. Reguły i walidacja: src/lib/platform-copy.ts (wspólne
// z serwerem, który odrzuca to samo, co formularz podświetla na czerwono).
//
// Opis wspólny (tytuł + treść z formularza) jest tylko punktem wyjścia:
// „Z opisu wspólnego" składa z niego szkic pod daną platformę, „Rozpisz …"
// robi to dla wszystkich kart naraz. Publikuje się to, co stoi w kartach.
import { Music2, RefreshCw, Twitter, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_LABELS, type StudioPlatform } from "@/lib/studio-platforms";
import {
  composeCopyForPlatform,
  copyLength,
  copyUnitLabel,
  countHashtags,
  countMentions,
  hasAnyCopy,
  orderPlatforms,
  platformCopyIssues,
  platformCopyRule,
  type CopyFieldRule,
  type CopyLimits,
  type PlatformCopy,
  type PlatformCopyMap,
} from "@/lib/platform-copy";

type Props = {
  /** Zaznaczone platformy (dowolna kolejność — karty idą w stałej kolejności formularzy). */
  platforms: readonly StudioPlatform[];
  value: PlatformCopyMap;
  onChange: (next: PlatformCopyMap) => void;
  /** Opis wspólny — źródło szkiców dla kart. */
  base: Partial<PlatformCopy>;
  /** Limity zależne od konta (X Premium). */
  limits?: CopyLimits;
  /**
   * Auto-publikacja po renderze: puste pola nie są błędem (uzupełni je AI
   * ze scenariusza, dopasowane do platformy) — zmienia komunikaty i placeholdery.
   */
  optional?: boolean;
};

export function PlatformCopyFields({ platforms, value, onChange, base, limits, optional }: Props) {
  const ordered = orderPlatforms(platforms);
  const canFill = hasAnyCopy(base);

  if (!ordered.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Zaznacz platformy — każda dostanie własne pole opisu z jej limitami i wymaganiami.
      </p>
    );
  }

  const setField = (p: StudioPlatform, field: keyof PlatformCopy, text: string) =>
    onChange({ ...value, [p]: { title: "", message: "", ...value[p], [field]: text } });

  const fillOne = (p: StudioPlatform) =>
    onChange({ ...value, [p]: composeCopyForPlatform(p, base, limits) });

  const fillAll = () => {
    const next: PlatformCopyMap = { ...value };
    for (const p of ordered) next[p] = composeCopyForPlatform(p, base, limits);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Opisy per platforma — jedna platforma, jeden opis</Label>
          <p className="text-xs text-muted-foreground">
            {optional
              ? "Opcjonalnie: co wpiszesz tutaj, pójdzie dokładnie tak na daną platformę; puste pola uzupełni AI ze scenariusza, dopasowane do jej limitów."
              : "Publikuje się to, co stoi w kartach poniżej — opis wspólny jest tylko punktem wyjścia."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={fillAll}
          disabled={!canFill}
          title={
            canFill
              ? "Nadpisze karty wszystkich zaznaczonych platform szkicem z opisu wspólnego."
              : "Najpierw wpisz opis wspólny."
          }
        >
          <Wand2 className="mr-1 h-4 w-4" /> Rozpisz opis wspólny na wszystkie
        </Button>
      </div>

      {ordered.map((p) => (
        <PlatformCopyCard
          key={p}
          platform={p}
          copy={value[p]}
          limits={limits}
          optional={optional}
          canFill={canFill}
          onFill={() => fillOne(p)}
          onField={(field, text) => setField(p, field, text)}
        />
      ))}
    </div>
  );
}

function PlatformIcon({ platform }: { platform: StudioPlatform }) {
  if (platform === "tiktok") return <Music2 className="h-4 w-4" />;
  if (platform === "x") return <Twitter className="h-4 w-4" />;
  return null;
}

function PlatformCopyCard({
  platform,
  copy,
  limits,
  optional,
  canFill,
  onFill,
  onField,
}: {
  platform: StudioPlatform;
  copy: Partial<PlatformCopy> | undefined;
  limits?: CopyLimits;
  optional?: boolean;
  canFill: boolean;
  onFill: () => void;
  onField: (field: keyof PlatformCopy, text: string) => void;
}) {
  const rule = platformCopyRule(platform, limits);
  const issues = platformCopyIssues(platform, copy, limits, { allowEmpty: optional });
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <PlatformIcon platform={platform} />
          {PLATFORM_LABELS[platform]}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onFill}
          disabled={!canFill}
          title="Złóż szkic z opisu wspólnego (nadpisze pola tej platformy)."
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Z opisu wspólnego
        </Button>
      </div>

      {(["title", "message"] as const).map((field) => {
        const fr = rule[field];
        if (!fr) return null;
        return (
          <CopyField
            key={field}
            rule={fr}
            value={copy?.[field] ?? ""}
            optional={optional}
            onChange={(text) => onField(field, text)}
          />
        );
      })}

      <p className="text-xs text-muted-foreground">{rule.hint}</p>
      {issues.map((issue) => (
        <p key={issue} className="text-xs text-destructive">
          {issue}
        </p>
      ))}
    </div>
  );
}

function CopyField({
  rule,
  value,
  optional,
  onChange,
}: {
  rule: CopyFieldRule;
  value: string;
  optional?: boolean;
  onChange: (text: string) => void;
}) {
  const used = copyLength(value.trim(), rule.unit);
  const over = used > rule.max;
  const hashtags = rule.hashtagMax != null ? countHashtags(value) : null;
  const mentions = rule.mentionMax != null ? countMentions(value) : null;
  const placeholder = optional
    ? "Puste — uzupełni AI ze scenariusza (dopasowane do platformy)."
    : undefined;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label className="text-xs">
          {rule.label}
          {rule.required && !optional && " *"}
        </Label>
        <span
          className={`text-[11px] tabular-nums ${over ? "font-medium text-destructive" : "text-muted-foreground"}`}
        >
          {used} / {rule.max} {copyUnitLabel(rule.unit)}
          {hashtags != null && (
            <span className={hashtags > rule.hashtagMax! ? "font-medium text-destructive" : ""}>
              {" • "}hashtagi {hashtags}/{rule.hashtagMax}
            </span>
          )}
          {mentions != null && mentions > 0 && (
            <span className={mentions > rule.mentionMax! ? "font-medium text-destructive" : ""}>
              {" • "}@wzmianki {mentions}/{rule.mentionMax}
            </span>
          )}
        </span>
      </div>
      {rule.rows ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rule.rows}
          placeholder={placeholder}
          className={over ? "border-destructive" : undefined}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={over ? "border-destructive" : undefined}
        />
      )}
    </div>
  );
}
