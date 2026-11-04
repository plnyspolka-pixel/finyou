// Sklep panelu inwestora — zakładka „Moje zakupy” (/inwestor/sklep?tab=zakupy):
// tu wracają płatności Tpay (?tpay=success|error) i prowadzi e-mail potwierdzający.
// Dostęp nadaje wyłącznie webhook Tpay (fulfill_store_order) — parametr tpay jest
// tylko wskazówką UI; dopóki zamówienie jest „pending”, dopytujemy serwer.
// Pokazuje: kalkulator compliance (HIT), okres dawnego Centrum Zarządzania
// (produkt wycofany, opłacone tury działają), lekcje (darmowa lekcja 1 + kupione,
// także z dawnych modułów/pakietu), dawne dokumenty z generatorem DOCX, raporty
// KW i historię zamówień.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicStoreCatalog } from "@/lib/storefront/catalog.functions";
import {
  acceptStoreDpa,
  getMyStorePurchases,
  getPurchasedDocumentTemplate,
  getPurchasedLessonUrl,
  getStoreLegalTexts,
} from "@/lib/storefront/checkout.functions";
import { getPurchasedKwReport } from "@/lib/storefront/kw-report.functions";
import {
  generateDocxFromTemplate,
  getGeneratedDocSignedUrl,
} from "@/lib/document-generator.functions";
import {
  CALCULATOR_UNLOCK_TITLE,
  cleanLessonTitle,
  formatLessonDuration,
} from "@/lib/storefront/products";
import { hasPendingOrder, ownedLessonIds, pln, type Entitlement, type Order } from "./store-shared";

const date = (d: Date) => d.toLocaleDateString("pl-PL");

export function StoreLibrary({
  tpay,
  onGoToProducts,
}: {
  tpay?: string;
  onGoToProducts: () => void;
}) {
  const qc = useQueryClient();
  const fetchPurchases = useServerFn(getMyStorePurchases);
  const fetchCatalog = useServerFn(getPublicStoreCatalog);
  const fetchLegal = useServerFn(getStoreLegalTexts);
  const getLesson = useServerFn(getPurchasedLessonUrl);
  const getDoc = useServerFn(getPurchasedDocumentTemplate);
  const getKw = useServerFn(getPurchasedKwReport);
  const generate = useServerFn(generateDocxFromTemplate);
  const getDownload = useServerFn(getGeneratedDocSignedUrl);
  const acceptDpa = useServerFn(acceptStoreDpa);

  // Po powrocie z Tpay dopytujemy o status zamówienia co 4 s, najwyżej 3 minuty.
  const [pollUntil] = useState(() => Date.now() + 3 * 60_000);
  const purchasesQ = useQuery({
    queryKey: ["store-purchases"],
    queryFn: () => fetchPurchases(),
    refetchInterval: (query) =>
      hasPendingOrder((query.state.data?.orders ?? []) as Order[]) && Date.now() < pollUntil
        ? 4000
        : false,
  });
  const catalogQ = useQuery({
    queryKey: ["store-catalog"],
    queryFn: () => fetchCatalog(),
    staleTime: 60_000,
  });
  const legalQ = useQuery({
    queryKey: ["store-legal"],
    queryFn: () => fetchLegal(),
    staleTime: 10 * 60_000,
  });

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [video, setVideo] = useState<{ title: string; url: string; external: boolean } | null>(
    null,
  );
  const [download, setDownload] = useState<{ url: string; label: string } | null>(null);
  const [doc, setDoc] = useState<{ id: string; name: string; placeholders: string[] } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dpaCheck, setDpaCheck] = useState(false);

  const purchases = purchasesQ.data;
  const entitlements = useMemo(() => (purchases?.entitlements ?? []) as Entitlement[], [purchases]);
  const orders = (purchases?.orders ?? []) as Order[];
  const lessons = useMemo(() => catalogQ.data?.lessons ?? [], [catalogQ.data]);
  const owned = useMemo(() => ownedLessonIds(entitlements, lessons), [entitlements, lessons]);
  const myLessons = lessons.filter((l) => l.free || l.number === 1 || owned.has(l.id));
  const documents = (catalogQ.data?.documents ?? []).filter((d) =>
    entitlements.some((e) => e.item_kind === "document" && e.item_id === d.id),
  );
  const kwItems = entitlements.filter((e) => e.item_kind === "kw");
  const pending = hasPendingOrder(orders);
  const anyPaid = orders.some((o) => o.status === "paid");
  const calcUntil = purchases?.calculatorActiveUntil
    ? new Date(purchases.calculatorActiveUntil)
    : null;
  const calcActive = Boolean(calcUntil && calcUntil.getTime() > Date.now());
  const mgmtUntil = purchases?.managementActiveUntil
    ? new Date(purchases.managementActiveUntil)
    : null;
  const mgmtActive = Boolean(mgmtUntil && mgmtUntil.getTime() > Date.now());

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operacja nieudana.");
    } finally {
      setBusy("");
    }
  };
  const openLesson = (id: string) =>
    void act("lesson:" + id, async () => {
      const item = await getLesson({ data: { id } });
      setVideo(item);
      setMessage("Dostęp do filmu jest aktywny. Link do odtwarzania wygasa po 10 minutach.");
    });
  const openDoc = (id: string) =>
    void act("document:" + id, async () => {
      const item = await getDoc({ data: { id } });
      setDoc(item);
      setValues({});
    });
  const makeDoc = () => {
    if (!doc) return;
    void act("generate:" + doc.id, async () => {
      const result = await generate({ data: { templateId: doc.id, values } });
      const link = await getDownload({ data: { path: result.docxPath, expiresInSec: 300 } });
      setDownload({ url: link.url, label: "Pobierz wygenerowany dokument DOCX" });
      setMessage("Dokument wygenerowano. Link do pobrania jest ważny 5 minut.");
    });
  };
  const openKw = (id: string) =>
    void act("kw:" + id, async () => {
      const result = await getKw({ data: { kw: id } });
      if (!result.ready) {
        setMessage(result.message || "Raport jest przygotowywany — spróbuj ponownie za chwilę.");
        return;
      }
      setDownload({ url: result.url, label: "Pobierz raport KW " + result.kw + " — PDF" });
      setMessage("Raport KW " + result.kw + " jest gotowy. Pobierz PDF z poniższego linku.");
    });
  const signDpa = () =>
    void act("dpa", async () => {
      await acceptDpa({ data: { accepted: true } });
      await qc.invalidateQueries({ queryKey: ["store-purchases"] });
      await qc.invalidateQueries({ queryKey: ["store-dpa-acceptance"] });
      setDpaCheck(false);
      setMessage("Umowa powierzenia została zaakceptowana i zapisana na Twoim koncie.");
    });

  if (purchasesQ.isLoading) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Sprawdzanie płatności i uprawnień…
      </p>
    );
  }
  if (purchasesQ.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Nie udało się wczytać zakupów. Odśwież stronę albo zaloguj się ponownie.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {tpay === "success" && pending && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Dziękujemy za płatność. Czekamy na potwierdzenie z serwera Tpay — zwykle kilka sekund.
            Dostęp pojawi się tu automatycznie; nie udostępniamy treści na podstawie samego powrotu
            z bramki.
          </AlertDescription>
        </Alert>
      )}
      {tpay === "success" && !pending && anyPaid && (
        <Alert className="border-emerald-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription>
            Płatność potwierdzona — zakupione produkty są poniżej.
          </AlertDescription>
        </Alert>
      )}
      {tpay === "error" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Płatność nie została zakończona. Koszyk czeka w zakładce „Produkty” — możesz spróbować
            ponownie.
          </AlertDescription>
        </Alert>
      )}
      {tpay !== "success" && pending && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Masz płatność oczekującą na potwierdzenie. Po jej rozliczeniu produkty pojawią się tu
            automatycznie.
          </AlertDescription>
        </Alert>
      )}
      {message && (
        <p
          role="status"
          className="rounded-md border border-emerald-300 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      {download && (
        <p className="rounded-md border border-emerald-300 p-3 text-sm">
          <a
            className="font-semibold underline"
            href={download.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {download.label}
          </a>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Card className={calcActive ? "border-emerald-300" : undefined}>
        <CardHeader>
          <CardTitle className="text-base">
            {CALCULATOR_UNLOCK_TITLE} — kalkulator compliance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          {calcUntil ? (
            <span className={calcActive ? "text-emerald-700" : "text-muted-foreground"}>
              {calcActive
                ? `Kalkulator aktywny do ${date(calcUntil)}.`
                : `Okres dostępu zakończył się ${date(calcUntil)}.`}
            </span>
          ) : (
            <span className="text-muted-foreground">Nie masz jeszcze opłaconego kalkulatora.</span>
          )}
          {calcActive ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/inwestor/kalkulator">Otwórz kalkulator compliance</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onGoToProducts}>
              {calcUntil ? "Odnów za 9,99 zł" : "Kup za 9,99 zł"}
            </Button>
          )}
        </CardContent>
      </Card>

      {mgmtUntil && (
        <Card className={mgmtActive ? "border-emerald-300" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">Centrum Zarządzania</CardTitle>
            <CardDescription>
              Produkt wycofany ze sprzedaży — opłacony wcześniej okres działa do końca.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className={mgmtActive ? "text-emerald-700" : "text-muted-foreground"}>
              {mgmtActive
                ? `Moduł aktywny do ${date(mgmtUntil)}. Dokumenty, CRM, e-podpis i compliance działają w panelu.`
                : `Okres modułu zakończył się ${date(mgmtUntil)}. Te narzędzia są w abonamencie inwestora.`}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to={mgmtActive ? "/inwestor/kreator-dokumentow" : "/inwestor/abonament"}>
                {mgmtActive ? "Otwórz generator dokumentów" : "Zobacz abonament"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lekcje Akademii</CardTitle>
          <CardDescription>
            Lekcja 1 jest za darmo; pozostałe pojawiają się tu po opłaceniu. Każda lekcja to osobne
            nagranie — link do odtwarzania wygasa po 10 minutach.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {catalogQ.isLoading && (
            <p className="text-sm text-muted-foreground">Wczytywanie listy lekcji…</p>
          )}
          {!catalogQ.isLoading && myLessons.length === 0 && (
            <p className="text-sm text-muted-foreground">Nie masz jeszcze kupionych lekcji.</p>
          )}
          {myLessons.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {myLessons.map((l) => {
                const free = l.free || l.number === 1;
                const dur = formatLessonDuration(l.durationSeconds);
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="w-7 shrink-0 font-bold text-amber-600">
                      {String(l.number).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{cleanLessonTitle(l.title)}</div>
                      <div className="text-xs text-muted-foreground">{dur ?? ""}</div>
                    </div>
                    {free ? (
                      <Badge variant="secondary">Za darmo</Badge>
                    ) : (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        Kupiona
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(busy)}
                      onClick={() => openLesson(l.id)}
                    >
                      {busy === "lesson:" + l.id ? "Otwieranie…" : "Oglądaj"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {!catalogQ.isLoading && myLessons.length < lessons.length && (
            <Button variant="link" size="sm" className="px-0" onClick={onGoToProducts}>
              Dokup kolejne lekcje →
            </Button>
          )}
          {video && (
            <div className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">{video.title}</h3>
              {video.external ? (
                <a className="underline" href={video.url} target="_blank" rel="noopener noreferrer">
                  Otwórz nagranie w nowej karcie
                </a>
              ) : (
                <video
                  src={video.url}
                  controls
                  playsInline
                  className="aspect-video w-full max-w-4xl rounded-md bg-black"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {kwItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raporty ksiąg wieczystych</CardTitle>
            <CardDescription>
              Pobranie księgi i analiza ruszają przy pierwszym otwarciu po opłaceniu — raport może
              potrzebować chwili.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm">
              {kwItems.map((i) => (
                <li
                  key={i.item_id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="font-medium">KW {i.item_id}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busy)}
                    onClick={() => openKw(i.item_id)}
                  >
                    {busy === "kw:" + i.item_id
                      ? "Pobieranie i analiza…"
                      : "Wygeneruj / pobierz PDF"}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zakupione dokumenty</CardTitle>
            <CardDescription>
              Wzory kupione pojedynczo (sprzedaż wycofana). Generowanie wymaga aktualnej umowy
              powierzenia danych (art. 28 RODO).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y rounded-lg border text-sm">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="font-medium">{d.title}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busy)}
                    onClick={() => openDoc(d.id)}
                  >
                    {busy === "document:" + d.id ? "Otwieranie…" : "Wygeneruj dokument"}
                  </Button>
                </li>
              ))}
            </ul>
            {purchases && !purchases.dpaAccepted && (
              <div className="space-y-3 rounded-lg border p-3 text-sm">
                <h3 className="font-semibold">Umowa powierzenia danych</h3>
                <p className="text-muted-foreground">
                  Aby przetwarzać dane stron umowy w generatorze, zaakceptuj poniższy dokument.
                </p>
                <details className="rounded-md border p-2">
                  <summary className="cursor-pointer font-semibold">Pełna treść umowy</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">
                    {legalQ.data?.dpa.text ?? "Wczytywanie…"}
                  </pre>
                </details>
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={dpaCheck}
                    onCheckedChange={(v) => setDpaCheck(v === true)}
                    className="mt-0.5"
                  />
                  <span>Przeczytałem i akceptuję umowę powierzenia danych osobowych.</span>
                </label>
                <Button size="sm" disabled={!dpaCheck || Boolean(busy)} onClick={signDpa}>
                  Zapisz akceptację
                </Button>
              </div>
            )}
            {doc && (
              <div className="space-y-3 rounded-lg border p-3 text-sm">
                <h3 className="font-semibold">Generator: {doc.name}</h3>
                <p className="text-muted-foreground">
                  Wpisz dane do dokumentu. Wszystkie pola i pliki są przypisane do Twojego konta.
                </p>
                {(Array.isArray(doc.placeholders) ? doc.placeholders : []).map((p, i) => (
                  <div key={i} className="space-y-1">
                    <Label htmlFor={`store-doc-${i}`}>{String(p)}</Label>
                    <Input
                      id={`store-doc-${i}`}
                      value={values[String(i)] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [String(i)]: e.target.value }))}
                    />
                  </div>
                ))}
                <Button
                  size="sm"
                  disabled={Boolean(busy) || !purchases?.dpaAccepted}
                  onClick={makeDoc}
                >
                  {busy === "generate:" + doc.id ? "Generowanie…" : "Generuj DOCX"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historia zamówień</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zamówień.</p>
          ) : (
            <ul className="divide-y text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{new Date(o.created_at).toLocaleDateString("pl-PL")}</span>
                  <span className="text-muted-foreground">
                    {o.status === "paid"
                      ? "Opłacone"
                      : o.status === "pending" || o.status === "created"
                        ? "Oczekuje"
                        : o.status === "refunded"
                          ? "Zwrócone"
                          : o.status === "cancelled"
                            ? "Anulowane"
                            : o.status}
                  </span>
                  <span className="font-semibold">{pln(o.amount_grosz / 100)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
