import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";

import { useEffect } from "react";
import appCss from "../styles.css?url";
import { getMetaAppId } from "@/lib/meta-app-id.functions";
import faviconAsset from "@/assets/favicon.png.asset.json";
import { AuthProvider } from "@/hooks/use-auth";
import { PreviewBypassToggle } from "@/components/preview-bypass-toggle";
import { Toaster } from "@/components/ui/sonner";
import { FacebookPixel } from "@/lib/fb-pixel";
import { GoogleAnalytics } from "@/lib/google-analytics";
import { MicrosoftClarity } from "@/lib/clarity";
import { ReferralCapture } from "@/components/affiliate/referral-capture";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Nie znaleziono strony</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Strona, której szukasz, nie istnieje lub została przeniesiona.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Wróć do strony głównej
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Wystąpił błąd</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Spróbuj ponownie
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Wróć do strony głównej
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    // Facebook App ID trzymamy w sekrecie serwera (META_APP_ID); wczytujemy go przy SSR,
    // żeby wyrenderować <meta property="fb:app_id"> w <head> — inaczej scraper Meta go nie zobaczy.
    const { appId } = await getMetaAppId();
    return { fbAppId: appId };
  },
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "d6rVA0W-j2dnMAaXoxXJbkOo71EwtTo6xvtHjfmjVGE" },
      ...(loaderData?.fbAppId ? [{ property: "fb:app_id", content: loaderData.fbAppId }] : []),
      { title: "Finance You — pożyczki pod zastaw nieruchomości" },
      {
        name: "description",
        content:
          "Finance You pomaga uzyskać finansowanie pod zastaw nieruchomości z indywidualnymi warunkami i szybkim wnioskiem online.",
      },
      { property: "og:title", content: "Finance You — pożyczki pod zastaw nieruchomości" },
      { name: "twitter:title", content: "Finance You — pożyczki pod zastaw nieruchomości" },
      {
        property: "og:description",
        content:
          "Finansowanie pod zastaw nieruchomości, szybki wniosek online i dobór warunków do sytuacji klienta.",
      },
      {
        name: "twitter:description",
        content:
          "Finansowanie pod zastaw nieruchomości, szybki wniosek online i dobór warunków do sytuacji klienta.",
      },
      {
        property: "og:image",
        content:
          "https://financeyou.pl/__l5e/assets-v1/e36c4fc3-f4ad-4970-a5b3-5af904ce2b7f/financeyou-og-1200x630.png",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:alt", content: "Finance You — pożyczki pod zastaw nieruchomości" },
      {
        name: "twitter:image",
        content:
          "https://financeyou.pl/__l5e/assets-v1/e36c4fc3-f4ad-4970-a5b3-5af904ce2b7f/financeyou-og-1200x630.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: faviconAsset.url },
      { rel: "apple-touch-icon", href: faviconAsset.url },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isEmbedRoute = useRouterState({
    select: (state) => state.location.pathname.startsWith("/embed"),
  });

  if (isEmbedRoute) {
    return (
      <QueryClientProvider client={queryClient}>
        <main id="main">
          <Outlet />
        </main>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ReferralCapture />
        <FacebookPixel />
        <GoogleAnalytics />
        <MicrosoftClarity />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Przejdź do treści
        </a>
        <main id="main">
          <Outlet />
        </main>
        <Toaster />
        <PreviewBypassToggle />
      </AuthProvider>
    </QueryClientProvider>
  );
}
