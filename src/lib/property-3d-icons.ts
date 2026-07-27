import apartmentAsset from "@/assets/3d/apartment.png.asset.json";
import houseAsset from "@/assets/3d/house.png.asset.json";
import plotAsset from "@/assets/3d/plot.png.asset.json";
import commercialAsset from "@/assets/3d/commercial.png.asset.json";
import otherAsset from "@/assets/3d/other.png.asset.json";
const otherAssetUrl = otherAsset.url;

export const PROPERTY_3D_ICON: Record<string, string> = {
  apartment: apartmentAsset.url,
  mieszkanie: apartmentAsset.url,
  house: houseAsset.url,
  dom: houseAsset.url,
  plot_building: plotAsset.url,
  dzialka: plotAsset.url,
  dzialka_budowlana: plotAsset.url,
  grunt_rolny: plotAsset.url,
  commercial: commercialAsset.url,
  lokal_uslugowy: commercialAsset.url,
  inna: otherAssetUrl,
  udzial_w_nieruchomosci: otherAssetUrl,
};

export const PROPERTY_LABELS: Record<string, string> = {
  apartment: "Mieszkanie",
  mieszkanie: "Mieszkanie",
  house: "Dom",
  dom: "Dom",
  plot_building: "Działka",
  dzialka: "Działka",
  dzialka_budowlana: "Działka",
  commercial: "Lokal użytkowy",
  lokal_uslugowy: "Lokal użytkowy",
  inna: "Nieruchomość",
};

export function property3dIcon(type: string | null | undefined): string {
  if (!type) return commercialAsset.url;
  return PROPERTY_3D_ICON[type] ?? commercialAsset.url;
}

export function propertyLabel(type: string | null | undefined): string {
  if (!type) return "Nieruchomość";
  return PROPERTY_LABELS[type] ?? type;
}
