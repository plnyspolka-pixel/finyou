import { createFileRoute } from "@tanstack/react-router";
import { UmowaHbGenerator } from "@/components/umowa-hb/UmowaHbGenerator";

/**
 * Kreator umowy pożyczki (wzór DOCX + asystent Gemini Pro) w panelu inwestora.
 * Wzór `wzor-umowy.docx` jest zasilany danymi wpisanymi ręcznie lub uzupełnionymi
 * przez AI (pola i klauzule opcjonalne).
 */
export const Route = createFileRoute("/inwestor/kreator-umowy")({
  component: UmowaHbGenerator,
});
