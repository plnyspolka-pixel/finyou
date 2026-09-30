import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  REGULAMIN_ABONAMENTU_PATH,
  REGULAMIN_ABONAMENTU_VERSION,
  regulaminAbonamentuInwestora,
} from "@/lib/legal/regulamin-abonamentu";

// Regulamin Abonamentu Inwestora — akceptowany przy płatności za dostęp do
// panelu inwestora (sprzedawca: Fundacja Krzewienia Edukacji Finansowej
// im. Pieczaka). Treść z kodu (lib/legal/regulamin-abonamentu.ts), wersja
// zapisywana w płatności.
export const Route = createFileRoute("/regulamin-inwestora")({
  component: RegulaminInwestora,
  head: () => ({
    meta: [
      { title: "Regulamin abonamentu inwestora | Finance You" },
      {
        name: "description",
        content:
          "Regulamin abonamentu inwestora Finance You — cena, płatność, dostęp do panelu, odstąpienie i reklamacje.",
      },
    ],
    links: [{ rel: "canonical", href: `https://financeyou.pl${REGULAMIN_ABONAMENTU_PATH}` }],
  }),
});

function RegulaminInwestora() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Wróć do strony głównej
        </Link>
        <p className="mt-6 text-sm text-muted-foreground">
          Regulamin abonamentu inwestora — {REGULAMIN_ABONAMENTU_VERSION}
        </p>
        <article className="mt-4 text-[0.95rem] leading-7 text-foreground [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:leading-tight [&_h2]:mt-8 [&_h2]:border-t [&_h2]:border-border [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-bold [&_hr]:my-6 [&_hr]:border-border [&_li]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_strong]:font-semibold">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {regulaminAbonamentuInwestora()}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
