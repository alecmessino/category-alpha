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
.platecol .sec{margin-top:0}
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
      `<tr class="${i % 2 ? "band" : ""}">`
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

export function ledgerPair(sys, { compact = true, chrome = "full" } = {}) {
  const lf = sys.landfall_rows;
  const half = Math.ceil(lf.length / 4) * 2;
  const L = CHROME[chrome] || CHROME.full;
  const o = chrome === "short"
    ? { showBar: false, compact, tokens: true, statusHead: "Status" }
    : { showBar: false, compact };
  return `<div class="ledgertrio">
    <div>${ledger([{ label: L.intensity, rows: sys.intensity_rows }], o)}</div>
    <div>${ledger([{ label: L.landfall, rows: lf.slice(0, half) }], o)}</div>
    <div>${ledger([{ label: L.continued, rows: lf.slice(half) }], o)}</div>
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

export function citeBlock(sys, { label = "CITE THIS COHORT" } = {}) {
  return `<div class="cite"><span class="k">${esc(label)}</span>`
    + `<div class="v">${esc(sys.cite)}</div>`
    + `<a class="u" href="${esc(sys.replay_url)}">${esc(sys.replay_url)}</a></div>`;
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
