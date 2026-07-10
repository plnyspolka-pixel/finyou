import { createFileRoute } from "@tanstack/react-router";
import { LoanDocWizardPage } from "@/components/loan-doc-wizard/LoanDocWizardPage";

export const Route = createFileRoute("/operator/kreator-udzielenia")({
  component: LoanDocWizardPage,
});
