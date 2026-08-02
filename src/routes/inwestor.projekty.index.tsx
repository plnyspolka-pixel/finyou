// Zakładka „Projekty" została scalona z „Dostępne wnioski" (/inwestor) —
// bramka dostępu (aplikacja → KYC → compliance) żyje tam, a trasa
// przekierowuje. Komponent (mobilne karty w stylu Tindera, „Dobierz projekty
// dla mnie", statystyki, profil preferencji) zostaje w kodzie na wypadek
// powrotu osobnego ekranu projektów.
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, SlidersHorizontal, Inbox, FileText, BellPlus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getModuleState, updateInvestorProfile } from "@/lib/projects/module-access.functions";
import {
  matchProjectsForMe,
  listMyProjectCards,
  openAssignment,
  decideAssignment,
  extendAssignment,
  getMyProjectStats,
  requestNewProjectsNotification,
} from "@/lib/projects/assignments.functions";
import type { InvestorProfileInput } from "@/lib/projects/module-access.functions";
import type { ProjectTeaser } from "@/lib/projects/module-types";
import { ModuleGate, type ModuleStateView } from "@/components/projects/module-gate";
import { InvestorProfileForm } from "@/components/projects/module-forms";
import { TinderDeck, type DeckDecision } from "@/components/projects/tinder-deck";

export const Route = createFileRoute("/inwestor/projekty/")({
  // Wszystko w jednej zakładce: bramka i lista wniosków są na /inwestor.
  beforeLoad: () => {
    throw redirect({ to: "/inwestor" });
  },
  component: ProjectsHome,
});

function ProjectsHome() {
  const stateFn = useServerFn(getModuleState);
  const stateQ = useQuery({ queryKey: ["projects-module-state"], queryFn: () => stateFn() });
  const qc = useQueryClient();
  const refetchState = () => void qc.invalidateQueries({ queryKey: ["projects-module-state"] });

  if (stateQ.isLoading) {
    return <p className="text-muted-foreground">Ładowanie…</p>;
  }
  if (stateQ.isError || !stateQ.data) {
    return (
      <div className="space-y-2">
        <p className="text-destructive">Nie udało się pobrać stanu modułu.</p>
        <Button variant="outline" onClick={() => void stateQ.refetch()}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  const state = stateQ.data as ModuleStateView & {
    preferences: Record<string, unknown>;
    profileCompletedAt: string | null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Projekty inwestycyjne</h1>
        <p className="text-sm text-muted-foreground">
          Zamknięty moduł indywidualnie dopasowywanych projektów pożyczkowych.
        </p>
      </div>
      {state.status === "approved_investor" ? (
        <ApprovedHome state={state} onChanged={refetchState} />
      ) : (
        <ModuleGate state={state} onChanged={refetchState} />
      )}
    </div>
  );
}

function ApprovedHome({
  state,
  onChanged,
}: {
  state: { preferences: Record<string, unknown>; profileCompletedAt: string | null };
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const cardsFn = useServerFn(listMyProjectCards);
  const statsFn = useServerFn(getMyProjectStats);
  const matchFn = useServerFn(matchProjectsForMe);
  const openFn = useServerFn(openAssignment);
  const decideFn = useServerFn(decideAssignment);
  const extendFn = useServerFn(extendAssignment);
  const notifyFn = useServerFn(requestNewProjectsNotification);
  const profileFn = useServerFn(updateInvestorProfile);

  const cardsQ = useQuery({ queryKey: ["projects-cards"], queryFn: () => cardsFn() });
  const statsQ = useQuery({ queryKey: ["projects-stats"], queryFn: () => statsFn() });

  const [matching, setMatching] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [interestedCard, setInterestedCard] = useState<ProjectTeaser | null>(null);
  const [lastMatchEmpty, setLastMatchEmpty] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["projects-cards"] });
    void qc.invalidateQueries({ queryKey: ["projects-stats"] });
  };

  const profileMissing = !state.profileCompletedAt;

  const runMatch = async () => {
    setMatching(true);
    setLastMatchEmpty(false);
    try {
      const res = await matchFn();
      if (res.code === "profile_incomplete") {
        toast.info("Najpierw uzupełnij profil preferencji.");
        setProfileOpen(true);
      } else if (res.code === "limit_reached") {
        toast.info(
          "Masz już maksymalną liczbę aktywnych kart. Podejmij decyzje, aby dobrać kolejne.",
        );
      } else if (res.code === "no_projects" || res.created === 0) {
        setLastMatchEmpty(true);
      } else {
        toast.success(`Dobrano ${res.created} ${res.created === 1 ? "projekt" : "projekty"}.`);
      }
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się dobrać projektów.");
    } finally {
      setMatching(false);
    }
  };

  const handleDecision = async (card: ProjectTeaser, decision: DeckDecision): Promise<boolean> => {
    setDeckBusy(true);
    try {
      if (decision === "extend") {
        const res = await extendFn({ data: { assignmentId: card.assignmentId } });
        if (res.ok) {
          toast.success("Przedłużono o 12 godzin.");
          refresh();
        } else if (res.code === "already_extended") {
          toast.error(
            "Przedłużenie zostało już wykorzystane — decyzję trzeba podjąć w obecnym terminie.",
          );
        } else if (res.code === "extension_limit") {
          toast.error("Osiągnięto limit przedłużonych projektów.");
        } else if (res.code === "expired") {
          toast.error("Przypisanie wygasło — projekt nie jest już dostępny.");
          refresh();
        } else {
          toast.error("Nie udało się przedłużyć przypisania.");
        }
        return false; // karta zostaje
      }

      const res = await decideFn({ data: { assignmentId: card.assignmentId, decision } });
      if (res.ok) {
        if (decision === "interested") {
          setInterestedCard(card);
        } else {
          toast.success("Projekt odrzucony.");
        }
        refresh();
        return true;
      }
      if (res.code === "expired") {
        toast.error("Ten projekt nie jest już dostępny — czas na decyzję minął.");
        refresh();
        return true; // karta znika, bo przypisanie jest już nieaktywne
      }
      if (res.code === "not_active" || res.code === "not_found") {
        toast.error("Ten projekt nie jest już dostępny.");
        refresh();
        return true;
      }
      toast.error("Nie udało się zapisać decyzji. Spróbuj ponownie.");
      return false;
    } catch (e) {
      // Brak internetu / błąd — karta NIE znika, można ponowić.
      toast.error(
        e instanceof Error && /fetch|network/i.test(e.message)
          ? "Brak połączenia — decyzja nie została zapisana. Spróbuj ponownie."
          : e instanceof Error
            ? e.message
            : "Błąd zapisu decyzji.",
      );
      return false;
    } finally {
      setDeckBusy(false);
    }
  };

  const cards = ((cardsQ.data as { cards?: ProjectTeaser[] } | undefined)?.cards ??
    []) as ProjectTeaser[];
  const stats = statsQ.data as
    | { viewed: number; rejected: number; interested: number; active: number }
    | undefined;

  // Pierwsze wejście: wymuś uzupełnienie profilu preferencji.
  if (profileMissing) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" /> Uzupełnij profil inwestora
          </CardTitle>
          <CardDescription>
            Zanim dobierzemy dla Ciebie projekty, uzupełnij aktualne preferencje inwestycyjne.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileFormWrapper
            initial={state.preferences as Partial<InvestorProfileInput>}
            onSaved={onChanged}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pasek akcji */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void runMatch()} disabled={matching || deckBusy} size="lg">
          <Sparkles className="mr-2 h-5 w-5" />
          {matching ? "Dobieranie…" : "Dobierz projekty dla mnie"}
        </Button>
        <Button variant="outline" onClick={() => setProfileOpen(true)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" /> Zmień preferencje
        </Button>
        <Button variant="outline" asChild>
          <Link to="/inwestor/projekty/propozycje">
            <FileText className="mr-2 h-4 w-4" /> Moje propozycje
          </Link>
        </Button>
      </div>

      {/* Statystyki zbiorcze (bez ujawniania rozmiaru puli) */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Przejrzane" value={stats.viewed} />
          <StatTile label="Odrzucone" value={stats.rejected} />
          <StatTile label="Interesujące" value={stats.interested} />
          <StatTile label="Aktywne karty" value={stats.active} />
        </div>
      )}

      {/* Talia kart / ekran braku projektów */}
      {cardsQ.isLoading ? (
        <p className="text-muted-foreground">Ładowanie kart…</p>
      ) : cards.length > 0 ? (
        <div className="pb-24">
          <TinderDeck
            cards={cards}
            busy={deckBusy}
            onDecision={(card, decision) => {
              if (decision !== "extend") {
                // pierwsze wyświetlenie karty oznaczamy jako otwarte (best-effort)
                void openFn({ data: { assignmentId: card.assignmentId } }).catch(() => undefined);
              }
              return handleDecision(card, decision);
            }}
          />
        </div>
      ) : (
        <Card className="mx-auto max-w-xl">
          <CardHeader className="items-center text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg">
              {lastMatchEmpty
                ? "Obecnie nie mamy projektów zgodnych z Twoimi preferencjami."
                : "Brak aktywnych kart"}
            </CardTitle>
            <CardDescription>
              {lastMatchEmpty
                ? "Możesz zmienić preferencje albo poprosić o powiadomienie, gdy pojawią się nowe projekty."
                : "Kliknij „Dobierz projekty dla mnie”, aby otrzymać indywidualnie dopasowane projekty."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {lastMatchEmpty ? (
              <>
                <Button variant="outline" onClick={() => setProfileOpen(true)}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" /> Zmień preferencje
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void notifyFn()
                      .then(() => toast.success("Powiadomimy Cię o nowych projektach."))
                      .catch(() => toast.error("Nie udało się zapisać powiadomienia."))
                  }
                >
                  <BellPlus className="mr-2 h-4 w-4" /> Powiadom mnie o nowych projektach
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/inwestor">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Wróć do panelu
                  </Link>
                </Button>
              </>
            ) : (
              <Button onClick={() => void runMatch()} disabled={matching}>
                <Sparkles className="mr-2 h-4 w-4" /> Dobierz projekty dla mnie
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal preferencji */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Preferencje inwestycyjne</DialogTitle>
            <DialogDescription>
              Zmiana preferencji wpływa na przyszłe dopasowania — aktywne przypisania pozostają bez
              zmian.
            </DialogDescription>
          </DialogHeader>
          <ProfileFormWrapper
            initial={state.preferences as Partial<InvestorProfileInput>}
            onSaved={() => {
              setProfileOpen(false);
              onChanged();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Potwierdzenie zainteresowania */}
      <Dialog open={Boolean(interestedCard)} onOpenChange={(o) => !o && setInterestedCard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Projekt zapisany jako interesujący</DialogTitle>
            <DialogDescription>
              Projekt został zapisany jako interesujący. Wyrażenie zainteresowania nie oznacza
              jeszcze zobowiązania do udzielenia finansowania.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              onClick={() => {
                const id = interestedCard?.assignmentId;
                setInterestedCard(null);
                if (id) {
                  void navigate({
                    to: "/inwestor/projekty/oferta/$assignmentId",
                    params: { assignmentId: id },
                  });
                }
              }}
            >
              Zobacz szczegóły
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setInterestedCard(null)}>
              Wróć do kolejnych projektów
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  function ProfileFormWrapper({
    initial,
    onSaved,
  }: {
    initial: Partial<InvestorProfileInput>;
    onSaved: () => void;
  }) {
    return (
      <InvestorProfileForm
        initial={initial}
        submitting={savingProfile}
        onSubmit={async (values) => {
          setSavingProfile(true);
          try {
            await profileFn({ data: values });
            toast.success("Preferencje zapisane.");
            onSaved();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Nie udało się zapisać preferencji.");
          } finally {
            setSavingProfile(false);
          }
        }}
      />
    );
  }
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
