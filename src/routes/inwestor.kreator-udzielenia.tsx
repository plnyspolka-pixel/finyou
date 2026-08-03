import { createFileRoute } from "@tanstack/react-router";
import { LoanDocWizardPage } from "@/components/loan-doc-wizard/LoanDocWizardPage";

/**
 * Kreator udzielenia pożyczki w panelu inwestora.
 *
 * Ta sama logika co w /operator, ale w wariancie „investor”:
 *  - bez listy finansujących — pożyczkodawcą jest zalogowany inwestor
 *    (dane pobierane z jego profilu),
 *  - sekcja „Uwagi praktyczne” nie trafia do dokumentu, tylko do osobnego okienka.
 */
export const Route = createFileRoute("/inwestor/kreator-udzielenia")({
  component: () => <LoanDocWizardPage variant="investor" />,
});
