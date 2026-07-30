import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPublicLandingPage, submitLandingLead } from "@/lib/landing-pages.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChatWidget } from "@/components/landing/chat-widget";
import { toast } from "sonner";

type FormField = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

type Section = {
  type: "text" | "features" | "stats" | "testimonial" | "cta";
  title?: string;
  content?: string;
  items?: Array<{
    title?: string;
    description?: string;
    label?: string;
    value?: string;
    icon?: string;
  }>;
  author?: string;
  role?: string;
};

type PublicPage = {
  id: string;
  slug: string;
  title: string;
  headline: string;
  subheadline: string | null;
  cta_text: string;
  hero_image_url: string | null;
  og_image_url: string | null;
  meta_description: string | null;
  sections: Section[];
  form_fields: FormField[];
  thank_you_message: string;
  redirect_url: string | null;
  theme: { primary?: string; background?: string };
};

const pageQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-landing", slug],
    queryFn: () => getPublicLandingPage({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/l/$slug")({
  loader: async ({ params, context }) => {
    const res = await context.queryClient.ensureQueryData(pageQuery(params.slug));
    if (!res.page) throw notFound();
    return res;
  },
  head: ({ loaderData }) => {
    const page = (loaderData?.page as unknown as PublicPage | null) ?? null;
    if (!page) return { meta: [{ title: "Nie znaleziono" }] };
    const desc = page.meta_description ?? page.subheadline ?? page.headline;
    const meta: Array<Record<string, string>> = [
      { title: page.title },
      { name: "description", content: desc },
      { property: "og:title", content: page.title },
      { property: "og:description", content: desc },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (page.og_image_url) {
      meta.push({ property: "og:image", content: page.og_image_url });
      meta.push({ name: "twitter:image", content: page.og_image_url });
    } else if (page.hero_image_url) {
      meta.push({ property: "og:image", content: page.hero_image_url });
    }
    return { meta };
  },
  errorComponent: ({ error }) => (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Nie udało się wczytać strony</h1>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">404</h1>
        <p className="text-muted-foreground">Ta strona nie istnieje lub została wyłączona.</p>
      </div>
    </div>
  ),
  component: LandingPage,
});

function LandingPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(pageQuery(slug));
  const page = data.page as unknown as PublicPage;
  const primary = page.theme?.primary ?? "#0ea5e9";
  const background = page.theme?.background ?? "#ffffff";

  return (
    <main style={{ background }} className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-20">
        {/* Hero */}
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h1 className="text-balance text-3xl font-bold leading-tight md:text-5xl">
              {page.headline}
            </h1>
            {page.subheadline && (
              <p className="mt-4 text-lg text-muted-foreground">{page.subheadline}</p>
            )}
            <a href="#zapis" className="mt-6 inline-block">
              <Button size="lg" style={{ background: primary, color: "#fff" }}>
                {page.cta_text}
              </Button>
            </a>
          </div>
          {page.hero_image_url && (
            <div>
              <img
                src={page.hero_image_url}
                alt=""
                className="w-full rounded-xl object-cover shadow-lg"
                loading="eager"
              />
            </div>
          )}
        </div>

        {/* Sections */}
        <div className="mt-16 space-y-16">
          {page.sections.map((s, i) => (
            <SectionView key={i} section={s} primary={primary} />
          ))}
        </div>

        {/* Form */}
        <section id="zapis" className="mt-20 rounded-2xl border bg-card p-6 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold md:text-3xl">{page.cta_text}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Wypełnij formularz — odezwiemy się.</p>
          <LeadForm page={page} primary={primary} />
        </section>
      </div>
      <ChatWidget source={`landing:${slug}`} />
    </main>
  );
}

function SectionView({ section, primary }: { section: Section; primary: string }) {
  if (section.type === "features") {
    return (
      <section>
        {section.title && <h2 className="mb-6 text-2xl font-bold md:text-3xl">{section.title}</h2>}
        <div className="grid gap-4 md:grid-cols-3">
          {(section.items ?? []).map((it, i) => (
            <div key={i} className="rounded-xl border bg-card p-5">
              <div className="mb-2 h-1 w-10 rounded" style={{ background: primary }} />
              <div className="font-semibold">{it.title}</div>
              {it.description && (
                <p className="mt-1 text-sm text-muted-foreground">{it.description}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (section.type === "stats") {
    return (
      <section>
        {section.title && <h2 className="mb-6 text-2xl font-bold md:text-3xl">{section.title}</h2>}
        <div className="grid gap-4 md:grid-cols-3">
          {(section.items ?? []).map((it, i) => (
            <div key={i} className="rounded-xl border bg-card p-6 text-center">
              <div className="text-3xl font-bold" style={{ color: primary }}>
                {it.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{it.label}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (section.type === "testimonial") {
    return (
      <section className="rounded-2xl border bg-card p-8">
        <p className="text-lg italic">„{section.content}"</p>
        <div className="mt-4 text-sm">
          <span className="font-semibold">{section.author}</span>
          {section.role && <span className="text-muted-foreground"> — {section.role}</span>}
        </div>
      </section>
    );
  }
  if (section.type === "cta") {
    return (
      <section
        className="rounded-2xl p-8 text-center"
        style={{ background: primary, color: "#fff" }}
      >
        {section.title && <h2 className="text-2xl font-bold md:text-3xl">{section.title}</h2>}
        {section.content && <p className="mt-2 opacity-90">{section.content}</p>}
        <a href="#zapis" className="mt-5 inline-block">
          <Button size="lg" variant="secondary">
            Przejdź do formularza
          </Button>
        </a>
      </section>
    );
  }
  // text
  return (
    <section>
      {section.title && <h2 className="mb-4 text-2xl font-bold md:text-3xl">{section.title}</h2>}
      {section.content && (
        <p className="whitespace-pre-line text-muted-foreground">{section.content}</p>
      )}
    </section>
  );
}

function LeadForm({ page, primary }: { page: PublicPage; primary: string }) {
  const submitFn = useServerFn(submitLandingLead);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ msg: string } | null>(null);

  const fields = page.form_fields ?? [];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailField =
      fields.find((f) => f.type === "email") ?? fields.find((f) => f.name === "email");
    const email = emailField ? values[emailField.name] : values["email"];
    if (!email || !/.+@.+\..+/.test(email)) {
      toast.error("Podaj poprawny email");
      return;
    }
    for (const f of fields) {
      if (f.required && !values[f.name]?.trim()) {
        toast.error(`Pole „${f.label}" jest wymagane`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const nameField = fields.find((f) => f.name === "name" || f.name === "full_name");
      const phoneField = fields.find((f) => f.type === "tel" || f.name === "phone");
      const custom: Record<string, string> = {};
      for (const f of fields) {
        if (f === emailField || f === nameField || f === phoneField) continue;
        if (values[f.name]) custom[f.name] = values[f.name];
      }

      const url = new URL(window.location.href);
      const utm = {
        source: url.searchParams.get("utm_source") ?? undefined,
        medium: url.searchParams.get("utm_medium") ?? undefined,
        campaign: url.searchParams.get("utm_campaign") ?? undefined,
        term: url.searchParams.get("utm_term") ?? undefined,
        content: url.searchParams.get("utm_content") ?? undefined,
      };

      const res = await submitFn({
        data: {
          landing_page_id: page.id,
          email,
          name: nameField ? values[nameField.name] : undefined,
          phone: phoneField ? values[phoneField.name] : undefined,
          custom_fields: custom,
          utm: Object.values(utm).some(Boolean) ? utm : undefined,
        },
      });
      if (res.redirect_url) {
        window.location.href = res.redirect_url;
        return;
      }
      setDone({ msg: res.thank_you_message });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd wysyłki");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded-xl border p-6 text-center">
        <div className="text-2xl">✓</div>
        <p className="mt-2 font-medium">{done.msg}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <Label>
            {f.label} {f.required && <span className="text-destructive">*</span>}
          </Label>
          {f.type === "textarea" ? (
            <Textarea
              value={values[f.name] ?? ""}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              placeholder={f.placeholder}
              required={f.required}
              maxLength={2000}
            />
          ) : f.type === "select" ? (
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={values[f.name] ?? ""}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              required={f.required}
            >
              <option value="">— wybierz —</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <Input
              type={f.type}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              placeholder={f.placeholder}
              required={f.required}
              maxLength={f.type === "email" ? 255 : f.type === "tel" ? 40 : 200}
            />
          )}
        </div>
      ))}
      <Button
        type="submit"
        disabled={submitting}
        className="w-full"
        size="lg"
        style={{ background: primary, color: "#fff" }}
      >
        {submitting ? "Wysyłam…" : page.cta_text}
      </Button>
    </form>
  );
}
