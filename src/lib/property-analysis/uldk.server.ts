// ULDK (GUGiK) — działka pod punktem (oficjalna, bezpłatna usługa państwowa).
import { parseUldkResponse, type UldkParcel } from "./uldk";

const ULDK_ENDPOINT = "https://uldk.gugik.gov.pl/";
const USER_AGENT = "FinanceYou-Analysis/1.0 (+https://financeyou.pl)";

export async function fetchParcelByPoint(lat: number, lng: number): Promise<UldkParcel | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = new URL(ULDK_ENDPOINT);
  url.searchParams.set("request", "GetParcelByXY");
  url.searchParams.set("xy", `${lng},${lat},4326`);
  url.searchParams.set("result", "id,voivodeship,county,commune,region,parcel,geom_wkt");
  url.searchParams.set("srid", "4326");
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return parseUldkResponse(await res.text());
  } catch {
    return null;
  }
}
