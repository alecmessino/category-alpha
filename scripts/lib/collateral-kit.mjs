/* The Millibar / Storm Atlas print kit: plate, ledger, cite block.
 *
 * Every component that prints a NUMBER takes a row object produced by collateral-data.mjs and
 * prints its fields. None of them accepts a hand-written figure, which is what makes the
 * evidence gate structural: to publish a rate that is not in the manifest you would have to
 * change this file, not a template.
 *
 * THE STATUS COLUMN. `ledger()` renders one cell per row from `row.status`, and `row.status` is
 * null unless the engine returned a refusal or the archive-wide event gate fired. A null prints
 * as an em dash. There is no code path here that writes SUFFICIENT, VALID, OK or any other
 * row-level stamp: the archive renders none, and a table that invents one is claiming an
 * instrument said something it did not. SUFFICIENT belongs to the cohort line, where the
 * archive puts it, and `cohortLine()` is the only thing that prints it.
 */
import { esc } from "./collateral-plate.mjs";

export { esc };

export const pct = (r) => (r === null || r === undefined ? "—" : `${(100 * r).toFixed(1)}%`);
export const ci = (c) => (c ? `${(100 * c[0]).toFixed(0)}–${(100 * c[1]).toFixed(0)}%` : "—");
export const hrs = (h) => (h === null || h === undefined ? "—" : `${Math.round(h)} h`);
export const coord = (lat, lon) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;

export const CSS = `
@page { size: Letter; margin: 10mm; }
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&display=swap');
:root{
  --ink-900:#0f172a; --ink-700:#334155; --ink-600:#475569; --ink-400:#94a3b8;
  --line-300:#cbd5e1; --line-200:#e2e8f0; --paper-50:#f8fafc; --paper-100:#f4f5f8; --white:#fff;
  --cyan-500:#0ea5e9; --green-600:#16a34a; --red-600:#dc2626; --amber-700:#b45309;
  --violet-600:#7c3aed; --blue-600:#0066ff;
  --font-display:'Source Serif 4',Georgia,serif;
  --font-sans:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --font-mono:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;
  /* WHITESPACE IS THE LEVER, NOT TYPE. The type gate fixes the three text sizes, so every
     density decision below it is made in this scale. Tightened once the gate was applied:
     the page pays for a larger body size out of its gutters, never out of its point size. */
  --sp-1:2px; --sp-2:3px; --sp-3:5px; --sp-4:6px; --sp-5:8px; --sp-6:10px; --sp-7:12px; --sp-8:15px;
  /* THE TYPE GATE, AS TOKENS.
     8.5 pt body, 7.5 pt detail, 7 pt legal, at 96 dpi where 1 pt = 4/3 px. Every font-size in
     this stylesheet is one of these three or a display size above them, so the gate is a
     property of the scale rather than something a reviewer has to measure line by line.
     scripts/check-collateral-legibility.mjs measures the rendered result anyway. */
  --t-body:11.4px;    /* 8.55 pt */
  --t-detail:10.1px;  /* 7.58 pt */
  --t-legal:9.4px;    /* 7.05 pt */
}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--paper-100);color:var(--ink-900);
  font-family:var(--font-sans);font-size:var(--t-body);line-height:1.26;
  font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
/* THE SCREEN BOX IS THE PRINT BOX, EXACTLY.
   @page is Letter with a 10 mm margin, so the printed content area is 196 x 259 mm. The
   on-screen sheet is that box and nothing else -- no padding of its own -- with the paper
   margin drawn by a border instead, so a block that would paginate on paper overflows visibly
   here. Measured against the PDF: an on-screen sheet that fits is a printed page that fits. */
.sheet{width:216mm;height:279mm;margin:0 auto;background:var(--white);
  padding:0;position:relative;border:10mm solid var(--white);
  box-shadow:0 1px 10px rgba(15,23,42,.14);
  display:flex;flex-direction:column;overflow:hidden}
@media print{ body{background:#fff}
  .sheet{box-shadow:none;margin:0;border:0;width:auto;height:auto;padding:0;
    break-after:page;overflow:visible}
  .sheet:last-child{break-after:auto} }

/* ---- masthead ------------------------------------------------------------------ */
.mh{border-bottom:1.6px solid var(--ink-900);padding-bottom:1px;margin-bottom:var(--sp-1)}
.mh-top{display:flex;justify-content:space-between;align-items:baseline;gap:var(--sp-6);line-height:1.1}
.mh-brand{font-family:var(--font-mono);font-size:var(--t-body);font-weight:600;letter-spacing:1.6px;
  text-transform:uppercase;color:var(--ink-900)}
.mh-brand .sep{color:var(--ink-400);margin:0 6px}
.mh-doc{font-family:var(--font-mono);font-size:var(--t-body);letter-spacing:.4px;color:var(--ink-600);
  text-transform:uppercase;text-align:right;white-space:nowrap}
.mh-title{font-family:var(--font-display);font-size:19px;font-weight:700;line-height:1.1;
  margin:var(--sp-2) 0 var(--sp-1);letter-spacing:-.3px;max-width:94%}
.mh-sub{font-size:var(--t-body);color:var(--ink-600);max-width:92%;line-height:1.3}
.mh-rule{display:flex;gap:var(--sp-2) var(--sp-5);margin-top:var(--sp-1);flex-wrap:wrap}
.mh-rule .kv{font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:.5px;color:var(--ink-600);
  text-transform:uppercase}
.mh-rule .kv b{color:var(--ink-900);font-weight:600}

/* ---- section furniture ---------------------------------------------------------- */
.sec{margin-top:1px}
.sec-hd{display:flex;align-items:baseline;gap:var(--sp-3);border-left:2.5px solid var(--ink-900);
  padding-left:var(--sp-3);margin-bottom:var(--sp-1)}
.sec.sechd-tight>.sec-hd{margin-bottom:0}
.sec-hd h2{font-family:var(--font-mono);font-size:var(--t-body);font-weight:600;letter-spacing:1.5px;
  text-transform:uppercase;margin:0;color:var(--ink-900)}
.sec-hd .n{font-family:var(--font-mono);font-size:var(--t-body);color:var(--ink-400);letter-spacing:.6px}
.sec-hd .note{font-size:var(--t-body);color:var(--ink-600);margin-left:auto;font-style:italic}
.lede{font-size:var(--t-body);line-height:1.26;color:var(--ink-700);margin:0 0 var(--sp-2)}
.lede p{margin:0 0 var(--sp-2)}
.lede p:last-child{margin-bottom:0}
/* minmax(0,1fr), NOT 1fr. A grid item whose min-content width is a nowrap table cell or an
   unbroken URL refuses to shrink below it, and the other columns collapse to make room --
   which is how one 100 px column ended up carrying 692 px of stacked text. */
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-6)}
/* Two prose boxes of unequal length: the longer one takes the wider track, so the row is as tall
   as it needs to be and not as tall as the shorter box would be at half width. */
.grid2.wideleft{grid-template-columns:minmax(0,1.22fr) minmax(0,.78fr)}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-5)}
.grid3.tight{gap:var(--sp-4);align-items:start}
.grid3.lastwide{grid-template-columns:minmax(0,1fr) minmax(0,.92fr) minmax(0,1.3fr)}
.grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--sp-4)}
.spacer{flex:1 1 auto;min-height:0}

/* ---- ledger --------------------------------------------------------------------- */
table.ledger{width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:var(--t-detail)}
table.ledger caption{caption-side:top;text-align:left;font-family:var(--font-mono);font-size:var(--t-detail);
  letter-spacing:.6px;text-transform:uppercase;color:var(--ink-600);padding-bottom:1px}
.ledger th{text-align:right;font-weight:600;font-size:var(--t-detail);letter-spacing:.4px;
  text-transform:uppercase;color:var(--ink-600);border-bottom:1px solid var(--ink-900);
  padding:1.5px var(--sp-3);white-space:nowrap}
.ledger th:first-child{text-align:left}
.ledger td{text-align:right;padding:0.8px var(--sp-3);border-bottom:1px solid var(--line-200);
  white-space:nowrap}
.ledger td:first-child{text-align:left;font-family:var(--font-sans);font-size:var(--t-detail);font-weight:500}
.ledger tr.band td{background:var(--paper-50)}
.ledger tr.rule-top td{border-top:1px solid var(--line-300)}
.ledger .grp td{background:var(--ink-900);color:#fff;font-family:var(--font-mono);font-size:var(--t-detail);
  letter-spacing:.6px;text-transform:uppercase;padding:1.5px var(--sp-3);text-align:left}
.ledger .frac{color:var(--ink-900);font-weight:500}
.ledger .rate{font-weight:600;font-size:var(--t-body)}
.ledger .rate.refused{color:var(--red-600);font-weight:600;font-size:var(--t-detail);letter-spacing:.4px}
.ledger .ci{color:var(--ink-600)}
.ledger .status{text-align:left;font-size:var(--t-detail);letter-spacing:.3px;white-space:normal;
  max-width:130px;line-height:1.2}
.ledger .status.none{color:var(--ink-400);text-align:center}
.ledger .status.refused{color:var(--red-600);font-weight:600}
.ledger .status.gate{color:var(--amber-700);font-weight:600}
.bar{display:inline-block;height:5px;background:var(--ink-900);vertical-align:middle;
  margin-right:5px;min-width:0}
.bar.zero{background:var(--line-300);width:1px}
.barwrap{display:flex;align-items:center;gap:4px;justify-content:flex-end}
.barbed{width:54px;height:5px;background:var(--line-200);position:relative;flex:0 0 54px}
.barbed i{position:absolute;left:0;top:0;bottom:0;background:var(--ink-900)}
.barbed u{position:absolute;top:-1.5px;bottom:-1.5px;background:rgba(14,165,233,.34);
  border-left:1px solid var(--cyan-500);border-right:1px solid var(--cyan-500)}

/* ---- cite ----------------------------------------------------------------------- */
.cite{border-top:1px solid var(--ink-900);margin-top:var(--sp-1);padding-top:1px}
.cite .k{font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:1.1px;text-transform:uppercase;
  color:var(--ink-600);display:block;margin-bottom:1px}
.cite .v{font-family:var(--font-mono);font-size:var(--t-detail);line-height:1.2;color:var(--ink-900);
  word-break:break-word}
.cite .u{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--blue-600);word-break:break-all;
  display:block;margin-top:3px}

/* ---- chips / badges -------------------------------------------------------------- */
.chip{display:inline-block;font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:.7px;
  text-transform:uppercase;padding:1px 4px;border:1px solid var(--line-300);border-radius:3px;
  color:var(--ink-700);background:var(--white);white-space:nowrap}
.chip.solid{background:var(--ink-900);color:#fff;border-color:var(--ink-900)}
.chip.live{background:var(--red-600);color:#fff;border-color:var(--red-600)}
.chip.obs{background:var(--ink-900);color:#fff;border-color:var(--ink-900)}
.chip.pre{background:var(--white);color:var(--violet-600);border-color:var(--violet-600)}
.chip.warn{color:var(--amber-700);border-color:var(--amber-700)}
.chip.refuse{color:var(--red-600);border-color:var(--red-600)}
.chip.ok{color:var(--green-600);border-color:var(--green-600)}

/* ---- boxes ----------------------------------------------------------------------- */
.box{border:1px solid var(--line-300);border-radius:4px;padding:3px 5px;background:var(--white)}
.box.sunken{background:var(--paper-50)}
.box.commercial{border:1px solid var(--ink-900);border-left-width:4px;background:var(--paper-50)}
.box.refusal{border:1px solid var(--red-600);border-left-width:4px;background:#fef6f6}
.box.hole{border:1px dashed var(--amber-700);background:#fffbf3}
.box h3{font-family:var(--font-mono);font-size:var(--t-body);letter-spacing:.1px;text-transform:uppercase;
  margin:0 0 0.5px;color:var(--ink-900);line-height:1.08}
.box p{margin:0 0 var(--sp-1);font-size:var(--t-body);line-height:1.22;color:var(--ink-700)}
.box p:last-child{margin-bottom:0}
.box ul{margin:0;padding-left:9px;font-size:var(--t-body);line-height:1.2;color:var(--ink-700)}
.box li{margin-bottom:1px}
.box li:last-child{margin-bottom:0}
.box li b{color:var(--ink-900)}
.disclaim{font-family:var(--font-mono);font-size:var(--t-legal);letter-spacing:.3px;color:var(--ink-600);
  line-height:1.24}

/* ---- comparison strip ------------------------------------------------------------- */
.cmp{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--ink-900);border-radius:6px;
  overflow:hidden}
.cmp>div{padding:var(--sp-3) var(--sp-4)}
.cmp>div:first-child{border-right:1px solid var(--ink-900);background:var(--paper-50)}
.cmp h4{font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:1.2px;text-transform:uppercase;
  margin:0 0 var(--sp-3);display:flex;align-items:center;gap:5px}
.cmp h4 .dot{width:6px;height:6px;border-radius:50%;background:var(--ink-400);flex:0 0 6px}
.cmp>div:last-child h4 .dot{background:var(--cyan-500)}
.cmp ul{margin:0;padding-left:11px;font-size:var(--t-body);line-height:1.24;color:var(--ink-700)}
.cmp li{margin-bottom:1px}

/* ---- cards ------------------------------------------------------------------------ */
.card{border:1px solid var(--line-300);border-radius:4px;padding:4px;background:var(--white);
  display:flex;flex-direction:column;gap:1px}
.card.major{border-left:3px solid var(--ink-900)}
.card.hur{border-left:3px solid var(--ink-600)}
.card.ts{border-left:3px solid var(--line-300)}
.card .nm{font-family:var(--font-display);font-size:13px;font-weight:700;line-height:1.02}
.card .yr{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);letter-spacing:.4px}
.card .pk{font-family:var(--font-mono);font-size:14.5px;font-weight:600;letter-spacing:-.2px}
.card .pk small{font-size:var(--t-detail);font-weight:400;color:var(--ink-600);letter-spacing:.6px}
.card .facts{font-family:var(--font-mono);font-size:var(--t-detail);line-height:1.3;
  color:var(--ink-700);margin-top:1px;letter-spacing:.1px}
.card .catline{font-family:var(--font-mono);font-size:var(--t-detail);font-weight:600;letter-spacing:.7px;
  color:var(--ink-900);margin-top:-1px;line-height:1.1}
.card .lf{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-900);
  border-top:1px solid var(--line-200);padding-top:1.5px;margin-top:1px;line-height:1.22}
.card .lf .none{color:var(--ink-400)}

/* ---- stat tiles -------------------------------------------------------------------- */
.tiles{display:grid;gap:var(--sp-4)}
.tile{border:1px solid var(--line-300);border-radius:4px;padding:3px 5px;background:var(--paper-50)}
.tile .k{font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:.6px;text-transform:uppercase;
  color:var(--ink-600);display:block;margin-bottom:2px}
.tile .v{font-family:var(--font-mono);font-size:19px;font-weight:600;line-height:1.02;
  letter-spacing:-.4px}
.tile .v small{font-size:var(--t-detail);font-weight:400;color:var(--ink-600);letter-spacing:.5px}
.tile .s{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);margin-top:1px;
  display:block;line-height:1.22}
.tile.refused .v{font-size:var(--t-body);color:var(--red-600)}

/* ---- plate --------------------------------------------------------------------------- */
.plate{border:1px solid var(--ink-900);border-radius:6px;overflow:hidden;background:#fbfcfe}
.plate-hd{display:flex;justify-content:space-between;align-items:center;gap:var(--sp-4);
  padding:1px var(--sp-4);border-bottom:1px solid var(--ink-900);background:var(--white)}
.plate-hd .t{font-family:var(--font-mono);font-size:var(--t-body);letter-spacing:.2px;text-transform:uppercase;
  font-weight:600;line-height:1.1}
.plate-hd .m{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);letter-spacing:.5px}
.plate svg{display:block;width:100%;height:auto}
.plate-ft{display:flex;flex-wrap:wrap;gap:0 var(--sp-4);padding:0 var(--sp-4);
  border-top:1px solid var(--line-200);background:var(--white)}
.lg{display:flex;align-items:center;gap:3px;font-family:var(--font-mono);font-size:var(--t-detail);
  letter-spacing:.5px;color:var(--ink-700);text-transform:uppercase}
.lg i{display:block;width:14px;height:0;border-top-width:1.6px;border-top-style:solid;flex:0 0 14px}
.lg i.dot{height:6px;width:6px;border-radius:50%;border:none;flex:0 0 6px}
.lg i.sq{height:7px;width:9px;border:1px solid;border-radius:1px;flex:0 0 9px}
.plate-note{padding:2px var(--sp-4);border-top:1px solid var(--line-200);
  font-size:var(--t-detail);color:var(--ink-600);line-height:1.3;background:var(--white)}

/* ---- answers rail --------------------------------------------------------------------- */
.rail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-4);border-top:1px solid var(--ink-900);
  border-bottom:1px solid var(--ink-900);padding:var(--sp-1) 0;margin:var(--sp-1) 0}
.rail>div{padding-right:var(--sp-5);border-right:1px solid var(--line-200)}
.rail>div:last-child{border-right:none;padding-right:0}
.rail .q{font-family:var(--font-mono);font-size:var(--t-body);letter-spacing:.5px;text-transform:uppercase;
  color:var(--ink-600);display:block;margin-bottom:1px}
.rail .a{font-size:var(--t-body);line-height:1.24;color:var(--ink-900)}
.rail .a b{font-weight:600}

/* ---- live strip -------------------------------------------------------------------- */
.live{border:1px solid var(--red-600);border-radius:6px;overflow:hidden}
.live-hd{display:flex;align-items:center;gap:var(--sp-3);padding:1.5px var(--sp-4);
  background:var(--red-600);color:#fff;font-family:var(--font-mono);font-size:var(--t-body);
  letter-spacing:.4px;text-transform:uppercase;font-weight:600;line-height:1.15}
.live-hd .ts{margin-left:auto;letter-spacing:.6px;font-weight:400;opacity:.94}
.live table{width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:var(--t-detail)}
.live th{text-align:left;font-size:var(--t-detail);letter-spacing:.2px;text-transform:uppercase;
  white-space:nowrap;
  color:var(--ink-600);padding:2px var(--sp-4);border-bottom:1px solid var(--line-200);font-weight:600}
.live td{padding:1.5px var(--sp-4);border-bottom:1px solid var(--line-200);vertical-align:top;line-height:1.22}
.live tr:last-child td{border-bottom:none}
.live .nm{font-family:var(--font-sans);font-weight:600;font-size:var(--t-body)}
.live .sub{color:var(--ink-600);font-size:var(--t-detail);display:block;letter-spacing:.3px}

/* ---- artifact A: the merged system grid ------------------------------------------- */
table.ledger.sysgrid{table-layout:fixed}
.ledger.sysgrid th{white-space:nowrap;line-height:1.2;vertical-align:bottom;letter-spacing:.1px}
.ledger.sysgrid .chip{white-space:normal;display:inline-block;max-width:100%;line-height:1.1;margin-top:1px}
.ledger.sysgrid td{vertical-align:top;padding:1.2px var(--sp-3);overflow-wrap:anywhere}
.ledger td.lft{text-align:left;white-space:normal}
.ledger .mono6{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);display:block;
  letter-spacing:.2px;line-height:1.18}
.ledger .mono8{font-family:var(--font-mono);font-size:var(--t-detail);display:inline-block;margin-top:1px}
/* TABLE PROSE SITS AT THE TABLE TIER. The legibility gate sets two floors: 8.5 pt for body and
   callout copy, 7.5 pt for table, citation and detail. A sentence inside a ledger cell is table
   content, so it is set at --t-detail like every other cell rather than at body size. This is the
   gate's own distinction, not a way under it: no substantive text anywhere is below 7.5 pt. */
.ledger .prose{font-family:var(--font-sans);font-size:var(--t-detail);line-height:1.2;color:var(--ink-700);
  margin-top:1px}
.ledger .prose p{margin:0 0 2px}
.ledger .prose p:last-child{margin-bottom:0}
.ledger .feed{font-family:var(--font-mono);font-size:var(--t-detail);line-height:1.2;color:var(--ink-600);
  border-top:1px dotted var(--line-300);margin-top:2px;padding-top:1.5px}
.feedts{color:var(--ink-400);margin-top:1.5px;letter-spacing:.2px}
.ledger th.livecol,.ledger td.livecol{border-left:2px solid var(--red-600);
  border-right:2px solid var(--red-600)}
.ledger th.livecol{color:var(--red-600)}
.box.tag{padding:6px 7px}
.box.tag h3{font-size:var(--t-detail);margin-bottom:2px}
.tagbody{font-size:var(--t-body);line-height:1.32;color:#334155}
.tagbody p{margin:0}
.grid2.tight{gap:var(--sp-5);align-items:start}
.platerow{display:grid;grid-template-columns:minmax(0,1.42fr) minmax(0,1fr);gap:var(--sp-5);align-items:start}
.platerow.even{grid-template-columns:repeat(2,minmax(0,1fr))}
.platerow.one{grid-template-columns:minmax(0,1fr)}
.platerow .sec{margin-top:0}
.tagstack{display:flex;flex-direction:column;gap:var(--sp-2)}
.ledgerpair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.06fr);gap:var(--sp-6);align-items:start}
/* THE EVIDENCE BRIDGE. Three columns of prose, not figures: the left cell is what a contract
   needs, the middle is what the archive holds, and the right is the archive's verdict on the
   distance. It borrows the ledger's rules and banding and carries no contract rows at all. */
.bridge td{white-space:normal;vertical-align:top;line-height:1.16;padding:1.2px var(--sp-3)}
.bridge td.status{font-weight:600;letter-spacing:.2px;max-width:none}
.bridge th{white-space:normal}
/* THE REFERENCE DOCUMENT STACKS INSTEAD OF COMPRESSING. It paginates by design and is not page-
   count constrained, so it keeps the full group labels and the full event-gate stamps and simply
   gives each ledger the sheet's whole width. */
.ledgertrio.stack{grid-template-columns:minmax(0,1fr);gap:var(--sp-3)}
/* A reference-document table that may grow downwards but not sideways. */
.ledger.reflow th,.ledger.reflow td{white-space:normal}
/* THE EVIDENCE ROW. Two lines: the contract row and its rate, then the arithmetic under it. The
   rate is the darkest, heaviest thing in the band because it is what a reader scans for; the
   denominator and interval sit directly beneath it in mono so the precision never leaves the
   number; the state token is the only coloured thing in line two, present where the archive
   stamped the row and absent where it did not. No cards, no rules between the two lines, no
   repeated prose -- the tokens are glossed once in the panel note. */
.ledger.evidence{table-layout:auto}
.ledger.evidence td{padding:0.6px var(--sp-2) 1.2px;border-bottom:1px solid var(--line-200);
  white-space:normal;text-align:left}
.ledger.evidence tr.grp td{background:var(--ink-900);color:#fff;font-family:var(--font-mono);
  font-size:var(--t-detail);letter-spacing:.6px;text-transform:uppercase;padding:1.5px var(--sp-2);
  white-space:nowrap}
.evidence .l1{display:flex;align-items:baseline;justify-content:space-between;gap:var(--sp-3)}
.evidence .nm{font-family:var(--font-sans);font-size:var(--t-detail);font-weight:500;
  color:var(--ink-900);line-height:1.14;white-space:nowrap}
.evidence .rt{font-family:var(--font-mono);font-size:var(--t-body);font-weight:700;
  color:var(--ink-900);font-variant-numeric:tabular-nums;line-height:1.04;white-space:nowrap}
.evidence .rt.refused{font-size:var(--t-detail);font-weight:600;color:var(--red-600)}
.evidence .l2{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);
  line-height:1.14;white-space:nowrap}
.evidence .l2.slotted{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3)}
.evidence .l2 .slot{flex:0 0 84px;width:84px;display:flex;justify-content:flex-end;align-items:center;min-height:9px}
.evidence .l2 .ivl{color:var(--ink-600)}
.evidence .l2 .st{color:var(--red-600);font-weight:600;letter-spacing:.2px;white-space:nowrap}
.ivl-glyph,.tr-glyph{display:block;overflow:visible}
/* THE TIMING RANGE COLUMN. Head text is the axis; the glyph rows carry their own data-* values. */
.ledger.timing th.rng{font-weight:500;letter-spacing:.2px;text-transform:none;white-space:normal;color:var(--ink-600)}
.ledger.timing td.rng{padding:0 var(--sp-2);vertical-align:middle}
/* THE RULE FLOW. Chips joined by arrows; the colours are the package's status colours. */
.flow{display:flex;align-items:center;flex-wrap:wrap;gap:3px 5px;margin:2px 0 1px}
.fstep{display:inline-block;font-family:var(--font-sans);font-size:var(--t-detail);font-weight:500;letter-spacing:0;
  padding:1px 5px;border:1px solid var(--ink-700);border-radius:3px;color:var(--ink-900);line-height:1.25;
  background:var(--white);white-space:nowrap}
.fstep .n{font-family:var(--font-mono);font-weight:600}
.fstep .tok{font-family:var(--font-mono);font-weight:700;letter-spacing:.3px;text-transform:uppercase}
.flowrow{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px;margin-top:3px}
.flowlead{font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:.8px;text-transform:uppercase;color:var(--ink-600);white-space:nowrap}
.bridge th .harrow{font-family:var(--font-mono);color:var(--ink-600);margin-right:5px;font-weight:400}
.bridge td .flow{margin:0}
.ledger th.rng{text-align:left;font-weight:500;text-transform:none;letter-spacing:.2px;color:var(--ink-600)}
.ledger td.rng{padding:0 var(--sp-2);vertical-align:middle}
.fstep b{font-weight:700}
.fstep.gate{border-style:dashed;color:var(--ink-700)}
.fstep.refused{border-color:var(--red-600);color:var(--red-600);font-weight:600;background:#fff5f5}
.fstep.ok{border-color:var(--green-600);color:var(--green-600);font-weight:600;background:#f3fbf5}
.fstep.absent{border-color:var(--red-600);color:var(--red-600);border-style:dashed;font-weight:600}
.farrow{font-family:var(--font-mono);color:var(--ink-600);font-size:var(--t-body);line-height:1}
/* THE REPLAY LINK. A label a reader can act on; the exact URL is the target and the title. */
a.replay{display:inline-block;font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:.25px;
  text-transform:uppercase;color:var(--blue-600);border:1px solid var(--blue-600);border-radius:3px;
  padding:1px 6px;text-decoration:none;white-space:nowrap;line-height:1.3}
.replayrow{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:3px}
.cite .khead{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px;margin-bottom:1px}
.cite .khead .k{margin:0}
.cite .raw b{color:var(--ink-600);font-weight:600;letter-spacing:.4px}
/* THE MEMBER TIMELINE. A figure set between two rules, not a box: it reads as a table would. */
.tl-fig{border-top:1px solid var(--ink-900);border-bottom:1px solid var(--line-300);padding:2px 0 1px;margin:2px 0 0}
.tl-fig svg{display:block}
.tl-legend{display:flex;flex-wrap:wrap;gap:1px var(--sp-4);padding:1px 0 0;font-family:var(--font-mono);font-size:var(--t-detail);
  letter-spacing:.3px;color:var(--ink-600);line-height:1.3}
.tl-legend i{display:inline-block;vertical-align:-1px;margin-right:4px}
.tl-legend .o{width:7px;height:7px;border-radius:50%;background:#fff;border:1.2px solid var(--ink-900)}
.tl-legend .f{width:7px;height:7px;border-radius:50%;background:#5b6b80}
.tl-legend .d{width:6px;height:6px;background:var(--ink-900);transform:rotate(45deg);margin-right:5px}
.tl-legend .up{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid #5b6b80}
.tl-legend .dn{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:7px solid #5b6b80}
.tl-legend .sw{width:9px;height:7px;border-radius:1px}
/* THE FILL KEY IS NOT A SIXTH MARKER. At a flex gap it read as "Mexico at the crossing";
   it is set off by its own rule, because it keys the fill of the two crossing marks. */
.tl-legend .fill{margin-left:calc(var(--sp-4) - 2px);padding-left:var(--sp-4);
  border-left:1px solid var(--line-300)}
.figcap{font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:.8px;text-transform:uppercase;color:var(--ink-600);margin:0 0 1px}
/* THE JOINT MATRIX. Margins carry the published rows; the interior is drawn as what it is. */
.joint{display:grid;grid-template-columns:148px minmax(0,1fr) minmax(0,1fr);gap:1.5px;margin-top:1px}
.joint .jc{font-family:var(--font-mono);font-size:var(--t-detail);line-height:1.2;color:var(--ink-600)}
.joint .head{padding:1px 3px 2px;display:flex;flex-direction:column;justify-content:flex-end}
.joint .head.col{text-align:center;align-items:center;border-bottom:1px solid var(--ink-900)}
.joint .head.row{text-align:right;align-items:flex-end;border-right:1px solid var(--ink-900);justify-content:center}
.joint .head .t{font-family:var(--font-sans);font-weight:600;color:var(--ink-900);font-size:var(--t-detail);line-height:1.15}
.joint .head .s{color:var(--ink-400)}
.joint .head .m{margin-top:1px}
.joint .head .m b{color:var(--ink-900)}
.joint .head .ivl-glyph{margin-top:1px}
.joint .head.not .t{color:var(--ink-400);font-weight:500}
.joint .cell{min-height:22px;display:flex;align-items:center;justify-content:center;text-align:center;padding:3px 5px;
  border:1px dotted var(--line-300);border-radius:2px;color:var(--ink-400);letter-spacing:.2px}
.joint .cell.void{border:1.5px dashed var(--red-600);color:var(--red-600);font-weight:700;letter-spacing:.3px;
  background:repeating-linear-gradient(135deg,#fff5f5 0 4px,#fde7e7 4px 6px)}
.jointnote{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);line-height:1.28;margin-top:3px}
.jointnote b{color:var(--ink-900)}
/* THE WIND AXIS beneath the matrix: the archive's two landfall cuts against the contract's. */
.axis{margin-top:2px}
.grid2.matrixleft{grid-template-columns:minmax(0,1.18fr) minmax(0,.82fr)}
.axis svg{display:block}
/* THE BRIDGE, AS RULES. Three columns, hairlines between rows, a verdict that is a coloured
   word with a rule beside it -- not nine boxes. */
.bridge2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) minmax(0,.86fr);column-gap:var(--sp-5);margin-top:2px}
.bridge2 .col-h{font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:.9px;text-transform:uppercase;color:var(--ink-600);
  padding-bottom:2px;border-bottom:1px solid var(--ink-900)}
.bridge2 .col-h .ar{color:var(--ink-400);margin-right:6px}
.bridge2 .need,.bridge2 .hold,.bridge2 .verdict{padding:2px 0 3px;border-bottom:1px solid var(--line-200)}
.bridge2 .need,.bridge2 .hold{font-size:var(--t-body);line-height:1.2;color:var(--ink-700)}
.bridge2 .need b,.bridge2 .hold b{color:var(--ink-900)}
.bridge2 .ref{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);margin-top:1px;line-height:1.2}
.bridge2 .ref b{color:var(--ink-900)}
.bridge2 .verdict{font-family:var(--font-mono);font-size:var(--t-detail);font-weight:600;letter-spacing:.3px;text-transform:uppercase;
  color:var(--red-600);line-height:1.22;display:flex;align-items:flex-start}
.bridge2 .verdict span{border-left:2px solid currentColor;padding-left:6px;display:block;margin-top:1px}
.bridge2 .verdict.ok{color:var(--green-600)}
/* One refusal box carrying two statements, each with its own lead. */
.box .lead{font-family:var(--font-mono);font-size:var(--t-detail);letter-spacing:.6px;text-transform:uppercase;color:var(--red-600);font-weight:600;margin-right:4px}
.liveline{border-left:3px solid var(--blue-600);padding-left:6px}
/* Three short statements read as three, not as one column of prose: two columns inside the box. */
.box.cols2{column-count:2;column-gap:var(--sp-6)}
.box.cols2 h3{column-span:all}
.box.cols2 p{margin-bottom:2px}
.box .src{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);line-height:1.25;margin-top:2px;border-top:1px dotted var(--line-300);padding-top:1px}
.box .src b{color:var(--ink-900)}
/* The raw replay string, kept in the provenance block for print at the legal size. */
.cite .raw{display:block;font-family:var(--font-mono);font-size:var(--t-legal);color:var(--ink-400);
  word-break:break-all;line-height:1.25;margin-top:1px}
.ledgertrio{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.04fr) minmax(0,1.04fr);
  gap:var(--sp-4);align-items:start}
.ledger.compact td{padding:0.6px var(--sp-2);font-size:var(--t-detail);line-height:1.18}
.ledger.compact th{padding:1px var(--sp-2);font-size:var(--t-detail)}
.ledger.compact td:first-child{font-size:var(--t-detail)}
.ledger.compact .rate{font-size:var(--t-detail)}
.ledger.compact .status{font-size:var(--t-detail);max-width:none;white-space:nowrap}
.ledger .ivl{color:var(--ink-600);font-weight:400;font-size:var(--t-detail);letter-spacing:0}
.ledger.compact .grp td{font-size:var(--t-detail);padding:1.5px var(--sp-2)}
.cardrow{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:var(--sp-2)}
.cardrow-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.cardrow-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.cardrow-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.cardrow-5{grid-template-columns:repeat(5,minmax(0,1fr))}
.cardrow-6{grid-template-columns:repeat(6,minmax(0,1fr))}
.cardrow .card{padding:2px 3px}
.cardrow .card .nm{font-size:12px}
.cardrow .card .pk{font-size:13.5px}
.cardrow .card .facts{font-size:var(--t-detail)}
.cardrow .card .lf{font-size:var(--t-detail)}
.cardrow .card .yr{font-size:var(--t-detail)}
.cmptable td{text-align:left;white-space:normal;vertical-align:top;line-height:1.22;
  font-family:var(--font-sans);font-size:var(--t-body);padding:1px var(--sp-3)}
.cmptable td.q{font-family:var(--font-mono);font-size:var(--t-body);color:var(--ink-900);font-weight:500}
.cmptable td.atlas{color:var(--ink-900);border-left:2px solid var(--cyan-500)}
/* Same rule as .ledger .prose: a comparison-strip cell is table content, so the compact strip
   sits at the 7.5 pt table tier rather than the 8.5 pt body tier. The full-size strip stays at
   body size where a page can afford it. */
.cmptable.compact td{font-size:var(--t-detail);padding:0.5px var(--sp-2);line-height:1.18}
.cmptable.compact td.q{font-size:var(--t-detail)}
.platecol{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.06fr);gap:var(--sp-5);align-items:start}
/* A REPLAY URL IS 78 CHARACTERS AND MAY NOT SHRINK. At the 7.5 pt citation floor it needs about
   440 px to sit on one line, and a column narrower than that costs a second line on every URL on
   the page. Where a plate shares the band with a cite list, the cite side gets the width it
   needs and the plate takes the remainder. */
.platecol.cites{grid-template-columns:minmax(0,.62fr) minmax(0,1fr)}
/* A plate beside a prose box: the plate takes the width its declared renderWidth expects, so its
   labels paint at the size they were set at, and the box takes the rest. */
.platecol.plateleft{grid-template-columns:minmax(0,.92fr) minmax(0,1fr)}
/* The timing ledger is 376 px at its narrowest; give it the wider track. */
.platecol.timingleft{grid-template-columns:minmax(0,1.08fr) minmax(0,1fr)}
.platecol .sec{margin-top:0}
/* THE MIDDLE TRACK HOLDS A GROUP BAR, AND A GROUP BAR DOES NOT WRAP: at .86fr it is 179 px and
   INTENSITY · GENESIS-CONDITIONED is 213. Taking the 34 px from the plate was tried and reverted
   -- the plate's SVG labels paint at their declared size times the rendered width, so a narrower
   plate drops them to 6.6 pt, under the 7.5 pt map floor. The ratios stay as they were and C's
   middle table overruns its column; that is reported, not hidden. */
.triband{display:grid;grid-template-columns:minmax(0,1.28fr) minmax(0,.86fr) minmax(0,1.36fr);
  gap:var(--sp-4);align-items:start}
.grid3.tight{gap:var(--sp-5);align-items:start}
.grid4.tight{gap:var(--sp-4);align-items:start}
.cardsplit{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(0,1fr);gap:var(--sp-6);align-items:start}
.cardcmp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:var(--sp-6);align-items:start}
.cardcmp .sec{margin-top:0}
.cardcmp .grid4{gap:var(--sp-2)}
.cardsplit .sec{margin-top:0}
.cardsplit .grid4{gap:var(--sp-2)}
/* The manifest is a reference document, not a one-page sheet: it may run as long as the
   evidence does, and it paginates rather than clipping. */
.sheet.manifest{height:auto;min-height:279mm;overflow:visible}
.qtiles{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:var(--sp-5);align-items:start}
.workflowrow{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,2fr);gap:var(--sp-5);align-items:start}
.fnrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--sp-5)}
.fnrow .fn{margin-top:var(--sp-2)}
.citepair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--sp-6)}
.citecmp{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--sp-6);align-items:start}
.citecmp .cite:first-child{margin-top:0}
.citepair .cite{margin-top:var(--sp-3)}
.qline{margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4)}
.qline p{font-size:var(--t-body);line-height:1.35}
.citelist.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 var(--sp-5)}
.citelist.two .cite:nth-child(2){border-top:1px solid var(--ink-900);margin-top:0}
.citelist .cite{margin-top:var(--sp-1);padding-top:1px;border-top:1px solid var(--line-300)}
.citelist .cite:first-child{border-top:1px solid var(--ink-900);margin-top:0}
.citelist .v{font-size:var(--t-detail);line-height:1.18}
.citerows{margin-top:1px}
.citerows>div{border-top:1px dotted var(--line-300);padding-top:0.5px;margin-top:0.5px}
.citerows .nm{font-family:var(--font-mono);font-size:var(--t-detail);font-weight:600;
  letter-spacing:.2px;color:var(--ink-900);display:block;line-height:1.15}
.citerows .u{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--blue-600);
  word-break:break-all;display:block;line-height:1.12}
.citelist.urls .cite{margin-top:1px}
.citelist.urls .k{margin-bottom:0}
.citelist .u{font-size:var(--t-detail)}
/* A source URL printed in a footnote line. Same treatment as a replay URL: house blue, no
   underline, and it may break mid-string rather than push the line over the sheet. */
.fn .u{color:var(--blue-600);text-decoration:none;word-break:break-all}
.citelist .k{font-size:var(--t-detail)}
.ledger .cohortstat{text-align:right;font-family:var(--font-mono);font-size:var(--t-detail);font-weight:600;
  letter-spacing:.3px}
.ledger .cohortstat.refused{color:var(--red-600)}
.qtiles .tiles.grid4{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.grid3.tight .sec{margin-top:0}
.reasons{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-1);
  font-size:var(--t-detail);line-height:1.22;
  color:var(--ink-700);margin-top:3px}
.reasons b{color:var(--red-600)}
.reasons .why{color:var(--ink-600)}

/* ---- two-column body flow ---------------------------------------------------------
   A Letter page is 192 mm of usable width. One column of that at 8 px type is a very long
   measure and a very short page; two columns roughly double the vertical budget without
   shrinking the type further, which is the trade the density of this material actually needs. */
.cols{column-count:2;column-gap:var(--sp-6);column-rule:1px solid var(--line-200)}
.cols>*{break-inside:avoid;margin-top:0}
.cols .sec{margin-top:0;margin-bottom:var(--sp-5)}
.wide{grid-column:1/-1}
.stack{display:flex;flex-direction:column;gap:var(--sp-4)}

/* ---- footer ----------------------------------------------------------------------- */
.ft{margin-top:auto;border-top:1px solid var(--ink-900);padding-top:1px}
.ft-disclaim{margin:0}
.ft-row{display:flex;justify-content:space-between;gap:var(--sp-6);align-items:flex-start}
.ft .l{font-family:var(--font-mono);font-size:var(--t-legal);color:var(--ink-600);letter-spacing:.1px;
  line-height:1.5;max-width:70%}
.ft .l b{color:var(--ink-900)}
.ft .r{font-family:var(--font-mono);font-size:var(--t-legal);color:var(--ink-400);letter-spacing:.9px;
  text-align:right;white-space:nowrap;text-transform:uppercase}
.fn{font-family:var(--font-mono);font-size:var(--t-detail);color:var(--ink-600);line-height:1.2;
  margin-top:var(--sp-1)}
.fn b{color:var(--ink-900)}
`;

/** The one product sentence that must travel with every rate on every page. */
export const DISCLAIMER =
  "RESEARCH ONLY — NOT A FORECAST. Every rate here is GENESIS-CONDITIONED: it assumes formation "
  + "and describes what the record did next — not P(forms), not a live feed, not a cone. "
  + "AN UNCONDITIONAL INTENSITY PROBABILITY REQUIRES AN EXTERNAL FORMATION PROBABILITY DEFINED ON "
  + "THE SAME FORMATION EVENT AND CONDITIONING SET. None is computed here. An NHC outlook "
  + "probability is not multiplied by these Atlas rows unless the conditioning events are "
  + "demonstrably aligned. Landfall is counted jointly and is never decomposed into path/intensity "
  + "marginals.";

export function page({ title, favicon, body, css = "" }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}${css}</style>
</head><body>
${body}
</body></html>`;
}

export function masthead({ doc, sheet, title, sub, rule = [] }) {
  return `<header class="mh">
  <div class="mh-top">
    <div class="mh-brand">MILLIBAR<span class="sep">/</span>STORM ATLAS</div>
    <div class="mh-doc">${esc(doc)}${sheet ? ` &nbsp;·&nbsp; ${esc(sheet)}` : ""}</div>
  </div>
  <h1 class="mh-title">${title}</h1>
  ${sub ? `<p class="mh-sub">${sub}</p>` : ""}
  ${rule.length ? `<div class="mh-rule">${rule.map((r) =>
    `<span class="kv">${esc(r[0])} <b>${esc(r[1])}</b></span>`).join("")}</div>` : ""}
</header>`;
}

export function sectionHead(n, title, note) {
  return `<div class="sec-hd"><span class="n">${esc(n)}</span><h2>${esc(title)}</h2>${
    note ? `<span class="note">${note}</span>` : ""}</div>`;
}

/** The cohort line, and the ONLY place the word SUFFICIENT is allowed to appear. */
export function cohortLine(sys) {
  const c = sys.cohort;
  const cls = c.sufficient ? "ok" : "refuse";
  return `<span class="chip ${cls}">${esc(c.cohort_status)}</span>`
    + `<span class="chip">N = ${c.n_cases}</span>`
    + `<span class="chip">ESS ${c.effective_sample_size}</span>`
    + `<span class="chip">MIN SAMPLE ${c.min_sample}</span>`;
}

/* THE STATUS CELL, AND THE ONE THING IT MAY NOT DO.
   It prints `row.status` and nothing else, and `row.status` is null unless the engine returned a
   refusal or the archive-wide event gate fired. A null prints as an em dash. There is no branch
   here that writes SUFFICIENT, VALID or OK: the archive stamps no row-level status on a scored
   row, and a table that invents one is claiming the instrument said something it did not.
   In compact mode the gate's counts move to the unscoreable table on the same page, which
   prints them in full -- the STAMP itself is never abbreviated or paraphrased. */
/* THE STATE TOKEN INSIDE A STAMP. The archive stamps a row "OUT OF SCOPE -- unscoreable here";
   the part before the dash is the state, and the part after is the explanation of the state. In a
   narrow column the explanation, repeated down twelve rows, is what sets the table's minimum
   width -- 210 px of chrome carrying one bit of information twelve times. The token goes in the
   row; the stamp and its reason go once into the panel note beside it. Nothing is dropped and no
   new state is invented: the token is read out of the archive's own string, never authored. */
export function statusToken(status) {
  return String(status || "").split(/\s+--\s+/)[0].trim();
}

function statusCell(row, compact, tokens) {
  if (row.status === "RATE REFUSED") {
    return compact
      ? `<td class="status refused">RATE REFUSED</td>`
      : `<td class="status refused">RATE REFUSED — ${esc(row.refused_reason)}</td>`;
  }
  if (row.status) {
    const g = row.gate;
    if (tokens) return `<td class="status gate">${esc(statusToken(row.status))}</td>`;
    if (compact) return `<td class="status gate">${esc(row.status)}</td>`;
    return `<td class="status gate">${esc(row.status)}<br>${g ? esc(
      `${g.scope_events} in scope / ${g.archive_events} archive-wide; ${g.required} needed`) : ""}</td>`;
  }
  return `<td class="status none">—</td>`;
}

function rateCell(row) {
  if (row.rate === null) return `<td class="rate refused">REFUSED</td>`;
  return `<td class="rate">${pct(row.rate)}</td>`;
}

function barCell(row) {
  if (row.rate === null || !row.ci95) return `<td></td>`;
  const w = 54;
  const lo = row.ci95[0] * w;
  const hi = row.ci95[1] * w;
  return `<td><div class="barwrap"><span class="barbed">`
    + `<u style="left:${lo.toFixed(1)}px;width:${Math.max(1, hi - lo).toFixed(1)}px"></u>`
    + `<i style="width:${(row.rate * w).toFixed(1)}px"></i></span></div></td>`;
}

/**
 * The outcome ledger. `groups` is [{ label, rows }]. Nothing is computed here.
 */
export function ledger(groups, { caption, showBar = true, compact = false, tokens = false,
  statusHead = "Status returned" } = {}) {
  /* COMPACT MERGES THE RATE AND ITS INTERVAL INTO ONE CELL. Not to save ink -- to buy the STATUS
     column the width it needs to print the archive's stamp on one line. A stamp that wraps to
     three lines in a narrow column costs more page than the interval column it was competing
     with, and the interval never leaves the number it belongs to. */
  const cols = compact ? 4 : (showBar ? 6 : 5);
  /* THE STATUS HEADING SETS THE TABLE'S MINIMUM WIDTH. Every cell in this table is nowrap, so
     the widest heading is what the table cannot shrink below -- and "Status returned" is 103 px
     of heading over cells that hold an em dash. In a half-width column that pushed the table
     51 px past its grid track and clipped the column at the sheet edge. Callers that live in a
     narrow column pass the short form; the default is unchanged. */
  const head = compact
    ? `<tr><th>Contract row</th><th>n / N</th><th>Rate · 95% Wilson</th>`
      + `<th style="text-align:left">${esc(statusHead)}</th></tr>`
    : `<tr><th>Contract row</th><th>n / N</th><th>Rate</th>`
      + (showBar ? `<th>95% Wilson</th>` : "")
      + `<th>Interval</th><th style="text-align:left">Status returned</th></tr>`;
  const body = groups.map((g) => {
    const grp = g.label ? `<tr class="grp"><td colspan="${cols}">${esc(g.label)}</td></tr>` : "";
    return grp + g.rows.map((r, i) =>
      `<tr class="${i % 2 ? "band" : ""}"${r.status ? ` data-status="${esc(r.status)}"` : ""}>`
      + `<td>${esc(r.label)}</td>`
      + `<td class="frac">${r.count} / ${r.n_storms}</td>`
      + (compact
        ? `<td class="rate${r.rate === null ? " refused" : ""}">${r.rate === null ? "REFUSED"
          : `${pct(r.rate)} <span class="ivl">[${ci(r.ci95)}]</span>`}</td>`
        : rateCell(r) + (showBar ? barCell(r) : "") + `<td class="ci">${ci(r.ci95)}</td>`)
      + statusCell(r, compact, tokens)
      + `</tr>`).join("");
  }).join("");
  return `<table class="ledger${compact ? " compact" : ""}">${caption ? `<caption>${esc(caption)}</caption>` : ""}`
    + `<thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/**
 * The same ledger, in two panels side by side.
 *
 * A nineteen-row single column is 450 px of page for a table whose two halves answer different
 * questions -- how strong did they get, and where did they come ashore. Split, each half reads
 * as its own contract set and the page gets its height back. The ROWS are identical objects:
 * nothing is dropped, reordered or recomputed, and the STATUS column travels with every one.
 */
/* THREE COLUMNS, NOT TWO. The landfall contract carries twelve rows against intensity's seven, so
   a two-column pair is 200 px tall to hold 130 px of intensity beside it and the page pays for the
   difference twice. Split at the region boundary the archive itself uses -- every region keeps its
   `any` and `>=64 kt` pair in the same column -- and the band is as tall as its tallest column,
   not as tall as the sum. No row is dropped and no row is reordered. */
/* THE EVIDENCE ROW — TWO LINES, NOT FOUR COLUMNS.
 *
 * A four-column spreadsheet row cannot be narrower than the sum of its widest cells, and in a
 * 224-253 px track that sum was 294-397 px however hard the chrome was compressed: a contract-row
 * label and a rate with its interval are evidence, and evidence does not shrink. The columns were
 * the wrong model, not the numbers.
 *
 * So the row folds:
 *
 *     reached Cat 1                          25.0%
 *     3 / 12 · [9-53%]
 *
 * The words "95% Wilson" are not repeated down nineteen rows: at 67 px a row they were the widest
 * thing on line two and would have put the band back over its track. The interval itself never
 * leaves the number it belongs to, and which interval it is stands once in the panel note.
 *
 * Line one is the question and its answer, the rate set as the darkest thing in the band. Line two
 * is the arithmetic behind it -- the exact denominator the rate came from, the interval that is
 * its precision, and, where the archive stamped the row, the state token. Where the engine refuses
 * a rate there is no rate on line one and line two carries the refusal, exactly as the registry
 * returned it. Nothing is computed, rounded, suppressed or manufactured here: pct(), ci() and the
 * status strings are the same ones the column model printed.
 *
 * The width this needs is max(name + rate, the line-two string) rather than their sum, which is
 * what lets three groups stay side by side. */
export function evidenceLedger(groups, { wilson = false, cohort = "", glyph = false } = {}) {
  const body = groups.map((g) => {
    const grp = g.label ? `<tr class="grp"><td>${esc(g.label)}</td></tr>` : "";
    return grp + g.rows.map((r, i) => {
      const token = r.status ? statusToken(r.status) : "";
      const refused = r.rate === null;
      /* data-status carries the archive's FULL stamp on every row that has one, whatever the row
         prints. scripts/check-collateral.mjs reads it: a stamp a row carries must be visible
         somewhere on the sheet -- in the row, in the panel note, or in UNSCOREABLE. */
      /* Line two is text on the left and a fixed-width slot on the right: the interval glyph
         for a scoreable row, the state token for a stamped or refused one, never both. */
      let l2;
      if (glyph) {
        const g = intervalGlyph(r, { cohort });
        const meta = refused
          ? `${r.count} / ${r.n_storms}`
          : `${r.count} / ${r.n_storms} · ${wilson ? "95% Wilson " : ""}<span class="ivl">[${ci(r.ci95)}]</span>`;
        const slot = g || (token ? `<span class="st">${esc(token)}</span>` : (refused ? `<span class="st">RATE REFUSED</span>` : ""));
        l2 = `<div class="l2 slotted"><span class="meta">${meta}</span><span class="slot">${slot}</span></div>`;
      } else {
        /* The pre-glyph row, unchanged: a sheet that has not taken the visual layer prints
           exactly what it printed. */
        const inner = refused
          ? `${r.count} / ${r.n_storms} · <span class="st">${esc(token || "RATE REFUSED")}</span>`
          : `${r.count} / ${r.n_storms} · ${wilson ? "95% Wilson " : ""}`
            + `<span class="ivl">[${ci(r.ci95)}]</span>`
            + (token ? ` · <span class="st">${esc(token)}</span>` : "");
        l2 = `<div class="l2">${inner}</div>`;
      }
      return `<tr class="ev ${i % 2 ? "band" : ""}"${r.status ? ` data-status="${esc(r.status)}"` : ""}><td>`
        + `<div class="l1"><span class="nm">${esc(r.label)}</span>`
        + (refused ? `<span class="rt refused">REFUSED</span>` : `<span class="rt">${pct(r.rate)}</span>`)
        + `</div>${l2}</td></tr>`;
    }).join("");
  }).join("");
  return `<table class="ledger compact evidence"><tbody>${body}</tbody></table>`;
}

/* ---- THE INTERVAL GLYPH ---------------------------------------------------------------------
 *
 * One horizontal axis, 0 to 100 percent, the same 84 px in every row of a group so the eye can
 * read down a ladder. The 95 percent Wilson interval is a thin whisker; the observed rate is the
 * one heavy mark on it. There is no bar: a bar from zero would draw the point estimate as an
 * area and make 8.3 percent look like a quantity rather than a position inside [1-35].
 *
 * A stamped or refused row gets NO glyph. Its slot holds the state token instead, so the absence
 * of a mark is itself the reading: the archive returned no point estimate it stands behind.
 *
 * Every number the glyph encodes is stamped on it as data-* so scripts/check-collateral.mjs can
 * recompute the mark's position from the manifest row and fail the sheet if the picture and the
 * printed value ever disagree. */
export const GLYPH_W = 84;
export function intervalGlyph(row, { cohort = "", w = GLYPH_W, h = 9 } = {}) {
  if (row.rate === null || row.rate === undefined || row.status || !row.ci95) return "";
  const x = (v) => (1.5 + v * (w - 3)).toFixed(2);
  const [lo, hi] = row.ci95;
  return `<svg class="ivl-glyph" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" `
    + `data-cohort="${esc(cohort)}" data-key="${esc(row.key)}" data-rate="${row.rate}" `
    + `data-lo="${lo}" data-hi="${hi}" data-w="${w}" aria-label="${pct(row.rate)}, 95% Wilson ${ci(row.ci95)}">`
    + `<line x1="1.5" x2="${w - 1.5}" y1="${h / 2}" y2="${h / 2}" stroke="var(--line-300)" stroke-width=".7"/>`
    + `<line class="whisker" x1="${x(lo)}" x2="${x(hi)}" y1="${h / 2}" y2="${h / 2}" stroke="var(--ink-600)" stroke-width="1.3" stroke-linecap="butt"/>`
    + `<circle class="pt" cx="${x(row.rate)}" cy="${h / 2}" r="2.3" fill="var(--ink-900)"/></svg>`;
}

/* ---- THE TIMING RANGE ------------------------------------------------------------------------
 *
 * The published quantiles, drawn: p10-p90 as the outer whisker, p25-p75 as the heavier inner
 * range, the median as a tick. One shared hours axis across the rows so "hurricane at 36 h,
 * major at 72 h" is a distance the eye measures. Nothing is smoothed and nothing is interpolated:
 * five printed numbers become five x-positions. The axis maximum is the largest p90 in the set,
 * rounded up to the next 10 h, and it is printed in the column head. */
export function timingRange(d, { max, w = 150, h = 11, cohort = "", key = "" } = {}) {
  if (!d || !d.n || d.median === null) return "";
  const x = (v) => (1.5 + (v / max) * (w - 3)).toFixed(2);
  return `<svg class="tr-glyph" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-max="${max}" data-w="${w}" `
    + `data-cohort="${esc(cohort)}" data-key="${esc(key)}" `
    + `data-p10="${d.p10}" data-p25="${d.p25}" data-median="${d.median}" data-p75="${d.p75}" data-p90="${d.p90}" `
    + `aria-label="median ${hrs(d.median)}, p25-p75 ${hrs(d.p25)}-${hrs(d.p75)}, p10-p90 ${hrs(d.p10)}-${hrs(d.p90)}">`
    + `<line x1="1.5" x2="${w - 1.5}" y1="${h / 2}" y2="${h / 2}" stroke="var(--line-200)" stroke-width=".7"/>`
    + `<line class="outer" x1="${x(d.p10)}" x2="${x(d.p90)}" y1="${h / 2}" y2="${h / 2}" stroke="var(--ink-600)" stroke-width="1"/>`
    + `<line class="inner" x1="${x(d.p25)}" x2="${x(d.p75)}" y1="${h / 2}" y2="${h / 2}" stroke="var(--ink-700)" stroke-width="3.2"/>`
    + `<line class="med" x1="${x(d.median)}" x2="${x(d.median)}" y1="1" y2="${h - 1}" stroke="var(--ink-900)" stroke-width="1.6"/></svg>`;
}

/** Hours, as the timing tables print them. */

/** The timing table with its range column. `keys` = [[time_to_event key, label], ...]. */
export function timingTable(sys, keys, { w = 150, caption = "TIME TO EVENT — hours from genesis", cohort = sys.id } = {}) {
  const t = sys.time_to_event;
  const rows = keys.map(([k, label]) => [k, label, t[k]]).filter(([, , d]) => d && d.n);
  if (!rows.length) return "";
  const max = Math.ceil(Math.max(...rows.map(([, , d]) => d.p90)) / 10) * 10;
  return `<table class="ledger timing"><caption>${esc(caption)}</caption>
    <thead><tr><th>Event</th><th>n</th><th>Median</th><th>p25 – p75</th><th>p10 – p90</th>
      <th class="rng" style="text-align:left">0 – ${max} h · p10–p90 whisker · p25–p75 band · median tick</th></tr></thead>
    <tbody>${rows.map(([k, label, d]) => `<tr data-timing="${esc(k)}"><td>${esc(label)}</td><td class="frac">n = ${d.n}</td>`
      + `<td class="rate">${hrs(d.median)}</td><td class="ci">${hrs(d.p25)} – ${hrs(d.p75)}</td>`
      + `<td class="ci">${hrs(d.p10)} – ${hrs(d.p90)}</td><td class="rng">${timingRange(d, { max, w, cohort, key: k })}</td></tr>`).join("")}
    </tbody></table>`;
}

/* ---- THE RULE FLOW ---------------------------------------------------------------------------
 * INPUT -> GATE -> RESULT, as chips. The refusal's full sentence stays nearby; this is the same
 * rule read in one glance. Colour is semantic: a refused result is red, a sufficient one green,
 * the gate itself is neutral ink. */
export function ruleFlow(steps) {
  return `<div class="flow">${steps.map((st, i) => (i ? `<span class="farrow">${esc(st.sep || "→")}</span>` : "")
    + `<span class="fstep ${esc(st.kind || "")}">${st.html || esc(st.text)}</span>`).join("")}</div>`;
}

/** A descriptive replay link: the label is what a reader sees, the exact URL is the target. */
export function replayLink(sys, label) {
  return `<a class="replay" href="${esc(sys.replay_url)}" title="${esc(sys.replay_url)}">${esc(label)} ↗</a>`;
}

/* ---- THE MEMBER TIMELINE ----------------------------------------------------------------
 *
 * Twelve members on one hours-from-genesis axis. Three zones and no floating text: the member
 * and its lifetime peak on the left; the plot; on the right, on the same line, what it did.
 * Every mark is a value the manifest holds for that member -- hours_to_ts, hours_to_cat1,
 * hours_to_cat3, and each recorded crossing at hours_from_genesis -- and a crossing is filled
 * by the wind the archive holds for it. Beneath, on the same axis, the published quantiles,
 * drawn as the five numbers they are. Nothing is smoothed and nothing is summed: a member with
 * twelve recorded crossings shows twelve marks on one row, which is what a crossings-not-storms
 * quantile counts. Every number a mark encodes is stamped on it as data-* for the gate. */
const TLINK = { lo: "#b9c3d1", mid: "#5b6b80", hi: "#0f172a", none: "#94a3b8" };
const CAT_SHORT = { td: "TD", ts: "TS", cat1: "Cat 1", cat2: "Cat 2", cat3: "Cat 3", cat4: "Cat 4", cat5: "Cat 5" };
const SUB_ABBR = { Louisiana: "LA", Texas: "TX", Florida: "FL", Mississippi: "MS", Alabama: "AL", Tamaulipas: "TAM", Veracruz: "VER" };
const ktInk = (kt) => (kt === null || kt === undefined ? TLINK.none : kt >= 96 ? TLINK.hi : kt >= 64 ? TLINK.mid : TLINK.lo);
const stx = (x, y, txt, { anchor = "start", b = false, ink = "#475569", mono = true, fs = 10.1 } = {}) =>
  `<text x="${(+x).toFixed(2)}" y="${(+y).toFixed(2)}" text-anchor="${anchor}" font-family="${mono
    ? "IBM Plex Mono,monospace" : "IBM Plex Sans,Helvetica,Arial,sans-serif"}" font-size="${fs}"${b ? ' font-weight="600"' : ""} fill="${ink}">${esc(txt)}</text>`;

/** The one line a member's crossings print, sized for the timeline's gutter. */
export function crossingText(m) {
  const K = m.crossings;
  if (!K.length) return { text: "no recorded crossing", strong: false };
  if (K.length === 1) {
    const k = K[0];
    const place = k.region === "conus" ? k.sub_region : `${k.sub_region}, ${k.region === "mexico" ? "MX" : k.region}`;
    const kt = k.category === null ? "kt unrecorded" : `${Math.round(k.vmax_kt)} kt`;
    return { text: `${place} · ${kt} · +${Math.round(k.hours_from_genesis)} h`, strong: k.hurricane || (k.category || "").startsWith("cat") };
  }
  const subs = [...new Set(K.map((k) => k.sub_region))].map((x) => SUB_ABBR[x] || x.slice(0, 3).toUpperCase());
  const kts = K.map((k) => k.vmax_kt).filter((v) => v !== null && v !== undefined).map(Math.round);
  return { text: `${K.length} crossings · ${subs.join(" → ")} · ${Math.min(...kts)}–${Math.max(...kts)} kt`, strong: Math.max(...kts) >= 64 };
}

/* ROW HEIGHT IS LEADING, NOT DECORATION. At 11 px a 10.1 px label fills its own row edge to
   edge and the twelve members read as one block; 12 px gives each row the leading a table row
   has, and the page has the space. */
export function memberTimeline(sys, { w = 742, rowH = 12, quantiles = [] } = {}) {
  const M = sys.members || [];
  const T = sys.time_to_event || {};
  const held = [];
  for (const m of M) for (const v of [m.hours_to_ts, m.hours_to_cat1, m.hours_to_cat3, ...m.crossings.map((k) => k.hours_from_genesis)]) if (v !== null && v !== undefined) held.push(v);
  for (const [k] of quantiles) if (T[k] && T[k].n) held.push(T[k].p90);
  const hmax = Math.max(48, Math.ceil(Math.max(...held) / 24) * 24);
  const nameX = 4, peakX = 158, x0 = 166, gut = w - 214, x1 = gut - 10;
  const x = (h) => (x0 + (h / hmax) * (x1 - x0)).toFixed(2);
  const out = [];
  let y = 14;
  for (let h = 0; h <= hmax; h += 24) {
    out.push(`<line x1="${x(h)}" x2="${x(h)}" y1="${y - 2}" y2="${y + rowH * M.length + 3}" stroke="${h % 48 ? "#eef1f5" : "#e2e7ee"}" stroke-width=".7"/>`);
    if (h % 48 === 0) out.push(stx(x(h), y - 4, `${h} h`, { anchor: "middle", ink: "#64748b" }));
  }
  out.push(stx(nameX, y - 4, "MEMBER · LIFETIME PEAK", { b: true, ink: "#0f172a" }));
  out.push(stx(gut, y - 4, "RECORDED CROSSINGS", { b: true, ink: "#0f172a" }));
  y += 6;
  const tri = (cx, cy, up, ink, hollow) => up
    ? `M${(cx - 3.3).toFixed(2)} ${(cy + 2.9).toFixed(2)}L${cx} ${(cy - 3.5).toFixed(2)}L${(cx + 3.3).toFixed(2)} ${(cy + 2.9).toFixed(2)}Z`
    : `M${(cx - 3.3).toFixed(2)} ${(cy - 2.9).toFixed(2)}L${cx} ${(cy + 3.5).toFixed(2)}L${(cx + 3.3).toFixed(2)} ${(cy - 2.9).toFixed(2)}Z`;
  for (const m of M) {
    const cy = y + rowH / 2;
    const last = Math.max(0, ...[m.hours_to_ts, m.hours_to_cat1, m.hours_to_cat3, ...m.crossings.map((k) => k.hours_from_genesis)].filter((v) => v !== null && v !== undefined));
    const cross = crossingText(m);
    out.push(`<g class="tl-row" data-storm="${esc(m.storm_id)}" data-crossings="${m.crossings.length}">`);
    out.push(`<line x1="${x0}" x2="${x1}" y1="${cy}" y2="${cy}" stroke="#e2e7ee" stroke-width=".7"/>`);
    out.push(stx(nameX, cy + 3.5, `${m.name} ${m.season}`, { b: true, ink: "#0f172a", mono: false }));
    out.push(stx(peakX, cy + 3.5, `${m.peak_vmax_kt} kt · ${CAT_SHORT[m.max_category] || m.max_category}`, { anchor: "end" }));
    if (last > 0) out.push(`<line x1="${x0}" x2="${x(last)}" y1="${cy}" y2="${cy}" stroke="#94a3b8" stroke-width="1"/>`);
    if (m.hours_to_ts != null) out.push(`<circle class="m-ts" data-h="${m.hours_to_ts}" cx="${x(m.hours_to_ts)}" cy="${cy}" r="2.5" fill="#fff" stroke="#0f172a" stroke-width="1.1"/>`);
    if (m.hours_to_cat1 != null) out.push(`<circle class="m-cat1" data-h="${m.hours_to_cat1}" cx="${x(m.hours_to_cat1)}" cy="${cy}" r="2.9" fill="${TLINK.mid}"/>`);
    if (m.hours_to_cat3 != null) out.push(`<rect class="m-cat3" data-h="${m.hours_to_cat3}" x="${(+x(m.hours_to_cat3) - 3).toFixed(2)}" y="${cy - 3}" width="6" height="6" transform="rotate(45 ${x(m.hours_to_cat3)} ${cy})" fill="${TLINK.hi}"/>`);
    for (const k of m.crossings) {
      const kt = k.category === null ? null : k.vmax_kt;
      out.push(`<path class="m-cross" data-h="${k.hours_from_genesis}" data-kt="${kt === null ? "" : kt}" data-region="${esc(k.region)}" d="${tri(+x(k.hours_from_genesis), cy, k.region === "conus", ktInk(kt))}" fill="${kt === null ? "#fff" : ktInk(kt)}" stroke="${ktInk(kt)}" stroke-width="1"/>`);
    }
    out.push(stx(gut, cy + 3.5, cross.text, { b: cross.strong, ink: !m.crossings.length ? "#94a3b8" : cross.strong ? "#0f172a" : "#475569" }));
    out.push(`</g>`);
    y += rowH;
  }
  if (quantiles.length) {
    y += 6;
    out.push(`<line x1="0" x2="${w}" y1="${y - 5}" y2="${y - 5}" stroke="#0f172a" stroke-width=".8"/>`);
    out.push(stx(nameX, y + 4, "PUBLISHED QUANTILES · HOURS FROM GENESIS", { b: true, ink: "#0f172a" }));
    out.push(stx(gut, y + 4, "median · p25–p75 · p10–p90", { ink: "#64748b" }));
    y += 10;
    for (const [k, label] of quantiles) {
      const d = T[k];
      if (!d || !d.n) continue;
      const cy = y + rowH / 2;
      out.push(`<g class="tl-q" data-key="${esc(k)}" data-n="${d.n}" data-p10="${d.p10}" data-p25="${d.p25}" data-median="${d.median}" data-p75="${d.p75}" data-p90="${d.p90}">`);
      out.push(stx(nameX, cy + 3.5, label, { ink: "#0f172a", mono: false }));
      out.push(stx(peakX, cy + 3.5, `n = ${d.n}`, { anchor: "end" }));
      out.push(`<line class="outer" x1="${x(d.p10)}" x2="${x(d.p90)}" y1="${cy}" y2="${cy}" stroke="#475569" stroke-width="1"/>`);
      out.push(`<line class="inner" x1="${x(d.p25)}" x2="${x(d.p75)}" y1="${cy}" y2="${cy}" stroke="#334155" stroke-width="3.4"/>`);
      out.push(`<line class="med" x1="${x(d.median)}" x2="${x(d.median)}" y1="${cy - 5}" y2="${cy + 5}" stroke="#0f172a" stroke-width="1.8"/>`);
      out.push(stx(gut, cy + 3.5, `${hrs(d.median)} · ${hrs(d.p25)}–${hrs(d.p75)} · ${hrs(d.p10)}–${hrs(d.p90)}`, { ink: "#0f172a" }));
      out.push(`</g>`);
      y += rowH;
    }
  }
  const H = y + 2;
  const svg = `<svg class="tl" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" data-cohort="${esc(sys.id)}" data-x0="${x0}" data-x1="${x1}" data-hmax="${hmax}" role="img" aria-label="member timeline">${out.join("")}</svg>`;
  const legend = `<div class="tl-legend">
    <span><i class="o"></i>TS 34 kt</span><span><i class="f"></i>Cat 1 64 kt</span><span><i class="d"></i>Cat 3 96 kt</span>
    <span><i class="up"></i>CONUS crossing</span><span><i class="dn"></i>Mexico</span>
    <span class="fill">at the crossing <i class="sw" style="background:${TLINK.lo}"></i>&lt;64 <i class="sw" style="background:${TLINK.mid}"></i>64–95 <i class="sw" style="background:${TLINK.hi}"></i>≥96 kt</span>
  </div>`;
  return `<figure class="tl-fig">${svg}${legend}</figure>`;
}

/* ---- THE JOINT MATRIX -------------------------------------------------------------------
 *
 * The contract's own event, as the 2 x 2 the archive would have to hold to score it. Both
 * margins are published rows and print with their n / N, rate, interval and glyph. The interior
 * is the joint event; the archive holds no cell of it, so the cells are drawn empty and the
 * contract's cell is drawn as a refusal. No interior number is generated, and the margins are
 * not multiplied. */
export function jointMatrix(sys, { row, col, rowLabel, rowSub = "", colLabel, notRow, notCol, voidText = "THE CONTRACT'S EVENT<br>NO ROW · NOT SCORED" }) {
  const R = [...sys.intensity_rows, ...sys.landfall_rows].find((r) => r.key === row);
  const C = [...sys.intensity_rows, ...sys.landfall_rows].find((r) => r.key === col);
  const margin = (r) => `<span class="m"><b>${r.count} / ${r.n_storms}</b> · ${pct(r.rate)}</span><span class="m">[${ci(r.ci95)}]</span>${intervalGlyph(r, { cohort: sys.id })}`;
  const attrs = (r) => `data-key="${esc(r.key)}" data-count="${r.count}" data-n="${r.n_storms}" data-rate="${r.rate}" data-lo="${r.ci95[0]}" data-hi="${r.ci95[1]}"`;
  return `<div class="joint" data-row-key="${esc(row)}" data-col-key="${esc(col)}">
  <div class="jc"></div>
  <div class="jc head col" ${attrs(C)}><span class="t">${colLabel}</span>${margin(C)}</div>
  <div class="jc head col not"><span class="t">${notCol}</span></div>
  <div class="jc head row" ${attrs(R)}><span class="t">${rowLabel}</span>${rowSub ? `<span class="s">${rowSub}</span>` : ""}${margin(R)}</div>
  <div class="jc cell void">${voidText}</div>
  <div class="jc cell">no joint row</div>
  <div class="jc head row not"><span class="t">${notRow}</span></div>
  <div class="jc cell">no joint row</div>
  <div class="jc cell">no joint row</div>
</div>`;
}

/* ---- THE WIND AXIS ----------------------------------------------------------------------
 * The archive's landfall intensity forms -- any, and ≥64 kt -- as spans on one wind axis, with
 * the contract's line on the same axis. Thresholds are the pack's. The gap between the red
 * line and the archive's rightmost cut is the finding, drawn. */
export function windAxis(pack, { w = 340, h = 60, contractKt = 113, contractLabel = "CONTRACT · ≥113 KT AT THE CROSSING", cutLabels = ["ARCHIVE SCORES A CROSSING AT ANY WIND", "AND AT ≥64 KT"], cuts = [0, 64], compact = false } = {}) {
  const th = pack.thresholds_kt || {};
  if (compact) return windAxisCompact(pack, { w, contractKt });
  const steps = [["TD", th.td ?? 0], ["TS", th.ts ?? 34], ["Cat 1", th.cat1 ?? 64], ["Cat 2", th.cat2 ?? 83], ["Cat 3", th.cat3 ?? 96], ["Cat 4", th.cat4 ?? 113], ["Cat 5", th.cat5 ?? 137]];
  const ktMax = 155, x0 = 8, x1 = w - 8, axY = 28;
  const x = (kt) => (x0 + (kt / ktMax) * (x1 - x0)).toFixed(2);
  const out = [];
  out.push(`<rect x="${x(contractKt)}" y="2" width="${(x1 - x(contractKt)).toFixed(2)}" height="${axY - 2}" fill="rgba(220,38,38,.06)"/>`);
  steps.forEach(([lb, kt], i) => {
    out.push(`<line x1="${x(kt)}" x2="${x(kt)}" y1="${axY - 3}" y2="${axY + 3}" stroke="#0f172a" stroke-width=".8"/>`);
    out.push(stx(x(kt), axY + (i % 2 ? 22 : 12), `${lb} ${kt}`, { anchor: i === 0 ? "start" : i === steps.length - 1 ? "end" : "middle", ink: "#475569" }));
  });
  out.push(`<line x1="${x0}" x2="${x1}" y1="${axY}" y2="${axY}" stroke="#0f172a" stroke-width="1"/>`);
  cuts.forEach((kt0, i) => {
    const yy = axY - 8 - i * 9;
    out.push(`<path class="span" data-kt0="${kt0}" data-kt1="${ktMax}" d="M${x(kt0)} ${yy - 3}V${yy}H${x1}" fill="none" stroke="#16a34a" stroke-width="1.5"/>`);
    out.push(stx(+x(kt0) + 4, yy - 1.5, cutLabels[i] || "", { b: true, ink: "#16a34a", fs: 10.1 }));
  });
  out.push(`<line class="contract" data-kt="${contractKt}" x1="${x(contractKt)}" x2="${x(contractKt)}" y1="1" y2="${axY + 3}" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="4 2.5"/>`);
  out.push(stx(x1, h - 2, contractLabel, { anchor: "end", b: true, ink: "#dc2626" }));
  return `<div class="axis"><svg class="axis" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-contract-kt="${contractKt}" role="img" aria-label="wind axis">${out.join("")}</svg></div>`;
}

/* The same axis on one line: where the archive cuts a landfall row (any wind; 64 kt) against
   where the contract cuts (113 kt). Sits under the matrix's column margin, whose cut it is. */
function windAxisCompact(pack, { w = 340, contractKt = 113 } = {}) {
  const th = pack.thresholds_kt || {};
  const any = th.td ?? 0, hur = th.cat1 ?? 64, ktMax = 155;
  const h = 28, x0 = 6, x1 = w - 6, axY = 13;
  const x = (kt) => (x0 + (kt / ktMax) * (x1 - x0)).toFixed(2);
  const out = [];
  out.push(`<rect x="${x(contractKt)}" y="${axY - 12}" width="${(x1 - x(contractKt)).toFixed(2)}" height="12" fill="rgba(220,38,38,.06)"/>`);
  out.push(`<line x1="${x0}" x2="${x1}" y1="${axY}" y2="${axY}" stroke="#0f172a" stroke-width=".8"/>`);
  out.push(`<path class="span" data-kt0="${any}" data-kt1="${ktMax}" d="M${x(any)} ${axY + 1}V${axY + 4}H${x1}V${axY + 1}" fill="none" stroke="#16a34a" stroke-width="1.3"/>`);
  out.push(`<path class="span" data-kt0="${hur}" data-kt1="${ktMax}" d="M${x(hur)} ${axY + 4}V${axY + 7}H${x1}V${axY + 4}" fill="none" stroke="#16a34a" stroke-width="1.3"/>`);
  out.push(`<line class="contract" data-kt="${contractKt}" x1="${x(contractKt)}" x2="${x(contractKt)}" y1="${axY - 12}" y2="${axY + 4}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="3.5 2"/>`);
  out.push(stx(x0, axY + 13, `ARCHIVE ROW · ANY WIND`, { ink: "#16a34a", b: true }));
  out.push(stx(x1, axY + 13, `ARCHIVE ROW · ≥${hur} KT`, { anchor: "end", ink: "#16a34a", b: true }));
  /* THE LABEL MAY NOT SIT WHERE THE TICK IS DRAWN. The contract's dashed rule rises through the
     upper band at 113 kt; a label long enough to reach back past that x was struck through by
     its own tick. The axis is named once on the left, so the right label carries the cut alone. */
  out.push(stx(x1, axY - 4, `CONTRACT · ≥${contractKt} KT`, { anchor: "end", ink: "#dc2626", b: true }));
  out.push(stx(x0, axY - 4, `WIND AT THE CROSSING`, { ink: "#475569" }));
  return `<div class="axis"><svg class="axis" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-contract-kt="${contractKt}" role="img" aria-label="wind axis">${out.join("")}</svg></div>`;
}

/* ---- THE BRIDGE, AS RULES ---------------------------------------------------------------- */
export function bridge(rows, { heads = ["Discrete needs", "Atlas currently holds", "The archive's verdict"] } = {}) {
  return `<div class="bridge2">
  ${heads.map((h, i) => `<div class="col-h">${i ? `<span class="ar">→</span>` : ""}${esc(h)}</div>`).join("")}
  ${rows.map((r) => `<div class="need">${r.need}</div><div class="hold">${r.hold}${(r.refs || []).map((x) => `<div class="ref">${x}</div>`).join("")}</div><div class="verdict${r.ok ? " ok" : ""}"><span>${esc(r.verdict)}</span></div>`).join("")}
</div>`;
}

/* CHROME, NOT EVIDENCE, IS WHAT SETS THESE TABLES' MINIMUM WIDTH. Every cell is nowrap, so the
   widest string in a column is a floor the table cannot go below -- and in a three-up band the
   widest strings were the group labels and the repeated event-gate stamps, not a single number.
   `chrome: "short"` prints the state and leaves the explanation to the panel note; the default
   keeps the full labels for documents that have the width for them. No row, order, count, rate,
   interval or refusal changes between the two: only the chrome around them. */
const CHROME = {
  full: { intensity: "INTENSITY THRESHOLDS — genesis-conditioned · TD is definitional",
    landfall: "LANDFALL CONTRACT ROWS — the regions this archive scores",
    continued: "LANDFALL CONTRACT ROWS — continued" },
  short: { intensity: "INTENSITY · GENESIS-CONDITIONED", landfall: "LANDFALL · SCORED REGIONS",
    continued: "LANDFALL · CONTINUED" },
};

export function ledgerPair(sys, { compact = true, chrome = "full", glyph = false } = {}) {
  const lf = sys.landfall_rows;
  const half = Math.ceil(lf.length / 4) * 2;
  const L = CHROME[chrome] || CHROME.full;
  const render = chrome === "short"
    ? (label, rows) => evidenceLedger([{ label, rows }], { cohort: sys.id, glyph })
    : (label, rows) => ledger([{ label, rows }], { showBar: false, compact });
  return `<div class="ledgertrio">
    <div>${render(L.intensity, sys.intensity_rows)}</div>
    <div>${render(L.landfall, lf.slice(0, half))}</div>
    <div>${render(L.continued, lf.slice(half))}</div>
  </div>`;
}

/* THE MEANING THE ROWS STOPPED REPEATING, PRINTED ONCE. Read off the cohort's own unscoreable
   block, so every stamp on the panel note is the archive's own string and the token in each row
   above is literally its head. Nothing here is authored copy. */
export function statusStamps(sys) {
  const out = [];
  for (const u of Object.values(sys.unscoreable || {})) if (!out.includes(u.status)) out.push(u.status);
  return out;
}

/** "OUT OF SCOPE -- unscoreable here; BASE RATE ONLY -- unscoreable", bolded, or "" if none. */
export function stampList(sys) {
  return statusStamps(sys).map((st) => `<b>${esc(st)}</b>`).join("; ");
}

/**
 * The archive-wide event gate, as a table rather than as eight near-identical paragraphs.
 *
 * The `reason` strings the engine returns are templated -- there are exactly two of them -- so
 * printing one per contract fills a page with the same sentence. Each contract keeps its exact
 * STATUS string and its own counts; the two reasons are quoted once, verbatim, beneath.
 * Nothing is softened and nothing is omitted: this is the same content, laid out once.
 */
export function unscoreableTable(sys) {
  const keys = Object.keys(sys.unscoreable);
  if (!keys.length) return "";
  const seen = new Map();
  for (const k of keys) {
    const u = sys.unscoreable[k];
    if (!seen.has(u.status)) seen.set(u.status, u.reason);
  }
  return `<div class="box refusal"><h3>WHAT THE ARCHIVE REFUSES ON THIS COHORT — ${keys.length} CONTRACT${keys.length > 1 ? "S" : ""}</h3>
  <table class="ledger compact"><thead><tr><th style="text-align:left">Contract</th>
    <th>In scope</th><th>Archive-wide</th><th>Required</th>
    <th style="text-align:left">Status returned</th></tr></thead><tbody>
  ${keys.map((k, i) => { const u = sys.unscoreable[k]; return `<tr class="${i % 2 ? "band" : ""}">
    <td style="font-family:var(--font-mono);font-size:var(--t-detail)">${esc(k)}</td>
    <td class="frac">${u.scope_events}</td><td class="frac">${u.archive_events}</td>
    <td class="frac">${u.required}</td>
    <td class="status gate">${esc(u.status)}</td></tr>`; }).join("")}
  </tbody></table>
  <p class="disclaim" style="margin-top:4px">Scope for this cohort: <b>${esc(sys.unscoreable[keys[0]].scope)}</b>.
  The two reasons the engine returned, verbatim:</p>
  <ul style="font-size:var(--t-detail);line-height:1.32;margin-top:3px">${[...seen].map(([st, why]) =>
    `<li><b>${esc(st)}</b> — ${esc(why)}</li>`).join("")}</ul>
  <p class="disclaim" style="margin-top:4px">A stamped row still publishes its count and its
  interval. What it will not carry is a calibrated or skill-scored probability.</p></div>`;
}

/**
 * The archive-wide event gate, in one band rather than a table.
 *
 * The STAMP for every affected contract is already on its own ledger row -- that is where a
 * reader meets it. What is missing there is the arithmetic behind it and the reason string, so
 * this band carries both: one line per contract with its counts, and each distinct reason quoted
 * once, verbatim. Two contracts sharing a reason do not get the sentence twice.
 */
export function unscoreableNote(sys) {
  const keys = Object.keys(sys.unscoreable);
  if (!keys.length) return "";
  const byReason = new Map();
  for (const k of keys) {
    const u = sys.unscoreable[k];
    if (!byReason.has(u.status)) byReason.set(u.status, { reason: u.reason, keys: [] });
    byReason.get(u.status).keys.push(`${k} (${u.scope_events} in scope / ${u.archive_events} archive-wide)`);
  }
  return `<div class="box refusal"><h3>UNSCOREABLE — ${keys.length} OF ${sys.landfall_rows.length} LANDFALL ROWS CARRY AN EVENT-GATE STAMP</h3>
  <p class="disclaim">Scope <b>${esc(sys.unscoreable[keys[0]].scope)}</b>;
  ${esc(sys.unscoreable[keys[0]].required)} distinct events are required before any skill claim,
  and each stamped row still publishes its count and interval.</p>
  <div class="reasons">${[...byReason].map(([st, v]) =>
    `<div><b>${esc(st)}</b> — ${esc(v.keys.join("; "))}. <span class="why">${esc(v.reason)}</span></div>`).join("")}</div></div>`;
}

/* THE PROVENANCE BLOCK. The citation string, a replay link a reader can act on -- labelled, not
   a 106-character query string -- and, beneath it at the legal size, the exact query string
   for print, where a label alone would be a dead link. The URL is the href, the title and the
   raw line; scripts/check-collateral-replay.mjs re-executes it from the manifest. */
export function citeBlock(sys, { label = "CITE THIS COHORT", replay = null, link = "raw" } = {}) {
  if (link === "raw") {
    return `<div class="cite"><span class="k">${esc(label)}</span>`
      + `<div class="v">${esc(sys.cite)}</div>`
      + `<a class="u" href="${esc(sys.replay_url)}">${esc(sys.replay_url)}</a></div>`;
  }
  const what = replay || `REPLAY THIS COHORT · N=${sys.cohort.n_cases}`;
  return `<div class="cite"><div class="khead"><span class="k">${esc(label)}</span>${replayLink(sys, what)}</div>`
    + `<div class="v">${esc(sys.cite)}</div>`
    + `<span class="raw">${esc(sys.replay_url)}</span></div>`;
}

/* ONE CITE STRING, SEVERAL LABELLED REPLAYS. The lead cohort's citation prints in full; each
   cohort the page tests it against gets a labelled link on the same head line and its exact
   query string beneath, tagged, for print. `links` = [[sys, label, tag], ...], lead first. */
export function citeLinks(lead, links, { label = "CITE THIS COHORT" } = {}) {
  return `<div class="cite"><div class="khead"><span class="k">${esc(label)}</span>`
    + links.map(([sy, what]) => replayLink(sy, what)).join("")
    + `</div><div class="v">${esc(lead.cite)}</div>`
    + links.map(([sy, , tag]) => `<span class="raw"><b>${esc(tag)}</b> ${esc(sy.replay_url)}</span>`).join("")
    + `</div>`;
}

/* THE COMPARISON, AS A TABLE RATHER THAN TWO LISTS.
   Two facing bullet lists make the reader hold one column in memory while reading the other, and
   they cost a third of a page. A row per question puts the two answers on the same line, which
   is the comparison the strip is actually making. */
/* THE COMPARISON, IN THREE ROWS. It ran to five; at the type gate the two extra rows cost more
   page than they added, because "where is it now", "will it form" and "where will it go" are one
   answer here -- silent, by construction -- and printing them separately said it three times. */
export const COMPARISON_ROWS = [
  ["Where is it now, will it form, where will it go?",
    "Position, intensity and motion now; <b>P(forms)</b> at 48 h and 7 d; the 5-day cone.",
    "Silent on all three, by construction. No live view, no formation probability, no cone."],
  ["What happened to storms that began here before?",
    "Not answered. No cohort, no denominator, no interval.",
    "<b>Exact n / N with a 95% Wilson interval</b> on every contract row, from a declared genesis point or pre-genesis cell, with the analog tracks drawn."],
  ["Where does the evidence run out, and can a counterparty reproduce it?",
    "Not answered. The advisory is public; the reasoning behind a number is not.",
    "<b>Visible refusal</b> — effective sample size, the min-sample gate and the archive-wide event gate, printed beside the number or instead of it. And the cohort is a <b>URL</b>: same question, same pack stamp, same numbers."],
];

/* THE COMPARISON IN ONE SENTENCE. The strip says three things a desk asks and what each side
   answers; where a sheet cannot give it three rows, this is the same claim in one line -- the
   form PROTECTED allows -- and it is written once here so every sheet that compresses it says
   exactly the same thing. */
export function whatAtlasAdds() {
  return `<b>WHAT ATLAS ADDS.</b> A public map gives position, P(forms) and a cone; Atlas gives `
    + `exact n / N with a 95% Wilson interval on every contract row, a visible refusal where the `
    + `record runs out, and a URL that reproduces both.`;
}

export function comparisonStrip({ note, compact = false } = {}) {
  return `<table class="ledger cmptable${compact ? " compact" : ""}">
  <thead><tr><th style="text-align:left;width:26%">The question a desk actually asks</th>
    <th style="text-align:left;width:33%">NHC / Zoom Earth / public maps</th>
    <th style="text-align:left;width:41%">Storm Atlas</th></tr></thead>
  <tbody>${COMPARISON_ROWS.map(([q, a, b], i) => `<tr class="${i % 2 ? "band" : ""}">
    <td class="q">${q}</td><td class="lft">${a}</td><td class="lft atlas">${b}</td></tr>`).join("")}
  </tbody></table>` + (note ? `<p class="fn">${note}</p>` : "");
}

export function answersRail(a, b, c) {
  return `<div class="rail">
  <div><span class="q">01 · What is happening now?</span><div class="a">${a}</div></div>
  <div><span class="q">02 · What does Storm Atlas add?</span><div class="a">${b}</div></div>
  <div><span class="q">03 · How does this help price, hedge, structure, explain, distribute?</span><div class="a">${c}</div></div>
</div>`;
}

const CAT_OF = (kt) => (kt >= 137 ? "CAT 5" : kt >= 113 ? "CAT 4" : kt >= 96 ? "CAT 3"
  : kt >= 83 ? "CAT 2" : kt >= 64 ? "CAT 1" : kt >= 34 ? "TS" : "TD");

export function repCards(sys, { limit = 8 } = {}) {
  const ms = sys.representatives.members.slice(0, limit);
  return ms.map((m) => {
    const cls = m.peak_vmax_kt >= 96 ? "major" : m.peak_vmax_kt >= 64 ? "hur" : "ts";
    /* COLLAPSED FOR THE CARD, AND ONLY FOR THE CARD. A storm that tracked along a coast can
       carry a dozen crossing rows -- Fern 1971 carries twelve. The card prints one line per
       region/sub-region with the STRONGEST crossing on it and the crossing count beside it,
       because twelve lines of the same coast is not more information. Nothing is dropped from
       the archive and nothing here is counted into a rate: the contract rows above are computed
       from the full landfalls table by the engine, not from this collapse. */
    const byPlace = new Map();
    for (const l of m.landfalls) {
      const key = `${l.region}|${l.sub_region || ""}`;
      const cur = byPlace.get(key);
      const kt = l.vmax_kt === null || l.vmax_kt === undefined ? null : l.vmax_kt;
      if (!cur) byPlace.set(key, { ...l, vmax_kt: kt, crossings: 1 });
      else {
        cur.crossings++;
        if (kt !== null && (cur.vmax_kt === null || kt > cur.vmax_kt)) cur.vmax_kt = kt;
        cur.hurricane = cur.hurricane || l.hurricane;
      }
    }
    const lf = byPlace.size
      ? [...byPlace.values()].sort((a, b) => (b.vmax_kt || 0) - (a.vmax_kt || 0)).map((l) =>
          `${l.region.replace(/_/g, " ").toUpperCase()}`
          + (l.sub_region ? ` / ${esc(l.sub_region)}` : "")
          + ` ${l.vmax_kt === null ? "—" : Math.round(l.vmax_kt) + " kt"}`
          + (l.hurricane ? " ≥64" : "")
          + (l.crossings > 1 ? ` <span class="none">×${l.crossings}</span>` : "")).join("<br>")
      : `<span class="none">no landfall in any modelled region</span>`;
    return `<div class="card ${cls}">
      <div class="nm">${esc(m.name)}</div>
      <div class="yr">${m.season} · genesis ${esc((m.genesis_utc || "").slice(0, 10))}</div>
      <div class="pk">${m.peak_vmax_kt}<small> KT PEAK</small></div>
      <div class="catline">${CAT_OF(m.peak_vmax_kt)} AT PEAK</div>
      <div class="facts">${coord(m.genesis_lat, m.genesis_lon)} · ${
        m.distance_km === null ? "—" : m.distance_km + " km"} · →TS ${hrs(m.hours_to_ts)} · →C1 ${hrs(m.hours_to_cat1)}</div>
      <div class="lf">${lf}</div>
    </div>`;
  }).join("");
}

/** Eight cards across one row, for a page that cannot spare two. Same fields, same rule. */
export function repCardRow(sys, { limit = 8 } = {}) {
  return `<div class="cardrow cardrow-${limit}">${repCards(sys, { limit })}</div>`;
}

export function repRule(sys) {
  const r = sys.representatives;
  return `<p class="fn"><b>SELECTION RULE — ${esc(r.rule)}</b> `
    + `${r.printed} of ${r.with_known_peak} members carrying a peak-wind value`
    + (r.shortfall ? `; <b>shortfall ${r.shortfall}</b>.` : ".")
    + ` <b>A member's landfall is a fact about that storm, not a rate</b>, and no sub-region here `
    + `is scored anywhere in this package. ×n marks repeat crossings of one coast.</p>`;
}

/* THE DISCLAIMER LIVES IN THE FOOTER.
   It was a block of its own, which cost every sheet 25 px to say something that belongs with the
   provenance rather than above it. It is still on every page, still in full, still before the
   pack stamps a reader would check it against. */
export function footer({ left, right, disclaimer = true }) {
  return `<footer class="ft">
    ${disclaimer ? `<p class="disclaim ft-disclaim">${esc(DISCLAIMER)}</p>` : ""}
    <div class="ft-row"><div class="l">${left}</div><div class="r">${right}</div></div>
  </footer>`;
}

export function disclaimerLine() {
  return `<p class="disclaim">${esc(DISCLAIMER)}</p>`;
}
