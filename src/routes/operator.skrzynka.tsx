import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SkrzynkaPosrednika } from "./posrednik.skrzynka";

export const Route = createFileRoute("/operator/skrzynka")({
  validateSearch: (s: Record<string, unknown>) => ({ compose: s.compose ? 1 : undefined }),
  component: SkrzynkaPosrednika,
});

// keep z import if needed later
void z;
