// Zamówienie raportu księgi wieczystej (99 zł / jedna KW) — ten sam formularz
// w sklepie (/sklep#analityk, `mode="inline"`: dodaje do koszyka strony) i na
// podstronie Analityka AI (`mode="redirect"`: zapisuje pozycję do koszyka
// sessionStorage i prowadzi na /sklep#koszyk). Numer sprawdzamy formalnie
// (cyfra kontrolna, lib/kw.ts); księgę pobieramy i raport generujemy dopiero
// po zaksięgowanej płatności (storefront/kw-report.functions.ts).
import { useState, type FormEvent } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { validateKwNumber } from "@/lib/kw";
import { addToStoreCart, STORE_CART_PATH, type StoreCartItem } from "@/lib/storefront/cart-storage";
import { KW_REPORT_PRICE_PLN } from "@/lib/storefront/products";

export function kwCartItem(kw: { value: string; compact: string }): StoreCartItem {
  return {
    id: "kw:" + kw.compact,
    type: "kw",
    title: "Raport księgi wieczystej " + kw.value,
    price: KW_REPORT_PRICE_PLN,
  };
}

type Props =
  | {
      mode: "inline";
      onAdd: (item: StoreCartItem) => void;
      purpose: boolean;
      onPurpose: (v: boolean) => void;
    }
  | { mode: "redirect" };

export function KwReportOrder(props: Props) {
  const [kw, setKw] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState<string | null>(null);
  const [ownPurpose, setOwnPurpose] = useState(false);
  const purpose = props.mode === "inline" ? props.purpose : ownPurpose;
  const setPurpose = props.mode === "inline" ? props.onPurpose : setOwnPurpose;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setReady(null);
    const check = validateKwNumber(kw);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    if (!purpose) {
      setError("Potwierdź, że masz uprawniony cel analizy danych księgi.");
      return;
    }
    setKw(check.value);
    setError("");
    const item = kwCartItem(check);
    if (props.mode === "inline") {
      props.onAdd(item);
      setReady(check.value);
      return;
    }
    addToStoreCart(item);
    window.location.assign(STORE_CART_PATH);
  }

  const inline = props.mode === "inline";
  return (
    <form
      className={inline ? "fy-store-kw-form" : "fy-store-kw-form fy-kw-order"}
      onSubmit={submit}
    >
      <label htmlFor="fy-store-kw">Numer księgi wieczystej</label>
      <input
        id="fy-store-kw"
        autoComplete="off"
        spellCheck={false}
        value={kw}
        onChange={(e) => {
          setKw(e.target.value.toUpperCase());
          setError("");
          setReady(null);
        }}
        onBlur={() => {
          const v = validateKwNumber(kw);
          if (v.ok) setKw(v.value);
        }}
        placeholder="LU1I/00012345/6"
        aria-invalid={!!error}
        aria-describedby="fy-kw-help fy-kw-error"
      />
      <small id="fy-kw-help">
        Format XXXX/12345678/9. Numer i cyfra kontrolna są sprawdzane według reguł EKW.
      </small>
      <label className="fy-store-check">
        <input type="checkbox" checked={purpose} onChange={(e) => setPurpose(e.target.checked)} />
        <span>
          Potwierdzam, że mam uprawniony cel analizy danych zawartych w tej księdze wieczystej.{" "}
          <a href="/polityka-prywatnosci">Informacja o przetwarzaniu danych</a>.
        </span>
      </label>
      {error && (
        <p id="fy-kw-error" className="fy-store-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="fy-store-add fy-store-kw-submit">
        {inline
          ? `Dodaj raport do koszyka — ${KW_REPORT_PRICE_PLN} zł`
          : `Generuj raport — ${KW_REPORT_PRICE_PLN} zł`}
      </button>
      {ready && (
        <div className="fy-store-kw-ready" role="status">
          <ShieldCheck size={20} />
          <div>
            Numer <strong>{ready}</strong> jest poprawny formalnie. Raport został dodany do koszyka.
            Pobranie i analiza rozpoczną się dopiero po płatności.
            <p>Po potwierdzeniu płatności pobierz raport na stronie „Moje zakupy”.</p>
          </div>
        </div>
      )}
      <p className="fy-store-fineprint">
        <LockKeyhole size={15} /> Bez potwierdzonej płatności nie pobieramy księgi ani nie
        generujemy płatnego raportu.
        {!inline && " Płatność Tpay po zalogowaniu na konto — koszyk czeka w sklepie."}
      </p>
    </form>
  );
}
