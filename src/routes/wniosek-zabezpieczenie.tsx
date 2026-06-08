import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SecurityTypePicker } from "@/components/security-type-picker";
import { ArrowRight } from "lucide-react";
import type { SecurityType } from "@/lib/loan-math";

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
    try {
      const raw = sessionStorage.getItem("calc_step1_v1");
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.amount === "number") setAmount(p.amount);
        if (typeof p.months === "number") setMonths(p.months);
      }
    } catch {
      /* noop */
    }
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const a = Number(sp.get("amount"));
      const m = Number(sp.get("months"));
      if (a) setAmount(a);
      if (m) setMonths(m);
    }
  }, []);

  const goNext = () => {
    if (!secType) return;
    try {
      const raw = sessionStorage.getItem("calc_step1_v1");
      const prev = raw ? JSON.parse(raw) : {};
      sessionStorage.setItem(
        "calc_step1_v1",
        JSON.stringify({ ...prev, secType, ts: Date.now() }),
      );
    } catch {
      /* noop */
    }
    const url = new URL("/wniosek-start", window.location.origin);
    if (amount) url.searchParams.set("amount", String(amount));
    if (months) url.searchParams.set("months", String(months));
    url.searchParams.set("secType", secType);
    url.searchParams.set("source", "landing_calculator");
    url.searchParams.set("next", "/wniosek-warunki");
    void navigate({ to: "/wniosek-start", search: Object.fromEntries(url.searchParams) as Record<string, string> });
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
