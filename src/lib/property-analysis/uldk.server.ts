// ULDK (GUGiK) — działka pod punktem (oficjalna, bezpłatna usługa państwowa).
import { registryGet } from "@/lib/registry-fetch.server";
import { parseUldkResponse, parseUldkBuilding, type UldkBuilding, type UldkParcel } from "./uldk";

const ULDK_ENDPOINT = "https://uldk.gugik.gov.pl/";
const USER_AGENT = "FinanceYou-Analysis/1.0 (+https://financeyou.pl)";

export async function fetchParcelByPoint(lat: number, lng: number): Promise<UldkParcel | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = new URL(ULDK_ENDPOINT);
  url.searchParams.set("request", "GetParcelByXY");
  url.searchParams.set("xy", `${lng},${lat},4326`);
  url.searchParams.set("result", "id,voivodeship,county,commune,region,parcel,geom_wkt");
  url.searchParams.set("srid", "4326");
  const res = await registryGet(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
    timeoutMs: 15_000,
    prefer: "direct",
  }).catch(() => null);
  return res?.ok ? parseUldkResponse(res.text) : null;
}

/** Budynek ewidencyjny (EGiB) pod punktem — obrys i powierzchnia zabudowy. */
export async function fetchBuildingByPoint(lat: number, lng: number): Promise<UldkBuilding | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = new URL(ULDK_ENDPOINT);
  url.searchParams.set("request", "GetBuildingByXY");
  url.searchParams.set("xy", `${lng},${lat},4326`);
  url.searchParams.set("result", "id,geom_wkt");
  url.searchParams.set("srid", "4326");
  const res = await registryGet(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
    timeoutMs: 15_000,
    prefer: "direct",
  }).catch(() => null);
  return res?.ok ? parseUldkBuilding(res.text) : null;
}
