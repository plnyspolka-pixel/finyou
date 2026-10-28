// Indywidualna konsultacja — inwestor wybiera w kalendarzu preferowany termin
// i długość; właściciel dostaje SMS i potwierdza termin. Limit 4 h w okresie
// abonamentu (Regulamin abonamentu 1.1, § 3 ust. 3).
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { pl } from "react-day-picker/locale";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getMyConsultations, requestConsultation } from "@/lib/consultations.functions";
import {
  CONSULTATION_DURATIONS,
  CONSULTATION_STATUS_LABEL,
  CONSULTATION_TOTAL_MINUTES,
  consultationTimes,
  consultationWhenLabel,
  isConsultationDay,
  minutesLabel,
  type ConsultationStatus,
} from "@/lib/consultations";

export const Route = createFileRoute("/inwestor/konsultacja")({
  component: Konsultacja,
});

/** Data z kalendarza (lokalna północ) → „RRRR-MM-DD”. */
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Konsultacja() {
  const qc = useQueryClient();
  const fetchMine = useServerFn(getMyConsultations);
  const send = useServerFn(requestConsultation);
  const { data } = useQuery({ queryKey: ["my-consultations"], queryFn: () => fetchMine() });
  const remaining = data?.remainingMinutes ?? CONSULTATION_TOTAL_MINUTES;

  const [day, setDay] = useState<Date | undefined>();
  const [minutes, setMinutes] = useState<number>(60);
  const [time, setTime] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const now = useMemo(() => new Date(), []);
  // Długości mieszczące się w pozostałym limicie; wybór spoza nich → najdłuższa dostępna.
  const durations = CONSULTATION_DURATIONS.filter((d) => d <= remaining);
  const chosen = (durations as readonly number[]).includes(minutes)
    ? minutes
    : (durations.at(-1) ?? 0);
  const times = day && chosen ? consultationTimes(dateKey(day), chosen, now) : [];

  const mutation = useMutation({
    mutationFn: () =>
      send({ data: { date: dateKey(day!), time: time!, minutes: chosen, topic: topic || null } }),
    onSuccess: () => {
      toast.success("Zgłoszenie wysłane. Potwierdzimy termin telefonicznie albo e-mailem.");
      setTime(null);
      setTopic("");
      qc.invalidateQueries({ queryKey: ["my-consultations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <FancyPageHeader
        eyebrow="Mentoring"
        title="Indywidualna konsultacja"
        subtitle={`W abonamencie masz ${minutesLabel(CONSULTATION_TOTAL_MINUTES)} indywidualnych konsultacji z prowadzącym szkolenie. Wybierz preferowany termin — potwierdzimy go telefonicznie albo e-mailem.`}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
          <CalendarClock className="h-5 w-5 text-primary" />
          <span>
            Do wykorzystania w tym okresie: <strong>{minutesLabel(remaining)}</strong> z{" "}
            {minutesLabel(CONSULTATION_TOTAL_MINUTES)}
          </span>
        </CardContent>
      </Card>

      {remaining > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wybierz preferowany termin</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-[auto_1fr]">
            <Calendar
              mode="single"
              locale={pl}
              weekStartsOn={1}
              selected={day}
              onSelect={(d) => {
                setDay(d);
                setTime(null);
              }}
              disabled={(d) => !isConsultationDay(dateKey(d), now)}
              startMonth={now}
              className="rounded-md border"
            />
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-sm font-medium">Długość</div>
                <div className="flex flex-wrap gap-2">
                  {durations.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={d === chosen ? "default" : "outline"}
                      onClick={() => {
                        setMinutes(d);
                        setTime(null);
                      }}
                    >
                      {minutesLabel(d)}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">
                  Godzina{" "}
                  {day
                    ? `— ${day.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}`
                    : ""}
                </div>
                {!day ? (
                  <p className="text-sm text-muted-foreground">
                    Najpierw wybierz dzień w kalendarzu (dni robocze, od jutra).
                  </p>
                ) : times.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak wolnych godzin tego dnia.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {times.map((t) => (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant={t === time ? "default" : "outline"}
                        onClick={() => setTime(t)}
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">Temat (opcjonalnie)</div>
                <Textarea
                  value={topic}
                  maxLength={500}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Np. pierwsza umowa, ocena konkretnej sprawy, windykacja…"
                />
              </div>
              <Button
                disabled={!day || !time || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Wysyłanie…" : "Zgłoś termin konsultacji"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Godziny w czasie polskim. Konsultacje dotyczą treści szkolenia i nie stanowią
                doradztwa inwestycyjnego, prawnego ani podatkowego.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm">
            Wykorzystałeś już wszystkie godziny konsultacji w tym okresie abonamentu.
          </CardContent>
        </Card>
      )}

      {(data?.requests.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Twoje zgłoszenia</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {data!.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <strong>{consultationWhenLabel(new Date(r.preferred_start))}</strong>
                  <span>{minutesLabel(r.duration_minutes)}</span>
                  <span className="text-muted-foreground">
                    {CONSULTATION_STATUS_LABEL[r.status as ConsultationStatus] ?? r.status}
                  </span>
                  {r.topic && <span className="w-full text-muted-foreground">{r.topic}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
