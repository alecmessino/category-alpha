/* @ds-bundle: {"format":4,"namespace":"CategoryAlphaDesignSystem_a835cf","components":[{"name":"EdgeCell","sourcePath":"components/data/EdgeCell.jsx"},{"name":"Gauge","sourcePath":"components/data/Gauge.jsx"},{"name":"KellyBar","sourcePath":"components/data/KellyBar.jsx"},{"name":"SignalCard","sourcePath":"components/data/SignalCard.jsx"},{"name":"StatTile","sourcePath":"components/data/StatTile.jsx"},{"name":"Badge","sourcePath":"components/primitives/Badge.jsx"},{"name":"Button","sourcePath":"components/primitives/Button.jsx"},{"name":"Pill","sourcePath":"components/primitives/Pill.jsx"},{"name":"StatusDot","sourcePath":"components/primitives/StatusDot.jsx"},{"name":"EmptyState","sourcePath":"components/surfaces/EmptyState.jsx"},{"name":"Panel","sourcePath":"components/surfaces/Panel.jsx"},{"name":"ProvenanceFooter","sourcePath":"components/surfaces/ProvenanceFooter.jsx"},{"name":"SectionHeader","sourcePath":"components/surfaces/SectionHeader.jsx"},{"name":"HealthRow","sourcePath":"components/telemetry/HealthRow.jsx"},{"name":"IngestionHUD","sourcePath":"components/telemetry/IngestionHUD.jsx"},{"name":"ReplayDeck","sourcePath":"components/telemetry/ReplayDeck.jsx"}],"sourceHashes":{"components/data/EdgeCell.jsx":"faa74594c4d2","components/data/Gauge.jsx":"cfc1750eba76","components/data/KellyBar.jsx":"f21facce177e","components/data/SignalCard.jsx":"fcfa180a3a85","components/data/StatTile.jsx":"140ba238ebd9","components/primitives/Badge.jsx":"5cbbb6faa450","components/primitives/Button.jsx":"84717a3794fd","components/primitives/Pill.jsx":"51a8fb990bf6","components/primitives/StatusDot.jsx":"63d2e2521974","components/surfaces/EmptyState.jsx":"f49ceb5c64ea","components/surfaces/Panel.jsx":"5ea9c4a939bc","components/surfaces/ProvenanceFooter.jsx":"e88c3dcd548e","components/surfaces/SectionHeader.jsx":"dafd394ee076","components/telemetry/HealthRow.jsx":"d492bdfba2d2","components/telemetry/IngestionHUD.jsx":"6095fdda35e0","components/telemetry/ReplayDeck.jsx":"34e27897f7c9","prototypes/millibar-terminal/compute.js":"a2041fcb790d","prototypes/millibar-terminal/console.jsx":"1276847b6d16","prototypes/millibar-terminal/data.js":"b9d693c24c8b","prototypes/millibar-terminal/drawer.jsx":"7a83f85860ee","prototypes/millibar-terminal/main.jsx":"851932cc684d","prototypes/millibar-terminal/map.jsx":"5e927ef73aa8","prototypes/millibar-terminal/panels.jsx":"f3f05ff504b0","prototypes/millibar-terminal/tweaks-panel.jsx":"d259e3a86f73","ui_kits/millibar-terminal/CommandCenter.jsx":"591e953e3db9","ui_kits/millibar-terminal/Header.jsx":"defdb3cad4c8","ui_kits/millibar-terminal/data.js":"7e5a5a9bb815","ui_kits/millibar-terminal/main.jsx":"8e4dd6c9e8f4"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CategoryAlphaDesignSystem_a835cf = window.CategoryAlphaDesignSystem_a835cf || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/data/Gauge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Gauge — thin telemetry bar. value 0–100. `gradient` uses the cyan→violet fill;
   otherwise a solid `color`. */
function Gauge({
  value = 0,
  color = "var(--accent)",
  gradient = false,
  height = 7,
  style = {},
  ...rest
}) {
  const v = Math.max(0, Math.min(100, value));
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      height: height + "px",
      borderRadius: "6px",
      background: "var(--border-dim)",
      overflow: "hidden",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: v + "%",
      background: gradient ? "linear-gradient(90deg,var(--cyan-500),var(--violet-600))" : color,
      transition: "width var(--ease-ui)"
    }
  }));
}
Object.assign(__ds_scope, { Gauge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Gauge.jsx", error: String((e && e.message) || e) }); }

// components/data/KellyBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* KellyBar — the liquidity-capped Q-Kelly allocation bar (IIDS hero component).
   Dual-layer: a TRANSLUCENT background bar = theoretical Kelly capacity, overlaid by
   a SOLID foreground bar = the size actually allowed by real-time order-book liquidity,
   with a distinct vertical RED threshold marker at the liquidity limit.
   theoretical / capped are Kelly fractions (0–1). scale magnifies small fractions
   (codebase uses 2.5). Never show raw theoretical Kelly in isolation. */
function KellyBar({
  theoretical = 0,
  capped,
  allocation,
  rawPct,
  stakePct,
  scale = 2.5,
  showCaption = true,
  style = {},
  ...rest
}) {
  const cap = capped == null ? theoretical : capped;
  const isCapped = cap < theoretical - 1e-6;
  const clamp = n => Math.max(0, Math.min(100, n));
  const theoPct = clamp(theoretical * 100 * scale);
  const actPct = clamp(cap * 100 * scale);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: style
  }, rest), showCaption && (allocation != null || stakePct != null) && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      color: "var(--text-2)",
      marginBottom: "6px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--accent)",
      fontWeight: 700
    }
  }, "Q-Kelly:"), " ", allocation != null && /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-1)"
    }
  }, "$", Number(allocation).toLocaleString()), stakePct != null && /*#__PURE__*/React.createElement(React.Fragment, null, " \xB7 ", stakePct, "% stake"), rawPct != null && /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.7
    }
  }, " (raw ", rawPct, "%)"), isCapped && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--warn)",
      fontWeight: 700
    }
  }, " \xB7 LIQ-CAPPED")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: "6px",
      borderRadius: "4px",
      background: "var(--border-dim)",
      overflow: "visible"
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      position: "absolute",
      left: 0,
      top: 0,
      height: "100%",
      width: theoPct + "%",
      borderRadius: "4px",
      background: "color-mix(in srgb, var(--edge-hot) 26%, transparent)"
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      position: "absolute",
      left: 0,
      top: 0,
      height: "100%",
      width: actPct + "%",
      borderRadius: "4px",
      background: "var(--edge-hot)"
    }
  }), isCapped && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: actPct + "%",
      top: "-3px",
      width: "2px",
      height: "12px",
      background: "var(--neg)",
      transform: "translateX(-1px)"
    }
  })));
}
Object.assign(__ds_scope, { KellyBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/KellyBar.jsx", error: String((e && e.message) || e) }); }

// components/data/EdgeCell.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* EdgeCell — a cell of the Edge Matrix / Alpha Surface (.mxcell). Contract name, the
   Category Alpha edge (radioactive glow at >=15%, green >0, dim otherwise), market
   price + order-book liquidity, and an embedded liquidity-capped KellyBar. */
function EdgeCell({
  contract,
  edge = 0,
  marketPct,
  liquidity,
  theoretical,
  capped,
  allocation,
  stakePct,
  rawPct,
  style = {},
  ...rest
}) {
  const sign = edge >= 0 ? "+" : "";
  const edgeStyle = edge >= 15 ? {
    color: "var(--edge-glow)",
    textShadow: "var(--glow-edge)"
  } : edge > 0 ? {
    color: "var(--pos)"
  } : {
    color: "var(--text-2)",
    opacity: 0.7
  };
  const hasBet = theoretical != null && edge > 0;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)",
      padding: "10px 12px",
      minWidth: 0,
      overflowWrap: "break-word",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "11px",
      color: "var(--text-2)",
      marginBottom: "6px",
      wordBreak: "break-word"
    }
  }, contract), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: "var(--font-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "21px",
      fontWeight: 800,
      ...edgeStyle
    }
  }, sign, edge.toFixed(1), "%"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      color: "var(--text-2)",
      marginTop: "5px"
    }
  }, "mkt ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-1)"
    }
  }, marketPct != null ? Math.round(marketPct) + "%" : "—"), " · ", "liq ", liquidity ? "$" + Number(liquidity).toLocaleString() : "n/a"), hasBet ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "6px"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.KellyBar, {
    theoretical: theoretical,
    capped: capped,
    allocation: allocation,
    stakePct: stakePct,
    rawPct: rawPct
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "10px",
      color: "var(--text-2)",
      marginTop: "5px"
    }
  }, "no positive edge"));
}
Object.assign(__ds_scope, { EdgeCell });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/EdgeCell.jsx", error: String((e && e.message) || e) }); }

// components/data/SignalCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* SignalCard — a divergence signal (.sigcard). Signed edge, a centered edge meter
   (model vs market), model/market probabilities, a confidence tier, and BUY/SELL/HOLD.
   Left rule + numbers are tinted by the signal side. */
const SIG = {
  BUY: {
    c: "var(--pos)",
    label: "LONG · mispriced"
  },
  SELL: {
    c: "var(--neg)",
    label: "SHORT · mispriced"
  },
  HOLD: {
    c: "var(--text-2)",
    label: "HOLD"
  }
};
const CONF_TONE = {
  HIGH: "pos",
  MED: "neutral",
  MEDIUM: "neutral",
  LOW: "warn"
};
function SignalCard({
  label,
  signal = "HOLD",
  edge = 0,
  modelProb,
  marketProb,
  conf,
  confReason,
  unmapped = false,
  Badge,
  style = {},
  ...rest
}) {
  const s = SIG[signal] || SIG.HOLD;
  const meterPct = Math.max(0, Math.min(100, 50 + edge * 1.4));
  const sign = edge >= 0 ? "+" : "";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-dim)",
      borderLeft: "var(--bw-signal) solid " + s.c,
      borderRadius: "var(--radius-md)",
      padding: "13px 15px",
      minWidth: 0,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: "8px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "12.5px",
      fontWeight: 600,
      color: "var(--text-1)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      fontWeight: 700,
      padding: "2px 7px",
      borderRadius: "6px",
      color: s.c,
      background: `color-mix(in srgb, ${s.c} 13%, transparent)`,
      whiteSpace: "nowrap"
    }
  }, s.label)), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: "var(--font-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "22px",
      fontWeight: 800,
      color: s.c,
      marginTop: "4px"
    }
  }, sign, edge.toFixed(1), "%"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: "6px",
      borderRadius: "4px",
      background: "var(--border-dim)",
      marginTop: "9px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: "50%",
      top: "-3px",
      width: "1px",
      height: "12px",
      background: "var(--text-2)",
      opacity: 0.5
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      position: "absolute",
      top: 0,
      height: "100%",
      borderRadius: "4px",
      width: "6px",
      left: meterPct + "%",
      background: s.c,
      transform: "translateX(-3px)"
    }
  })), (modelProb != null || marketProb != null) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "11px",
      color: "var(--text-2)",
      marginTop: "9px",
      fontFamily: "var(--font-mono)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "model ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-1)"
    }
  }, modelProb, "%")), /*#__PURE__*/React.createElement("span", null, "mkt ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-1)"
    }
  }, marketProb, "%"))), (conf || unmapped) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "6px",
      marginTop: "9px",
      flexWrap: "wrap"
    }
  }, conf && (Badge ? /*#__PURE__*/React.createElement(Badge, {
    tone: CONF_TONE[conf] || "neutral",
    title: confReason
  }, "CONF ", conf) : /*#__PURE__*/React.createElement("span", {
    title: confReason,
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "9.5px",
      fontWeight: 700,
      padding: "3px 8px",
      borderRadius: "5px",
      color: "var(--text-2)",
      background: "var(--surface-sunken)"
    }
  }, "CONF ", conf)), unmapped && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "9.5px",
      fontWeight: 700,
      padding: "3px 8px",
      borderRadius: "5px",
      color: "var(--warn)",
      background: "color-mix(in srgb, var(--warn) 14%, transparent)"
    }
  }, "UNMAPPED CONTRACT")));
}
Object.assign(__ds_scope, { SignalCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/SignalCard.jsx", error: String((e && e.message) || e) }); }

// components/data/StatTile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* StatTile — a hero stat (.stat) or command-rail metric (.cmd-metric). Big value with
   a dimmed unit, an uppercase label, and an optional sub line. `color` tints the value. */
function StatTile({
  label,
  value,
  unit,
  sub,
  color,
  variant = "tile",
  style = {},
  ...rest
}) {
  const rail = variant === "metric";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: rail ? "var(--surface-card)" : "var(--surface-sunken)",
      border: rail ? "none" : "1px solid var(--border-dim)",
      borderRadius: rail ? 0 : "var(--radius-lg)",
      padding: rail ? "9px 14px" : "12px 14px",
      minWidth: 0,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: rail ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: rail ? "9px" : "10px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: rail ? "1.2px" : "var(--track-label)",
      color: "var(--text-2)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: "var(--font-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: rail ? "22px" : "var(--fs-stat)",
      fontWeight: 800,
      lineHeight: 1,
      marginTop: "3px",
      color: color || "var(--text-1)",
      letterSpacing: "-.3px"
    }
  }, value, unit && /*#__PURE__*/React.createElement("small", {
    style: {
      fontSize: rail ? "11px" : "13px",
      color: "var(--text-2)",
      fontWeight: 700,
      marginLeft: "3px"
    }
  }, unit)), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      color: "var(--text-2)",
      marginTop: "4px"
    }
  }, sub));
}
Object.assign(__ds_scope, { StatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatTile.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Tonal status badge — the terminal's b-ok/warn/bad/vio badges, livebadge, and
   PASS/FAIL/BLOCKED health chips. Tint is a color-mix over the semantic tone token,
   so it flips correctly on light vs tactical surfaces.
   tone: neutral | pos | warn | neg | special | live | seeded */
const TONE = {
  neutral: "var(--text-2)",
  pos: "var(--pos)",
  warn: "var(--warn)",
  neg: "var(--neg)",
  special: "var(--special)",
  live: "var(--pos)",
  seeded: "var(--warn)"
};
function Badge({
  children,
  tone = "neutral",
  mono = true,
  dot = false,
  style = {},
  ...rest
}) {
  const c = TONE[tone] || TONE.neutral;
  const bg = tone === "neutral" ? "var(--surface-sunken)" : `color-mix(in srgb, ${c} 14%, transparent)`;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: "var(--fs-mono-xs)",
      fontWeight: 700,
      letterSpacing: ".5px",
      color: c,
      background: bg,
      padding: "3px 8px",
      borderRadius: "5px",
      whiteSpace: "nowrap",
      lineHeight: 1.2,
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: c,
      flex: "none",
      animation: tone === "live" ? "ca-pulse 2s infinite" : "none"
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Badge.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Millibar Terminal button. Flat, tight, mono-or-sans by variant.
   variant: solid (ink fill) | accent (cyan fill) | segment (bordered toggle) | preset (mono chip)
   Segmented toggles set `active` on the selected one. */
function Button({
  children,
  variant = "segment",
  size = "md",
  active = false,
  mono = false,
  disabled = false,
  onClick,
  title,
  style = {},
  ...rest
}) {
  const pad = size === "sm" ? "5px 10px" : size === "lg" ? "7px 14px" : "6px 12px";
  const fs = size === "sm" ? "11px" : "12px";
  const base = {
    fontFamily: mono || variant === "preset" ? "var(--font-mono)" : "var(--font-sans)",
    fontWeight: 700,
    fontSize: fs,
    letterSpacing: mono ? "var(--track-mono)" : ".3px",
    padding: pad,
    borderRadius: "var(--radius-sm)",
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid var(--border-dim)",
    transition: "all var(--ease-ui)",
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    lineHeight: 1,
    opacity: disabled ? 0.42 : 1,
    whiteSpace: "nowrap"
  };
  const skin = {
    solid: {
      background: "var(--surface-solid)",
      color: "var(--text-inverse)",
      borderColor: "var(--surface-solid)"
    },
    accent: {
      background: "var(--accent)",
      color: "#fff",
      borderColor: "var(--accent)"
    },
    segment: active ? {
      background: "var(--surface-solid)",
      color: "#fff",
      borderColor: "var(--surface-solid)"
    } : {
      background: "var(--surface-card)",
      color: "var(--text-2)"
    },
    preset: active ? {
      background: "var(--accent)",
      color: "#fff",
      borderColor: "var(--accent)"
    } : {
      background: "var(--surface-sunken)",
      color: "var(--text-2)"
    }
  }[variant] || {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    title: title,
    disabled: disabled,
    onClick: onClick,
    style: {
      ...base,
      ...skin,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Button.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Pill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Pill — rounded capsule chip. The strategy chip, command-center storm selector,
   and imagery-product toggles. size sm|md; active fills with an accent ring glow. */
function Pill({
  children,
  active = false,
  dotColor,
  mono = true,
  size = "md",
  onClick,
  style = {},
  ...rest
}) {
  const interactive = typeof onClick === "function";
  const pad = size === "sm" ? "4px 9px" : "5px 12px";
  return /*#__PURE__*/React.createElement("span", _extends({
    onClick: onClick,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "7px",
      fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: mono ? "var(--fs-mono-sm)" : "12px",
      fontWeight: 700,
      letterSpacing: mono ? ".5px" : ".2px",
      textTransform: mono ? "uppercase" : "none",
      padding: pad,
      borderRadius: "var(--radius-pill)",
      cursor: interactive ? "pointer" : "default",
      border: "1px solid " + (active ? "var(--accent-bright)" : "var(--border-dim)"),
      background: active ? "color-mix(in srgb, var(--accent) 15%, var(--surface-card))" : "var(--surface-sunken)",
      color: active ? "var(--accent)" : "var(--text-2)",
      boxShadow: active ? "var(--glow-accent)" : "none",
      transition: "all var(--ease-cam)",
      whiteSpace: "nowrap",
      lineHeight: 1.1,
      ...style
    }
  }, rest), dotColor && /*#__PURE__*/React.createElement("span", {
    style: {
      width: "9px",
      height: "9px",
      borderRadius: "50%",
      background: dotColor,
      flex: "none"
    }
  }), children);
}
Object.assign(__ds_scope, { Pill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Pill.jsx", error: String((e && e.message) || e) }); }

// components/primitives/StatusDot.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* StatusDot — small filled circle carrying feed/PAI state. status: ok|stale|missing|
   live|neutral, or pass a raw `color`. `pulse` runs the sanctioned live-pulse anim
   (auto on for status="live"|"ok"). */
const S = {
  ok: "var(--pos)",
  live: "var(--pos)",
  stale: "var(--warn)",
  missing: "var(--border-strong)",
  neutral: "var(--text-2)"
};
function StatusDot({
  status = "neutral",
  color,
  size = 8,
  pulse,
  style = {},
  ...rest
}) {
  const c = color || S[status] || S.neutral;
  const doPulse = pulse != null ? pulse : status === "live" || status === "ok";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-block",
      width: size + "px",
      height: size + "px",
      borderRadius: "50%",
      background: c,
      flex: "none",
      animation: doPulse ? "ca-pulse 2s infinite" : "none",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/StatusDot.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/EmptyState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* EmptyState — cinematic terminal empty state. NEVER "No data available".
   Renders monospaced rule lines, a bracketed title, a plain-language line, an
   "Awaiting:" bullet list, and a pipeline-status line. */
function EmptyState({
  title = "SYSTEM AWAITING TELEMETRY",
  message = "Research ledger empty.",
  awaiting = [],
  status = "INGESTION READY",
  statusTone = "pos",
  style = {},
  ...rest
}) {
  const rule = "─".repeat(52);
  const stColor = {
    pos: "var(--pos)",
    warn: "var(--warn)",
    neg: "var(--neg)",
    special: "var(--special)",
    neutral: "var(--text-2)"
  }[statusTone] || "var(--pos)";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-mono-md)",
      lineHeight: 1.7,
      color: "var(--text-2)",
      background: "var(--surface-sunken)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)",
      padding: "18px 20px",
      whiteSpace: "pre-wrap",
      overflowX: "auto",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--border-strong)",
      letterSpacing: "-.5px"
    }
  }, rule), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--accent)",
      fontWeight: 700,
      letterSpacing: "1px",
      margin: "6px 0"
    }
  }, "[ ", title, " ]"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-1)"
    }
  }, message), awaiting.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "8px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-2)"
    }
  }, "Awaiting:"), awaiting.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      color: "var(--text-2)",
      paddingLeft: "4px"
    }
  }, "\u2022 ", a))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "6px 0"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-2)"
    }
  }, "Pipeline Status: "), /*#__PURE__*/React.createElement("span", {
    style: {
      color: stColor,
      fontWeight: 700,
      letterSpacing: ".5px"
    }
  }, status)), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--border-strong)",
      letterSpacing: "-.5px"
    }
  }, rule));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Panel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Panel — the terminal's flat bordered card/section container. Optional header row
   (title + right slot) and an optional left accent rule (tone or raw color).
   Panels are border-only (no shadow); popups/drawers add --shadow-card themselves. */
function Panel({
  children,
  title,
  right,
  accent,
  footer,
  pad = true,
  style = {},
  bodyStyle = {},
  ...rest
}) {
  const accentColor = accent && (accent.startsWith("var") || accent.startsWith("#") ? accent : {
    accent: "var(--accent)",
    pos: "var(--pos)",
    warn: "var(--warn)",
    neg: "var(--neg)",
    special: "var(--special)"
  }[accent]);
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-dim)",
      borderLeft: accentColor ? "var(--bw-signal) solid " + accentColor : undefined,
      borderRadius: "var(--radius-md)",
      overflow: "hidden",
      minWidth: 0,
      ...style
    }
  }, rest), (title || right) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "10px",
      padding: "var(--pad-panel-hd)",
      borderBottom: "1px solid var(--border-dim)",
      background: "var(--surface-sunken)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "13px",
      fontWeight: 700,
      letterSpacing: ".6px",
      textTransform: "uppercase",
      color: "var(--accent)"
    }
  }, title), right && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: "6px",
      alignItems: "center"
    }
  }, right)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: pad ? "var(--sp-6)" : 0,
      minWidth: 0,
      ...bodyStyle
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border-dim)"
    }
  }, footer));
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Panel.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ProvenanceFooter.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* ProvenanceFooter — the Phase-3 observability micro-footer every card can carry:
   [ Source: NHC / RECON · Latency: 4m · Ver: 1.2.4 · Tier: A ]
   All monospaced. Tier renders as a tinted letter chip (A pos / B warn / C neg).
   Pass named fields and/or freeform `items` [{k,v}]. */
const TIER = {
  A: "var(--pos)",
  B: "var(--warn)",
  C: "var(--neg)"
};
function ProvenanceFooter({
  source,
  latency,
  version,
  tier,
  items = [],
  style = {},
  ...rest
}) {
  const parts = [];
  if (source) parts.push(["Source", source]);
  if (latency) parts.push(["Latency", latency]);
  if (version) parts.push(["Ver", version]);
  items.forEach(it => parts.push([it.k, it.v]));
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "4px 10px",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-mono-xs)",
      fontWeight: 500,
      letterSpacing: "var(--track-mono)",
      color: "var(--text-2)",
      padding: "7px 12px",
      background: "var(--surface-sunken)",
      borderTop: "1px solid var(--border-dim)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.5
    }
  }, "["), parts.map(([k, v], i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.7
    }
  }, k, ":"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-1)",
      fontWeight: 600
    }
  }, v))), tier && /*#__PURE__*/React.createElement("span", {
    style: {
      color: TIER[tier] || "var(--text-2)",
      fontWeight: 700,
      background: `color-mix(in srgb, ${TIER[tier] || "var(--text-2)"} 14%, transparent)`,
      padding: "1px 6px",
      borderRadius: "4px"
    }
  }, "Tier: ", tier), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.5
    }
  }, "]"));
}
Object.assign(__ds_scope, { ProvenanceFooter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ProvenanceFooter.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/SectionHeader.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* SectionHeader — the .sec label: uppercase, tracked, muted, with a left accent rule.
   Separates modules inside a column. tone sets the rule color. */
const RULE = {
  accent: "var(--accent)",
  pos: "var(--pos)",
  warn: "var(--warn)",
  neg: "var(--neg)",
  special: "var(--special)"
};
function SectionHeader({
  children,
  tone = "accent",
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "12px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "1px",
      color: "var(--text-2)",
      borderLeft: "var(--bw-accent) solid " + (RULE[tone] || tone),
      paddingLeft: "10px",
      margin: "var(--sp-8) 0 10px",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/telemetry/HealthRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* HealthRow — one operational system-health check (.hrow + .hchip). Name, a mono
   detail line, and a status chip (PASS / EMPTY / BLOCKED / FAIL). Distinct from
   evidence-quality: this is operational, not scientific. */
const CHIP = {
  PASS: "var(--pos)",
  EMPTY: "var(--text-2)",
  BLOCKED: "var(--special)",
  FAIL: "var(--neg)"
};
function HealthRow({
  name,
  detail,
  status = "PASS",
  style = {},
  ...rest
}) {
  const c = CHIP[status] || CHIP.FAIL;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      background: "var(--surface-sunken)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)",
      padding: "9px 11px",
      minWidth: 0,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "12px",
      fontWeight: 600,
      color: "var(--text-1)"
    }
  }, name), detail && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      color: "var(--text-2)",
      marginTop: "2px",
      wordBreak: "break-word"
    }
  }, detail)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "9.5px",
      fontWeight: 700,
      letterSpacing: ".6px",
      padding: "3px 8px",
      borderRadius: "var(--radius-pill)",
      flex: "none",
      color: c,
      background: status === "EMPTY" ? "var(--surface-app)" : `color-mix(in srgb, ${c} 13%, transparent)`
    }
  }, status));
}
Object.assign(__ds_scope, { HealthRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/telemetry/HealthRow.jsx", error: String((e && e.message) || e) }); }

// components/telemetry/IngestionHUD.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* IngestionHUD — header feed-freshness telemetry (.hud). A monospaced pill of feed
   cells (dot + name + age); clicking opens a diagnostic popover mapping each feed's
   latency to its evidence-quality penalty. Honest colors: fresh=green(ok),
   STALE=amber, MISSING=grey (an un-ingested stream is honest absence, never red). */
const DOT = {
  ok: "var(--pos)",
  stale: "var(--warn)",
  missing: "var(--border-strong)"
};
function IngestionHUD({
  streams = [],
  diagnostics = true,
  style = {},
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: "relative",
      display: "inline-block",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    onClick: () => diagnostics && setOpen(!open),
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      cursor: diagnostics ? "pointer" : "default",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-mono-sm)",
      fontWeight: 600,
      color: "var(--text-2)",
      background: "var(--surface-sunken)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-pill)",
      padding: "5px 12px"
    }
  }, streams.map((s, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: s.name
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      width: "1px",
      height: "12px",
      background: "var(--border-dim)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: DOT[s.status] || DOT.missing,
      flex: "none",
      animation: s.status === "ok" ? "ca-pulse 2.4s infinite" : "none"
    }
  }), /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-1)",
      fontWeight: 700,
      letterSpacing: ".5px"
    }
  }, s.name), /*#__PURE__*/React.createElement("span", null, s.status === "missing" ? "—" : s.age || s.status))))), open && diagnostics && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "calc(100% + 6px)",
      left: 0,
      zIndex: 40,
      minWidth: "300px",
      background: "var(--surface-card)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-card)",
      padding: "11px 13px",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-mono-sm)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--accent)",
      letterSpacing: ".5px",
      marginBottom: "9px",
      fontWeight: 700
    }
  }, "[ INGESTION DIAGNOSTIC AUDIT ]"), streams.map(s => {
    const tier = s.tier || (s.status === "ok" ? "HIGH" : s.status === "stale" ? "MEDIUM" : "LOW");
    const tierColor = /HIGH|^A$/.test(tier) ? "var(--pos)" : /LOW|^C$/.test(tier) ? "var(--neg)" : "var(--warn)";
    return /*#__PURE__*/React.createElement("div", {
      key: s.name,
      style: {
        padding: "7px 0",
        borderTop: "1px solid var(--border-dim)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: "6px",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "7px",
        height: "7px",
        borderRadius: "50%",
        background: DOT[s.status] || DOT.missing
      }
    }), /*#__PURE__*/React.createElement("b", {
      style: {
        color: "var(--text-1)",
        letterSpacing: ".5px"
      }
    }, s.name)), /*#__PURE__*/React.createElement("span", {
      style: {
        color: tierColor
      }
    }, "TIER ", tier)), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-2)",
        lineHeight: 1.55
      }
    }, /*#__PURE__*/React.createElement("div", null, "src ", s.source || s.name), /*#__PURE__*/React.createElement("div", null, "ts ", s.timestamp || "—", " \xB7 lat ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-1)"
      }
    }, s.latency || s.age || (s.status === "missing" ? "—" : s.status))), /*#__PURE__*/React.createElement("div", null, "penalty ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: s.penalty ? "var(--neg)" : "var(--pos)"
      }
    }, s.penalty || "none")), /*#__PURE__*/React.createElement("div", null, "buffer ", s.buffer || (s.status === "missing" ? "NO STREAM" : "SYNCED · 0 dropped"))));
  })));
}
Object.assign(__ds_scope, { IngestionHUD });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/telemetry/IngestionHUD.jsx", error: String((e && e.message) || e) }); }

// components/telemetry/ReplayDeck.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* ReplayDeck — the Temporal Replay VCR transport (IIDS hero). A multi-control tactical
   playback cluster: step-back [◀◀], play/pause [▶/❚❚], step-forward [▶▶|], jump-to-live
   [▶▶ Live], a scrubber with bookmarked historical-event micro-jumps, a live/replay
   badge, timestamp, and speed cycle. Self-driving: manages play + cursor internally,
   emitting onSeek(idx). Frames are assumed evenly spaced (stepMin apart, ending now). */
function ReplayDeck({
  frames = 24,
  stepMin = 10,
  speeds = [1, 2, 4],
  bookmarks = [],
  subLabel = "GOES · ABI",
  autoplay = true,
  onSeek,
  style = {},
  ...rest
}) {
  const [idx, setIdx] = React.useState(frames - 1);
  const [playing, setPlaying] = React.useState(autoplay);
  const [speed, setSpeed] = React.useState(speeds[0]);
  const last = frames - 1;
  React.useEffect(() => {
    onSeek && onSeek(idx);
  }, [idx]);
  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIdx(i => i >= last ? 0 : i + 1), Math.round(560 / speed));
    return () => clearInterval(t);
  }, [playing, speed, last]);
  const ageMin = (last - idx) * stepMin;
  const isLive = idx >= last;
  const now = Date.now();
  const stamp = new Date(now - ageMin * 60000);
  const pad = n => (n < 10 ? "0" : "") + n;
  const hhmm = pad(stamp.getUTCHours()) + ":" + pad(stamp.getUTCMinutes()) + "Z";
  const humanAge = ageMin < 60 ? ageMin + "m" : Math.floor(ageMin / 60) + "h" + pad(ageMin % 60) + "m";
  const btn = {
    cursor: "pointer",
    flex: "none",
    border: "1px solid var(--border-strong)",
    background: "var(--surface-sunken)",
    color: "var(--text-2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-mono)",
    borderRadius: "var(--radius-sm)",
    transition: "all var(--ease-ui)"
  };
  const seek = i => {
    setPlaying(false);
    setIdx(Math.max(0, Math.min(last, i)));
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px 16px",
      background: "var(--surface-card)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "6px",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    title: "Step back",
    onClick: () => seek(idx - 1),
    style: {
      ...btn,
      width: "30px",
      height: "30px",
      fontSize: "11px"
    }
  }, "\u25C0\u25C0"), /*#__PURE__*/React.createElement("div", {
    title: "Play / pause",
    onClick: () => setPlaying(!playing),
    style: {
      ...btn,
      width: "36px",
      height: "36px",
      fontSize: "13px",
      background: "var(--surface-solid)",
      color: "var(--text-inverse)",
      borderColor: "var(--surface-solid)"
    }
  }, playing ? "❚❚" : "▶"), /*#__PURE__*/React.createElement("div", {
    title: "Step forward",
    onClick: () => seek(idx + 1),
    style: {
      ...btn,
      width: "30px",
      height: "30px",
      fontSize: "11px"
    }
  }, "\u25B6\u25B6|"), /*#__PURE__*/React.createElement("div", {
    title: "Jump to live",
    onClick: () => {
      setPlaying(true);
      setIdx(last);
    },
    style: {
      ...btn,
      padding: "0 10px",
      height: "30px",
      fontSize: "10px",
      fontWeight: 700,
      letterSpacing: ".5px",
      color: isLive ? "var(--pos)" : "var(--text-2)",
      borderColor: isLive ? "var(--pos)" : "var(--border-strong)"
    }
  }, "\u25B6\u25B6 Live")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: "relative",
      height: "30px",
      display: "flex",
      alignItems: "center",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%",
      height: "5px",
      borderRadius: "3px",
      background: "var(--border-dim)",
      overflow: "visible"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: idx / last * 100 + "%",
      background: "linear-gradient(90deg,var(--cyan-500),var(--cyan-400))",
      borderRadius: "3px"
    }
  }), bookmarks.map(b => /*#__PURE__*/React.createElement("span", {
    key: b.i,
    title: b.label,
    onClick: () => seek(b.i),
    style: {
      position: "absolute",
      top: "-4px",
      left: b.i / last * 100 + "%",
      width: "2px",
      height: "13px",
      background: b.color || "var(--warn)",
      transform: "translateX(-1px)",
      cursor: "pointer"
    }
  }))), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: last,
    value: idx,
    step: 1,
    onChange: e => seek(+e.target.value),
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "30px",
      margin: 0,
      opacity: 0,
      cursor: "pointer"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      fontFamily: "var(--font-mono)",
      fontSize: "9.5px",
      fontWeight: 700,
      letterSpacing: "1px",
      padding: "3px 9px",
      borderRadius: "var(--radius-pill)",
      color: isLive ? "var(--pos)" : "var(--warn)",
      border: "1px solid " + (isLive ? "color-mix(in srgb,var(--pos) 35%,transparent)" : "color-mix(in srgb,var(--warn) 35%,transparent)"),
      background: isLive ? "color-mix(in srgb,var(--pos) 8%,transparent)" : "color-mix(in srgb,var(--warn) 8%,transparent)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: isLive ? "var(--pos)" : "var(--warn)",
      animation: isLive ? "ca-pulse 1.8s infinite" : "none"
    }
  }), isLive ? "LIVE" : "REPLAY −" + humanAge), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
      fontWeight: 700,
      color: "var(--text-1)",
      textAlign: "right",
      minWidth: "96px",
      fontVariantNumeric: "tabular-nums"
    }
  }, hhmm, /*#__PURE__*/React.createElement("small", {
    style: {
      display: "block",
      color: "var(--text-2)",
      fontWeight: 600,
      fontSize: "9px",
      letterSpacing: "1px"
    }
  }, subLabel)), /*#__PURE__*/React.createElement("div", {
    title: "Playback speed",
    onClick: () => setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length]),
    style: {
      ...btn,
      padding: "5px 9px",
      height: "26px",
      fontSize: "10px",
      fontWeight: 700
    }
  }, speed, "\xD7")));
}
Object.assign(__ds_scope, { ReplayDeck });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/telemetry/ReplayDeck.jsx", error: String((e && e.message) || e) }); }


__ds_ns.EdgeCell = __ds_scope.EdgeCell;

__ds_ns.Gauge = __ds_scope.Gauge;

__ds_ns.KellyBar = __ds_scope.KellyBar;

__ds_ns.SignalCard = __ds_scope.SignalCard;

__ds_ns.StatTile = __ds_scope.StatTile;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Pill = __ds_scope.Pill;

__ds_ns.StatusDot = __ds_scope.StatusDot;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.ProvenanceFooter = __ds_scope.ProvenanceFooter;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.HealthRow = __ds_scope.HealthRow;

__ds_ns.IngestionHUD = __ds_scope.IngestionHUD;

__ds_ns.ReplayDeck = __ds_scope.ReplayDeck;

})();
