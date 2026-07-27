import type { CSSProperties } from "react";

/**
 * Finance You — 3D isometric icon set (marketing only).
 * Premium rendered navy + gold objects on transparent backgrounds. The images
 * ship as static assets under /public/marketing/icons-3d, so this is a thin
 * <img> wrapper. Ported from the Finance You Design System export.
 */

const FILES = {
  apartment: "apartment.png",
  house: "house.png",
  plot: "plot.png",
  field: "field.png",
  calculator: "calculator.png",
  loan: "loan.png",
  shield: "shield.png",
  handshake: "handshake.png",
  growth: "growth.png",
  chat: "chat.png",
  crm: "crm.png",
  kalkulator: "kalkulator.png",
  application: "application.png",
  investors: "investors.png",
  documents: "documents.png",
  academy: "academy.png",
  ai: "ai.png",
  automation: "automation.png",
  status: "status.png",
  compliance: "compliance.png",
  access: "access.png",
  training: "training.png",
  dossier: "dossier.png",
  procedures: "procedures.png",
  knowledge: "knowledge.png",
  aibrain: "aibrain.png",
  crmfolder: "crmfolder.png",
  shieldcheck: "shieldcheck.png",
  community: "community.png",
  updates: "updates.png",
  complianceAml: "compliance-aml.png",
  complianceRodo: "compliance-rodo.png",
  complianceDocs: "compliance-dokumentacja.png",
  complianceProc: "compliance-procedury.png",
  complianceRegistry: "compliance-rejestry.png",
  complianceProcess: "compliance-zgodnosc.png",
  propApartment: "prop-apartment.png",
  propHouse: "prop-house.png",
  propStore: "prop-store.png",
  propPlot: "prop-plot.png",
  propField: "prop-field.png",
} as const;

export type Icon3DName = keyof typeof FILES;
export const ICON3D_NAMES = Object.keys(FILES) as Icon3DName[];

const BASE = "/marketing/icons-3d";

type Props = {
  name: Icon3DName;
  size?: number;
  alt?: string;
  shadow?: boolean;
  className?: string;
  style?: CSSProperties;
  imgStyle?: CSSProperties;
};

export function Icon3D({ name, size = 64, alt, shadow = true, className, style, imgStyle }: Props) {
  const file = FILES[name] ?? FILES.shield;
  const src = `${BASE}/${file}`;
  const decorative = alt == null;
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        verticalAlign: "middle",
        ...style,
      }}
    >
      <img
        src={src}
        alt={decorative ? "" : alt}
        aria-hidden={decorative ? true : undefined}
        loading="lazy"
        draggable={false}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          filter: shadow ? "drop-shadow(0 6px 9px oklch(0.16 0.09 265 / 0.28))" : "none",
          ...imgStyle,
        }}
      />
    </span>
  );
}
