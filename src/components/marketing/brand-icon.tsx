/* eslint-disable */
// @ts-nocheck
/**
 * Finance You — brand iconography (duo-tone navy + gold SVG glyphs).
 * Ported verbatim from the Finance You Design System export
 * (components/icons/BrandIcon.jsx, already compiled to React.createElement).
 * Hand-editing is discouraged; regenerate from the design system instead.
 */
import React from "react";

const NAVY_HI = "oklch(0.58 0.17 266)";
const NAVY = "oklch(0.30 0.11 265)";
const NAVY_DEEP = "oklch(0.16 0.09 265)";
const GOLD_HI = "oklch(0.90 0.14 92)";
const GOLD = "oklch(0.80 0.18 86)";
const GOLD_DEEP = "oklch(0.62 0.16 70)";
const WHITE = "#ffffff";
function Spec({
  cx,
  cy,
  rx,
  ry,
  o = 0.5,
  rot
}) {
  return /*#__PURE__*/React.createElement("ellipse", {
    cx: cx,
    cy: cy,
    rx: rx,
    ry: ry,
    fill: WHITE,
    opacity: o,
    transform: rot ? `rotate(${rot} ${cx} ${cy})` : undefined
  });
}
function paths(name, g) {
  switch (name) {
    /* —— Vault / amount —— */
    case "vault":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "6",
        width: "18",
        height: "14.4",
        rx: "3",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "5.2",
        width: "18",
        height: "14",
        rx: "3",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("rect", {
        x: "4.4",
        y: "6.4",
        width: "15.2",
        height: "5.4",
        rx: "2",
        fill: g.gloss
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "15",
        cy: "12.2",
        r: "3.7",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "15",
        cy: "11.9",
        r: "3.7",
        fill: g.gold
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "15",
        cy: "11.9",
        r: "1.15",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M15 7.9v1.3M15 14.6v1.3M11.2 11.9h1.3M17.5 11.9h1.3",
        stroke: GOLD_HI,
        strokeWidth: "1.1",
        strokeLinecap: "round"
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 13.8,
        cy: 10.6,
        rx: 1,
        ry: 0.6,
        o: 0.55,
        rot: -35
      }), /*#__PURE__*/React.createElement("rect", {
        x: "5",
        y: "9.4",
        width: "3",
        height: "5.4",
        rx: "1",
        fill: GOLD,
        opacity: "0.85"
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 6.5,
        cy: 6.9,
        rx: 5,
        ry: 1.1,
        o: 0.18
      }));

    /* —— Clock / okres —— */
    case "clock":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12.3",
        r: "9.4",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "9.2",
        fill: g.sphere
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "9.2",
        fill: "none",
        stroke: WHITE,
        strokeOpacity: "0.14",
        strokeWidth: "0.6"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "6.6",
        fill: "none",
        stroke: GOLD,
        strokeOpacity: "0.25",
        strokeWidth: "0.8"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 7v5.1l3.2 2",
        stroke: GOLD_HI,
        strokeWidth: "1.8",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "0.95",
        fill: GOLD_HI
      }), [0, 90, 180, 270].map(a => /*#__PURE__*/React.createElement("line", {
        key: a,
        x1: "12",
        y1: "3.9",
        x2: "12",
        y2: "5.1",
        stroke: GOLD,
        strokeWidth: "1",
        strokeLinecap: "round",
        transform: `rotate(${a} 12 12)`
      })), /*#__PURE__*/React.createElement(Spec, {
        cx: 8.6,
        cy: 7.6,
        rx: 4.6,
        ry: 3,
        o: 0.2,
        rot: -25
      }));

    /* —— LTV / chart —— */
    case "ltv":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
        x: "2.5",
        y: "3.2",
        width: "19",
        height: "19",
        rx: "4",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("rect", {
        x: "2.5",
        y: "2.5",
        width: "19",
        height: "19",
        rx: "4",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("rect", {
        x: "4",
        y: "3.8",
        width: "16",
        height: "6",
        rx: "2.5",
        fill: g.gloss
      }), /*#__PURE__*/React.createElement("path", {
        d: "M5 16l3.5-3.5 3 2.5 4-5L19 13",
        stroke: GOLD_HI,
        strokeWidth: "1.9",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "19",
        cy: "13",
        r: "1.7",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "18.8",
        cy: "12.8",
        r: "1.7",
        fill: g.gold
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 18.4,
        cy: 12.3,
        rx: 0.6,
        ry: 0.4,
        o: 0.6
      }));

    /* —— Bolt / 24h —— */
    case "bolt":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12.4",
        r: "10",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "9.7",
        fill: g.sphere
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "9.7",
        fill: "none",
        stroke: WHITE,
        strokeOpacity: "0.14",
        strokeWidth: "0.6"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M13.6 4l-6.2 9.2h4.1l-1.5 7.2 6.2-9.2h-4.1l1.5-7.2z",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M13.5 3.8l-6.1 9.1h4.05l-1.5 7.1 6.1-9.1H12l1.5-7.1z",
        fill: g.gold
      }), /*#__PURE__*/React.createElement("path", {
        d: "M13.3 4.4l-5.2 7.8h2.2",
        stroke: GOLD_HI,
        strokeWidth: "0.8",
        strokeLinecap: "round",
        fill: "none",
        opacity: "0.8"
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 8.8,
        cy: 7.8,
        rx: 4.8,
        ry: 3,
        o: 0.18,
        rot: -25
      }));

    /* —— Shield —— */
    case "shield":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M12 2.9l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6l8-3z",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6l8-3z",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 2.5l8 3v6c0 5-3.5 8.5-8 10V2.5z",
        fill: NAVY_DEEP,
        opacity: "0.28"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 2.5l-8 3v6c0 1 .15 1.95.42 2.85C6 12 9 9 12 8V2.5z",
        fill: WHITE,
        opacity: "0.16"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M8.5 12l2.5 2.5 4.5-5.2",
        stroke: GOLD_HI,
        strokeWidth: "2.1",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }));

    /* —— Doc / wniosek —— */
    case "doc":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M5.5 2.9h8L19 8.4v12.2a1 1 0 01-1 1H5.5a1 1 0 01-1-1V3.9a1 1 0 011-1z",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M5.5 2.5h8L19 8v12.5a1 1 0 01-1 1H5.5a1 1 0 01-1-1V3.5a1 1 0 011-1z",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("path", {
        d: "M13.5 2.5L19 8h-4.5a1 1 0 01-1-1V2.5z",
        fill: GOLD,
        opacity: "0.85"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "6",
        y: "4",
        width: "5.5",
        height: "4.5",
        rx: "1",
        fill: g.gloss
      }), /*#__PURE__*/React.createElement("path", {
        d: "M8 14l2.2 2.2L15 11.4",
        stroke: GOLD_HI,
        strokeWidth: "1.9",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }));

    /* —— Hand coins / brak opłat —— */
    case "handCoins":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "15.5",
        cy: "6.7",
        r: "3.7",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "15.5",
        cy: "6.4",
        r: "3.7",
        fill: g.gold
      }), /*#__PURE__*/React.createElement("text", {
        x: "15.5",
        y: "7.9",
        textAnchor: "middle",
        fontSize: "4",
        fontWeight: "800",
        fill: NAVY_DEEP
      }, "z\u0142"), /*#__PURE__*/React.createElement(Spec, {
        cx: 14.2,
        cy: 5,
        rx: 0.9,
        ry: 0.55,
        o: 0.6,
        rot: -30
      }), /*#__PURE__*/React.createElement("path", {
        d: "M3 14.6c2-1 4-1.5 6-1.5 1.5 0 3 .5 4.5 1.5 1 .7 2 .7 3 0l4-2v6c-3 2-6 3-9 3s-6-.7-8.5-2v-5z",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M3 14c2-1 4-1.5 6-1.5 1.5 0 3 .5 4.5 1.5 1 .7 2 .7 3 0l4-2v6c-3 2-6 3-9 3s-6-.7-8.5-2v-5z",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("path", {
        d: "M9 14.5c2 0 3.5 1 5 1.5",
        stroke: GOLD_HI,
        strokeWidth: "1.1",
        strokeLinecap: "round"
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 6,
        cy: 14,
        rx: 3.4,
        ry: 0.8,
        o: 0.16,
        rot: -12
      }));

    /* —— Lock —— */
    case "lock":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M7 10V8a5 5 0 0110 0v2",
        stroke: NAVY_DEEP,
        strokeWidth: "2.4",
        strokeLinecap: "round",
        fill: "none"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M7 10V8a5 5 0 0110 0v2",
        stroke: GOLD,
        strokeWidth: "1.6",
        strokeLinecap: "round",
        fill: "none"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "4.5",
        y: "10.6",
        width: "15",
        height: "11",
        rx: "3",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("rect", {
        x: "4.5",
        y: "10",
        width: "15",
        height: "11",
        rx: "3",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("rect", {
        x: "5.8",
        y: "11.1",
        width: "12.4",
        height: "4.2",
        rx: "1.8",
        fill: g.gloss
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "15",
        r: "1.7",
        fill: GOLD_HI
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 16.5v2.4",
        stroke: GOLD_HI,
        strokeWidth: "1.7",
        strokeLinecap: "round"
      }));

    /* —— Calculator —— */
    case "calc":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
        x: "3.5",
        y: "3.1",
        width: "17",
        height: "19",
        rx: "3",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("rect", {
        x: "3.5",
        y: "2.5",
        width: "17",
        height: "19",
        rx: "3",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("rect", {
        x: "5.5",
        y: "4.5",
        width: "13",
        height: "4",
        rx: "1.2",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("rect", {
        x: "5.5",
        y: "4.3",
        width: "13",
        height: "4",
        rx: "1.2",
        fill: g.gold
      }), /*#__PURE__*/React.createElement("text", {
        x: "17",
        y: "7.5",
        textAnchor: "end",
        fontSize: "3.1",
        fontWeight: "800",
        fill: NAVY_DEEP
      }, "1 234"), [0, 1, 2].map(r => [0, 1, 2, 3].map(cc => /*#__PURE__*/React.createElement("circle", {
        key: `${r}-${cc}`,
        cx: 6.8 + cc * 3,
        cy: 11.6 + r * 3,
        r: "1.15",
        fill: cc === 3 ? GOLD_HI : WHITE,
        fillOpacity: cc === 3 ? 1 : 0.9
      }))), /*#__PURE__*/React.createElement(Spec, {
        cx: 7,
        cy: 4.9,
        rx: 5,
        ry: 0.8,
        o: 0.22
      }));

    /* —— Apartment —— */
    case "apartment":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
        x: "3.5",
        y: "3.9",
        width: "17",
        height: "18",
        rx: "2.5",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("rect", {
        x: "3.5",
        y: "3.5",
        width: "17",
        height: "18",
        rx: "2.5",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("path", {
        d: "M3.5 6a2.5 2.5 0 012.5-2.5h12A2.5 2.5 0 0120.5 6v1H3.5V6z",
        fill: g.gloss
      }), [0, 1, 2].map(r => [0, 1, 2].map(cc => /*#__PURE__*/React.createElement("rect", {
        key: `${r}-${cc}`,
        x: 5.5 + cc * 4,
        y: 5.6 + r * 4,
        width: "2.6",
        height: "2.6",
        rx: "0.5",
        fill: r === 1 && cc === 1 ? GOLD_HI : GOLD,
        fillOpacity: r === 1 && cc === 1 ? 1 : 0.6
      }))), /*#__PURE__*/React.createElement("rect", {
        x: "10.5",
        y: "17.5",
        width: "3",
        height: "4",
        rx: "0.5",
        fill: GOLD_HI
      }));

    /* —— House —— */
    case "house":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M12 3l9.5 8H19v10.5h-5v-6h-4v6H5V11H2.5L12 3z",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 2.5l9.5 8H19v10.5h-5v-6h-4v6H5V10.5H2.5L12 2.5z",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 2.5L2.5 10.5H5L12 4.6V2.5z",
        fill: WHITE,
        opacity: "0.16"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 2.5l9.5 8H19",
        stroke: GOLD,
        strokeWidth: "1.3",
        strokeLinejoin: "round",
        fill: "none"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "13.6",
        y: "11.6",
        width: "3.4",
        height: "3.4",
        rx: "0.5",
        fill: g.gold
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 14.4,
        cy: 12.3,
        rx: 0.7,
        ry: 0.45,
        o: 0.55
      }));

    /* —— Shop —— */
    case "shop":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M4 7.3l1-3.5h14l1 3.5v2a2.5 2.5 0 01-4.5 1.5A2.5 2.5 0 0112 11.3a2.5 2.5 0 01-3.5-.5A2.5 2.5 0 014 9.3v-2z",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M4 7l1-3.5h14L20 7v2a2.5 2.5 0 01-4.5 1.5A2.5 2.5 0 0112 11a2.5 2.5 0 01-3.5-.5A2.5 2.5 0 014 9V7z",
        fill: g.gold
      }), /*#__PURE__*/React.createElement("rect", {
        x: "4.5",
        y: "11.4",
        width: "15",
        height: "10.5",
        rx: "1.5",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("rect", {
        x: "4.5",
        y: "11",
        width: "15",
        height: "10.5",
        rx: "1.5",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("rect", {
        x: "10",
        y: "13.6",
        width: "4",
        height: "7.9",
        fill: GOLD,
        fillOpacity: "0.75"
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 7,
        cy: 5,
        rx: 4.5,
        ry: 0.9,
        o: 0.25
      }));

    /* —— Land —— */
    case "land":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M2.5 19L8 11.4l4 4 3-3 6.5 6.5v2.1H2.5V19z",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M2.5 18.5L8 11l4 4 3-3 6.5 6.5v2H2.5v-2z",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("path", {
        d: "M2.5 18.5L8 11l2 2-5.5 5.5H2.5z",
        fill: WHITE,
        opacity: "0.14"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "17",
        cy: "6.2",
        r: "2.8",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "17",
        cy: "5.9",
        r: "2.8",
        fill: g.gold
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 16,
        cy: 4.8,
        rx: 0.7,
        ry: 0.45,
        o: 0.6
      }));

    /* —— Phone —— */
    case "phone":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
        d: "M5 4.9h3.5l1.5 4-2 1.2c1 2.3 2.5 3.8 4.8 4.8l1.2-2 4 1.5v3.1a1.5 1.5 0 01-1.5 1.5C9.7 20 4.5 14.7 4.5 6.4A1.5 1.5 0 016 4.9H5z",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("path", {
        d: "M5 4.5h3.5l1.5 4-2 1.2c1 2.3 2.5 3.8 4.8 4.8l1.2-2 4 1.5V18a1.5 1.5 0 01-1.5 1.5C9.7 19.5 4.5 14.3 4.5 6A1.5 1.5 0 016 4.5H5z",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("path", {
        d: "M5.4 5h3l1.2 3.2-1.4.85",
        stroke: WHITE,
        strokeOpacity: "0.22",
        strokeWidth: "0.7",
        fill: "none"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "17.5",
        cy: "6",
        r: "2.3",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "17.5",
        cy: "5.7",
        r: "2.3",
        fill: g.gold
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 16.7,
        cy: 4.8,
        rx: 0.6,
        ry: 0.4,
        o: 0.6
      }));

    /* —— Mail —— */
    case "mail":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
        x: "2.5",
        y: "5",
        width: "19",
        height: "15",
        rx: "2.5",
        fill: NAVY_DEEP
      }), /*#__PURE__*/React.createElement("rect", {
        x: "2.5",
        y: "4.5",
        width: "19",
        height: "15",
        rx: "2.5",
        fill: g.nav
      }), /*#__PURE__*/React.createElement("path", {
        d: "M3 6.2l9 6.6 9-6.6",
        fill: "none",
        stroke: GOLD_HI,
        strokeWidth: "1.6",
        strokeLinejoin: "round"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M2.5 6.5a2.5 2.5 0 012.5-2h14a2.5 2.5 0 012.5 2L12 13 2.5 6.5z",
        fill: g.gloss
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "19.5",
        cy: "6",
        r: "2.1",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "19.5",
        cy: "5.7",
        r: "2.1",
        fill: g.gold
      }));

    /* —— Check —— */
    case "check":
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12.4",
        r: "9.7",
        fill: GOLD_DEEP
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "9.6",
        fill: g.goldSphere
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "12",
        cy: "12",
        r: "9.6",
        fill: "none",
        stroke: WHITE,
        strokeOpacity: "0.25",
        strokeWidth: "0.6"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M7.4 12.3l3.3 3.3 6.1-6.1",
        stroke: NAVY_DEEP,
        strokeWidth: "2.4",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }), /*#__PURE__*/React.createElement(Spec, {
        cx: 8.6,
        cy: 7.8,
        rx: 4.4,
        ry: 2.8,
        o: 0.32,
        rot: -25
      }));
    default:
      return /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "3",
        width: "18",
        height: "18",
        rx: "4",
        fill: g.nav
      });
  }
}
type BrandIconProps = {
  name?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
} & Omit<React.SVGProps<SVGSVGElement>, "name" | "style">;

function BrandIcon({
  name = "shield",
  size = 24,
  className,
  style,
  ...rest
}: BrandIconProps) {
  const uid = React.useId().replace(/:/g, "");
  const navId = `${uid}n`;
  const goldId = `${uid}g`;
  const glossId = `${uid}s`;
  const sphereId = `${uid}sp`;
  const goldSphereId = `${uid}gs`;
  const g = {
    nav: `url(#${navId})`,
    gold: `url(#${goldId})`,
    gloss: `url(#${glossId})`,
    sphere: `url(#${sphereId})`,
    goldSphere: `url(#${goldSphereId})`
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    className: className,
    style: {
      flexShrink: 0,
      display: "inline-block",
      verticalAlign: "middle",
      ...style
    },
    "aria-hidden": "true",
    ...rest
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: navId,
    gradientUnits: "userSpaceOnUse",
    x1: "4",
    y1: "2",
    x2: "20",
    y2: "22"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: NAVY_HI
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "0.5",
    stopColor: NAVY
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: NAVY_DEEP
  })), /*#__PURE__*/React.createElement("radialGradient", {
    id: sphereId,
    gradientUnits: "userSpaceOnUse",
    cx: "8.5",
    cy: "7.5",
    r: "17"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: NAVY_HI
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "0.5",
    stopColor: NAVY
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: NAVY_DEEP
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: goldId,
    gradientUnits: "userSpaceOnUse",
    x1: "6",
    y1: "3",
    x2: "18",
    y2: "21"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: GOLD_HI
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "0.55",
    stopColor: GOLD
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: GOLD_DEEP
  })), /*#__PURE__*/React.createElement("radialGradient", {
    id: goldSphereId,
    gradientUnits: "userSpaceOnUse",
    cx: "8.5",
    cy: "7.5",
    r: "17"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: GOLD_HI
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "0.55",
    stopColor: GOLD
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: GOLD_DEEP
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: glossId,
    gradientUnits: "userSpaceOnUse",
    x1: "12",
    y1: "2",
    x2: "12",
    y2: "14"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: WHITE,
    stopOpacity: "0.5"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: WHITE,
    stopOpacity: "0"
  }))), paths(name, g));
}

export { BrandIcon };
