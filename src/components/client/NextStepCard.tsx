import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import type { EnrichedProgress } from "@/lib/my-loan-progress";

interface Props {
  progress: EnrichedProgress;
}

export function NextStepCard({ progress }: Props) {
  const done = progress.next_step.section === "gotowe";
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
          {done ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {done ? "Wniosek kompletny" : "Co dalej?"}
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold leading-tight">
            {progress.next_step.title}
          </h2>
          <p className="text-muted-foreground max-w-xl">{progress.next_step.description}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Postęp wniosku</span>
            <span className="font-medium">{progress.completion_percent}%</span>
          </div>
          <Progress value={progress.completion_percent} />
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild size="lg" variant="cta">
            <Link to={progress.next_step.ctaHref}>
              {progress.next_step.ctaLabel} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          {!done && (
            <Button asChild variant="ghost" size="lg">
              <Link to="/klient">Zobacz cały wniosek</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
