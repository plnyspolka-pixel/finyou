/**
 * Finance You — premium brand iconography.
 * Custom duo-tone SVG ikony (navy + gold), spójne 24x24, geometric.
 * Każda ikona ma subtelny gradient i akcent — daje efekt "premium fintech".
 */
import { cn } from "@/lib/utils";

type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
  className?: string;
};

const NAVY = "oklch(0.20 0.08 265)";
const NAVY_SOFT = "oklch(0.40 0.20 265)";
const GOLD = "oklch(0.78 0.18 85)";
const GOLD_DEEP = "oklch(0.68 0.18 75)";

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-navy`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={NAVY_SOFT} />
        <stop offset="100%" stopColor={NAVY} />
      </linearGradient>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={GOLD} />
        <stop offset="100%" stopColor={GOLD_DEEP} />
      </linearGradient>
    </defs>
  );
}

const base = (props: IconProps) => ({
  width: props.size ?? 24,
  height: props.size ?? 24,
  viewBox: "0 0 24 24",
  fill: "none",
  className: cn("shrink-0", props.className),
  ...props,
});

/* —————————— Wallet / kwota —————————— */
export function IconVault(props: IconProps) {
  const id = "vault";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill={`url(#${id}-navy)`} />
      <circle cx="15" cy="12" r="3.2" stroke={GOLD} strokeWidth="1.4" />
      <circle cx="15" cy="12" r="0.9" fill={GOLD} />
      <path
        d="M15 8.2v1.2M15 14.6v1.2M11.2 12h1.2M17.6 12h1.2"
        stroke={GOLD}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <rect x="4.4" y="9" width="3.8" height="6" rx="1" fill={GOLD} fillOpacity="0.25" />
      <path d="M4.4 12h3.8" stroke={GOLD} strokeWidth="0.8" strokeOpacity="0.6" />
    </svg>
  );
}

/* —————————— Clock / okres —————————— */
export function IconClock(props: IconProps) {
  const id = "clock";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <circle cx="12" cy="12" r="9" fill={`url(#${id}-navy)`} />
      <circle cx="12" cy="12" r="9" stroke={GOLD} strokeOpacity="0.35" strokeWidth="0.8" />
      <path
        d="M12 7v5l3.2 2"
        stroke={GOLD}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="0.9" fill={GOLD} />
      {[0, 90, 180, 270].map((a) => (
        <line
          key={a}
          x1="12"
          y1="3.6"
          x2="12"
          y2="4.8"
          stroke={GOLD}
          strokeWidth="1"
          strokeLinecap="round"
          transform={`rotate(${a} 12 12)`}
        />
      ))}
    </svg>
  );
}

/* —————————— LTV / wykres —————————— */
export function IconLtv(props: IconProps) {
  const id = "ltv";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <rect x="2.5" y="2.5" width="19" height="19" rx="3" fill={`url(#${id}-navy)`} />
      <path
        d="M5 16l3.5-3.5 3 2.5 4-5L19 13"
        stroke={GOLD}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="13" r="1.5" fill={GOLD} />
      <path d="M5 19h14" stroke={GOLD} strokeOpacity="0.35" strokeWidth="0.8" />
    </svg>
  );
}

/* —————————— Zap / 48h —————————— */
export function IconBolt(props: IconProps) {
  const id = "bolt";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <circle cx="12" cy="12" r="10" fill={`url(#${id}-navy)`} />
      <path d="M13.5 4l-6 9h4l-1.5 7 6-9h-4l1.5-7z" fill={`url(#${id}-gold)`} />
    </svg>
  );
}

/* —————————— Shield / bezpieczeństwo —————————— */
export function IconShield(props: IconProps) {
  const id = "shield";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6l8-3z" fill={`url(#${id}-navy)`} />
      <path
        d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10"
        stroke={GOLD}
        strokeOpacity="0.5"
        strokeWidth="0.8"
      />
      <path
        d="M8.5 12l2.5 2.5 4.5-5"
        stroke={GOLD}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* —————————— FileCheck / wniosek —————————— */
export function IconDoc(props: IconProps) {
  const id = "doc";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <path
        d="M5.5 2.5h8L19 8v12.5a1 1 0 01-1 1H5.5a1 1 0 01-1-1V3.5a1 1 0 011-1z"
        fill={`url(#${id}-navy)`}
      />
      <path d="M13.5 2.5V8H19" stroke={GOLD} strokeOpacity="0.5" strokeWidth="0.8" />
      <path
        d="M8 14l2.2 2.2L15 11.5"
        stroke={GOLD}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* —————————— Hand coins / brak opłat —————————— */
export function IconHandCoins(props: IconProps) {
  const id = "hc";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <circle cx="15.5" cy="6.5" r="3.5" fill={`url(#${id}-gold)`} />
      <text x="15.5" y="8" textAnchor="middle" fontSize="4" fontWeight="700" fill={NAVY}>
        zł
      </text>
      <path
        d="M3 14c2-1 4-1.5 6-1.5 1.5 0 3 .5 4.5 1.5 1 .7 2 .7 3 0l4-2v6c-3 2-6 3-9 3s-6-.7-8.5-2v-5z"
        fill={`url(#${id}-navy)`}
      />
      <path d="M9 14.5c2 0 3.5 1 5 1.5" stroke={GOLD} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/* —————————— Lock / w jednym miejscu —————————— */
export function IconLock(props: IconProps) {
  const id = "lock";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <path d="M7 10V8a5 5 0 0110 0v2" stroke={NAVY_SOFT} strokeWidth="2" strokeLinecap="round" />
      <rect x="4.5" y="10" width="15" height="11" rx="2.5" fill={`url(#${id}-navy)`} />
      <circle cx="12" cy="15" r="1.6" fill={GOLD} />
      <path d="M12 16.6v2.4" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* —————————— Calculator —————————— */
export function IconCalc(props: IconProps) {
  const id = "calc";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <rect x="3.5" y="2.5" width="17" height="19" rx="2.5" fill={`url(#${id}-navy)`} />
      <rect x="5.5" y="4.5" width="13" height="4" rx="1" fill={GOLD} fillOpacity="0.85" />
      <text x="17" y="7.7" textAnchor="end" fontSize="3.2" fontWeight="700" fill={NAVY}>
        1 234
      </text>
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <circle
            key={`${r}-${c}`}
            cx={6.8 + c * 3}
            cy={11.5 + r * 3}
            r="1.1"
            fill={c === 3 ? GOLD : "white"}
            fillOpacity={c === 3 ? 1 : 0.85}
          />
        )),
      )}
    </svg>
  );
}

/* —————————— Property: Mieszkanie —————————— */
export function IconApartment(props: IconProps) {
  const id = "ap";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <rect x="3.5" y="3.5" width="17" height="18" rx="2" fill={`url(#${id}-navy)`} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={5.5 + c * 4}
            y={5.5 + r * 4}
            width="2.6"
            height="2.6"
            rx="0.4"
            fill={GOLD}
            fillOpacity={r === 1 && c === 1 ? 1 : 0.55}
          />
        )),
      )}
      <rect x="10.5" y="17.5" width="3" height="4" rx="0.4" fill={GOLD} />
    </svg>
  );
}

/* —————————— Property: Dom —————————— */
export function IconHouse(props: IconProps) {
  const id = "hs";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <path d="M12 2.5l9.5 8H19v10.5h-5v-6h-4v6H5V10.5H2.5L12 2.5z" fill={`url(#${id}-navy)`} />
      <path d="M12 2.5l9.5 8H19" stroke={GOLD} strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="15.5" cy="13" r="1" fill={GOLD} />
    </svg>
  );
}

/* —————————— Property: Lokal usługowy —————————— */
export function IconShop(props: IconProps) {
  const id = "shop";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <path
        d="M4 7l1-3.5h14L20 7v2a2.5 2.5 0 01-4.5 1.5A2.5 2.5 0 0112 11a2.5 2.5 0 01-3.5-.5A2.5 2.5 0 014 9V7z"
        fill={`url(#${id}-gold)`}
      />
      <rect x="4.5" y="11" width="15" height="10.5" rx="1" fill={`url(#${id}-navy)`} />
      <rect x="10" y="13.5" width="4" height="8" fill={GOLD} fillOpacity="0.7" />
      <rect x="6.5" y="13.5" width="2.5" height="3.5" fill={GOLD} fillOpacity="0.35" />
      <rect x="15" y="13.5" width="2.5" height="3.5" fill={GOLD} fillOpacity="0.35" />
    </svg>
  );
}

/* —————————— Property: Działka —————————— */
export function IconLand(props: IconProps) {
  const id = "land";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <path d="M2.5 18.5L8 11l4 4 3-3 6.5 6.5v2H2.5v-2z" fill={`url(#${id}-navy)`} />
      <circle cx="17" cy="6" r="2.6" fill={`url(#${id}-gold)`} />
      <path
        d="M7 13c1.5-1 3.5-1 5 0M14 11.5l1.5-1"
        stroke={GOLD}
        strokeOpacity="0.45"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* —————————— Phone —————————— */
export function IconPhone(props: IconProps) {
  const id = "ph";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <path
        d="M5 4.5h3.5l1.5 4-2 1.2c1 2.3 2.5 3.8 4.8 4.8l1.2-2 4 1.5V18a1.5 1.5 0 01-1.5 1.5C9.7 19.5 4.5 14.3 4.5 6A1.5 1.5 0 016 4.5H5z"
        fill={`url(#${id}-navy)`}
      />
      <circle cx="17" cy="6" r="2" fill={GOLD} />
    </svg>
  );
}

/* —————————— Check —————————— */
export function IconCheck(props: IconProps) {
  const id = "ck";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <circle cx="12" cy="12" r="9.5" fill={`url(#${id}-gold)`} />
      <path
        d="M7.5 12.2l3.2 3.2 6-6"
        stroke={NAVY}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* —————————— Mail —————————— */
export function IconMail(props: IconProps) {
  const id = "ml";
  return (
    <svg {...base(props)}>
      <Defs id={id} />
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" fill={`url(#${id}-navy)`} />
      <path d="M3 6l9 7 9-7" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
      <circle cx="19.5" cy="6" r="2" fill={GOLD} />
    </svg>
  );
}

/* —————————— BACKGROUND WATERMARK ICONS (line-art, oversized for tile bg) —————————— */

type BgProps = React.SVGProps<SVGSVGElement> & { className?: string };

const bgBase = (props: BgProps) => ({
  viewBox: "0 0 100 100",
  fill: "none",
  className: cn("h-full w-full", props.className),
  ...props,
});

/* Banknot z monetami — kwota */
export function BgMoney(props: BgProps) {
  return (
    <svg {...bgBase(props)}>
      <g
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      >
        <rect x="14" y="32" width="58" height="34" rx="4" />
        <circle cx="43" cy="49" r="8" />
        <path d="M43 44v10M40 47h6M40 51h6" />
        <circle cx="22" cy="40" r="1.5" fill={GOLD} />
        <circle cx="64" cy="58" r="1.5" fill={GOLD} />
        <circle cx="74" cy="72" r="10" />
        <path d="M74 67v10M71 70h6M71 74h6" />
        <circle cx="58" cy="78" r="7" />
      </g>
    </svg>
  );
}

/* Kalendarz z zegarem — okres */
export function BgPeriod(props: BgProps) {
  return (
    <svg {...bgBase(props)}>
      <g
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      >
        <rect x="16" y="22" width="50" height="46" rx="4" />
        <path d="M16 34h50M28 16v12M54 16v12" />
        <circle cx="32" cy="48" r="2" fill={GOLD} />
        <circle cx="44" cy="48" r="2" fill={GOLD} />
        <circle cx="56" cy="48" r="2" fill={GOLD} />
        <circle cx="32" cy="60" r="2" fill={GOLD} />
        <circle cx="70" cy="70" r="16" />
        <path d="M70 60v10l7 4" />
      </g>
    </svg>
  );
}

/* Waga / proporcje — LTV */
export function BgScale(props: BgProps) {
  return (
    <svg {...bgBase(props)}>
      <g
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      >
        <path d="M50 14v66M30 80h40" />
        <path d="M50 22l-22 22M50 22l22 22" />
        <path d="M16 44h24l-12 18a12 12 0 0024 0L40 44" />
        <path d="M60 44h24l-12 14a12 12 0 0024 0L72 44" transform="translate(-12,0)" />
        <circle cx="50" cy="14" r="3" fill={GOLD} />
      </g>
    </svg>
  );
}

/* Rakieta — 48h decyzja */
export function BgRocket(props: BgProps) {
  return (
    <svg {...bgBase(props)}>
      <g
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      >
        <path d="M50 10c12 10 18 22 18 36 0 8-3 14-6 18H38c-3-4-6-10-6-18 0-14 6-26 18-36z" />
        <circle cx="50" cy="40" r="6" />
        <path d="M38 56l-10 6 4 10 8-6M62 56l10 6-4 10-8-6" />
        <path d="M44 74c2 6 4 10 6 14 2-4 4-8 6-14" />
        <circle cx="46" cy="86" r="1.5" fill={GOLD} />
        <circle cx="54" cy="90" r="1.5" fill={GOLD} />
      </g>
    </svg>
  );
}
