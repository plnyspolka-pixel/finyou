// „Podwójna gwarancja satysfakcji” pod cennikiem (decyzja właściciela
// 28.10.2026). Warunki i zakres: Regulamin abonamentu 1.2, § 7 ust. 3–6 —
// liczby z tych samych stałych, żeby strona i regulamin się nie rozjechały.
import {
  GWARANCJA_MAX_ODRZUCONYCH,
  GWARANCJA_MIN_ZLECENIE_PLN,
  GWARANCJA_WINDYKACJA_RAT,
  REGULAMIN_ABONAMENTU_PATH,
} from "@/lib/legal/regulamin-abonamentu";
import { plnLabel } from "@/lib/investor-plan/plans";
import { Icon3D, type Icon3DName } from "./icon-3d";

const GUARANTEES: { n: number; title: string; icon: Icon3DName; text: string }[] = [
  {
    n: 1,
    title: "Uruchomisz pierwszą pożyczkę",
    icon: "handshake",
    text: "Popyt na pieniądze jest nieograniczony, a my mamy świetną sieć sprzedaży — dlatego gwarantujemy, że z nami uruchomisz swoją pierwszą pożyczkę. Jeśli nie — pracujemy dla Ciebie dalej za darmo, aż do skutku!",
  },
  {
    n: 2,
    title: "Windykator AI pracuje dalej gratis",
    icon: "shieldcheck",
    text: `Potrafimy nie tylko sprzedawać pieniądze, ale przede wszystkim je odzyskiwać — dlatego jeśli klient nie będzie wywiązywał się z warunków umowy i dojdzie do jej wypowiedzenia (${GWARANCJA_WINDYKACJA_RAT}\u00a0niewpłacone raty), Windykator AI dalej pracuje dla Ciebie gratis!`,
  },
];

export function DoubleGuarantee() {
  return (
    <div className="fy-guarantee">
      <h3>Podwójna gwarancja satysfakcji</h3>
      <p className="fy-guarantee-lead">
        Robimy to od dawna i robimy to dobrze — dlatego gwarantujemy, że i Ty skorzystasz na
        współpracy z nami:
      </p>
      <div className="fy-guarantee-grid">
        {GUARANTEES.map((g) => (
          <article key={g.n}>
            <Icon3D name={g.icon} size={56} />
            <span className="fy-sales-eyebrow">Gwarancja {g.n}</span>
            <h4>{g.title}</h4>
            <p>{g.text}</p>
          </article>
        ))}
      </div>
      <p className="fy-guarantee-terms">
        Warunki gwarancji 1: zawarte umowy o dostęp do Klientów, aktywne Zlecenie kwoty od{" "}
        {plnLabel(GWARANCJA_MIN_ZLECENIE_PLN)} i nie więcej niż {GWARANCJA_MAX_ODRZUCONYCH}{" "}
        odrzucone sprawy spełniające warunki Zlecenia. Gwarancja 2 dotyczy pożyczek udzielonych
        klientom przedstawionym przez Finance You. Gwarancje nie dotyczą zysku ani odzyskania
        należności. Szczegóły: § 7 <a href={REGULAMIN_ABONAMENTU_PATH}>regulaminu abonamentu</a>.
      </p>
    </div>
  );
}
