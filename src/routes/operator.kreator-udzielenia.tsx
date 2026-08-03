import { createFileRoute } from "@tanstack/react-router";
import { EngineUmowaGenerator } from "@/components/engine-umowa/EngineUmowaGenerator";

/**
 * Kreator udzielenia pożyczki — umowa składana z silnika klauzul
 * (model ratalny: prowizja rozliczana w ratach, bez kwoty brutto).
 * Zastępuje wcześniejszy wzór DOCX „umowa pożyczki z załącznikami REDLINE".
 */
export const Route = createFileRoute("/operator/kreator-udzielenia")({
  component: () => <EngineUmowaGenerator title="Kreator udzielenia pożyczki" />,
});
