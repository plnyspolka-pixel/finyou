// „Stwórz umowę" — wspólne dla „Moich ofert" i „Moich zleceń": pobiera pełne
// dane klienta, KW i złożoną ofertę (serwer pilnuje Ujawnienia / akceptacji),
// liczy harmonogram tym samym silnikiem co PDF i otwiera kreator umowy.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { buildOfferPdfPayload } from "@/lib/offer-pdf";
import { saveCalcHandoff, saveContractContextHandoff } from "@/lib/loan-calc-handoff";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";
import {
  ensureContractOffer,
  getOfferContractContext,
  type OfferContractContext,
} from "@/lib/offer-contract-handoff.functions";

type Target = { offerId: string } | { applicationId: string };

export function useCreateContract() {
  const navigate = useNavigate();
  const fetchCtx = useServerFn(getOfferContractContext);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const createContract = async (target: Target) => {
    const key = "offerId" in target ? target.offerId : target.applicationId;
    setPendingKey(key);
    try {
      const ctx = await fetchCtx({ data: target });
      const payload = ctx.offer ? buildOfferPdfPayload(ctx.offer) : null;
      if (payload) {
        payload.clientName = ctx.client.fullName || null;
        saveCalcHandoff(payload, contractContextText(ctx));
      } else {
        // Bez (kompletnej) oferty: agent dostaje strony i KW, warunki ustala w rozmowie.
        saveContractContextHandoff(contractContextText(ctx));
      }
      void navigate({ to: "/inwestor/dokumenty", hash: "kreator-umowy" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się przygotować umowy.");
    } finally {
      setPendingKey(null);
    }
  };

  // „Przygotuj umowę": ekran danych stron działa na ofercie — bierzemy
  // istniejącą albo serwer tworzy szkic z parametrów wniosku.
  const ensureOffer = useServerFn(ensureContractOffer);
  const prepareContract = async (applicationId: string) => {
    setPendingKey(`prep:${applicationId}`);
    try {
      const { offerId } = await ensureOffer({ data: { applicationId } });
      void navigate({ to: "/inwestor/umowa/$offerId", params: { offerId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się przygotować umowy.");
    } finally {
      setPendingKey(null);
    }
  };

  return { createContract, prepareContract, pendingKey };
}

/** Blok danych stron i nieruchomości do pierwszej wiadomości agenta umowy. */
export function contractContextText(ctx: OfferContractContext): string {
  const c = ctx.client;
  const p = ctx.property;
  const line = (k: string, v: string | number | null | undefined) =>
    v != null && String(v).trim() !== "" ? `• ${k}: ${v}` : null;
  const lines: Array<string | null> = [];
  if (!ctx.offer) {
    lines.push(
      "Parametry z wniosku (oferta jeszcze niezłożona):",
      line(
        "Wnioskowana kwota",
        ctx.application.loanAmount ? formatPLN(ctx.application.loanAmount) : null,
      ),
      line(
        "Preferowany okres",
        ctx.application.periodMonths ? `${ctx.application.periodMonths} mies.` : null,
      ),
      "",
    );
  }
  lines.push(
    "Dane pożyczkobiorcy (z wniosku):",
    line("Imię i nazwisko", c.fullName),
    line("PESEL", c.pesel),
    line("Adres", c.address),
    line("Telefon", c.phone),
    line("E-mail", c.email),
    line("Firma", c.companyName),
    line("NIP", c.nip),
    line("REGON", c.regon),
    line("KRS", c.krs),
    line("Rachunek bankowy", c.bankAccount),
  );
  if (p) {
    lines.push(
      "",
      "Nieruchomość (zabezpieczenie):",
      line("Numer(y) KW", p.landRegisterNumbers.join(", ")),
      line("Adres", p.address),
      line("Rodzaj", p.type ? (propertyTypeLabels[p.type] ?? p.type) : null),
      line("Powierzchnia", p.areaSqm ? `${p.areaSqm} m²` : null),
      line("Szacowana wartość", p.estimatedValue ? formatPLN(p.estimatedValue) : null),
      p.hasMortgage != null ? `• Obciążona hipoteką: ${p.hasMortgage ? "tak" : "nie"}` : null,
      p.hasCoOwners != null ? `• Współwłaściciele: ${p.hasCoOwners ? "tak" : "nie"}` : null,
    );
  }
  return lines.filter((l): l is string => l !== null).join("\n");
}
