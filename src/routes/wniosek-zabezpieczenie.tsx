import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SecurityTypePicker } from "@/components/security-type-picker";
import { ArrowRight } from "lucide-react";
import type { SecurityType } from "@/lib/loan-math";
import { readFunnelState, mergeFunnelState, captureFunnelParamsFromUrl } from "@/lib/wniosek-funnel";

export const Route = createFileRoute("/wniosek-zabezpieczenie")({
  component: WniosekZabezpieczeniePage,
  head: () => ({
    meta: [
      { title: "Wybierz zabezpieczenie" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function WniosekZabezpieczeniePage() {
  const navigate = useNavigate();
  const [secType, setSecType] = useState<SecurityType | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [months, setMonths] = useState<number | null>(null);

  useEffect(() => {
    captureFunnelParamsFromUrl();
    const s = readFunnelState();
    if (typeof s.amount === "number") setAmount(s.amount);
    if (typeof s.months === "number") setMonths(s.months);
  }, []);

  const goNext = () => {
    if (!secType) return;
    mergeFunnelState({ secType, amount, months, source: "landing_calculator" });
    void navigate({ to: "/wniosek-formularz" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Co ma być zabezpieczeniem?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Wybierz typ nieruchomości, którą chcesz przedstawić jako zabezpieczenie pożyczki.
          </p>
          <SecurityTypePicker value={secType} onChange={setSecType} />
          <Button
            type="button"
            variant="cta"
            size="cta"
            disabled={!secType}
            onClick={goNext}
            className="w-full disabled:opacity-50"
          >
            Dalej
            <ArrowRight className="ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
