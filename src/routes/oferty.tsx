import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/oferty")({
  head: () => ({ meta: [
    { title: "Finance You" },
    { name: "robots", content: "noindex, follow" },
  ] }),
  component: OfertyPage,
});

function OfertyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Finance You</h1>
      <p className="mt-4 text-muted-foreground">
        Projekty inwestycyjne są dostępne wyłącznie dla Finance You.
      </p>
      <Link to="/" className="mt-6 inline-block underline">Strona główna</Link>
    </main>
  );
}
