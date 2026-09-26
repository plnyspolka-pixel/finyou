// Ekran publikacji TikToka — kontrolki wymagane przez audyt Content Posting API.
//
// Wytyczne TikToka (Content Sharing Guidelines) stawiają twarde warunki UX,
// bez których klient nie przechodzi audytu:
//   * poziom prywatności wybiera TWÓRCA, z opcji zwróconych przez
//     creator_info — „Developers should not hardcode one privacy setting…
//     your export screen must reflect those values". Dlatego brak wartości
//     domyślnej: dopóki nikt nie wybierze, publikacja jest zablokowana.
//   * przełączniki komentarzy/duetu/stitcha muszą być widoczne i WYSZARZONE,
//     gdy konto twórcy ich nie dopuszcza.
//   * ujawnienie treści komercyjnej: domyślnie wyłączone, po włączeniu
//     checkboxy „Your brand" i „Branded content" oraz etykieta, jaką TikTok
//     nada filmowi.
//   * deklaracja zgody na muzykę tuż przed przyciskiem publikacji.
//
// Komponent jest wspólny dla publikacji ręcznej i auto-publikacji zadania
// wideo, żeby oba tory niosły wybory twórcy (tick nie dobiera nic sam).
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Music2 } from "lucide-react";
import { tiktokOptionsError, type TiktokPostOptions } from "@/lib/tiktok-upload";
import type { TiktokCreatorInfo } from "@/lib/tiktok.functions";

const MUSIC_CONFIRMATION_URL =
  "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED_CONTENT_POLICY_URL =
  "https://www.tiktok.com/legal/page/global/branded-content-policy/en";

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Publiczny — każdy może zobaczyć",
  MUTUAL_FOLLOW_FRIENDS: "Znajomi — wzajemni obserwujący",
  FOLLOWER_OF_CREATOR: "Obserwujący",
  SELF_ONLY: "Tylko ja (prywatny)",
};

/** Etykieta, jaką TikTok nada filmowi przy wybranym ujawnieniu. */
function disclosureLabel(o: TiktokPostOptions): string | null {
  if (o.brandedContent) return "Płatna współpraca (Paid partnership)";
  if (o.brandOrganic) return "Treść promocyjna (Promotional content)";
  return null;
}

type Props = {
  value: TiktokPostOptions;
  onChange: (next: TiktokPostOptions) => void;
  creator: TiktokCreatorInfo | undefined;
  loading?: boolean;
  error?: string | null;
  /** Auto-publikacja: film powstanie później, więc inny podpis sekcji. */
  deferred?: boolean;
};

export function TiktokPostOptionsFields({
  value,
  onChange,
  creator,
  loading,
  error,
  deferred,
}: Props) {
  const set = (patch: Partial<TiktokPostOptions>) => onChange({ ...value, ...patch });

  // Ujawnienie treści komercyjnej jest włączone, gdy zaznaczono cokolwiek.
  const disclosureOn = value.brandOrganic || value.brandedContent;
  const blocker = tiktokOptionsError(value, creator?.privacyOptions);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Pobieram ustawienia konta TikTok…
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="rounded-lg border border-destructive/40 p-3 text-sm">
        <p className="font-medium text-destructive">
          Nie udało się pobrać danych konta TikTok — publikacja niemożliwa.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error ?? "Połącz konto TikTok w karcie powyżej."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Music2 className="h-4 w-4" />
          Ustawienia posta na TikToku
        </p>
        {/* Wymóg wytycznych: pokaż, na czyje konto publikujemy. */}
        <p className="text-xs text-muted-foreground">
          Konto: <b className="text-foreground">{creator.nickname ?? "(nieznane)"}</b>
          {creator.username ? ` (@${creator.username})` : ""}
        </p>
      </div>

      {deferred && (
        <p className="text-xs text-muted-foreground">
          Te ustawienia zostaną użyte przy automatycznej publikacji po wyrenderowaniu filmu — nic
          nie jest dobierane później automatycznie.
        </p>
      )}

      {/* ── Prywatność: bez domyślnej, wyłącznie z creator_info ───────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="tt-privacy" className="text-sm">
          Kto może zobaczyć ten film? <span className="text-destructive">*</span>
        </Label>
        <select
          id="tt-privacy"
          className="w-full rounded-md border bg-background p-2 text-sm"
          value={value.privacyLevel}
          onChange={(e) => set({ privacyLevel: e.target.value })}
        >
          <option value="">— wybierz —</option>
          {creator.privacyOptions.map((opt) => (
            <option
              key={opt}
              value={opt}
              // Reguła TikToka: treść brandowana nie może być prywatna.
              disabled={opt === "SELF_ONLY" && value.brandedContent}
            >
              {PRIVACY_LABELS[opt] ?? opt}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Lista pochodzi z ustawień Twojego konta TikTok.
        </p>
      </div>

      {/* ── Interakcje: wyszarzone, gdy konto ich nie dopuszcza ───────────── */}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm">Zezwól na</legend>
        {(
          [
            { key: "disableComment", label: "Komentarze", blocked: creator.commentDisabled },
            { key: "disableDuet", label: "Duet", blocked: creator.duetDisabled },
            { key: "disableStitch", label: "Stitch", blocked: creator.stitchDisabled },
          ] as const
        ).map((row) => (
          <label
            key={row.key}
            className={`flex items-center gap-2 text-sm ${
              row.blocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            }`}
          >
            <Checkbox
              // „Zezwól" = odwrotność disable*.
              checked={!row.blocked && !value[row.key]}
              disabled={row.blocked}
              onCheckedChange={(c) => set({ [row.key]: c !== true } as Partial<TiktokPostOptions>)}
            />
            {row.label}
            {row.blocked && (
              <span className="text-xs text-muted-foreground">
                — wyłączone w ustawieniach Twojego konta TikTok
              </span>
            )}
          </label>
        ))}
      </fieldset>

      {/* ── Ujawnienie treści komercyjnej: domyślnie wyłączone ────────────── */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="tt-disclosure" className="text-sm">
              Ujawnij treść komercyjną
            </Label>
            <p className="text-xs text-muted-foreground">
              Włącz, jeśli film promuje Ciebie, markę, produkt lub usługę.
            </p>
          </div>
          <Switch
            id="tt-disclosure"
            checked={disclosureOn}
            onCheckedChange={(on) =>
              set(on ? { brandOrganic: true } : { brandOrganic: false, brandedContent: false })
            }
          />
        </div>

        {disclosureOn && (
          <div className="space-y-2 rounded-md bg-muted/50 p-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={value.brandOrganic}
                onCheckedChange={(c) => set({ brandOrganic: c === true })}
              />
              <span>
                Twoja marka
                <span className="block text-xs text-muted-foreground">
                  Film promuje Twoją własną działalność.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={value.brandedContent}
                onCheckedChange={(c) =>
                  set({
                    brandedContent: c === true,
                    // Prywatny post nie może być brandowany — zdejmij wybór,
                    // żeby twórca świadomie wskazał inny.
                    ...(c === true && value.privacyLevel === "SELF_ONLY"
                      ? { privacyLevel: "" }
                      : {}),
                  })
                }
              />
              <span>
                Treść brandowana
                <span className="block text-xs text-muted-foreground">
                  Film powstał w ramach płatnej współpracy z inną marką.{" "}
                  <a
                    className="underline"
                    href={BRANDED_CONTENT_POLICY_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Zasady treści brandowanych
                  </a>
                </span>
              </span>
            </label>
            {disclosureLabel(value) && (
              <p className="text-xs">
                Film zostanie oznaczony jako: <b>{disclosureLabel(value)}</b>
              </p>
            )}
            {!value.brandOrganic && !value.brandedContent && (
              <p className="text-xs text-destructive">
                Zaznacz co najmniej jedną opcję albo wyłącz ujawnianie.
              </p>
            )}
          </div>
        )}
      </div>

      {blocker && <p className="text-xs text-destructive">{blocker}</p>}

      {/* ── Zgoda na muzykę — wymagana tuż przed przyciskiem publikacji ───── */}
      <p className="border-t pt-3 text-xs text-muted-foreground">
        Publikując, akceptujesz{" "}
        <a className="underline" href={MUSIC_CONFIRMATION_URL} target="_blank" rel="noreferrer">
          Music Usage Confirmation
        </a>{" "}
        TikToka
        {value.brandedContent ? (
          <>
            {" "}
            oraz{" "}
            <a
              className="underline"
              href={BRANDED_CONTENT_POLICY_URL}
              target="_blank"
              rel="noreferrer"
            >
              Branded Content Policy
            </a>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
