import { createFileRoute } from "@tanstack/react-router";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { PaymentsAndInvoices } from "@/components/access/PaymentsAndInvoices";

export const Route = createFileRoute("/inwestor/platnosci")({
  component: () => (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Rozliczenia"
        title="Płatności i faktury"
        subtitle="Historia Twoich płatności za dostęp oraz wystawione faktury."
      />
      <PaymentsAndInvoices />
    </div>
  ),
});
