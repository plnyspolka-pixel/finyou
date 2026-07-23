// Mobilna talia kart projektów w stylu Tindera.
//
// Jedna główna karta + lekko widoczne krawędzie kolejnych. Gesty: swipe w lewo
// „Nie interesuje mnie", swipe w prawo „Interesuje mnie"; pod kartą przyciski
// X / zegar / serce wykonujące TE SAME akcje serwerowe. Karta znika dopiero po
// potwierdzeniu serwera — brak internetu = karta wraca + komunikat z opcją
// ponowienia. Przy oczekiwaniu na serwer przyciski są zablokowane
// (idempotentne wywołania po stronie API i tak chronią przed dublami).
import { useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { X, Heart, Clock, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPLN } from "@/lib/labels";
import type { ProjectTeaser } from "@/lib/projects/module-types";
import { AssignmentCountdown } from "./countdown";

export type DeckDecision = "interested" | "rejected" | "extend";

interface TinderDeckProps {
  cards: ProjectTeaser[];
  /** Zwraca true, gdy serwer potwierdził decyzję (karta może zniknąć). */
  onDecision: (card: ProjectTeaser, decision: DeckDecision) => Promise<boolean>;
  busy: boolean;
}

const SWIPE_THRESHOLD = 110;

export function TinderDeck({ cards, onDecision, busy }: TinderDeckProps) {
  const top = cards[0];
  if (!top) return null;
  return (
    <div
      className="relative mx-auto w-full max-w-sm select-none"
      style={{ height: "min(64vh, 560px)" }}
    >
      {/* Krawędzie kolejnych kart za kartą główną */}
      {cards.slice(1, 3).map((c, i) => (
        <div
          key={c.assignmentId}
          aria-hidden
          className="absolute inset-0 rounded-3xl border bg-card shadow-md"
          style={{
            transform: `translateY(${(i + 1) * 12}px) scale(${1 - (i + 1) * 0.04})`,
            zIndex: 5 - i,
            opacity: 0.9 - i * 0.25,
          }}
        />
      ))}
      <TopCard key={top.assignmentId} card={top} onDecision={onDecision} busy={busy} />
    </div>
  );
}

function TopCard({
  card,
  onDecision,
  busy,
}: {
  card: ProjectTeaser;
  onDecision: TinderDeckProps["onDecision"];
  busy: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const likeOpacity = useTransform(x, [30, 130], [0, 1]);
  const nopeOpacity = useTransform(x, [-130, -30], [1, 0]);
  const [pending, setPending] = useState(false);
  const locked = busy || pending;

  const settle = async (decision: DeckDecision, fromSwipe: boolean) => {
    if (locked) {
      if (fromSwipe) void animate(x, 0, { type: "spring", stiffness: 300, damping: 25 });
      return;
    }
    setPending(true);
    if (fromSwipe) {
      // Wysuwamy kartę wizualnie, ale NIE usuwamy jej, dopóki serwer nie potwierdzi.
      void animate(x, decision === "interested" ? 260 : -260, { duration: 0.18 });
    }
    const confirmed = await onDecision(card, decision);
    if (!confirmed) {
      // Serwer nie potwierdził (offline / wygaśnięcie) — karta wraca na miejsce.
      void animate(x, 0, { type: "spring", stiffness: 300, damping: 25 });
    }
    setPending(false);
  };

  return (
    <div className="absolute inset-0" style={{ zIndex: 10 }}>
      <motion.div
        className="absolute inset-0 cursor-grab overflow-hidden rounded-3xl border bg-card shadow-xl active:cursor-grabbing"
        style={{ x, rotate }}
        drag={locked ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={(_, info) => {
          if (info.offset.x > SWIPE_THRESHOLD) void settle("interested", true);
          else if (info.offset.x < -SWIPE_THRESHOLD) void settle("rejected", true);
        }}
      >
        {/* Zdjęcie nieruchomości (jedyne na karcie) */}
        <div className="absolute inset-0">
          {card.photoUrl ? (
            <img
              src={card.photoUrl}
              alt="Nieruchomość"
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-muted text-muted-foreground">
              <ImageOff className="h-10 w-10" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        </div>

        {/* Naklejki decyzji podczas przeciągania */}
        <motion.div
          className="absolute left-4 top-4 rounded-lg border-4 border-emerald-400 px-3 py-1 text-xl font-black uppercase tracking-wider text-emerald-400"
          style={{ opacity: likeOpacity, rotate: -12 }}
        >
          Interesuje mnie
        </motion.div>
        <motion.div
          className="absolute right-4 top-4 rounded-lg border-4 border-rose-500 px-3 py-1 text-xl font-black uppercase tracking-wider text-rose-500"
          style={{ opacity: nopeOpacity, rotate: 12 }}
        >
          Nie
        </motion.div>

        {/* Teaser: kwota, rodzaj, miejscowość — nic więcej */}
        <div className="absolute inset-x-0 bottom-0 space-y-1 p-5 text-white">
          <div className="flex items-center justify-between">
            <AssignmentCountdown expiresAt={card.expiresAt} serverNow={card.serverNow} />
            {card.extendedAt && (
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs">przedłużono</span>
            )}
          </div>
          <div className="pt-1 text-4xl font-extrabold tracking-tight">
            {formatPLN(card.amount)}
          </div>
          <div className="text-lg font-medium">{card.propertyTypeLabel}</div>
          <div className="text-sm text-white/85">{card.city}</div>
        </div>
      </motion.div>

      {/* Przyciski dostępności — te same akcje serwerowe co gesty */}
      <div className="absolute inset-x-0 -bottom-20 flex items-center justify-center gap-5">
        <Button
          variant="outline"
          size="icon"
          aria-label="Odrzuć"
          disabled={locked}
          className="h-14 w-14 rounded-full border-rose-300 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"
          onClick={() => void settle("rejected", false)}
        >
          <X className="h-7 w-7" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Potrzebuję więcej czasu"
          disabled={locked || Boolean(card.extendedAt)}
          title={
            card.extendedAt
              ? "Przedłużenie zostało już wykorzystane"
              : "Przedłuż o 12 godzin (jednorazowo)"
          }
          className="h-12 w-12 rounded-full border-amber-300 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950"
          onClick={() => void settle("extend", false)}
        >
          <Clock className="h-6 w-6" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Interesuje mnie"
          disabled={locked}
          className="h-14 w-14 rounded-full border-emerald-300 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950"
          onClick={() => void settle("interested", false)}
        >
          <Heart className="h-7 w-7" />
        </Button>
      </div>
    </div>
  );
}
