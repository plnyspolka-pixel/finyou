// Sklep panelu inwestora — zakładka „Produkty” (/inwestor/sklep).
// Decyzja właściciela 04.11.2026: publicznego sklepu nie ma (/sklep → 301 tutaj);
// sprzedajemy WYŁĄCZNIE pojedyncze lekcje Akademii (149 zł, lekcja 1 za darmo),
// kalkulator compliance (HIT 9,99 zł / 30 dni) i raport KW (99 zł). Moduły
// Akademii, pakiet całej Akademii i Centrum Zarządzania są wycofane.
// Koszyk: sessionStorage tej karty (lib/storefront/cart-storage.ts) — ten sam,
// który zasilają /dla-inwestora/szkolenie i /dla-inwestora/analityk-ai#raport-kw.
// Ceny, uprawnienia i potwierdzony e-mail egzekwuje serwer (createStoreCheckout);
// dostęp nadaje webhook Tpay — nigdy sam powrót z bramki.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calculator,
  CheckCircle2,
  FileSearch,
  GraduationCap,
  Loader2,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccessState } from "@/hooks/use-access";
import { useAuth } from "@/hooks/use-auth";
import { validateKwNumber } from "@/lib/kw";
import { getPublicStoreCatalog } from "@/lib/storefront/catalog.functions";
import {
  createStoreCheckout,
  getMyStorePurchases,
  getStoreLegalTexts,
} from "@/lib/storefront/checkout.functions";
import {
  CALCULATOR_CART_ITEM_ID,
  calculatorCartItem,
  kwCartItem,
  lessonCartItem,
} from "@/lib/storefront/cart-storage";
import {
  ACADEMY_LESSON_PRICE_PLN,
  ACADEMY_MODULES,
  CALCULATOR_UNLOCK_DAYS,
  CALCULATOR_UNLOCK_PRICE_LABEL,
  CALCULATOR_UNLOCK_TITLE,
  KW_REPORT_PRICE_PLN,
  academyModuleForCatalogLesson,
  cleanLessonTitle,
  formatLessonDuration,
} from "@/lib/storefront/products";
import { ownedLessonIds, pln, type Entitlement, type Lesson } from "./store-shared";
import { useStoreCart, type StoreCart } from "./use-store-cart";

export function StoreProducts({ onGoToLibrary }: { onGoToLibrary: () => void }) {
  const cart = useStoreCart();
  const access = useAccessState("investor");
  const fetchCatalog = useServerFn(getPublicStoreCatalog);
  const fetchPurchases = useServerFn(getMyStorePurchases);

  const catalogQ = useQuery({
    queryKey: ["store-catalog"],
    queryFn: () => fetchCatalog(),
    staleTime: 60_000,
  });
  const purchasesQ = useQuery({
    queryKey: ["store-purchases"],
    queryFn: () => fetchPurchases(),
  });

  const lessons = useMemo(() => catalogQ.data?.lessons ?? [], [catalogQ.data]);
  const entitlements = useMemo(
    () => (purchasesQ.data?.entitlements ?? []) as Entitlement[],
    [purchasesQ.data],
  );
  const owned = useMemo(() => ownedLessonIds(entitlements, lessons), [entitlements, lessons]);
  const calcUntil = purchasesQ.data?.calculatorActiveUntil
    ? new Date(purchasesQ.data.calculatorActiveUntil)
    : null;
  const calcActive = Boolean(calcUntil && calcUntil.getTime() > Date.now());
  // Abonament obejmuje całą Akademię i kalkulator — nie sprzedajemy ich drugi raz.
  const inSubscription = access.hasFullAccess;
  const [kwPurpose, setKwPurpose] = useState(false);

  return (
    <div className="space-y-6">
      {inSubscription && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Masz aktywny abonament inwestora — wszystkie lekcje Akademii i kalkulator compliance są
            w nim bez dopłat (zakładki „Akademia” i „Kalkulator compliance”). Do kupienia osobno
            zostaje raport księgi wieczystej.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <CalculatorCard
            cart={cart}
            activeUntil={calcUntil}
            active={calcActive}
            inSubscription={inSubscription}
          />
          <LessonsCard
            cart={cart}
            lessons={lessons}
            owned={owned}
            loading={catalogQ.isLoading}
            error={catalogQ.isError}
            inSubscription={inSubscription}
            onGoToLibrary={onGoToLibrary}
          />
          <KwCard cart={cart} purpose={kwPurpose} onPurpose={setKwPurpose} />
        </div>
        <div className="lg:sticky lg:top-4">
          <CartCard cart={cart} kwPurpose={kwPurpose} onKwPurpose={setKwPurpose} />
        </div>
      </div>
    </div>
  );
}

// ── HIT: kalkulator compliance na 30 dni ─────────────────────────────────────

function CalculatorCard({
  cart,
  activeUntil,
  active,
  inSubscription,
}: {
  cart: StoreCart;
  activeUntil: Date | null;
  active: boolean;
  inSubscription: boolean;
}) {
  const inCart = cart.ids.has(CALCULATOR_CART_ITEM_ID);
  return (
    <Card id="mapa-szans" className="scroll-mt-20 border-amber-300">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Calculator className="h-5 w-5 text-amber-600" />
          {CALCULATOR_UNLOCK_TITLE}
          <Badge className="bg-orange-500 text-white hover:bg-orange-500">HIT</Badge>
        </CardTitle>
        <CardDescription>
          Pełny kalkulator compliance z panelu na {CALCULATOR_UNLOCK_DAYS} dni: harmonogram spłat,
          zysk i rata, próg odsetek maksymalnych, MPKK, krotność spłaty i próg AML — każde
          ostrzeżenie zanim podpiszesz umowę. Harmonogram wyślesz klientowi albo do kreatora umowy
          jednym kliknięciem.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-extrabold">{CALCULATOR_UNLOCK_PRICE_LABEL}</div>
          <div className="text-xs text-muted-foreground">
            / {CALCULATOR_UNLOCK_DAYS} dni · bez automatycznego odnawiania
          </div>
          {activeUntil && (
            <p className={`mt-2 text-sm ${active ? "text-emerald-700" : "text-muted-foreground"}`}>
              {active
                ? `Aktywny do ${activeUntil.toLocaleDateString("pl-PL")} — kolejna tura przedłuża okres od tej daty.`
                : `Poprzedni okres zakończył się ${activeUntil.toLocaleDateString("pl-PL")}.`}
            </p>
          )}
        </div>
        {inSubscription ? (
          <Badge variant="secondary">W abonamencie bez dopłat</Badge>
        ) : (
          <Button disabled={inCart} onClick={() => cart.add(calculatorCartItem())}>
            {inCart
              ? "W koszyku"
              : active
                ? `Przedłuż o ${CALCULATOR_UNLOCK_DAYS} dni — ${CALCULATOR_UNLOCK_PRICE_LABEL}`
                : `Dodaj do koszyka — ${CALCULATOR_UNLOCK_PRICE_LABEL}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Lekcje Akademii — po jednej ──────────────────────────────────────────────

function LessonsCard({
  cart,
  lessons,
  owned,
  loading,
  error,
  inSubscription,
  onGoToLibrary,
}: {
  cart: StoreCart;
  lessons: Lesson[];
  owned: Set<string>;
  loading: boolean;
  error: boolean;
  inSubscription: boolean;
  onGoToLibrary: () => void;
}) {
  // Moduły Akademii służą już tylko do grupowania listy (nie są sprzedawane).
  const groups = useMemo(() => {
    const byModule = new Map<number, Lesson[]>();
    const rest: Lesson[] = [];
    for (const l of lessons) {
      const m = academyModuleForCatalogLesson(l);
      if (m) byModule.set(m.number, [...(byModule.get(m.number) ?? []), l]);
      else rest.push(l);
    }
    return { byModule, rest };
  }, [lessons]);

  const groupProps = { cart, owned, inSubscription, onGoToLibrary };
  return (
    <Card id="lekcje" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-5 w-5" /> Lekcje Akademii — po jednej
        </CardTitle>
        <CardDescription>
          Każda lekcja kosztuje {pln(ACADEMY_LESSON_PRICE_PLN)}; lekcja 1 jest za darmo. Kupione
          lekcje oglądasz w „Moich zakupach” — bez abonamentu. W abonamencie masz całą Akademię w
          zakładce „Akademia”.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie listy lekcji…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Nie udało się pobrać listy lekcji. Odśwież stronę.
          </p>
        )}
        {ACADEMY_MODULES.map((m) => {
          const list = groups.byModule.get(m.number) ?? [];
          if (!list.length) return null;
          return (
            <LessonGroup
              key={m.id}
              title={`Moduł ${m.number} · ${m.title}`}
              lessons={list}
              {...groupProps}
            />
          );
        })}
        {groups.rest.length > 0 && (
          <LessonGroup title="Pozostałe nagrania" lessons={groups.rest} {...groupProps} />
        )}
      </CardContent>
    </Card>
  );
}

function LessonGroup({
  title,
  lessons,
  cart,
  owned,
  inSubscription,
  onGoToLibrary,
}: {
  title: string;
  lessons: Lesson[];
  cart: StoreCart;
  owned: Set<string>;
  inSubscription: boolean;
  onGoToLibrary: () => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="mt-2 divide-y rounded-lg border">
        {lessons.map((l) => {
          const free = l.free || l.number === 1;
          const dur = formatLessonDuration(l.durationSeconds);
          const id = "lesson:" + l.id;
          const inCart = cart.ids.has(id);
          let action: ReactNode;
          if (free) {
            action = (
              <>
                <Badge variant="secondary">Za darmo</Badge>
                <Button variant="outline" size="sm" onClick={onGoToLibrary}>
                  Obejrzyj
                </Button>
              </>
            );
          } else if (owned.has(l.id)) {
            action = (
              <>
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Kupiona</Badge>
                <Button variant="outline" size="sm" onClick={onGoToLibrary}>
                  Oglądaj
                </Button>
              </>
            );
          } else if (inSubscription) {
            action = <Badge variant="secondary">W abonamencie</Badge>;
          } else {
            action = (
              <Button
                size="sm"
                variant={inCart ? "secondary" : "default"}
                disabled={inCart}
                onClick={() => cart.add(lessonCartItem(l))}
                aria-label={`Dodaj do koszyka lekcję: ${cleanLessonTitle(l.title)}`}
              >
                {inCart ? "W koszyku" : `+ Dodaj · ${pln(ACADEMY_LESSON_PRICE_PLN)}`}
              </Button>
            );
          }
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="w-7 shrink-0 font-bold text-amber-600">
                {String(l.number).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{cleanLessonTitle(l.title)}</div>
                <div className="text-xs text-muted-foreground">
                  {free ? "Za darmo" : pln(ACADEMY_LESSON_PRICE_PLN)}
                  {dur ? ` · ${dur}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">{action}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Raport księgi wieczystej (99 zł) ─────────────────────────────────────────

function KwCard({
  cart,
  purpose,
  onPurpose,
}: {
  cart: StoreCart;
  purpose: boolean;
  onPurpose: (v: boolean) => void;
}) {
  const [kw, setKw] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdded(null);
    const check = validateKwNumber(kw);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    if (!purpose) {
      setError("Potwierdź, że masz uprawniony cel analizy danych księgi.");
      return;
    }
    setError("");
    setKw(check.value);
    cart.add(kwCartItem(check));
    setAdded(check.value);
  }

  return (
    <Card id="raport-kw" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSearch className="h-5 w-5" /> Raport księgi wieczystej
        </CardTitle>
        <CardDescription>
          Wpisz numer księgi dowolnej nieruchomości — po opłaceniu pobieramy księgę i generujemy
          raport analityczny w PDF ({pln(KW_REPORT_PRICE_PLN)} za jedną KW). Numer i cyfrę kontrolną
          sprawdzamy według reguł EKW; bez potwierdzonej płatności nie pobieramy księgi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="store-kw">Numer księgi wieczystej</Label>
            <Input
              id="store-kw"
              value={kw}
              autoComplete="off"
              spellCheck={false}
              placeholder="LU1I/00012345/6"
              aria-invalid={!!error}
              onChange={(e) => {
                setKw(e.target.value.toUpperCase());
                setError("");
                setAdded(null);
              }}
              onBlur={() => {
                const v = validateKwNumber(kw);
                if (v.ok) setKw(v.value);
              }}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={purpose}
              onCheckedChange={(v) => onPurpose(v === true)}
              className="mt-0.5"
            />
            <span>
              Potwierdzam, że mam uprawniony cel analizy danych zawartych w tej księdze wieczystej.{" "}
              <a
                className="underline"
                href="/polityka-prywatnosci"
                target="_blank"
                rel="noreferrer"
              >
                Informacja o przetwarzaniu danych
              </a>
              .
            </span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {added && (
            <p role="status" className="text-sm text-emerald-700">
              Numer {added} jest poprawny formalnie — raport jest w koszyku. Pobranie i analiza
              ruszą po płatności.
            </p>
          )}
          <Button type="submit" variant="outline">
            Dodaj raport do koszyka — {pln(KW_REPORT_PRICE_PLN)}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Koszyk i płatność Tpay ───────────────────────────────────────────────────

function CartCard({
  cart,
  kwPurpose,
  onKwPurpose,
}: {
  cart: StoreCart;
  kwPurpose: boolean;
  onKwPurpose: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const fetchLegal = useServerFn(getStoreLegalTexts);
  const checkout = useServerFn(createStoreCheckout);
  const legalQ = useQuery({
    queryKey: ["store-legal"],
    queryFn: () => fetchLegal(),
    staleTime: 10 * 60_000,
  });
  const [buyerName, setBuyerName] = useState("");
  const [terms, setTerms] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [withdrawal, setWithdrawal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  // Nabywca z profilu konta (można poprawić przed płatnością).
  useEffect(() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    if (!buyerName && typeof meta.full_name === "string") setBuyerName(meta.full_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const hasKw = cart.items.some((i) => i.type === "kw");
  const allowed =
    cart.items.length > 0 &&
    Boolean(legalQ.data) &&
    buyerName.trim().length >= 3 &&
    terms &&
    immediate &&
    withdrawal &&
    (!hasKw || kwPurpose);

  async function pay() {
    if (!allowed || paying) return;
    setPaying(true);
    setPayError("");
    try {
      const res = await checkout({
        data: {
          buyerName: buyerName.trim(),
          cart: cart.items.map((i) => ({ kind: i.type, id: i.id.slice(i.id.indexOf(":") + 1) })),
          terms: true,
          immediate: true,
          withdrawalAcknowledgement: true,
          dpa: false,
          kwPurpose: hasKw ? kwPurpose : false,
        },
      });
      window.location.assign(res.paymentUrl);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Nie udało się rozpocząć płatności.");
      setPaying(false);
    }
  }

  return (
    <Card id="koszyk" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-5 w-5" /> Koszyk{" "}
          <span className="text-muted-foreground">({cart.items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cart.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dodaj lekcję, kalkulator compliance albo raport KW. Pozycje dodane na stronach
            „Szkolenie” i „Analityk AI” też trafiają tutaj.
          </p>
        ) : (
          <>
            <ul className="divide-y text-sm">
              {cart.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">{i.title}</span>
                  <span className="flex shrink-0 items-center gap-2 font-semibold">
                    {pln(i.price)}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={"Usuń " + i.title}
                      onClick={() => cart.remove(i.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between text-base font-bold">
              <span>Łącznie</span>
              <span>{pln(cart.total)}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-buyer">Imię i nazwisko / nazwa nabywcy</Label>
              <Input
                id="store-buyer"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                autoComplete="name"
                placeholder="Dane do potwierdzenia zakupu"
              />
              <p className="text-xs text-muted-foreground">
                Potwierdzenie zakupu trafi na adres e-mail Twojego konta (musi być zweryfikowany).
              </p>
            </div>
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-semibold">
                Regulamin sklepu produktów cyfrowych
                {legalQ.data ? ` (wersja ${legalQ.data.terms.version})` : ""}
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">
                {legalQ.data?.terms.text ?? "Wczytywanie…"}
              </pre>
            </details>
            <Consent checked={terms} onChange={setTerms}>
              Zapoznałem się z regulaminem sklepu i akceptuję jego treść.
            </Consent>
            <Consent checked={immediate} onChange={setImmediate}>
              Wyraźnie żądam rozpoczęcia dostarczania zakupionych treści cyfrowych przed upływem
              terminu odstąpienia.
            </Consent>
            <Consent checked={withdrawal} onChange={setWithdrawal}>
              Przyjmuję do wiadomości, że po rozpoczęciu dostarczania treści cyfrowych mogę utracić
              ustawowe prawo odstąpienia, gdy spełnione zostaną wymagania prawa.
            </Consent>
            {hasKw && (
              <Consent checked={kwPurpose} onChange={onKwPurpose}>
                Potwierdzam uprawniony cel analizy danych księgi wieczystej z koszyka.
              </Consent>
            )}
            {payError && (
              <p role="alert" className="text-sm text-destructive">
                {payError}
              </p>
            )}
            <Button className="w-full" disabled={!allowed || paying} onClick={() => void pay()}>
              {paying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Łączenie z Tpay…
                </>
              ) : (
                `Przejdź do płatności Tpay — ${pln(cart.total)}`
              )}
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={cart.clear}>
              Wyczyść koszyk
            </Button>
            <p className="text-xs text-muted-foreground">
              Ceny są obliczane ponownie na serwerze. Sam powrót z bramki Tpay nie daje dostępu —
              zakup uruchamia się po potwierdzeniu płatności z serwera Tpay, a produkty pojawiają
              się w „Moich zakupach”.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Consent({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <span>{children}</span>
    </label>
  );
}
