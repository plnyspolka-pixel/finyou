// Zamówienie raportu księgi wieczystej (99 zł / jedna KW) na podstronie
// Analityka AI (/dla-inwestora/analityk-ai#raport-kw): zapisuje pozycję do
// koszyka sessionStorage i prowadzi do sklepu panelu inwestora
// (/inwestor/sklep#koszyk — niezalogowanego PanelShell przepuszcza przez
// /logowanie, koszyk czeka w tej karcie). Numer sprawdzamy formalnie (cyfra
// kontrolna, lib/kw.ts); księgę pobieramy i raport generujemy dopiero po
// zaksięgowanej płatności (storefront/kw-report.functions.ts). W samym sklepie
// panelu jest własny formularz (components/inwestor/sklep/store-products.tsx).
import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { validateKwNumber } from "@/lib/kw";
import { addToStoreCart, kwCartItem, STORE_CART_PATH } from "@/lib/storefront/cart-storage";
import { KW_REPORT_PRICE_PLN } from "@/lib/storefront/products";

export function KwReportOrder() {
  const [kw, setKw] = useState("");
  const [error, setError] = useState("");
  const [purpose, setPurpose] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    addToStoreCart(kwCartItem(check));
    window.location.assign(STORE_CART_PATH);
  }

  return (
    <form className="fy-store-kw-form fy-kw-order" onSubmit={submit}>
      <label htmlFor="fy-store-kw">Numer księgi wieczystej</label>
      <input
        id="fy-store-kw"
        autoComplete="off"
        spellCheck={false}
        value={kw}
        onChange={(e) => {
          setKw(e.target.value.toUpperCase());
          setError("");
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
        Generuj raport — {KW_REPORT_PRICE_PLN} zł
      </button>
      <p className="fy-store-fineprint">
        <LockKeyhole size={15} /> Bez potwierdzonej płatności nie pobieramy księgi ani nie
        generujemy płatnego raportu. Płatność Tpay po zalogowaniu do panelu inwestora — raport czeka
        w koszyku sklepu panelu.
      </p>
    </form>
  );
}
