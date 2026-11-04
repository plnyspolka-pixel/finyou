// Mapa położenia nieruchomości w raporcie (OpenStreetMap, osadzenie bez
// dodatkowych bibliotek) + działka ewidencyjna z ULDK i najbliższa infrastruktura.
import { MapPinned } from "lucide-react";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import { NUISANCE_LABEL } from "@/lib/property-analysis/surroundings";
import {
  EEA_CDDA_LAYERS,
  EEA_CDDA_WMS,
  EEA_NATURA2000_LAYERS,
  EEA_NATURA2000_WMS,
  ISOK_FLOOD_LAYERS,
  ISOK_FLOOD_WMS,
  KIMPZP_LAYERS,
  KIMPZP_WMS,
  wmsGetMapUrl,
} from "@/lib/pdf/static-map";

const ORTO_WMS = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution";

/** Warstwa podkładu + nakładka WMS w tym samym zakresie (EPSG:3857). */
function LayeredWms({
  lat,
  lng,
  zoom,
  overlay,
  title,
}: {
  lat: number;
  lng: number;
  zoom: number;
  overlay: { base: string; layers: string } | null;
  title: string;
}) {
  const view = { lat, lng, zoom, width: 520, height: 300 };
  const base = wmsGetMapUrl(ORTO_WMS, "Raster", view, {
    format: "image/jpeg",
    transparent: false,
    scale: 1,
  });
  return (
    <figure className="space-y-1">
      <div className="relative aspect-[52/30] w-full overflow-hidden rounded-lg border bg-muted">
        <img
          src={base}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        {overlay && (
          <img
            src={wmsGetMapUrl(overlay.base, overlay.layers, view, { scale: 1 })}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-75"
            loading="lazy"
          />
        )}
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow" />
      </div>
      <figcaption className="text-xs text-muted-foreground">{title}</figcaption>
    </figure>
  );
}

const POI_LABEL: Record<string, string> = {
  schools: "Szkoła",
  kindergartens: "Przedszkole",
  groceryStores: "Sklep spożywczy",
  pharmacies: "Apteka",
  clinics: "Przychodnia / szpital",
  publicTransport: "Przystanek",
  parks: "Park",
  restaurants: "Gastronomia",
  banks: "Bank / bankomat",
  shopping: "Centrum handlowe",
};

const fmtDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`;

function embedUrl(lat: number, lng: number, delta: number, marker: boolean): string {
  const bbox = [lng - delta * 1.6, lat - delta, lng + delta * 1.6, lat + delta]
    .map((v) => v.toFixed(6))
    .join(",");
  return (
    `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik` +
    (marker ? `&marker=${lat.toFixed(6)},${lng.toFixed(6)}` : "")
  );
}

export function PropertyLocationMap({ result }: { result: PropertyAnalysisResult | null }) {
  const p = result?.property;
  if (!p) return null;
  const lat = p.latitude;
  const lng = p.longitude;
  const parcel = p.parcel ?? null;
  const nearest = result?.locationScore?.nearest ?? {};
  const nearestRows = Object.keys(POI_LABEL).filter((k) => nearest[k]);

  return (
    <section className="space-y-3 rounded-xl border p-3">
      <h4 className="flex items-center gap-2 font-semibold">
        <MapPinned className="h-4 w-4" /> Lokalizacja nieruchomości
      </h4>
      {lat != null && lng != null ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <iframe
              title="Mapa okolicy nieruchomości"
              src={embedUrl(lat, lng, 0.04, !p.locationApproximate)}
              className="h-64 w-full rounded-lg border"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
            {!p.locationApproximate && (
              <iframe
                title="Zbliżenie na nieruchomość"
                src={embedUrl(lat, lng, 0.0025, true)}
                className="h-64 w-full rounded-lg border"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {p.locationApproximate
              ? "Dokładnego adresu nie ustalono — mapa pokazuje okolicę miejscowości. "
              : ""}
            Współrzędne: {lat.toFixed(6)}, {lng.toFixed(6)} ·{" "}
            <a
              className="underline"
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              otwórz mapę
            </a>
            {" · "}
            <a
              className="underline"
              href={`https://mapy.geoportal.gov.pl/imap/Imgp_2.html?locale=pl&gpmap=gp0&bbox=${lng - 0.003},${lat - 0.002},${lng + 0.003},${lat + 0.002}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Geoportal
            </a>{" "}
            · © OpenStreetMap contributors
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Mapa niedostępna — brak ustalonego położenia (przed rezerwacją dokładna lokalizacja jest
          ukryta).
        </p>
      )}

      {lat != null && lng != null && (
        <div className="grid gap-3 md:grid-cols-3">
          {!p.locationApproximate && (
            <LayeredWms
              lat={lat}
              lng={lng}
              zoom={17}
              overlay={null}
              title="Ortofotomapa (Geoportal GUGiK)"
            />
          )}
          {!p.locationApproximate && (
            <LayeredWms
              lat={lat}
              lng={lng}
              zoom={16}
              overlay={{ base: KIMPZP_WMS, layers: KIMPZP_LAYERS }}
              title="Plany miejscowe (KIMPZP) na ortofotomapie"
            />
          )}
          <LayeredWms
            lat={lat}
            lng={lng}
            zoom={14}
            overlay={{ base: ISOK_FLOOD_WMS, layers: ISOK_FLOOD_LAYERS }}
            title="Obszary zagrożenia powodziowego (ISOK)"
          />
        </div>
      )}

      {result?.mpzp && (
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="font-medium">Plan miejscowy (Krajowa Integracja MPZP)</div>
          {result.mpzp.plans.map((pl, i) => (
            <div key={i} className="mt-1 text-xs">
              <b>{pl.planName ?? "Plan"}</b>
              {pl.symbol ? ` · teren ${pl.symbol}` : ""}
              {pl.purpose ? ` — ${pl.purpose}` : ""}
              {pl.resolution ? ` · uchwała ${pl.resolution}` : ""}
              {pl.url && (
                <>
                  {" · "}
                  <a className="underline" href={pl.url} target="_blank" rel="noopener noreferrer">
                    BIP
                  </a>
                </>
              )}
            </div>
          ))}
          <p className="mt-1 text-xs text-muted-foreground">{result.mpzp.note}</p>
        </div>
      )}

      {parcel && (
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="font-medium">Działka ewidencyjna (ULDK GUGiK)</div>
          <div className="mt-1 grid gap-x-6 gap-y-0.5 text-xs md:grid-cols-2">
            <div>Identyfikator: {parcel.id}</div>
            <div>Numer: {parcel.number}</div>
            {parcel.region && <div>Obręb: {parcel.region}</div>}
            {parcel.commune && <div>Gmina: {parcel.commune}</div>}
            {parcel.county && <div>Powiat: {parcel.county}</div>}
            {parcel.areaM2 != null && (
              <div>Powierzchnia z geometrii: {parcel.areaM2.toLocaleString("pl-PL")} m²</div>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{parcel.note}</p>
        </div>
      )}

      {result?.surroundings && <SurroundingsPanel result={result} />}

      {nearestRows.length > 0 && (
        <div className="text-sm">
          <div className="font-medium">Najbliższa infrastruktura (OpenStreetMap)</div>
          <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-xs md:grid-cols-2">
            {nearestRows.map((k) => (
              <li key={k}>
                {POI_LABEL[k]}: {nearest[k].name ?? "bez nazwy"} —{" "}
                {fmtDistance(nearest[k].distanceM)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SurroundingsPanel({ result }: { result: PropertyAnalysisResult }) {
  const sr = result.surroundings!;
  const p = result.property;
  const pa = sr.protectedAreas;
  const nu = sr.nuisances;
  const pw = sr.powiat;
  const bld = sr.building;
  const num = (x: number) => String(x).replace(".", ",");
  return (
    <div className="space-y-3 text-sm">
      {bld && (
        <div className="text-xs">
          Budynek ewidencyjny (EGiB) {bld.id}
          {bld.footprintM2 != null
            ? ` — powierzchnia zabudowy ok. ${bld.footprintM2.toLocaleString("pl-PL")} m² (nie powierzchnia użytkowa)`
            : ""}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="font-medium">Obszary chronione przyrody (EEA)</div>
          {pa?.areas.length ? (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {pa.areas.map((a, i) => (
                <li key={i}>
                  {a.name} — {a.type}
                  {a.code ? ` (${a.code})` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">{pa?.note ?? "Nie sprawdzono."}</p>
          {p.latitude != null && p.longitude != null && (
            <div className="relative mt-2 aspect-[52/30] w-full overflow-hidden rounded border bg-muted">
              <img
                src={wmsGetMapUrl(
                  "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution",
                  "Raster",
                  { lat: p.latitude, lng: p.longitude, zoom: 12, width: 520, height: 300 },
                  { format: "image/jpeg", transparent: false, scale: 1 },
                )}
                alt="Obszary chronione w okolicy"
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
              {[
                [EEA_CDDA_WMS, EEA_CDDA_LAYERS],
                [EEA_NATURA2000_WMS, EEA_NATURA2000_LAYERS],
              ].map(([base, layers]) => (
                <img
                  key={base}
                  src={wmsGetMapUrl(
                    base,
                    layers,
                    { lat: p.latitude!, lng: p.longitude!, zoom: 12, width: 520, height: 300 },
                    { scale: 1 },
                  )}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-60"
                  loading="lazy"
                />
              ))}
              <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow" />
            </div>
          )}
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="font-medium">
            Uciążliwości w promieniu {nu ? fmtDistance(nu.radiusM) : "2 km"} (OSM)
          </div>
          {nu?.hits.length ? (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {nu.hits.map((h, i) => (
                <li
                  key={i}
                  className={h.alert ? "font-medium text-amber-700 dark:text-amber-400" : ""}
                >
                  {NUISANCE_LABEL[h.key]}
                  {h.name ? ` (${h.name})` : ""} — {fmtDistance(h.distanceM)}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {nu?.note ?? "Nie sprawdzono (brak dokładnego adresu)."}
          </p>
        </div>
      </div>
      {pw?.status === "checked" && (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs">
          <div className="text-sm font-medium">
            {pw.unitName} — dane GUS ({pw.year})
          </div>
          <div className="mt-1 grid gap-x-6 gap-y-0.5 md:grid-cols-2">
            {pw.population != null && (
              <div>
                Ludność: {pw.population.toLocaleString("pl-PL")}
                {pw.populationChange5yPct != null
                  ? ` (5 lat: ${pw.populationChange5yPct > 0 ? "+" : ""}${num(pw.populationChange5yPct)}%)`
                  : ""}
              </div>
            )}
            {pw.migrationPer1000 != null && (
              <div>
                Saldo migracji: {pw.migrationPer1000 > 0 ? "+" : ""}
                {num(pw.migrationPer1000)} / 1000 mieszk.
              </div>
            )}
            {pw.unemploymentPct != null && (
              <div>
                Bezrobocie: {num(pw.unemploymentPct)}%
                {pw.unemploymentPolandPct != null
                  ? ` (Polska ${num(pw.unemploymentPolandPct)}%)`
                  : ""}
              </div>
            )}
            {pw.wageIndexPl100 != null && (
              <div>Wynagrodzenia: {num(pw.wageIndexPl100)}% średniej krajowej</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
