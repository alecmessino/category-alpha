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

// prototypes/millibar-terminal/compute.js
try { (() => {
/* Derived snapshot math — pure functions over the seed at a replay frame. Keeps the
   probability axis separate from the evidence-quality (confidence) axis, always.
   Market price, model anchor, edge, Q-Kelly and the order book are all derived live
   per frame here, so every panel re-reads a coherent snapshot at the as-of cursor. */
(function buildMTX() {
  if (typeof MT === "undefined" || !window.MT) {
    setTimeout(buildMTX, 20);
    return;
  }
  window.MTX = function () {
    const NF = MT.FRAMES - 1;
    function seed(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) / 4294967296;
    }
    function clampF(f) {
      return Math.max(0, Math.min(NF, f));
    }
    function tier(stormId, frame) {
      const S = MT.storms[stormId];
      const reasons = [],
        age = S.reconAge(frame);
      let score = 3; // 3=A 2=B 1=C
      reasons.push("Market price: SEEDED (auth-gated) → −1");
      score -= 1;
      if (age == null) {
        reasons.push("No recon for this basin → −1");
        score -= 0.5;
      } else if (age > 30) {
        reasons.push("Recon stale (" + Math.round(age) + "m) → −0.5");
        score -= 0.5;
      } else reasons.push("Recon fresh (" + Math.round(age) + "m) → ok");
      reasons.push("SST anomaly: manual, dated 07-22");
      reasons.push("Direct-market coverage" + (stormId === "AL04" ? "" : " via seasonal proxy"));
      const t = score >= 2.5 ? "A" : score >= 1.5 ? "B" : "C";
      return {
        tier: t,
        reasons
      };
    }
    function snap(stormId, frame) {
      const S = MT.storms[stormId];
      const model = S.modelCat4(frame),
        market = S.marketCat4(frame);
      const tt = tier(stormId, frame);
      return {
        S,
        frame,
        pressure: Math.round(S.pressure(frame)),
        wind: Math.round(S.wind(frame)),
        model,
        market,
        edgePct: (model - market) * 100,
        reconAge: S.reconAge(frame),
        tier: tt.tier,
        tierReasons: tt.reasons
      };
    }

    // Live market price for a contract at a frame: base + smooth deterministic
    // micro-oscillation (order flow) + optional drift. Falls back to the storm's
    // market series when a contract has no explicit base.
    function mkt(c, frame) {
      const f = clampF(frame);
      const base = c.market != null ? c.market : MT.storms[c.storm].marketCat4(f);
      const ph = seed(c.id) * 6.283;
      const wig = Math.sin(f / 3 + ph) * 0.012 + Math.sin(f / 6.5 + ph * 2) * 0.007;
      const drift = (c.drift || 0) * (f / NF);
      return Math.max(0.02, Math.min(0.98, base + wig + drift));
    }

    // Category Alpha model anchor for a contract at a frame.
    function mdl(c, frame) {
      const f = clampF(frame);
      if (c.model != null) {
        const ph = seed(c.id + "m");
        return Math.max(0.02, Math.min(0.98, c.model + Math.sin(f / 4 + ph * 6) * 0.005 + (c.mdrift || 0) * (f / NF)));
      }
      return MT.storms[c.storm].modelCat4(f);
    }

    // Liquidity-capped Q-Kelly. Kelly fraction for a binary at price m with model
    // probability p is (p−m)/(1−m); we then apply the stake fraction and cap the
    // dollar allocation at real order-book depth.
    function kellyFor(c, frame, bankroll, stakeFrac) {
      const model = mdl(c, frame),
        market = mkt(c, frame);
      const edge = (model - market) * 100;
      const kf = market < 0.99 ? Math.max(0, (model - market) / (1 - market)) : 0;
      if (edge <= 0 || kf <= 0) return {
        edge,
        market: market * 100,
        model: model * 100,
        noBet: true
      };
      const applied = kf * stakeFrac;
      const ideal = bankroll * applied;
      const alloc = c.liquidity ? Math.min(ideal, c.liquidity) : ideal;
      return {
        edge,
        market: market * 100,
        model: model * 100,
        theoretical: applied,
        capped: alloc / bankroll,
        allocation: Math.round(alloc),
        stakePct: Math.round(applied * 100),
        rawPct: Math.round(kf * 100),
        liqCapped: c.liquidity && ideal > c.liquidity
      };
    }

    // Recent price track (for market-board sparklines).
    function priceHist(c, frame, n) {
      const a = [];
      for (let i = n - 1; i >= 0; i--) a.push(mkt(c, frame - i));
      return a;
    }

    // Per-contract order book, built live around the current mid. Depth grows away
    // from the touch; cumulative bid depth beyond c.liquidity is the slippage cap.
    function orderBookFor(c, frame) {
      const mid = mkt(c, frame),
        spread = c.spread || 0.02;
      const bestAsk = Math.min(0.98, mid + spread / 2),
        bestBid = Math.max(0.02, mid - spread / 2);
      const liq = c.liquidity || 20000;
      const depth = i => Math.max(1000, Math.round(liq * (0.16 + 0.17 * i) * (0.8 + seed(c.id + "d" + i) * 0.5) / 1000) * 1000);
      const asks = [0, 1, 2, 3, 4].map(i => [Math.min(0.98, bestAsk + i * 0.02), depth(i)]);
      const bids = [0, 1, 2, 3, 4].map(i => [Math.max(0.02, bestBid - i * 0.02), depth(i)]);
      return {
        contract: c.id,
        mid,
        asks,
        bids,
        bestAsk,
        bestBid,
        liquidityCap: liq,
        slippageBudget: Math.max(1, Math.round(spread * 100)) + "¢"
      };
    }

    // Bitemporal as-of accessor — engine.at(T). Returns the coherent state of the world
    // AS IT STOOD at replay frame T: interpolated eye position, recon freshness/visibility,
    // and the latest advisory issued at-or-before T. Map + tables read this one source, so
    // scrubbing rewinds geometry and latency together — not just the numbers.
    function at(stormId, frame) {
      const S = MT.storms[stormId];
      const f = clampF(frame),
        t = f / NF;
      const a = S.track[Math.max(0, S.pastIdx - 1)],
        b = S.track[S.pastIdx];
      const center = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const reconAge = S.reconAge(f);
      const advisory = MT.events.filter(e => e.kind === "advisory" && e.frame <= f).slice(-1)[0] || null;
      return {
        S,
        frame: f,
        t,
        center,
        reconAge,
        reconVisible: reconAge != null,
        advisory,
        asOf: frameTime(f)
      };
    }
    function frameTime(frame) {
      const back = (MT.FRAMES - 1 - frame) * MT.STEP_MIN;
      const d = new Date(Date.now() - back * 60000);
      const p = n => (n < 10 ? "0" : "") + n;
      return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + "Z";
    }
    return {
      snap,
      at,
      kellyFor,
      tier,
      frameTime,
      mkt,
      mdl,
      priceHist,
      orderBookFor
    };
  }();
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "prototypes/millibar-terminal/compute.js", error: String((e && e.message) || e) }); }

// prototypes/millibar-terminal/console.jsx
try { (() => {
const {
  Badge: BGc
} = window.CategoryAlphaDesignSystem_a835cf || {};

/* Terminal console — deterministic diagnostics + a Claude-backed explainability
   assistant. Claude only ever explains/summarizes grounded evidence; it never issues
   a recommendation and every answer stays traceable to the as-of cursor. */
function buildContext(stormId, frame) {
  const s = MTX.snap(stormId, frame),
    S = s.S;
  const ev = MT.evidence.map(e => e.label + " = " + e.read(S, frame) + " [" + e.source + ", tier " + e.tier + "]");
  const contracts = MT.contracts.map(c => {
    const k = MTX.kellyFor(c, frame, 10000, 0.25);
    return c.label + ": edge " + k.edge.toFixed(1) + "%, mkt " + Math.round(k.market) + "%" + (k.noBet ? " (no bet)" : ", Q-Kelly $" + k.allocation + (k.liqCapped ? " LIQ-CAPPED" : ""));
  });
  const past = MT.events.filter(e => e.frame <= frame).map(e => MTX.frameTime(e.frame) + " " + e.label);
  return {
    as_of: MTX.frameTime(frame),
    storm: S.name + " " + S.full_cls,
    pressure_mb: s.pressure,
    wind_kt: s.wind,
    model_cat4: Math.round(s.model * 100) + "%",
    market_cat4: Math.round(s.market * 100) + "%",
    edge_pct: s.edgePct.toFixed(1),
    confidence_tier: s.tier,
    tier_reasons: s.tierReasons,
    evidence: ev,
    contracts,
    events_seen: past
  };
}
const SYS = "You are the Category Alpha research assistant embedded in Millibar Terminal, an institutional hurricane-divergence research console. RULES (non-negotiable): research-only — never give financial advice or tell the user to trade/buy/sell; always ground every statement in the provided evidence; keep probability and evidence-quality (confidence) as SEPARATE axes; be terse and operational (Bloomberg/mission-control tone), plain text, no markdown headers; if something is absent or deferred, say so plainly rather than inventing. You are given the current terminal state as JSON.";
function MT_Console({
  stormId,
  frame
}) {
  const [log, setLog] = React.useState([{
    role: "sys",
    text: "Category Alpha assistant ready. Type `help`, or ask about the current evidence, confidence, or edge."
  }]);
  const [val, setVal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const bodyRef = React.useRef(null);
  React.useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [log, busy]);
  async function run(cmd) {
    const c = cmd.trim();
    if (!c) return;
    setLog(l => [...l, {
      role: "user",
      text: c
    }]);
    const lc = c.toLowerCase();
    if (lc === "help") {
      setLog(l => [...l, {
        role: "sys",
        text: "commands: status · explain confidence · explain edge · compare models · summarize · clear — or ask anything in plain language."
      }]);
      return;
    }
    if (lc === "clear") {
      setLog([]);
      return;
    }
    if (lc === "status") {
      const ctx = buildContext(stormId, frame);
      setLog(l => [...l, {
        role: "sys",
        text: `as-of ${ctx.as_of} · ${ctx.storm}\n${ctx.pressure_mb} mb · ${ctx.wind_kt} kt · model ${ctx.model_cat4} vs mkt ${ctx.market_cat4} · edge ${ctx.edge_pct}% · confidence tier ${ctx.confidence_tier}`
      }]);
      return;
    }
    // Claude-backed explainability
    setBusy(true);
    const ctx = buildContext(stormId, frame);
    const prompt = {
      system: SYS + "\n\nSTATE:\n" + JSON.stringify(ctx, null, 1),
      messages: [{
        role: "user",
        content: c
      }],
      max_tokens: 500
    };
    try {
      const out = await window.claude.complete(prompt);
      setLog(l => [...l, {
        role: "assistant",
        text: out,
        tier: ctx.confidence_tier,
        asof: ctx.as_of
      }]);
    } catch (err) {
      setLog(l => [...l, {
        role: "sys",
        text: "assistant unavailable: " + (err && err.message ? err.message : "error")
      }]);
    }
    setBusy(false);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
      background: "var(--surface-card)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "9px 12px",
      borderBottom: "1px solid var(--border-dim)",
      background: "var(--surface-sunken)",
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: ".6px",
      textTransform: "uppercase",
      color: "var(--accent)"
    }
  }, "Terminal Console"), /*#__PURE__*/React.createElement(BGc, {
    tone: "special"
  }, "EXPLAINABILITY ONLY")), /*#__PURE__*/React.createElement("div", {
    ref: bodyRef,
    style: {
      flex: 1,
      minHeight: 120,
      overflowY: "auto",
      padding: 12,
      fontFamily: "var(--font-mono)",
      fontSize: 11.5,
      lineHeight: 1.55
    }
  }, log.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginBottom: 9
    }
  }, m.role === "user" && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--accent)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .6
    }
  }, "\u203A"), " ", m.text), m.role === "sys" && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-2)",
      whiteSpace: "pre-wrap"
    }
  }, m.text), m.role === "assistant" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1,
      color: "var(--special)",
      marginBottom: 3
    }
  }, "CATEGORY ALPHA ASSISTANT"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-1)",
      whiteSpace: "pre-wrap"
    }
  }, m.text), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-2)",
      fontSize: 9,
      marginTop: 4,
      opacity: .8
    }
  }, "[ traceable to evidence as-of ", m.asof, " \xB7 confidence tier ", m.tier, " ]")))), busy && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-2)"
    }
  }, "\u258D reasoning over evidence\u2026")), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      run(val);
      setVal("");
    },
    style: {
      display: "flex",
      borderTop: "1px solid var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "9px 6px 9px 12px",
      fontFamily: "var(--font-mono)",
      color: "var(--accent)"
    }
  }, "\u203A"), /*#__PURE__*/React.createElement("input", {
    value: val,
    onChange: e => setVal(e.target.value),
    placeholder: "explain edge \xB7 compare models \xB7 summarize\u2026",
    disabled: busy,
    style: {
      flex: 1,
      border: "none",
      background: "transparent",
      outline: "none",
      fontFamily: "var(--font-mono)",
      fontSize: 11.5,
      color: "var(--text-1)",
      padding: "9px 12px 9px 0"
    }
  })));
}
window.MT_Console = MT_Console;
})(); } catch (e) { __ds_ns.__errors.push({ path: "prototypes/millibar-terminal/console.jsx", error: String((e && e.message) || e) }); }

// prototypes/millibar-terminal/data.js
try { (() => {
/* Millibar Terminal — prototype seed. All values are SEEDED/illustrative and labeled
   as such; nothing here is a live forecast, price, or recommendation. The replay
   window is 24 frames × 10 min (4h) ending "now"; scrubbing the VCR moves the as-of
   cursor and every panel re-reads its snapshot at that frame. */
window.MT = function () {
  const FRAMES = 24,
    STEP_MIN = 10;
  // linear keyframe interpolation over frames [0..23]
  function series(keys) {
    // keys: [[frame,value],...] sorted; returns f -> value
    return f => {
      f = Math.max(0, Math.min(FRAMES - 1, f));
      for (let i = 1; i < keys.length; i++) {
        if (f <= keys[i][0]) {
          const [f0, v0] = keys[i - 1],
            [f1, v1] = keys[i];
          const t = (f - f0) / (f1 - f0 || 1);
          return v0 + (v1 - v0) * t;
        }
      }
      return keys[keys.length - 1][1];
    };
  }
  const storms = {
    AL04: {
      id: "AL04",
      name: "Bertha",
      cls: "C3",
      full_cls: "Cat 3 Hurricane",
      basin: "east",
      color: "var(--pai-velocity)",
      phase: "VELOCITY",
      center: [29.5, -90.5],
      movement: "NNW 12 kt",
      track: [[27.0, -88.5], [27.9, -89.2], [28.7, -89.9], [29.5, -90.5], [30.4, -91.0], [31.4, -91.4], [32.6, -91.6], [33.8, -91.5]],
      pastIdx: 3,
      // current fix — 29.5°N 90.5°W, SE Louisiana (Advisory 14A)
      cone: [[29.7, -90.0], [30.6, -90.3], [31.6, -90.5], [32.8, -90.6], [34.0, -90.4], [34.0, -92.6], [32.8, -92.6], [31.6, -92.3], [30.6, -91.7], [29.7, -91.0]],
      reconTracks: [{
        id: "AF307",
        label: "AF307 · USAF Vortex",
        color: "#f472b6",
        points: [[28.9, -88.9], [29.4, -88.3], [29.85, -87.77], [30.3, -87.2], [30.0, -86.6]],
        sondes: [[29.85, -87.77], [29.4, -88.3]]
      }, {
        id: "NOAA3",
        label: "NOAA3 · P-3 Orion",
        color: "#38bdf8",
        points: [[27.5, -86.6], [27.9, -86.1], [28.22, -85.63], [28.7, -85.1], [28.4, -84.6]],
        sondes: [[28.22, -85.63]]
      }],
      // time-varying quantities
      pressure: series([[0, 968], [8, 962], [12, 958], [16, 954], [23, 951]]),
      wind: series([[0, 92], [8, 99], [16, 108], [23, 112]]),
      modelCat4: series([[0, 0.38], [10, 0.47], [16, 0.56], [23, 0.61]]),
      marketCat4: series([[0, 0.41], [12, 0.42], [18, 0.44], [23, 0.44]]),
      reconAge: series([[0, 6], [6, 41], [7, 4], [14, 44], [15, 5], [23, 22]])
    },
    EP07: {
      id: "EP07",
      name: "Elida",
      cls: "C1",
      full_cls: "Cat 1 Hurricane",
      basin: "west",
      color: "var(--pai-accumulation)",
      phase: "ACCUMULATION",
      center: [16.8, -112.4],
      movement: "W 9 kt",
      track: [[16.2, -109.8], [16.5, -111.1], [16.8, -112.4], [17.2, -114.0], [17.7, -115.8]],
      pastIdx: 2,
      cone: [[17.0, -112.7], [17.5, -114.2], [18.1, -116.0], [17.3, -116.4], [16.9, -114.6], [16.6, -113.0]],
      recon: null,
      pressure: series([[0, 992], [23, 985]]),
      wind: series([[0, 65], [23, 75]]),
      modelCat4: series([[0, 0.05], [23, 0.08]]),
      marketCat4: series([[0, 0.06], [23, 0.06]]),
      reconAge: series([[0, null], [23, null]])
    },
    EP08: {
      id: "EP08",
      name: "Fausto",
      cls: "TS",
      full_cls: "Tropical Storm",
      basin: "west",
      color: "var(--pai-watch)",
      phase: "WATCH",
      center: [14.2, -120.1],
      movement: "WNW 14 kt",
      track: [[13.6, -117.9], [13.9, -119.0], [14.2, -120.1], [14.7, -121.6]],
      pastIdx: 2,
      cone: [[14.4, -120.4], [14.9, -121.9], [14.3, -122.2], [14.0, -120.7]],
      recon: null,
      pressure: series([[0, 1000], [23, 998]]),
      wind: series([[0, 45], [23, 50]]),
      modelCat4: series([[0, 0.01], [23, 0.01]]),
      marketCat4: series([[0, 0.02], [23, 0.02]]),
      reconAge: series([[0, null], [23, null]])
    }
  };

  // Prediction-market contracts (Kalshi-style, SEEDED). Each carries a base market
  // price + Category Alpha model anchor; edge, Kelly, order book and sparklines are
  // all derived live per replay frame in compute.js. volume = $ notional traded.
  const contracts = [{
    id: "KXHURCAT4-25",
    label: "KXHURCAT4 · Bertha Cat 4+ landfall",
    short: "Bertha Cat 4+",
    storm: "AL04",
    market: 0.44,
    model: 0.61,
    drift: 0.02,
    mdrift: 0.05,
    liquidity: 38000,
    spread: 0.03,
    volume: 1240000
  }, {
    id: "KXHURCAT3-25",
    label: "KXHURCAT3 · Bertha Cat 3+ sustain",
    short: "Bertha Cat 3+",
    storm: "AL04",
    market: 0.58,
    model: 0.69,
    mdrift: 0.02,
    liquidity: 61000,
    spread: 0.02,
    volume: 2100000
  }, {
    id: "KXHURLALAND-25",
    label: "KXHURLA · Bertha LA landfall <72h",
    short: "Bertha LA <72h",
    storm: "AL04",
    market: 0.36,
    model: 0.49,
    mdrift: 0.03,
    liquidity: 44000,
    spread: 0.03,
    volume: 880000
  }, {
    id: "KXHURW120-25",
    label: "KXHURW120 · Bertha peak wind ≥120 kt",
    short: "Bertha ≥120 kt",
    storm: "AL04",
    market: 0.28,
    model: 0.41,
    drift: 0.01,
    mdrift: 0.04,
    liquidity: 26000,
    spread: 0.04,
    volume: 540000
  }, {
    id: "KXHURCAT1E-25",
    label: "KXHURCAT1E · Elida Cat 1+ 48h",
    short: "Elida Cat 1+",
    storm: "EP07",
    market: 0.63,
    model: 0.66,
    liquidity: 22000,
    spread: 0.03,
    volume: 410000
  }, {
    id: "KXHURFAU-25",
    label: "KXHURFAU · Fausto → hurricane",
    short: "Fausto → hur",
    storm: "EP08",
    market: 0.22,
    model: 0.17,
    liquidity: 12000,
    spread: 0.05,
    volume: 190000
  }, {
    id: "KXATLNAMED-25",
    label: "KXATLNAMED · Atlantic named ≥14 (season)",
    short: "ATL named ≥14",
    storm: "AL04",
    market: 0.71,
    model: 0.70,
    liquidity: 9000,
    spread: 0.04,
    volume: 3100000,
    proxy: true
  }];

  // Evidence items for the primary storm (Evidence Matrix). value(f) computed live.
  const evidence = [{
    id: "ev-adv",
    kind: "advisory",
    label: "NHC Public Advisory",
    source: "NHC",
    tier: "A",
    latency: "3m",
    ver: "adv-15",
    read: (S, f) => S.full_cls + " · " + Math.round(S.wind(f)) + " kt",
    weight: 0.28,
    hash: "a1b2c3d4"
  }, {
    id: "ev-recon",
    kind: "recon_fix",
    label: "Recon flight-level pressure",
    source: "URNT15 HDOB",
    tier: "B",
    ver: "fix-118",
    read: (S, f) => Math.round(S.pressure(f)) + " mb",
    weight: 0.24,
    hash: "9f8e7d6c"
  }, {
    id: "ev-sst",
    kind: "sst_reading",
    label: "Gulf SST anomaly",
    source: "Open-Meteo / manual",
    tier: "B",
    latency: "manual",
    ver: "sst-0722",
    read: () => "+2.4 °C",
    weight: 0.15,
    hash: "5a5a1212"
  }, {
    id: "ev-ascat",
    kind: "scatter",
    label: "ASCAT surface wind vectors",
    source: "METOP-C",
    tier: "B",
    latency: "88m",
    ver: "asc-441",
    read: (S, f) => Math.round(S.wind(f) * 0.86) + " kt (sfc)",
    weight: 0.12,
    hash: "cc01aa22"
  }, {
    id: "ev-models",
    kind: "model_cycle",
    label: "Model consensus (GFS/ECMWF/HAFS)",
    source: "NOMADS",
    tier: "A",
    latency: "40m",
    ver: "12z",
    read: (S, f) => Math.round(S.modelCat4(f) * 100) + "% Cat4+",
    weight: 0.21,
    hash: "d00df00d"
  }, {
    id: "ev-market",
    kind: "market_snapshot",
    label: "Kalshi contract price",
    source: "Kalshi (seeded)",
    tier: "C",
    latency: "5m",
    ver: "mkt-77",
    read: (S, f) => Math.round(S.marketCat4(f) * 100) + "¢",
    weight: 0.0,
    hash: "beef4444"
  }];

  // Model consensus members for the Probability panel.
  const models = [{
    id: "GFS",
    label: "GFS",
    cat4: 0.58,
    color: "var(--cyan-400)"
  }, {
    id: "ECMWF",
    label: "ECMWF",
    cat4: 0.64,
    color: "var(--green-400)"
  }, {
    id: "HAFS-A",
    label: "HAFS-A",
    cat4: 0.55,
    color: "var(--amber-400)"
  }, {
    id: "GEFS-mean",
    label: "GEFS mean",
    cat4: 0.52,
    color: "var(--violet-500)"
  }];

  // Event ledger / research ledger — each pins a replay frame (VCR bookmarks).
  const events = [{
    frame: 0,
    kind: "advisory",
    label: "Advisory #14 issued — Cat 2, 92 kt",
    source: "NHC",
    tier: "A"
  }, {
    frame: 6,
    kind: "recon_fix",
    label: "Recon fix — 962 mb, sfc 96 kt",
    source: "URNT15",
    tier: "B"
  }, {
    frame: 10,
    kind: "signal",
    label: "RI onset — Δ −7 mb / 3h (PAI Velocity)",
    source: "Vortex",
    tier: "B",
    hot: true
  }, {
    frame: 14,
    kind: "scatter",
    label: "ASCAT pass — surface wind field",
    source: "METOP-C",
    tier: "B"
  }, {
    frame: 16,
    kind: "model_cycle",
    label: "12z model cycle — consensus Cat4+ 56%",
    source: "NOMADS",
    tier: "A"
  }, {
    frame: 19,
    kind: "market_snapshot",
    label: "Market moved +2¢ → 44¢",
    source: "Kalshi",
    tier: "C"
  }, {
    frame: 23,
    kind: "advisory",
    label: "Advisory #15 issued — Cat 3, 108 kt",
    source: "NHC",
    tier: "A"
  }];

  // Pipeline stages (Observability) — the canonical Evidence→…→Position spine.
  const pipeline = [{
    stage: "Observation",
    status: "PASS",
    detail: "6 feeds · 1 stale (recon)"
  }, {
    stage: "Evidence",
    status: "PASS",
    detail: "canonical.fix() · range-checked"
  }, {
    stage: "Features",
    status: "PASS",
    detail: "wind_pressure_residual · unvalidated"
  }, {
    stage: "Confidence",
    status: "PASS",
    detail: "tier B · recon stale −1"
  }, {
    stage: "Probability",
    status: "BLOCKED",
    detail: "engine deferred — anchor only"
  }, {
    stage: "Edge",
    status: "PASS",
    detail: "anchor − market"
  }, {
    stage: "Kelly",
    status: "PASS",
    detail: "Q-Kelly ¼ · liquidity-capped"
  }, {
    stage: "Position",
    status: "EMPTY",
    detail: "research-only · no execution"
  }];
  const health = [{
    name: "Event store",
    detail: "argus.db · 4,182 events",
    status: "PASS"
  }, {
    name: "Live NHC feed",
    detail: "CurrentStorms.json · 200 OK",
    status: "PASS"
  }, {
    name: "GIBS imagery",
    detail: "VIIRS/NOAA-20 true-color · CORS ok",
    status: "PASS"
  }, {
    name: "Kalshi snapshot",
    detail: "seeded board · 7 contracts",
    status: "PASS"
  }, {
    name: "Recon ingester",
    detail: "HDOB no valid-time parser",
    status: "EMPTY"
  }, {
    name: "Probability engine",
    detail: "deferred until promotion",
    status: "BLOCKED"
  }];
  return {
    FRAMES,
    STEP_MIN,
    storms,
    contracts,
    evidence,
    models,
    events,
    pipeline,
    health
  };
}();
})(); } catch (e) { __ds_ns.__errors.push({ path: "prototypes/millibar-terminal/data.js", error: String((e && e.message) || e) }); }

// prototypes/millibar-terminal/drawer.jsx
try { (() => {
const {
  Badge: BGd
} = window.CategoryAlphaDesignSystem_a835cf || {};

/* Provenance drawer — drill-down from any evidence row to its lineage + envelope
   (source, content hash, timestamp, latency, revision) and the pipeline chain it
   feeds. Slides in from the right. */
function MT_Provenance({
  evidenceId,
  stormId,
  frame,
  onClose
}) {
  const e = MT.evidence.find(x => x.id === evidenceId);
  const open = !!e;
  const S = MT.storms[stormId];
  const chain = ["Observation", "Evidence", "Feature", "Confidence", "Decision"];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(2,5,12,.5)",
      opacity: open ? 1 : 0,
      pointerEvents: open ? "auto" : "none",
      transition: "opacity .2s",
      zIndex: 60
    }
  }), /*#__PURE__*/React.createElement("aside", {
    style: {
      position: "fixed",
      top: 0,
      right: 0,
      height: "100vh",
      width: 380,
      maxWidth: "92vw",
      background: "var(--surface-card)",
      borderLeft: "1px solid var(--border-strong)",
      boxShadow: "var(--shadow-cmd)",
      transform: open ? "translateX(0)" : "translateX(100%)",
      transition: "transform .25s",
      zIndex: 61,
      overflowY: "auto",
      padding: 18
    }
  }, e && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: "var(--accent)"
    }
  }, "Data Provenance"), /*#__PURE__*/React.createElement("span", {
    onClick: onClose,
    style: {
      cursor: "pointer",
      color: "var(--text-2)",
      fontSize: 18,
      lineHeight: 1
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--text-1)",
      marginTop: 6
    }
  }, e.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 20,
      fontWeight: 800,
      color: "var(--accent)",
      margin: "8px 0"
    }
  }, e.read(S, frame)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(BGd, {
    tone: {
      A: "pos",
      B: "warn",
      C: "neg"
    }[e.tier]
  }, "TIER ", e.tier), /*#__PURE__*/React.createElement(BGd, {
    tone: "neutral"
  }, e.kind)), [["source", e.source], ["timestamp", MTX.frameTime(frame) + " (as-of cursor)"], ["latency", e.latency || "—"], ["revision", e.ver], ["content hash", "sha256:" + e.hash + "…"], ["weight in confidence", e.weight ? (e.weight * 100).toFixed(0) + "%" : "excluded"]].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      padding: "7px 0",
      borderBottom: "1px solid var(--border-dim)",
      fontFamily: "var(--font-mono)",
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-2)"
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-1)",
      fontWeight: 600,
      textAlign: "right",
      wordBreak: "break-all"
    }
  }, v))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: "var(--text-2)",
      margin: "16px 0 8px"
    }
  }, "Pipeline lineage"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 0
    }
  }, chain.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: c,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "6px 0"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      flex: "none",
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      fontWeight: 700,
      background: i <= 2 ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "var(--surface-sunken)",
      color: i <= 2 ? "var(--accent)" : "var(--text-2)"
    }
  }, i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: i <= 3 ? "var(--text-1)" : "var(--text-2)"
    }
  }, c), c === "Decision" && /*#__PURE__*/React.createElement(BGd, {
    tone: "special",
    style: {
      marginLeft: "auto"
    }
  }, "NULL (engine deferred)")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      padding: "10px 12px",
      borderRadius: 8,
      border: "1px solid var(--border-dim)",
      borderLeft: "3px solid var(--accent)",
      fontSize: 11,
      color: "var(--text-2)",
      lineHeight: 1.5
    }
  }, "Content-addressed & bitemporal: this fix is an immutable event; a correction is a new row with a higher revision, never an edit."))));
}
window.MT_Provenance = MT_Provenance;
})(); } catch (e) { __ds_ns.__errors.push({ path: "prototypes/millibar-terminal/drawer.jsx", error: String((e && e.message) || e) }); }

// prototypes/millibar-terminal/main.jsx
try { (() => {
const A = window.CategoryAlphaDesignSystem_a835cf || {};
const {
  Pill: PL,
  Badge: BA,
  IngestionHUD: HUD,
  StatTile: STt
} = A;
const NF = (window.MT ? MT.FRAMES : 24) - 1;
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "tactical",
  "density": "comfortable"
} /*EDITMODE-END*/;
const PAI = {
  ACCUMULATION: {
    c: "var(--pai-accumulation)",
    t: "Accumulation",
    d: "Pressure trend building — early organization."
  },
  VELOCITY: {
    c: "var(--pai-velocity)",
    t: "Velocity",
    d: "Pressure falling fast — intensification underway."
  },
  EXHAUSTION: {
    c: "var(--pai-exhaustion)",
    t: "Exhaustion",
    d: "Deepening decelerating — near peak."
  },
  WATCH: {
    c: "var(--pai-watch)",
    t: "Watch",
    d: "Insufficient pressure trend — monitoring."
  }
};
function Anno({
  tone,
  icon,
  title,
  desc
}) {
  const c = {
    pos: "var(--pos)",
    warn: "var(--warn)",
    info: "var(--accent-bright)",
    neu: "var(--text-2)"
  }[tone];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 9,
      alignItems: "flex-start",
      padding: "6px 0",
      borderBottom: "1px solid var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 20,
      height: 20,
      flex: "none",
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      color: c,
      background: `color-mix(in srgb, ${c} 14%, transparent)`
    }
  }, icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: "var(--text-1)",
      lineHeight: 1.2
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      color: "var(--text-2)",
      marginTop: 1,
      lineHeight: 1.4
    }
  }, desc)));
}
function LayerToggles({
  layers,
  setLayers
}) {
  const PROV = {
    live: "var(--pos)",
    seeded: "var(--warn)",
    nofeed: "var(--neg)"
  };
  const PROV_TITLE = {
    live: "LIVE — probed feed",
    seeded: "SEEDED — illustrative, not a live forecast",
    nofeed: "NO FEED — requires live backend telemetry; disabled"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 12,
      bottom: 12,
      zIndex: 500,
      display: "flex",
      gap: 5,
      flexWrap: "wrap",
      maxWidth: "72%"
    }
  }, window.MT_LAYERS.map(o => {
    const nofeed = o.prov === "nofeed";
    const on = layers[o.id] && !nofeed;
    return /*#__PURE__*/React.createElement("span", {
      key: o.id,
      title: PROV_TITLE[o.prov],
      onClick: () => {
        if (nofeed) return;
        setLayers(s => ({
          ...s,
          [o.id]: !s[o.id]
        }));
      },
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: ".3px",
        padding: "4px 9px",
        borderRadius: 6,
        cursor: nofeed ? "not-allowed" : "pointer",
        border: "1px solid " + (on ? "var(--cyan-400)" : "var(--graphite-700)"),
        background: on ? "color-mix(in srgb,var(--cyan-400) 15%,transparent)" : "rgba(7,12,22,.8)",
        color: nofeed ? "#5b6b82" : on ? "#eaf2ff" : "#8ea3bd",
        backdropFilter: "blur(4px)",
        opacity: nofeed ? 0.75 : 1,
        textDecoration: nofeed ? "line-through" : "none"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: PROV[o.prov],
        flex: "none"
      }
    }), o.label, nofeed && /*#__PURE__*/React.createElement("span", {
      style: {
        textDecoration: "none",
        color: "var(--neg)",
        fontSize: 8.5,
        letterSpacing: ".5px"
      }
    }, "NO FEED"));
  }));
}
function Transport({
  frame,
  setFrame,
  playing,
  setPlaying,
  speed,
  setSpeed
}) {
  const isLive = frame >= NF;
  const ageMin = (NF - frame) * MT.STEP_MIN;
  const human = ageMin < 60 ? ageMin + "m" : Math.floor(ageMin / 60) + "h" + ("0" + ageMin % 60).slice(-2) + "m";
  const [stepFlash, setStepFlash] = React.useState(null);
  const flashRef = React.useRef();
  const flash = txt => {
    setStepFlash(txt);
    clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setStepFlash(null), 900);
  };
  const mode = isLive ? playing ? "LIVE" : "HOLD" : playing ? "REPLAY" : "PAUSED";
  const modeGreen = mode === "LIVE" || mode === "HOLD";
  const modeColor = modeGreen ? "var(--pos)" : "var(--warn)";
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
    borderRadius: 6
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 14px",
      background: "var(--surface-card)",
      borderTop: "1px solid var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    title: "Step back 10m (\u2190)",
    onClick: () => {
      setPlaying(false);
      setFrame(Math.max(0, frame - 1));
      flash("STEP −10m");
    },
    style: {
      ...btn,
      width: 30,
      height: 30,
      fontSize: 11
    }
  }, "\u25C0\u25C0"), /*#__PURE__*/React.createElement("div", {
    title: "Play/pause (space)",
    onClick: () => setPlaying(!playing),
    style: {
      ...btn,
      width: 36,
      height: 36,
      fontSize: 13,
      background: "var(--surface-solid)",
      color: "var(--text-inverse)",
      borderColor: "var(--surface-solid)"
    }
  }, playing ? "❚❚" : "▶"), /*#__PURE__*/React.createElement("div", {
    title: "Step forward 10m (\u2192)",
    onClick: () => {
      setPlaying(false);
      setFrame(Math.min(NF, frame + 1));
      flash("STEP +10m");
    },
    style: {
      ...btn,
      width: 30,
      height: 30,
      fontSize: 11
    }
  }, "\u25B6\u25B6|"), /*#__PURE__*/React.createElement("div", {
    title: "Jump to live",
    onClick: () => {
      setPlaying(true);
      setFrame(NF);
    },
    style: {
      ...btn,
      padding: "0 10px",
      height: 30,
      fontSize: 10,
      fontWeight: 700,
      color: isLive ? "var(--pos)" : "var(--text-2)",
      borderColor: isLive ? "var(--pos)" : "var(--border-strong)"
    }
  }, "\u25B6\u25B6 Live")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: "relative",
      height: 30,
      display: "flex",
      alignItems: "center",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%",
      height: 5,
      borderRadius: 3,
      background: "var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: frame / NF * 100 + "%",
      background: "linear-gradient(90deg,var(--cyan-500),var(--cyan-400))",
      borderRadius: 3
    }
  }), MT.events.map(e => /*#__PURE__*/React.createElement("span", {
    key: e.frame,
    title: e.label,
    onClick: () => {
      setPlaying(false);
      setFrame(e.frame);
    },
    style: {
      position: "absolute",
      top: -4,
      left: e.frame / NF * 100 + "%",
      width: 2,
      height: 13,
      background: e.hot ? "var(--warn)" : "var(--accent)",
      transform: "translateX(-1px)",
      cursor: "pointer"
    }
  }))), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: NF,
    value: frame,
    onChange: e => {
      setPlaying(false);
      setFrame(+e.target.value);
    },
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: 30,
      margin: 0,
      opacity: 0,
      cursor: "pointer"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 1,
      padding: "3px 9px",
      borderRadius: 999,
      color: modeColor,
      border: "1px solid " + ("color-mix(in srgb," + modeColor + " 35%,transparent)")
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: modeColor,
      animation: mode === "LIVE" ? "ca-pulse 1.8s infinite" : "none"
    }
  }), mode, isLive ? "" : " −" + human), stepFlash && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: .5,
      color: "var(--accent)",
      padding: "3px 8px",
      borderRadius: 6,
      border: "1px solid color-mix(in srgb,var(--accent) 35%,transparent)"
    }
  }, stepFlash), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      fontWeight: 700,
      color: "var(--text-1)",
      minWidth: 64,
      textAlign: "right"
    }
  }, MTX.frameTime(frame)), /*#__PURE__*/React.createElement("div", {
    title: "Speed",
    onClick: () => setSpeed(speed >= 4 ? 1 : speed * 2),
    style: {
      ...btn,
      padding: "5px 9px",
      height: 26,
      fontSize: 10,
      fontWeight: 700
    }
  }, speed, "\xD7"));
}
function MillibarTerminalApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [frame, setFrame] = React.useState(NF);
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(2);
  const [storm, setStorm] = React.useState("AL04");
  const [sel, setSel] = React.useState({
    contract: "KXHURCAT4-25",
    evidence: null
  });
  const [bankroll, setBankroll] = React.useState(10000);
  const [stake, setStake] = React.useState(0.25);
  const [layers, setLayers] = React.useState({
    satellite: true,
    cone: true,
    track: true,
    recon: true,
    ascat: false,
    models: false,
    particles: false
  });
  const dense = t.density === "compact";
  const tactical = t.theme !== "light";
  React.useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setFrame(f => f >= NF ? 0 : f + 1), Math.round(700 / speed));
    return () => clearInterval(iv);
  }, [playing, speed]);
  const st = React.useRef({});
  st.current = {
    frame,
    playing,
    storm
  };
  React.useEffect(() => {
    function onKey(e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const c = st.current;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying(p => !p);
      } else if (e.key === "ArrowRight") {
        setPlaying(false);
        setFrame(Math.min(NF, c.frame + 1));
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        setFrame(Math.max(0, c.frame - 1));
      } else if (e.key === "]") {
        setPlaying(false);
        const n = MT.events.find(x => x.frame > c.frame);
        if (n) setFrame(n.frame);
      } else if (e.key === "[") {
        setPlaying(false);
        const p = [...MT.events].reverse().find(x => x.frame < c.frame);
        if (p) setFrame(p.frame);
      } else if (e.key === "1") setStorm("AL04");else if (e.key === "2") setStorm("EP07");else if (e.key === "3") setStorm("EP08");else if (e.key === "Escape") setSel(s => ({
        ...s,
        evidence: null
      }));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const S = MT.storms[storm],
    P0 = PAI[S.phase],
    snap = MTX.snap(storm, frame);
  const pickContract = id => {
    const c = MT.contracts.find(x => x.id === id);
    setSel(s => ({
      ...s,
      contract: id
    }));
    if (c) setStorm(c.storm);
  };
  const rAge = snap.reconAge;
  const reconStatus = rAge == null ? "missing" : rAge > 30 ? "stale" : "ok";
  const reconLat = rAge == null ? "—" : rAge >= 60 ? (rAge / 60).toFixed(1) + " hrs" : Math.round(rAge) + "m";
  const reconPenalty = rAge == null ? "−0.50 (no coverage)" : rAge > 30 ? "−0.15 (decay curve)" : null;
  const reconTier = rAge == null ? "LOW" : rAge > 30 ? "MEDIUM" : "HIGH";
  const feeds = [{
    name: "ATCF",
    status: "ok",
    age: "2m",
    source: "NHC ATCF b-deck",
    timestamp: MTX.frameTime(frame),
    latency: "2m",
    penalty: null,
    tier: "HIGH",
    buffer: "SYNCED · 0 dropped"
  }, {
    name: "RECON",
    status: reconStatus,
    age: rAge == null ? undefined : Math.round(rAge) + "m",
    source: "AF307 Vortex Message",
    timestamp: "00:31Z",
    latency: reconLat,
    penalty: reconPenalty,
    tier: reconTier,
    buffer: rAge == null ? "NO STREAM" : "SYNCED · 0 dropped"
  }, {
    name: "SST",
    status: "stale",
    age: "1d",
    source: "Open-Meteo / manual",
    timestamp: "07-22 00:00Z",
    latency: "1d",
    penalty: "−0.10 (age decay)",
    tier: "MEDIUM",
    buffer: "MANUAL · cached"
  }];
  return /*#__PURE__*/React.createElement("div", {
    "data-surface": tactical ? "tactical" : undefined,
    style: {
      minHeight: "100vh",
      background: "var(--surface-app)",
      color: "var(--text-1)",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 30,
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "9px 20px",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: tactical ? "../../assets/logo-dark.svg" : "../../assets/logo.svg",
    alt: "Millibar Terminal",
    style: {
      height: 40
    }
  }), /*#__PURE__*/React.createElement(PL, null, "Category Alpha"), /*#__PURE__*/React.createElement(HUD, {
    streams: feeds
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontFamily: "var(--font-mono)",
      fontSize: 10.5,
      color: "var(--text-2)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "as-of ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--accent)"
    }
  }, MTX.frameTime(frame))), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .4
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "space play \xB7 \u2190\u2192 scrub \xB7 [ ] events \xB7 1-3 storm"))), /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: 1680,
      margin: "0 auto",
      padding: "16px 16px 48px"
    }
  }, /*#__PURE__*/React.createElement("section", {
    style: {
      borderRadius: 14,
      overflow: "hidden",
      border: "1px solid var(--border-strong)",
      boxShadow: "var(--shadow-cmd)",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) 320px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      minHeight: 480,
      background: "var(--slate-950)"
    }
  }, /*#__PURE__*/React.createElement(window.MT_Map, {
    stormId: storm,
    frame: frame,
    layers: layers,
    onSelect: setStorm
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 500,
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      padding: "12px 14px",
      background: "linear-gradient(180deg,rgba(4,6,12,.9),rgba(4,6,12,.4) 70%,transparent)",
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 2.5,
      color: "var(--blue-300)",
      textTransform: "uppercase"
    }
  }, "Storm Command Center"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginLeft: "auto",
      pointerEvents: "auto"
    }
  }, Object.values(MT.storms).map(s => /*#__PURE__*/React.createElement(PL, {
    key: s.id,
    mono: false,
    size: "sm",
    active: s.id === storm,
    dotColor: s.color,
    onClick: () => setStorm(s.id)
  }, s.name, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .6,
      fontSize: 10
    }
  }, s.cls))))), /*#__PURE__*/React.createElement(LayerToggles, {
    layers: layers,
    setLayers: setLayers
  })), /*#__PURE__*/React.createElement("aside", {
    style: {
      background: "var(--surface-card)",
      borderLeft: "1px solid var(--border-dim)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "11px 15px 8px",
      borderBottom: "1px solid var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      lineHeight: 1.05,
      display: "flex",
      alignItems: "center",
      gap: 9
    }
  }, S.name, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      fontWeight: 800,
      padding: "3px 8px",
      borderRadius: 6,
      color: S.color,
      background: `color-mix(in srgb,${S.color} 15%,transparent)`
    }
  }, S.full_cls)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text-2)",
      marginTop: 5
    }
  }, S.center[0].toFixed(1), "\xB0N ", Math.abs(S.center[1]).toFixed(1), "\xB0W \xB7 VIIRS/NOAA-20")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 1,
      background: "var(--border-dim)",
      borderBottom: "1px solid var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement(STt, {
    variant: "metric",
    label: "WIND",
    value: snap.wind,
    unit: "kt",
    sub: "NHC"
  }), /*#__PURE__*/React.createElement(STt, {
    variant: "metric",
    label: "PRESSURE",
    value: snap.pressure,
    unit: "mb",
    sub: snap.reconAge == null ? "no recon" : "recon"
  }), /*#__PURE__*/React.createElement(STt, {
    variant: "metric",
    label: "EDGE",
    value: (snap.edgePct >= 0 ? "+" : "") + snap.edgePct.toFixed(1),
    unit: "%",
    sub: "model \u2212 mkt"
  }), /*#__PURE__*/React.createElement(STt, {
    variant: "metric",
    label: "PHASE",
    value: P0.t,
    sub: "PAI"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 15px",
      flex: 1,
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      fontWeight: 800,
      letterSpacing: 1.4,
      color: "var(--accent)",
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, "Category Alpha Read"), /*#__PURE__*/React.createElement(Anno, {
    tone: "info",
    icon: "\u25C9",
    title: "Lifecycle — " + P0.t,
    desc: P0.d
  }), S.basin === "east" && /*#__PURE__*/React.createElement(Anno, {
    tone: "warn",
    icon: "\u25B2",
    title: "Gulf ocean heat HIGH",
    desc: "SST anomaly +2.4\xB0C \u2014 RI-supportive fuel."
  }), snap.reconAge != null && snap.reconAge < 30 && /*#__PURE__*/React.createElement(Anno, {
    tone: "pos",
    icon: "\u2713",
    title: "Recon confirms circulation",
    desc: "Aircraft min pressure " + snap.pressure + " mb."
  }), snap.reconAge != null && snap.reconAge >= 30 && /*#__PURE__*/React.createElement(Anno, {
    tone: "warn",
    icon: "\u25BC",
    title: "Recon stale",
    desc: Math.round(snap.reconAge) + "m since last fix — confidence −0.5."
  }), /*#__PURE__*/React.createElement(Anno, {
    tone: "neu",
    icon: "\u27A4",
    title: "Tracking",
    desc: snap.wind + " kt, moving " + S.movement + "."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      color: "var(--text-2)",
      opacity: .8
    }
  }, "Interpretation, not observation. SEEDED demo \u2014 no execution, no advice.")))), /*#__PURE__*/React.createElement(Transport, {
    frame: frame,
    setFrame: setFrame,
    playing: playing,
    setPlaying: setPlaying,
    speed: speed,
    setSpeed: setSpeed
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.5fr 1fr 1fr",
      gap: 14,
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(window.MT_Evidence, {
    stormId: storm,
    frame: frame,
    selection: sel,
    onSelect: id => setSel(s => ({
      ...s,
      evidence: id
    })),
    dense: dense
  }), /*#__PURE__*/React.createElement(window.MT_Markets, {
    frame: frame,
    selection: sel,
    onSelect: pickContract,
    dense: dense
  }), /*#__PURE__*/React.createElement(window.MT_EdgeMatrix, {
    frame: frame,
    bankroll: bankroll,
    stake: stake,
    setBankroll: setBankroll,
    setStake: setStake,
    selection: sel,
    onSelect: pickContract,
    dense: dense
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(window.MT_Confidence, {
    stormId: storm,
    frame: frame
  }), /*#__PURE__*/React.createElement(window.MT_Probability, {
    stormId: storm,
    frame: frame
  }), /*#__PURE__*/React.createElement(window.MT_OrderBook, {
    contractId: sel.contract,
    frame: frame,
    dense: dense
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(window.MT_Ledger, {
    frame: frame,
    onSeek: f => {
      setPlaying(false);
      setFrame(f);
    },
    dense: dense
  }), /*#__PURE__*/React.createElement(window.MT_Observability, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      height: 300
    }
  }, /*#__PURE__*/React.createElement(window.MT_Console, {
    stormId: storm,
    frame: frame
  }))), /*#__PURE__*/React.createElement(window.MT_Provenance, {
    evidenceId: sel.evidence,
    stormId: storm,
    frame: frame,
    onClose: () => setSel(s => ({
      ...s,
      evidence: null
    }))
  }), /*#__PURE__*/React.createElement(TweaksPanel, null, /*#__PURE__*/React.createElement(TweakSection, {
    label: "Display"
  }), /*#__PURE__*/React.createElement(TweakRadio, {
    label: "Theme",
    value: t.theme,
    options: ["tactical", "light"],
    onChange: v => setTweak("theme", v)
  }), /*#__PURE__*/React.createElement(TweakRadio, {
    label: "Density",
    value: t.density,
    options: ["compact", "comfortable"],
    onChange: v => setTweak("density", v)
  })));
}
(function mount() {
  // Order-independent boot: wait for the plain-script globals (seed data, compute
  // engine, DS bundle) before first render. Direct load has them synchronously;
  // the offline bundle re-injects scripts async, so poll briefly.
  if (window.MT && window.MTX && window.CategoryAlphaDesignSystem_a835cf && window.MT_Evidence) {
    ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(MillibarTerminalApp, null));
  } else {
    setTimeout(mount, 30);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "prototypes/millibar-terminal/main.jsx", error: String((e && e.message) || e) }); }

// prototypes/millibar-terminal/map.jsx
try { (() => {
/* Storm Command Map — Leaflet, dark tactical. A CARTO dark raster field under
   vector-first cartography: real NASA GIBS VIIRS imagery (probed live), NHC cone +
   track, recon flight track, ASCAT vectors, and multi-model consensus spread. Each
   layer carries an honest provenance tag (live / seeded / no-feed). The eye position
   is bound to the bitemporal engine (MTX.at(T)) so scrubbing rewinds geometry too. */
const MT_LAYERS = [{
  id: "satellite",
  label: "VIIRS Satellite",
  prov: "live"
}, {
  id: "cone",
  label: "NHC Cone",
  prov: "seeded"
}, {
  id: "track",
  label: "Forecast Track",
  prov: "seeded"
}, {
  id: "recon",
  label: "Recon Track",
  prov: "seeded"
}, {
  id: "ascat",
  label: "ASCAT Winds",
  prov: "seeded"
}, {
  id: "models",
  label: "Model Consensus",
  prov: "seeded"
}, {
  id: "particles",
  label: "Particle Wind (SFMR)",
  prov: "nofeed"
}];
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}
// NASA GIBS sub-hourly GOES layers aren't retained in this environment; VIIRS/NOAA-20
// daily true-color IS, globally and reliably. Key the basemap to a recent UTC day and
// probe before attaching so an unreachable feed degrades to vector-only with no 404s.
const GIBS_SAT_LAYER = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
const GIBS_SAT_TMS = "GoogleMapsCompatible_Level9";
function gibsDay(back) {
  const d = new Date(Date.now() - back * 86400000);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function gibsUrl(date) {
  return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + GIBS_SAT_LAYER + "/default/" + date + "/" + GIBS_SAT_TMS + "/{z}/{y}/{x}.jpg";
}
function gibsProbe(date) {
  // Probe the actual storm-region tile (z5, Gulf) rather than a global low-zoom tile,
  // so a day whose regional pass hasn't published yet is skipped cleanly (no 404 flood).
  return new Promise(res => {
    const img = new Image();
    const to = setTimeout(() => res(false), 6000);
    img.onload = () => {
      clearTimeout(to);
      res(true);
    };
    img.onerror = () => {
      clearTimeout(to);
      res(false);
    };
    img.src = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + GIBS_SAT_LAYER + "/default/" + date + "/" + GIBS_SAT_TMS + "/5/13/7.jpg";
  });
}
function cssVar(v) {
  const m = /var\((--[\w-]+)\)/.exec(v);
  if (!m) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#38bdf8";
}
function MT_Map({
  stormId,
  frame,
  layers,
  onSelect,
  height = "100%"
}) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const refs = React.useRef({});
  const S = MT.storms[stormId];

  // init once
  React.useEffect(() => {
    if (mapRef.current || !elRef.current || typeof L === "undefined") return;
    const map = L.map(elRef.current, {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 8,
      zoomSnap: 0.25
    }).setView(S.center, 5);
    L.control.zoom({
      position: "topright"
    }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 9,
      opacity: 0.62,
      attribution: "© OpenStreetMap · © CARTO"
    }).addTo(map);
    map.attributionControl.addAttribution("Imagery NASA GIBS / VIIRS · tracks NHC · SEEDED");
    refs.current.ovl = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // recenter on storm change
  React.useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo(S.center, S.basin === "east" ? 5 : 5, {
      duration: 0.7
    });
  }, [stormId]);

  // Satellite raster (VIIRS/NOAA-20 daily true-color via GIBS). Probe recent UTC days
  // and attach the freshest that resolves; if none do, stay vector-only silently.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (refs.current.sat) {
      map.removeLayer(refs.current.sat);
      refs.current.sat = null;
    }
    if (!layers.satellite) return;
    let cancelled = false;
    (async () => {
      for (let back = 0; back < 7 && !cancelled; back++) {
        const date = gibsDay(back);
        const ok = await gibsProbe(date);
        if (cancelled || !mapRef.current) return;
        if (ok) {
          const sat = L.tileLayer(gibsUrl(date), {
            opacity: 0.9,
            maxNativeZoom: 8,
            maxZoom: 8,
            minZoom: 2,
            tileSize: 256,
            updateWhenIdle: true,
            attribution: "VIIRS/NOAA-20 true-color · " + date + " · NASA GIBS",
            errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
          });
          sat.addTo(mapRef.current);
          refs.current.sat = sat;
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [layers.satellite]);

  // vector overlays, rebuilt on storm/layers change
  React.useEffect(() => {
    const map = mapRef.current,
      g = refs.current.ovl;
    if (!map || !g) return;
    g.clearLayers();
    const pc = cssVar(S.color);
    // all storms as selectable dots
    Object.values(MT.storms).forEach(st => {
      const on = st.id === stormId;
      const dot = L.circleMarker(st.center, {
        radius: on ? 7 : 5,
        color: cssVar(st.color),
        weight: 2,
        fillColor: "#0b1830",
        fillOpacity: 1
      });
      dot.on("click", () => onSelect && onSelect(st.id));
      dot.bindTooltip(st.name + " " + st.cls, {
        direction: "top",
        className: "mt-tt"
      });
      dot.addTo(g);
    });
    if (layers.cone && S.cone) {
      L.polygon(S.cone, {
        stroke: false,
        fillColor: pc,
        fillOpacity: 0.09
      }).addTo(g);
      L.polygon(S.cone, {
        color: pc,
        weight: 1.1,
        opacity: 0.8,
        dashArray: "2,6",
        fill: false
      }).addTo(g);
    }
    if (layers.track && S.track) {
      const past = S.track.slice(0, S.pastIdx + 1),
        fut = S.track.slice(S.pastIdx);
      L.polyline(past, {
        color: "#e2e8f0",
        weight: 2,
        opacity: 0.9
      }).addTo(g);
      L.polyline(fut, {
        color: "#38bdf8",
        weight: 1.8,
        opacity: 0.9,
        dashArray: "5,5"
      }).addTo(g);
      S.track.forEach((p, i) => L.circleMarker(p, {
        radius: 2.6,
        color: i <= S.pastIdx ? "#e2e8f0" : "#38bdf8",
        fillColor: "#0b1830",
        fillOpacity: 1,
        weight: 1.4
      }).addTo(g));
    }
    if (layers.recon && S.reconTracks) {
      S.reconTracks.forEach(rt => {
        L.polyline(rt.points, {
          color: rt.color,
          weight: 1.6,
          opacity: 0.9
        }).addTo(g);
        const head = rt.points[rt.points.length - 1];
        L.circleMarker(head, {
          radius: 3.4,
          color: rt.color,
          fillColor: "#0b1830",
          fillOpacity: 1,
          weight: 1.8
        }).bindTooltip(rt.label, {
          direction: "top",
          className: "mt-tt"
        }).addTo(g);
        (rt.sondes || []).forEach(p => L.circleMarker(p, {
          radius: 2.2,
          color: rt.color,
          fillColor: rt.color,
          fillOpacity: 0.85,
          weight: 0
        }).bindTooltip(rt.id + " dropsonde", {
          direction: "top",
          className: "mt-tt"
        }).addTo(g));
      });
    }
    if (layers.ascat) {
      // seeded surface wind vectors near the core (schematic ASCAT swath)
      const [la, lo] = S.center;
      for (let i = 0; i < 12; i++) {
        const ang = i / 12 * Math.PI * 2,
          r = 1.4 + i % 3 * 0.5;
        const p0 = [la + Math.sin(ang) * r, lo + Math.cos(ang) * r];
        const p1 = [p0[0] + Math.cos(ang + 1.4) * 0.5, p0[1] + Math.sin(ang + 1.4) * 0.5];
        L.polyline([p0, p1], {
          color: "#34d399",
          weight: 1.2,
          opacity: 0.7
        }).addTo(g);
      }
    }
    if (layers.models && S.track) {
      const c = S.track[S.pastIdx],
        end = S.track[S.track.length - 1];
      MT.models.forEach((m, i) => {
        const spread = (i - 1.5) * 0.9;
        L.polyline([c, [end[0] + spread, end[1] - spread * 0.6]], {
          color: cssVar(m.color),
          weight: 1.3,
          opacity: 0.65,
          dashArray: "3,4"
        }).addTo(g);
      });
    }
    // eye reticle — position bound to the bitemporal engine (updated per-frame below)
    const eyeAt = typeof MTX !== "undefined" && MTX.at ? MTX.at(stormId, frame).center : S.center;
    const icon = L.divIcon({
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: '<div style="position:relative;width:30px;height:30px;color:' + pc + '">' + '<div style="position:absolute;inset:0;border-radius:50%;border:1.5px solid currentColor;opacity:.85;animation:ca-reticle 2.4s ease-out infinite"></div>' + '<div style="position:absolute;inset:8px;border-radius:50%;border:1.5px solid currentColor;opacity:.5"></div>' + '<div style="position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;background:currentColor;transform:translate(-50%,-50%);box-shadow:0 0 7px 1px currentColor"></div></div>'
    });
    refs.current.eye = L.marker(eyeAt, {
      icon,
      interactive: false,
      zIndexOffset: 1000
    }).addTo(g);
  }, [stormId, layers.cone, layers.track, layers.recon, layers.ascat, layers.models]);

  // bitemporal binding — move ONLY the eye marker as the as-of cursor scrubs, so
  // geometry rewinds with the tables and there is no overlay rebuild / tile flash.
  React.useEffect(() => {
    if (!refs.current.eye || typeof MTX === "undefined" || !MTX.at) return;
    refs.current.eye.setLatLng(MTX.at(stormId, frame).center);
  }, [frame, stormId]);
  return /*#__PURE__*/React.createElement("div", {
    ref: elRef,
    style: {
      position: "absolute",
      inset: 0,
      height,
      background: "var(--slate-950)"
    }
  });
}
window.MT_Map = MT_Map;
window.MT_LAYERS = MT_LAYERS;
})(); } catch (e) { __ds_ns.__errors.push({ path: "prototypes/millibar-terminal/map.jsx", error: String((e && e.message) || e) }); }

// prototypes/millibar-terminal/panels.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CAns = window.CategoryAlphaDesignSystem_a835cf || {};
const {
  Panel: P,
  SectionHeader: SH,
  ProvenanceFooter: PF,
  Badge: BG,
  Gauge: GG,
  KellyBar: KB,
  EdgeCell: EC,
  StatTile: ST,
  HealthRow: HR,
  Button: BT
} = CAns;
const TIER_TONE = {
  A: "pos",
  B: "warn",
  C: "neg"
};
function labelRow(k, v, tone) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8,
      padding: "3px 0",
      fontFamily: "var(--font-mono)",
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-2)"
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: tone || "var(--text-1)",
      fontWeight: 600
    }
  }, v));
}

/* ---- Evidence Matrix ---- */
function MT_Evidence({
  stormId,
  frame,
  selection,
  onSelect,
  dense
}) {
  const S = MT.storms[stormId];
  const pad = dense ? "4px 8px" : "7px 9px";
  return /*#__PURE__*/React.createElement(P, {
    pad: false,
    title: "Evidence Matrix",
    right: /*#__PURE__*/React.createElement(BG, {
      tone: "live",
      dot: true
    }, MT.evidence.length, " SIGNALS"),
    footer: /*#__PURE__*/React.createElement(PF, {
      source: "canonical.fix()",
      latency: "live",
      version: "1.2.4",
      tier: "A"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: dense ? 11 : 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ["Evidence", "Value", "Source", "Tier"].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      textAlign: "left",
      color: "var(--text-2)",
      fontWeight: 600,
      fontSize: 9.5,
      textTransform: "uppercase",
      letterSpacing: ".5px",
      padding: pad,
      borderBottom: "1px solid var(--border-dim)"
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, MT.evidence.map(e => {
    const on = selection.evidence === e.id;
    return /*#__PURE__*/React.createElement("tr", {
      key: e.id,
      onClick: () => onSelect(e.id),
      style: {
        cursor: "pointer",
        background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent"
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: pad,
        borderBottom: "1px solid var(--border-dim)",
        color: "var(--text-1)"
      }
    }, e.label), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: pad,
        borderBottom: "1px solid var(--border-dim)",
        fontFamily: "var(--font-mono)",
        color: "var(--accent)",
        fontWeight: 700
      }
    }, e.read(S, frame)), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: pad,
        borderBottom: "1px solid var(--border-dim)",
        fontFamily: "var(--font-mono)",
        color: "var(--text-2)",
        fontSize: 10
      }
    }, e.source), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: pad,
        borderBottom: "1px solid var(--border-dim)"
      }
    }, /*#__PURE__*/React.createElement(BG, {
      tone: TIER_TONE[e.tier]
    }, e.tier)));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      color: "var(--text-2)",
      padding: "6px 10px"
    }
  }, "Click a row \u2192 provenance drill-down. Values re-read at the as-of cursor."));
}

/* ---- Confidence (evidence-quality) ---- */
function MT_Confidence({
  stormId,
  frame
}) {
  const s = MTX.snap(stormId, frame);
  return /*#__PURE__*/React.createElement(P, {
    title: "Confidence",
    right: /*#__PURE__*/React.createElement(BG, {
      tone: TIER_TONE[s.tier]
    }, "TIER ", s.tier),
    footer: /*#__PURE__*/React.createElement(PF, {
      source: "evidence_quality.py",
      latency: "live",
      version: "1.2.4",
      tier: s.tier
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text-2)",
      lineHeight: 1.6
    }
  }, s.tierReasons.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, "\xB7 ", r))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: "9px 11px",
      borderRadius: 8,
      border: "1px solid var(--border-dim)",
      borderLeft: "3px solid var(--special)",
      fontSize: 11,
      color: "var(--text-2)",
      lineHeight: 1.5
    }
  }, "Evidence-quality is ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-1)"
    }
  }, "not"), " probability. This tier scores how real/live/sourced the inputs are \u2014 a 60% @ B \u2260 60% @ A."));
}

/* ---- Probability (model consensus) ---- */
function MT_Probability({
  stormId,
  frame
}) {
  const s = MTX.snap(stormId, frame);
  return /*#__PURE__*/React.createElement(P, {
    title: "Probability \u2014 Cat4+",
    right: /*#__PURE__*/React.createElement(BG, {
      tone: "special"
    }, "ANCHOR ONLY"),
    footer: /*#__PURE__*/React.createElement(PF, {
      source: "NHC anchor + model consensus",
      latency: "40m",
      version: "12z",
      tier: "B"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 32,
      fontWeight: 800,
      color: "var(--accent)"
    }
  }, Math.round(s.model * 100), "%"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text-2)"
    }
  }, "Category Alpha anchor \xB7 vs mkt ", Math.round(s.market * 100), "%")), MT.models.map(m => /*#__PURE__*/React.createElement("div", {
    key: m.id,
    style: {
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--text-2)",
      marginBottom: 3
    }
  }, /*#__PURE__*/React.createElement("span", null, m.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-1)"
    }
  }, Math.round(m.cat4 * 100), "%")), /*#__PURE__*/React.createElement(GG, {
    value: m.cat4 * 100,
    color: m.color,
    height: 5
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      color: "var(--text-2)",
      marginTop: 8
    }
  }, "Probability engine deferred \u2014 anchor is NHC-intensity-derived, not a fitted model."));
}

/* ---- Edge Matrix / Q-Kelly ---- */
function MT_EdgeMatrix({
  frame,
  bankroll,
  stake,
  setBankroll,
  setStake,
  selection,
  onSelect,
  dense
}) {
  const rows = MT.contracts.map(c => ({
    c,
    k: MTX.kellyFor(c, frame, bankroll, stake)
  }));
  const total = rows.reduce((a, r) => a + (r.k.allocation || 0), 0);
  return /*#__PURE__*/React.createElement(P, {
    pad: false,
    title: "Edge Matrix \u2014 Q-Kelly Allocation",
    right: /*#__PURE__*/React.createElement(BG, {
      tone: "live",
      dot: true
    }, "LIVE"),
    footer: /*#__PURE__*/React.createElement(PF, {
      source: "Category Alpha \xD7 Kalshi (seeded)",
      latency: "5m",
      version: "1.2.4",
      tier: "B"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      padding: "10px 12px",
      borderBottom: "1px solid var(--border-dim)",
      background: "var(--surface-sunken)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: ".5px",
      textTransform: "uppercase",
      color: "var(--text-2)"
    }
  }, "Bankroll"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: bankroll,
    min: 100,
    step: 500,
    onChange: e => setBankroll(+e.target.value || 0),
    style: {
      width: 104,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      padding: "5px 8px",
      border: "1px solid var(--border-dim)",
      borderRadius: 6,
      background: "var(--surface-card)",
      color: "var(--text-1)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex"
    }
  }, [[1, "FULL"], [0.5, "½"], [0.25, "¼"]].map(([f, l], i) => /*#__PURE__*/React.createElement(BT, {
    key: l,
    variant: "preset",
    mono: true,
    active: stake === f,
    onClick: () => setStake(f),
    style: {
      borderRadius: i === 0 ? "6px 0 0 6px" : i === 2 ? "0 6px 6px 0" : 0,
      marginLeft: i ? "-1px" : 0
    }
  }, l))), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontSize: 11,
      color: "var(--text-2)"
    }
  }, "Total deploy ", /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: "var(--font-mono)",
      color: "var(--text-1)",
      fontSize: 13
    }
  }, "$", total.toLocaleString()))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
      gap: 10,
      padding: dense ? 9 : 12
    }
  }, rows.map(({
    c,
    k
  }) => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    onClick: () => onSelect(c.id),
    style: {
      cursor: "pointer",
      borderRadius: 9,
      outline: selection.contract === c.id ? "1px solid var(--accent)" : "none",
      outlineOffset: 1
    }
  }, /*#__PURE__*/React.createElement(EC, {
    contract: c.label,
    edge: k.edge,
    marketPct: k.market,
    liquidity: c.liquidity,
    theoretical: k.noBet ? undefined : k.theoretical,
    capped: k.capped,
    allocation: k.allocation,
    stakePct: k.stakePct,
    rawPct: k.rawPct
  })))));
}

/* ---- Prediction Markets board ---- */
function MT_spark(vals, w, h, color) {
  if (!vals || vals.length < 2) return null;
  const mn = Math.min(...vals),
    mx = Math.max(...vals),
    r = mx - mn || 1;
  const pts = vals.map((v, i) => (i / (vals.length - 1) * w).toFixed(1) + "," + (h - (v - mn) / r * h).toFixed(1)).join(" ");
  return /*#__PURE__*/React.createElement("svg", {
    width: w,
    height: h,
    style: {
      display: "block",
      marginLeft: "auto"
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: pts,
    fill: "none",
    stroke: color,
    strokeWidth: "1.2",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }));
}
function fmtVol(v) {
  return v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1e3) + "k";
}
function MT_Markets({
  frame,
  selection,
  onSelect,
  dense
}) {
  const pad = dense ? "5px 8px" : "7px 10px";
  const rows = MT.contracts.map(c => {
    const px = MTX.mkt(c, frame),
      model = MTX.mdl(c, frame);
    const prev = MTX.mkt(c, Math.max(0, frame - 3));
    return {
      c,
      px,
      model,
      edge: (model - px) * 100,
      d: (px - prev) * 100,
      hist: MTX.priceHist(c, frame, 12)
    };
  });
  const tvol = rows.reduce((a, r) => a + r.c.volume, 0);
  const th = (h, right) => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      textAlign: right ? "right" : "left",
      color: "var(--text-2)",
      fontWeight: 600,
      fontSize: 9.5,
      textTransform: "uppercase",
      letterSpacing: ".5px",
      padding: pad,
      borderBottom: "1px solid var(--border-dim)"
    }
  }, h);
  const cell = {
    padding: pad,
    borderBottom: "1px solid var(--border-dim)",
    fontFamily: "var(--font-mono)",
    textAlign: "right"
  };
  return /*#__PURE__*/React.createElement(P, {
    pad: false,
    title: "Prediction Markets \u2014 Kalshi board",
    right: /*#__PURE__*/React.createElement(BG, {
      tone: "live",
      dot: true
    }, rows.length, " MKTS"),
    footer: /*#__PURE__*/React.createElement(PF, {
      source: "Kalshi order-driven (seeded)",
      latency: "5m",
      version: "mkt-77",
      tier: "C"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: dense ? 11 : 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, th("Contract"), th("Px", 1), th("Δ", 1), th("Model", 1), th("Edge", 1), th("Vol", 1), th("4h", 1))), /*#__PURE__*/React.createElement("tbody", null, rows.map(({
    c,
    px,
    model,
    edge,
    d,
    hist
  }) => {
    const on = selection.contract === c.id;
    const eStyle = edge >= 15 ? {
      color: "var(--edge-glow)",
      textShadow: "var(--glow-edge)"
    } : edge > 0 ? {
      color: "var(--pos)"
    } : {
      color: "var(--text-2)"
    };
    return /*#__PURE__*/React.createElement("tr", {
      key: c.id,
      onClick: () => onSelect(c.id),
      style: {
        cursor: "pointer",
        background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent"
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: pad,
        borderBottom: "1px solid var(--border-dim)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-1)",
        fontWeight: 600,
        fontSize: dense ? 11 : 11.5
      }
    }, c.short), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-2)"
      }
    }, c.id, c.proxy ? " · proxy" : "")), /*#__PURE__*/React.createElement("td", {
      style: {
        ...cell,
        color: "var(--text-1)",
        fontWeight: 700
      }
    }, Math.round(px * 100), "\xA2"), /*#__PURE__*/React.createElement("td", {
      style: {
        ...cell,
        color: d >= 0 ? "var(--pos)" : "var(--neg)"
      }
    }, d >= 0 ? "+" : "", d.toFixed(1)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...cell,
        color: "var(--text-2)"
      }
    }, Math.round(model * 100), "%"), /*#__PURE__*/React.createElement("td", {
      style: {
        ...cell,
        fontWeight: 800,
        ...eStyle
      }
    }, edge >= 0 ? "+" : "", edge.toFixed(1)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...cell,
        color: "var(--text-2)",
        fontSize: 10
      }
    }, fmtVol(c.volume)), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: pad,
        borderBottom: "1px solid var(--border-dim)"
      }
    }, MT_spark(hist, 52, 15, edge > 0 ? "var(--pos)" : "var(--neg)")));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      color: "var(--text-2)",
      padding: "6px 10px"
    }
  }, /*#__PURE__*/React.createElement("span", null, "Click a market \u2192 order book + allocation."), /*#__PURE__*/React.createElement("span", null, "\u03A3 vol ", fmtVol(tvol))));
}

/* ---- Order Book & Liquidity (per selected contract, live) ---- */
function MT_OrderBook({
  contractId,
  frame,
  dense
}) {
  const c = MT.contracts.find(x => x.id === contractId) || MT.contracts[0];
  const ob = MTX.orderBookFor(c, frame);
  const maxDepth = Math.max(...ob.asks.map(a => a[1]), ...ob.bids.map(b => b[1]));
  const row = (p, d, tone, capped) => /*#__PURE__*/React.createElement("div", {
    key: tone + p,
    style: {
      position: "relative",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: dense ? "3px 10px" : "5px 11px",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      borderBottom: "1px solid var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: d / maxDepth * 58 + "%",
      background: `color-mix(in srgb, ${tone} 14%, transparent)`
    }
  }), capped && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: 2,
      background: "var(--neg)",
      boxShadow: "0 0 6px 1px var(--neg)",
      zIndex: 2
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: tone,
      fontWeight: 700,
      zIndex: 1
    }
  }, Math.round(p * 100), "\xA2"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: capped ? "var(--warn)" : "var(--text-1)",
      zIndex: 1
    }
  }, "$", d.toLocaleString()));
  let cum = 0;
  return /*#__PURE__*/React.createElement(P, {
    pad: false,
    title: "Order Book & Liquidity",
    right: /*#__PURE__*/React.createElement(BG, {
      tone: "warn"
    }, "CAP $", Math.round(ob.liquidityCap / 1000), "k"),
    footer: /*#__PURE__*/React.createElement(PF, {
      source: "Kalshi depth (seeded)",
      latency: "5m",
      version: "ob-77",
      tier: "C"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "6px 11px",
      fontFamily: "var(--font-mono)",
      fontSize: 9.5,
      color: "var(--text-2)",
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-1)",
      fontWeight: 700
    }
  }, c.short), /*#__PURE__*/React.createElement("span", null, c.id, " \xB7 slippage ", ob.slippageBudget)), ob.asks.slice().reverse().map(a => row(a[0], a[1], "var(--neg)")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "4px 11px",
      background: "var(--surface-sunken)",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--text-2)",
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", null, "spread ", Math.round((ob.bestAsk - ob.bestBid) * 100), "\xA2"), /*#__PURE__*/React.createElement("span", null, "mid ", Math.round(ob.mid * 100), "\xA2")), ob.bids.map(b => {
    cum += b[1];
    return row(b[0], b[1], "var(--pos)", cum > ob.liquidityCap);
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 11px",
      fontSize: 10.5,
      color: "var(--text-2)",
      lineHeight: 1.5,
      borderTop: "1px solid var(--border-dim)"
    }
  }, "Cumulative depth beyond ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--warn)"
    }
  }, "$", ob.liquidityCap.toLocaleString()), " exceeds the ", ob.slippageBudget, " slippage budget \u2014 the red threshold marks where liquidity caps the Kelly allocation."));
}

/* ---- Event Ledger (VCR bookmarks) ---- */
function MT_Ledger({
  frame,
  onSeek,
  dense
}) {
  return /*#__PURE__*/React.createElement(P, {
    pad: false,
    title: "Research Ledger \u2014 Event Timeline",
    footer: /*#__PURE__*/React.createElement(PF, {
      source: "event_store (immutable)",
      latency: "live",
      version: "1.2.4",
      tier: "A"
    })
  }, /*#__PURE__*/React.createElement("div", null, MT.events.slice().reverse().map(ev => {
    const on = Math.abs(ev.frame - frame) <= 0;
    const near = ev.frame <= frame;
    return /*#__PURE__*/React.createElement("div", {
      key: ev.frame,
      onClick: () => onSeek(ev.frame),
      style: {
        display: "flex",
        gap: 9,
        alignItems: "flex-start",
        padding: dense ? "6px 11px" : "8px 12px",
        borderBottom: "1px solid var(--border-dim)",
        cursor: "pointer",
        background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent",
        opacity: near ? 1 : 0.45
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-2)",
        minWidth: 46,
        paddingTop: 1
      }
    }, MTX.frameTime(ev.frame)), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 7,
        height: 7,
        borderRadius: "50%",
        marginTop: 4,
        flex: "none",
        background: ev.hot ? "var(--warn)" : near ? "var(--pos)" : "var(--border-strong)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--text-1)",
        lineHeight: 1.3
      }
    }, ev.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        color: "var(--text-2)",
        marginTop: 1
      }
    }, ev.source, " \xB7 tier ", ev.tier)));
  })));
}

/* ---- Observability / Pipeline ---- */
function MT_Observability() {
  const CHIP = {
    PASS: "var(--pos)",
    EMPTY: "var(--text-2)",
    BLOCKED: "var(--special)",
    FAIL: "var(--neg)"
  };
  return /*#__PURE__*/React.createElement(P, {
    pad: false,
    title: "Observability \u2014 Pipeline Status",
    footer: /*#__PURE__*/React.createElement(PF, {
      source: "verify_stack.py",
      latency: "live",
      version: "1.2.4",
      tier: "A"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 1,
      padding: 12,
      background: "var(--border-dim)"
    }
  }, MT.pipeline.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.stage,
    style: {
      flex: "1 1 30%",
      minWidth: 120,
      background: "var(--surface-card)",
      padding: "8px 10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      color: "var(--text-2)",
      letterSpacing: ".5px"
    }
  }, i + 1, ". ", s.stage.toUpperCase()), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: CHIP[s.status]
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      fontWeight: 700,
      color: CHIP[s.status]
    }
  }, s.status)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      color: "var(--text-2)",
      marginTop: 3
    }
  }, s.detail)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      padding: 12
    }
  }, MT.health.map(h => /*#__PURE__*/React.createElement(HR, _extends({
    key: h.name
  }, h)))));
}
Object.assign(window, {
  MT_Evidence,
  MT_Confidence,
  MT_Probability,
  MT_EdgeMatrix,
  MT_Markets,
  MT_OrderBook,
  MT_Ledger,
  MT_Observability
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "prototypes/millibar-terminal/panels.jsx", error: String((e && e.message) || e) }); }

// prototypes/millibar-terminal/tweaks-panel.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)
// Copied omelette starter. Re-running copy_starter_component with this kind overwrites this file with the latest version (page content is unaffected).

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits
    }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({
      type: '__edit_mode_dismissed'
    }, '*');
  };
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // data-om-starter: inert presence marker — Claude Design's starter-usage
  // probe reads it. The closed panel renders nothing, so the marker rides
  // the <html> element as an attribute instead of a rendered node — zero
  // elements added, so page CSS (even structural selectors like
  // :nth-child) can never observe it. It records that the page WIRES a
  // tweaks panel, whether or not the panel is open. Keep this effect.
  React.useEffect(() => {
    document.documentElement.setAttribute('data-om-starter', 'tweaks-panel');
    return () => document.documentElement.removeAttribute('data-om-starter');
  }, []);
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    "data-omelette-chrome": "",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    "aria-label": "Close tweaks",
    onMouseDown: e => e.stopPropagation(),
    onClick: dismiss
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRow({
  label,
  value,
  children,
  inline = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: inline ? 'twk-row twk-row-h' : 'twk-row'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label), value != null && /*#__PURE__*/React.createElement("span", {
    className: "twk-val"
  }, value)), children);
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label,
    value: `${value}${unit}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "twk-slider",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  }));
}
function TweakToggle({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row twk-row-h"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "twk-toggle",
    "data-on": value ? '1' : '0',
    role: "switch",
    "aria-checked": !!value,
    onClick: () => onChange(!value)
  }, /*#__PURE__*/React.createElement("i", null)));
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = o => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({
    2: 16,
    3: 10
  }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = s => {
      const m = options.find(o => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return /*#__PURE__*/React.createElement(TweakSelect, {
      label: label,
      value: value,
      options: options,
      onChange: s => onChange(resolve(s))
    });
  }
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const segAt = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor((clientX - r.left - 2) / inner * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = e => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = ev => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    role: "radiogroup",
    onPointerDown: onPointerDown,
    className: dragging ? 'twk-seg dragging' : 'twk-seg'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "radio",
    "aria-checked": o.value === value
  }, o.label))));
}
function TweakSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("select", {
    className: "twk-field",
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })));
}
function TweakText({
  label,
  value,
  placeholder,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("input", {
    className: "twk-field",
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: e => onChange(e.target.value)
  }));
}
function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange
}) {
  const clamp = n => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({
    x: 0,
    val: 0
  });
  const onScrubStart = e => {
    e.preventDefault();
    startRef.current = {
      x: e.clientX,
      val: value
    };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = ev => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "twk-num-lbl",
    onPointerDown: onScrubStart
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    min: min,
    max: max,
    step: step,
    onChange: e => onChange(clamp(Number(e.target.value)))
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "twk-num-unit"
  }, unit));
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, c => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = n >> 16 & 255,
    g = n >> 8 & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({
  light
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 7.2 5.8 10 11 4.2",
  fill: "none",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  stroke: light ? 'rgba(0,0,0,.78)' : '#fff'
}));

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      className: "twk-swatch",
      value: value,
      onChange: e => onChange(e.target.value)
    }));
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-chips",
    role: "radiogroup"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const sup = rest.slice(0, 4);
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "twk-chip",
      role: "radio",
      "aria-checked": on,
      "data-on": on ? '1' : '0',
      "aria-label": colors.join(', '),
      title: colors.join(' · '),
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, sup.length > 0 && /*#__PURE__*/React.createElement("span", null, sup.map((c, j) => /*#__PURE__*/React.createElement("i", {
      key: j,
      style: {
        background: c
      }
    }))), on && /*#__PURE__*/React.createElement(__TwkCheck, {
      light: __twkIsLight(hero)
    }));
  })));
}
function TweakButton({
  label,
  onClick,
  secondary = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: secondary ? 'twk-btn secondary' : 'twk-btn',
    onClick: onClick
  }, label);
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "prototypes/millibar-terminal/tweaks-panel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/millibar-terminal/CommandCenter.jsx
try { (() => {
const {
  Pill,
  StatTile,
  ReplayDeck,
  Badge
} = window.CategoryAlphaDesignSystem_a835cf;
const PAI = {
  ACCUMULATION: {
    c: "var(--pai-accumulation)",
    t: "Accumulation",
    d: "Pressure trend building — early organization."
  },
  VELOCITY: {
    c: "var(--pai-velocity)",
    t: "Velocity",
    d: "Pressure falling fast — intensification underway."
  },
  EXHAUSTION: {
    c: "var(--pai-exhaustion)",
    t: "Exhaustion",
    d: "Deepening decelerating — near peak / weakening."
  },
  WATCH: {
    c: "var(--pai-watch)",
    t: "Watch",
    d: "Insufficient pressure trend — monitoring."
  }
};
const PRODUCTS = ["GeoColor", "Clean IR", "Water Vapor", "Visible"];
const OVERLAYS = [{
  label: "Eye",
  live: true
}, {
  label: "Forecast Track",
  live: true
}, {
  label: "Uncertainty Cone",
  live: true
}, {
  label: "Wind Radii",
  live: false
}, {
  label: "Recon",
  live: false
}, {
  label: "Lightning (GLM)",
  live: false
}];
function Anno({
  kind,
  icon,
  title,
  desc
}) {
  const tone = {
    pos: "var(--pos)",
    warn: "var(--warn)",
    info: "var(--accent-bright)",
    neu: "var(--text-2)"
  }[kind];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "10px",
      alignItems: "flex-start",
      padding: "7px 0",
      borderBottom: "1px solid var(--border-dim)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "22px",
      height: "22px",
      flex: "none",
      borderRadius: "6px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "12px",
      marginTop: "1px",
      color: tone,
      background: `color-mix(in srgb, ${tone} 14%, transparent)`
    }
  }, icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "12.5px",
      fontWeight: 700,
      color: "var(--text-1)",
      lineHeight: 1.25
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      color: "var(--text-2)",
      marginTop: "2px",
      lineHeight: 1.4
    }
  }, desc)));
}
function CommandStage({
  storm
}) {
  const pc = (PAI[storm.phase] || PAI.WATCH).c;
  const [prod, setProd] = React.useState(0);
  const [ovl, setOvl] = React.useState({
    0: true,
    1: true,
    2: true
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      background: "var(--slate-950)",
      minHeight: "540px",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "radial-gradient(120% 90% at 46% 52%, #0a1424 0%, #060b16 55%, #04060c 100%)"
    }
  }), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 800 540",
    preserveAspectRatio: "xMidYMid slice",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%"
    }
  }, ovl[2] && /*#__PURE__*/React.createElement("polygon", {
    points: "360,300 560,150 720,60 760,120 640,230 400,320",
    fill: pc,
    opacity: "0.09"
  }), ovl[2] && /*#__PURE__*/React.createElement("polygon", {
    points: "360,300 560,150 720,60 760,120 640,230 400,320",
    fill: "none",
    stroke: pc,
    strokeWidth: "1.1",
    opacity: "0.8",
    strokeDasharray: "2,6"
  }), ovl[1] && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
    points: "360,300 470,220 600,150 720,90",
    fill: "none",
    stroke: "var(--cyan-400)",
    strokeWidth: "5",
    opacity: "0.16"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "360,300 470,220 600,150 720,90",
    fill: "none",
    stroke: "#e2e8f0",
    strokeWidth: "1.8",
    opacity: "0.92"
  }), [[470, 220], [600, 150], [720, 90]].map((p, i) => /*#__PURE__*/React.createElement("circle", {
    key: i,
    cx: p[0],
    cy: p[1],
    r: "2.6",
    fill: "#0b1830",
    stroke: "#e2e8f0",
    strokeWidth: "1.4"
  })))), ovl[0] && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "45%",
      top: "55.5%",
      transform: "translate(-50%,-50%)",
      width: "34px",
      height: "34px",
      color: pc
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      border: "1.5px solid currentColor",
      opacity: 0.85,
      animation: "ca-reticle 2.4s ease-out infinite"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: "9px",
      borderRadius: "50%",
      border: "1.5px solid currentColor",
      opacity: 0.5
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "50%",
      top: 0,
      width: "1px",
      height: "100%",
      background: "currentColor",
      opacity: 0.7,
      transform: "translateX(-.5px)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "50%",
      left: 0,
      height: "1px",
      width: "100%",
      background: "currentColor",
      opacity: 0.7,
      transform: "translateY(-.5px)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "5px",
      height: "5px",
      borderRadius: "50%",
      background: "currentColor",
      transform: "translate(-50%,-50%)",
      boxShadow: "0 0 7px 1px currentColor"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      boxShadow: "inset 0 0 120px 20px rgba(2,5,12,.75),inset 0 0 40px rgba(2,5,12,.6)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "52px",
      left: "14px",
      display: "flex",
      gap: "5px",
      flexWrap: "wrap",
      maxWidth: "70%"
    }
  }, PRODUCTS.map((p, i) => /*#__PURE__*/React.createElement(Pill, {
    key: p,
    size: "sm",
    mono: false,
    active: prod === i,
    onClick: () => setProd(i),
    style: {
      fontSize: "10px"
    }
  }, p))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "14px",
      bottom: "74px",
      display: "flex",
      gap: "5px",
      flexWrap: "wrap",
      maxWidth: "62%"
    }
  }, OVERLAYS.map((o, i) => /*#__PURE__*/React.createElement("span", {
    key: o.label,
    onClick: () => o.live && setOvl(s => ({
      ...s,
      [i]: !s[i]
    })),
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "9.5px",
      fontWeight: 700,
      letterSpacing: ".4px",
      padding: "4px 9px",
      borderRadius: "6px",
      cursor: o.live ? "pointer" : "not-allowed",
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      textDecoration: o.live ? "none" : "line-through",
      opacity: o.live ? 1 : 0.42,
      border: "1px solid " + (o.live && ovl[i] ? "var(--cyan-400)" : "var(--graphite-700)"),
      background: o.live && ovl[i] ? "color-mix(in srgb,var(--cyan-400) 15%,transparent)" : "rgba(7,12,22,.72)",
      color: o.live && ovl[i] ? "#eaf2ff" : "#8ea3bd"
    }
  }, o.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: "10px 12px",
      background: "linear-gradient(0deg,rgba(4,6,12,.94),rgba(4,6,12,.5) 60%,transparent)"
    }
  }, /*#__PURE__*/React.createElement(ReplayDeck, {
    frames: 36,
    stepMin: 10,
    subLabel: (storm.basin === "west" ? "GOES-18" : "GOES-19") + " · " + PRODUCTS[prod],
    bookmarks: [{
      i: 8,
      label: "RI onset"
    }, {
      i: 24,
      label: "Landfall watch",
      color: "var(--neg)"
    }],
    style: {
      background: "transparent",
      border: "none",
      padding: "2px 4px"
    }
  })));
}
function MB_CommandCenter({
  storms,
  activeIdx,
  onSelect,
  sst,
  risk
}) {
  const storm = storms[activeIdx];
  const P0 = PAI[storm.phase] || PAI.WATCH;
  const annos = [];
  annos.push(/*#__PURE__*/React.createElement(Anno, {
    key: "l",
    kind: "info",
    icon: "\u25C9",
    title: "Lifecycle — " + P0.t,
    desc: P0.d
  }));
  if (storm.basin === "east" && sst != null) {
    const hot = risk[0] === "HIGH" || risk[0] === "EXTREME";
    annos.push(/*#__PURE__*/React.createElement(Anno, {
      key: "s",
      kind: hot ? "warn" : "neu",
      icon: hot ? "▲" : "≈",
      title: "Gulf ocean heat " + risk[0],
      desc: "Gulf SST anomaly +" + sst + "°C — " + (hot ? "RI-supportive fuel." : "near climatology.")
    }));
  }
  if (storm.recon) annos.push(/*#__PURE__*/React.createElement(Anno, {
    key: "r",
    kind: "pos",
    icon: "\u2713",
    title: "Recon confirms circulation",
    desc: "Aircraft min pressure " + storm.recon.pressure + " mb, sfc " + storm.recon.sfc + " kt."
  }));
  annos.push(/*#__PURE__*/React.createElement(Anno, {
    key: "t",
    kind: "neu",
    icon: "\u27A4",
    title: "Tracking",
    desc: storm.wind + " kt " + storm.full_cls + ", moving " + storm.movement + "."
  }));
  return /*#__PURE__*/React.createElement("section", {
    "data-surface": "tactical",
    style: {
      margin: "18px 0 26px",
      borderRadius: "16px",
      overflow: "hidden",
      background: "var(--slate-925)",
      border: "1px solid var(--graphite-600)",
      boxShadow: "var(--shadow-cmd)",
      color: "#e6edf6"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) 320px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 5,
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "12px 14px",
      flexWrap: "wrap",
      background: "linear-gradient(180deg,rgba(4,6,12,.92),rgba(4,6,12,.5) 65%,transparent)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      fontWeight: 700,
      letterSpacing: "2.5px",
      color: "var(--blue-300)",
      textTransform: "uppercase"
    }
  }, "Live Storm Command Center"), /*#__PURE__*/React.createElement(Badge, {
    tone: "live",
    dot: true
  }, "LIVE"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "6px",
      flexWrap: "wrap",
      marginLeft: "auto"
    }
  }, storms.map((s, i) => /*#__PURE__*/React.createElement(Pill, {
    key: s.id,
    mono: false,
    size: "sm",
    active: i === activeIdx,
    dotColor: s.color,
    onClick: () => onSelect(i)
  }, s.name, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.6,
      fontWeight: 600,
      fontSize: "10px"
    }
  }, s.cls))))), /*#__PURE__*/React.createElement(CommandStage, {
    storm: storm
  })), /*#__PURE__*/React.createElement("aside", {
    style: {
      background: "linear-gradient(180deg,#070b14,#060911)",
      borderLeft: "1px solid var(--graphite-800)",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "11px 16px 8px",
      borderBottom: "1px solid var(--graphite-800)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "26px",
      fontWeight: 800,
      lineHeight: 1.05,
      color: "#fff",
      letterSpacing: "-.5px",
      display: "flex",
      alignItems: "center",
      gap: "10px"
    }
  }, storm.name, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      fontWeight: 800,
      letterSpacing: "1px",
      padding: "3px 9px",
      borderRadius: "6px",
      color: storm.color,
      background: `color-mix(in srgb, ${storm.color} 15%, transparent)`
    }
  }, storm.full_cls)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
      color: "#6f86a6",
      marginTop: "6px",
      letterSpacing: ".3px"
    }
  }, storm.lat.toFixed(1), "\xB0N  ", Math.abs(storm.lon).toFixed(1), "\xB0", storm.lon < 0 ? "W" : "E", "  \xB7  ", storm.basin === "west" ? "GOES-18 West" : "GOES-19 East")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "1px",
      background: "var(--graphite-800)",
      borderBottom: "1px solid var(--graphite-800)"
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    variant: "metric",
    label: "WIND",
    value: storm.wind,
    unit: "kt",
    sub: "NHC advisory"
  }), /*#__PURE__*/React.createElement(StatTile, {
    variant: "metric",
    label: "PRESSURE",
    value: storm.recon ? storm.recon.pressure : "—",
    unit: storm.recon ? "mb" : "",
    sub: storm.recon ? "recon (aircraft)" : "no recon"
  }), /*#__PURE__*/React.createElement(StatTile, {
    variant: "metric",
    label: "MOTION",
    value: storm.movement,
    sub: "NHC"
  }), /*#__PURE__*/React.createElement(StatTile, {
    variant: "metric",
    label: "LIFECYCLE",
    value: P0.t,
    sub: "PAI phase"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "9.5px",
      fontWeight: 800,
      letterSpacing: "1.4px",
      color: "var(--blue-300)",
      textTransform: "uppercase",
      marginBottom: "10px"
    }
  }, "Category Alpha Read"), annos), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "0 16px 16px",
      padding: "11px 13px",
      borderRadius: "10px",
      border: "1px solid var(--graphite-700)",
      background: "linear-gradient(180deg,rgba(18,34,58,.5),rgba(8,14,26,.5))",
      fontSize: "11px",
      color: "#8ea3bd",
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "#bcd3ee"
    }
  }, "Interpretation, not observation."), " Annotations are Category Alpha's read of real signals \u2014 never fabricated meteorology. Absent a live feed, an overlay stays ", /*#__PURE__*/React.createElement("i", null, "disabled"), " rather than invented."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "9px",
      color: "#4b6183",
      padding: "0 16px 14px",
      letterSpacing: ".3px"
    }
  }, "Imagery NASA GIBS / NOAA GOES ABI \xB7 tracks & cone NHC \xB7 SEEDED demo"))));
}
window.MB_CommandCenter = MB_CommandCenter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/millibar-terminal/CommandCenter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/millibar-terminal/Header.jsx
try { (() => {
const {
  Pill,
  IngestionHUD
} = window.CategoryAlphaDesignSystem_a835cf;
function MB_Header({
  feeds
}) {
  const nav = ["Overview", "Signals", "Hurricanes", "Docs [?]"];
  const [active, setActive] = React.useState("Hurricanes");
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 20,
      background: "#fff",
      borderBottom: "1px solid var(--border-dim)",
      padding: "10px 26px",
      display: "flex",
      alignItems: "center",
      gap: "14px"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.svg",
    alt: "Millibar Terminal",
    style: {
      height: "44px",
      width: "auto",
      display: "block"
    }
  }), /*#__PURE__*/React.createElement(Pill, null, "Category Alpha"), /*#__PURE__*/React.createElement(IngestionHUD, {
    streams: feeds
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      marginLeft: "auto",
      display: "flex",
      gap: "6px"
    }
  }, nav.map(n => /*#__PURE__*/React.createElement("a", {
    key: n,
    href: "#",
    onClick: e => {
      e.preventDefault();
      setActive(n);
    },
    style: {
      color: active === n ? "var(--accent)" : "var(--text-2)",
      background: active === n ? "var(--surface-sunken)" : "transparent",
      textDecoration: "none",
      fontSize: "13px",
      padding: "6px 12px",
      borderRadius: "8px",
      fontFamily: "var(--font-sans)",
      transition: "all var(--ease-ui)"
    }
  }, n))));
}
window.MB_Header = MB_Header;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/millibar-terminal/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/millibar-terminal/data.js
try { (() => {
/* Millibar Terminal — SEEDED demo data for the UI kit recreation.
   Values are illustrative (labeled SEEDED throughout), never live. Honest-data ethos:
   nothing here is presented as a real forecast or market price. */
window.MILLIBAR_DATA = {
  updated: "18:42:07Z",
  gulf_anom_c: 2.4,
  risk: ["HIGH", "var(--warn)"],
  storms: [{
    id: "AL04",
    name: "Bertha",
    cls: "C3",
    full_cls: "Cat 3 Hurricane",
    wind: 108,
    pressure: 954,
    movement: "WNW 12 kt",
    lat: 24.1,
    lon: -78.6,
    basin: "east",
    phase: "VELOCITY",
    color: "var(--pai-velocity)",
    recon: {
      pressure: 954,
      sfc: 105
    }
  }, {
    id: "EP07",
    name: "Elida",
    cls: "C1",
    full_cls: "Cat 1 Hurricane",
    wind: 75,
    pressure: 985,
    movement: "W 9 kt",
    lat: 16.8,
    lon: -112.4,
    basin: "west",
    phase: "ACCUMULATION",
    color: "var(--pai-accumulation)",
    recon: null
  }, {
    id: "EP08",
    name: "Fausto",
    cls: "TS",
    full_cls: "Tropical Storm",
    wind: 50,
    pressure: 998,
    movement: "WNW 14 kt",
    lat: 14.2,
    lon: -120.1,
    basin: "west",
    phase: "WATCH",
    color: "var(--pai-watch)",
    recon: null
  }],
  feeds: [{
    name: "ATCF",
    status: "ok",
    age: "2m"
  }, {
    name: "RECON",
    status: "stale",
    age: "41m",
    penalty: "−1 tier"
  }, {
    name: "SST",
    status: "missing"
  }],
  matrix: [{
    contract: "KXHURCAT4-25 · Bertha Cat4+",
    edge: 16.2,
    market: 44,
    liquidity: 38000,
    theoretical: 0.18,
    capped: 0.11,
    rawPct: 18
  }, {
    contract: "KXHURCAT3-25 · Bertha Cat3+",
    edge: 7.4,
    market: 58,
    liquidity: 61000,
    theoretical: 0.09,
    capped: 0.09,
    rawPct: 9
  }, {
    contract: "KXHURCAT1-25 · Elida Cat1+",
    edge: 3.1,
    market: 63,
    liquidity: 22000,
    theoretical: 0.04,
    capped: 0.04,
    rawPct: 4
  }, {
    contract: "KXATLSEAS-25 · seasonal (proxy)",
    edge: -2.1,
    market: 71,
    liquidity: 12000
  }],
  signals: [{
    label: "Bertha → KXHURCAT4",
    signal: "BUY",
    edge: 16.2,
    modelProb: 60,
    marketProb: 44,
    conf: "HIGH"
  }, {
    label: "Elida → KXHURCAT1",
    signal: "BUY",
    edge: 3.1,
    modelProb: 66,
    marketProb: 63,
    conf: "MED"
  }, {
    label: "Fausto (seasonal proxy)",
    signal: "HOLD",
    edge: -1.2,
    modelProb: 30,
    marketProb: 31,
    conf: "LOW",
    unmapped: true
  }],
  health: [{
    name: "Event store",
    detail: "argus.db · 4,182 events",
    status: "PASS"
  }, {
    name: "Live NHC feed",
    detail: "CurrentStorms.json · 200 OK",
    status: "PASS"
  }, {
    name: "Kalshi snapshot",
    detail: "seeded · auth-gated keylessly",
    status: "EMPTY"
  }, {
    name: "Probability engine",
    detail: "deferred until features promote",
    status: "BLOCKED"
  }, {
    name: "Recon ingester",
    detail: "no valid-time parser yet",
    status: "EMPTY"
  }, {
    name: "Replay fold",
    detail: "zero look-ahead · verified",
    status: "PASS"
  }],
  modes: {
    observation: {
      status: "LIVE",
      tone: "live",
      text: "Live NHC systems, official forecast tracks, and uncertainty cones."
    },
    forecast: {
      status: "LIVE",
      tone: "live",
      text: "Category Alpha Cat1+ probability anchored on NHC intensity guidance."
    },
    market: {
      status: "SEEDED",
      tone: "seeded",
      text: "Seeded Kalshi / Polymarket prices — hurricane markets are auth-gated keylessly."
    },
    physics: {
      status: "OFFLINE",
      tone: "special",
      text: "HAFS / ECMWF ensemble surface — MODEL OFFLINE (no keyless ensemble feed)."
    },
    alpha: {
      status: "LIVE",
      tone: "live",
      text: "Category Alpha edge surface: model probability minus market price, per contract."
    }
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/millibar-terminal/data.js", error: String((e && e.message) || e) }); }

// ui_kits/millibar-terminal/main.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CA = window.CategoryAlphaDesignSystem_a835cf;
const {
  Panel,
  SectionHeader,
  ProvenanceFooter,
  StatTile,
  Gauge,
  Button,
  Badge,
  EdgeCell,
  SignalCard,
  HealthRow
} = CA;
const D = window.MILLIBAR_DATA;
function MapModePanel() {
  const modes = ["observation", "forecast", "market", "physics", "alpha"];
  const labels = {
    observation: "Observation",
    forecast: "Forecast",
    market: "Market",
    physics: "Physics",
    alpha: "Category Alpha"
  };
  const [mode, setMode] = React.useState("observation");
  const m = D.modes[mode];
  return /*#__PURE__*/React.createElement(Panel, {
    pad: false,
    title: "Strike Zone \u2014 Live NHC Systems & Projected Tracks",
    footer: /*#__PURE__*/React.createElement(ProvenanceFooter, {
      source: "NHC (MIATCDATx)",
      latency: "3m",
      version: "1.2.4",
      tier: "A"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 16px",
      borderBottom: "1px solid var(--border-dim)",
      background: "var(--surface-sunken)",
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      fontWeight: 700,
      letterSpacing: ".6px",
      textTransform: "uppercase",
      color: "var(--text-2)"
    }
  }, "Map Mode"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "0"
    }
  }, modes.map((k, i) => /*#__PURE__*/React.createElement(Button, {
    key: k,
    variant: "segment",
    active: mode === k,
    onClick: () => setMode(k),
    style: {
      borderRadius: i === 0 ? "6px 0 0 6px" : i === modes.length - 1 ? "0 6px 6px 0" : 0,
      marginLeft: i ? "-1px" : 0
    }
  }, labels[k])))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "9px",
      padding: "10px 16px"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: m.tone
  }, m.status), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "11.5px",
      color: "var(--text-2)",
      lineHeight: 1.4
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-1)"
    }
  }, labels[mode]), " \u2014 ", m.text)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "220px",
      margin: "0 16px 16px",
      borderRadius: "8px",
      border: "1px solid var(--border-dim)",
      background: "repeating-linear-gradient(0deg,#eef2f7,#eef2f7 1px,#f4f5f8 1px,#f4f5f8 28px),repeating-linear-gradient(90deg,#eef2f7,#eef2f7 1px,#f4f5f8 1px,#f4f5f8 28px)",
      position: "relative",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 600 220",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%"
    }
  }, D.storms.map((s, i) => {
    const x = 120 + i * 150,
      y = 150 - i * 30;
    return /*#__PURE__*/React.createElement("g", {
      key: s.id
    }, /*#__PURE__*/React.createElement("polyline", {
      points: `${x},${y} ${x + 40},${y - 40} ${x + 80},${y - 75}`,
      fill: "none",
      stroke: "var(--cyan-500)",
      strokeWidth: "2",
      opacity: "0.8"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: x,
      cy: y,
      r: "7",
      fill: "none",
      stroke: s.color,
      strokeWidth: "2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: x,
      cy: y,
      r: "2.5",
      fill: s.color
    }), /*#__PURE__*/React.createElement("text", {
      x: x,
      y: y + 22,
      fill: "var(--text-2)",
      fontSize: "10",
      fontFamily: "var(--font-mono)",
      textAnchor: "middle"
    }, s.name));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: "10px",
      top: "10px",
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      color: "var(--text-2)"
    }
  }, "schematic \xB7 SEEDED")));
}
function EdgeMatrix() {
  const [bankroll, setBankroll] = React.useState(10000);
  const [stake, setStake] = React.useState(0.25);
  const rows = D.matrix.map(r => {
    if (r.theoretical == null || r.edge <= 0) return {
      ...r,
      noBet: true
    };
    const applied = r.theoretical * stake;
    const ideal = bankroll * applied;
    const alloc = r.liquidity ? Math.min(ideal, r.liquidity) : ideal;
    return {
      ...r,
      theoretical: applied,
      capped: alloc / bankroll,
      allocation: Math.round(alloc),
      stakePct: Math.round(applied * 100),
      rawPct: r.rawPct
    };
  });
  const total = rows.reduce((a, r) => a + (r.allocation || 0), 0);
  return /*#__PURE__*/React.createElement(Panel, {
    pad: false,
    title: "Edge Matrix \u2014 Alpha Surface",
    right: /*#__PURE__*/React.createElement(Badge, {
      tone: "live",
      dot: true
    }, "LIVE"),
    footer: /*#__PURE__*/React.createElement(ProvenanceFooter, {
      source: "Category Alpha \xD7 Kalshi (seeded)",
      latency: "5m",
      version: "1.2.4",
      tier: "B"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      flexWrap: "wrap",
      padding: "10px 12px",
      borderBottom: "1px solid var(--border-dim)",
      background: "var(--surface-sunken)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      fontWeight: 700,
      letterSpacing: ".5px",
      textTransform: "uppercase",
      color: "var(--text-2)"
    }
  }, "Bankroll"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: bankroll,
    min: 100,
    step: 500,
    onChange: e => setBankroll(+e.target.value || 0),
    style: {
      width: "110px",
      fontFamily: "var(--font-mono)",
      fontSize: "13px",
      padding: "5px 8px",
      border: "1px solid var(--border-dim)",
      borderRadius: "6px",
      background: "var(--surface-card)",
      color: "var(--text-1)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      fontWeight: 700,
      letterSpacing: ".5px",
      textTransform: "uppercase",
      color: "var(--text-2)"
    }
  }, "Stake"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 0
    }
  }, [[1, "FULL"], [0.5, "½"], [0.25, "¼"]].map(([f, l], i) => /*#__PURE__*/React.createElement(Button, {
    key: l,
    variant: "preset",
    mono: true,
    active: stake === f,
    onClick: () => setStake(f),
    style: {
      borderRadius: i === 0 ? "6px 0 0 6px" : i === 2 ? "0 6px 6px 0" : 0,
      marginLeft: i ? "-1px" : 0
    }
  }, l))), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontSize: "11px",
      color: "var(--text-2)"
    }
  }, "Total deploy ", /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: "var(--font-mono)",
      color: "var(--text-1)",
      fontSize: "13px"
    }
  }, "$", total.toLocaleString()))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
      gap: "11px",
      padding: "12px"
    }
  }, rows.map(r => /*#__PURE__*/React.createElement(EdgeCell, {
    key: r.contract,
    contract: r.contract,
    edge: r.edge,
    marketPct: r.market,
    liquidity: r.liquidity,
    theoretical: r.noBet ? undefined : r.theoretical,
    capped: r.capped,
    allocation: r.allocation,
    stakePct: r.stakePct,
    rawPct: r.rawPct
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "0 12px 12px",
      padding: "11px 13px",
      border: "1px solid var(--border-dim)",
      borderLeft: "3px solid var(--warn)",
      borderRadius: "10px",
      fontSize: "12px",
      color: "var(--text-2)",
      lineHeight: 1.55
    }
  }, "Alpha rows show ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-1)"
    }
  }, "Category Alpha"), " (NHC-anchored) edge only. HAFS / ECMWF / DeepMark columns are ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-1)"
    }
  }, "MODEL OFFLINE"), " \u2014 the multi-model surface needs HAFS ensemble outputs (unavailable keylessly). Seams are in place; add model feeds to populate."));
}
function MillibarKitApp() {
  const [active, setActive] = React.useState(0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-app)",
      minHeight: "100vh",
      fontFamily: "var(--font-sans)",
      color: "var(--text-1)"
    }
  }, /*#__PURE__*/React.createElement(window.MB_Header, {
    feeds: D.feeds
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: "1600px",
      margin: "0 auto",
      padding: "24px 22px 60px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border-dim)",
      borderRadius: "8px",
      padding: "20px 24px",
      marginBottom: "18px",
      background: "var(--surface-card)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "0 0 4px",
      fontSize: "22px",
      fontWeight: 700
    }
  }, "Hurricane & Prediction-Market Divergence Terminal"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-2)",
      fontSize: "13px",
      marginBottom: "14px"
    }
  }, "Physical-model anchor (live NHC) vs retail prediction-market price \u2014 edge \u2192 sizing."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: "150px"
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Gulf SST Anomaly",
    value: "+" + D.gulf_anom_c,
    unit: "\xB0C",
    color: "var(--warn)",
    sub: "warm Gulf \u2192 RI fuel"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "9px"
    }
  }, /*#__PURE__*/React.createElement(Gauge, {
    value: D.gulf_anom_c * 33,
    color: "var(--warn)"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: "150px"
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Rapid Intensification Threat",
    value: /*#__PURE__*/React.createElement(Badge, {
      tone: "warn"
    }, D.risk[0]),
    sub: "warm Gulf \u2192 RI fuel"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: "150px"
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Active NHC Systems",
    value: D.storms.length,
    sub: "live \xB7 keyless"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: "150px"
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Long Mispricing Signals",
    value: D.signals.filter(s => s.signal === "BUY").length,
    color: "var(--pos)",
    sub: "edge > +3%"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "11.5px",
      color: "var(--text-2)",
      marginTop: "12px"
    }
  }, "Live \xB7 last refreshed ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      color: "var(--accent)"
    }
  }, D.updated), " \xB7 auto-refresh 5m \xB7 ", /*#__PURE__*/React.createElement("b", null, "SEEDED demo"))), /*#__PURE__*/React.createElement(window.MB_CommandCenter, {
    storms: D.storms,
    activeIdx: active,
    onSelect: setActive,
    sst: D.gulf_anom_c,
    risk: D.risk
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)",
      gap: "24px",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "24px"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeader, null, "Strike Zone"), /*#__PURE__*/React.createElement(MapModePanel, null)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeader, {
    tone: "special"
  }, "Divergence Signals"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
      gap: "13px"
    }
  }, D.signals.map(s => /*#__PURE__*/React.createElement(SignalCard, _extends({
    key: s.label
  }, s, {
    Badge: Badge
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "18px"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeader, null, "Edge Matrix"), /*#__PURE__*/React.createElement(EdgeMatrix, null)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeader, null, "System Health"), /*#__PURE__*/React.createElement(Panel, {
    pad: false,
    footer: /*#__PURE__*/React.createElement(ProvenanceFooter, {
      source: "verify_stack.py",
      latency: "live",
      version: "1.2.4",
      tier: "A"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px",
      padding: "12px"
    }
  }, D.health.map(h => /*#__PURE__*/React.createElement(HealthRow, _extends({
    key: h.name
  }, h))))))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(MillibarKitApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/millibar-terminal/main.jsx", error: String((e && e.message) || e) }); }

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
