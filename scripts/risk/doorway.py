"""The /risk/ index: one door onto the published evidence, built from the evidence.

WHY THIS IS GENERATED AND NOT WRITTEN. An index that is typed by hand is a second place
where a record's facts live, and the second place is the one that goes stale -- it keeps
listing a record after it is renamed, or quietly stops listing one that was added. So every
card below is read out of the thing it points at: the trigger evidence records from their own
published manifests, the genesis watch from its ledger. The only prose here is prose.

WHAT IT DELIBERATELY IS NOT. Not a dashboard. Nothing on this page updates, ranks, scores or
recommends, and there is no pathway from it to a trading or betting surface -- that is gated,
in scripts/check-risk-doorway.mjs, rather than promised.
"""
from __future__ import annotations
import json
from pathlib import Path

from tec import EVENTS, ROOT
from record import ASSETS

OUT = ROOT / "docs" / "risk"
LEDGER = ROOT / "data" / "genesis-watch" / "LEDGER.json"
LIVE_URL = "https://alecmessino.github.io/category-alpha/risk/"

# The markdown that documents the methodology. It is repository source, served by Pages as
# plain text, and it is linked here AS source -- the standing commitments are stated on this
# page in prose, so that a reader meets them without opening a raw file.
METHOD_DOCS = [
    ("GENESIS-ARCHIVE.md", "The genesis-to-intensity archive: scope, quality remedies and the refusals"),
    ("TRACK-RESIDUAL.md", "Track residuals: the time model, and the result it retired"),
    ("PLAN-TRACK-MODEL.md", "The time-model correction, as it was planned and carried out"),
]


def money(n) -> str:
    return f"${n:,}" if isinstance(n, int) else str(n)


def records() -> list[dict]:
    """One card per published trigger evidence record, read from its own manifest."""
    out = []
    for slug in sorted(EVENTS):
        mp = OUT / slug / f"{slug}.manifest.json"
        if not mp.is_file():
            continue
        m = json.loads(mp.read_text())
        em, dm = m["event_manifest"], m["decision_manifest"]
        first = min((r["valid"] for r in em["records"]), default="")
        products = sorted({s["file"] for s in em["sources"]
                           if not s["file"].endswith((".geojson", ".json", ".dat"))})
        out.append({
            "slug": slug,
            "event": m["event"],
            "url": m["canonical_url"],
            "settlement": dm["settlement"],
            "n_products": len(products),
            "n_records": len(em["records"]),
            "n_sources": len(em["sources"]),
            "discussions": em["time_model"]["discussions_checked"],
            "issuance": (em.get("issuance_provenance") or {}).get("basis", "wmo-transmission-minute"),
            "pdf": next((p.name for p in (OUT / slug).glob("*.pdf")), None),
            "first": first,
        })
    # THE SEASON'S ORDER, NOT THE ALPHABET'S. Taken from the earliest record each manifest
    # holds, so a third event files itself correctly without anyone maintaining a list.
    out.sort(key=lambda r: r["first"])
    return out


def watch() -> dict | None:
    if not LEDGER.is_file():
        return None
    led = json.loads(LEDGER.read_text())
    entries = led.get("entries", [])
    # The ledger's `kind` is a schema token. It is shown to a reader in the reader's words,
    # and an unrecognised one falls through as itself rather than being dropped.
    SAYS = {"nhc-source-state": "official source state",
            "nhc-source-and-atlas-state": "source state with the Atlas state beside it",
            "atlas-state-append": "Atlas state appended to an earlier capture",
            "correction": "correction, appended over a record left unedited"}
    kinds = {}
    for e in entries:
        k = SAYS.get(e.get("kind", "?"), e.get("kind", "?"))
        kinds[k] = kinds.get(k, 0) + 1
    return {"n": len(entries), "kinds": kinds,
            "latest": max((e.get("committed_at_utc", "") for e in entries), default=""),
            "url": "https://alecmessino.github.io/category-alpha/risk/genesis-watch/"}


def record_card(r: dict) -> str:
    s = r["settlement"]
    status = "Not reconstructable from public terms" \
        if s.get("status") == "NOT_RECONSTRUCTABLE_FROM_PUBLIC_TERMS" else s.get("status", "")
    pdf = (f'<a href="{r["slug"]}/{r["pdf"]}">one-page brief</a> · ' if r["pdf"] else "")
    issuance = ("issuance to the transmission minute"
                if r["issuance"] == "wmo-transmission-minute"
                else "issuance to the printed hour; no transmission minute is reconstructed")
    return f"""<div class="rec">
 <h3><a href="{r['slug']}/">{r['event']}</a></h3>
 <table>
  <tr><td>Observed payout</td><td>{money(s.get('payout_observed'))}</td></tr>
  <tr><td>Settlement</td><td><span class="status">{status}</span></td></tr>
  <tr><td>Official products</td><td>{r['n_products']}</td></tr>
  <tr><td>Position records</td><td>{r['n_records']}</td></tr>
  <tr><td>Hashed inputs</td><td>{r['n_sources']}</td></tr>
  <tr><td>Time model</td><td>Cycle origin confirmed on {r['discussions']} archived discussions</td></tr>
  <tr><td>Source vintage</td><td>{issuance}</td></tr>
 </table>
 <p class="small">{pdf}<a href="{r['slug']}/{r['slug']}.manifest.json">machine-readable record</a></p>
</div>"""


def build() -> str:
    recs = records()
    w = watch()
    total_products = sum(r["n_products"] for r in recs)
    total_sources = sum(r["n_sources"] for r in recs)
    watch_row = ""
    if w:
        kinds = "; ".join(f"{v} {k}" for k, v in sorted(w["kinds"].items()))
        watch_row = f"""
 <div class="rec">
  <h3><a href="genesis-watch/">Pacific Genesis Watch</a></h3>
  <table>
   <tr><td>Sequence</td><td>{w['n']} committed records ({kinds})</td></tr>
   <tr><td>Contract</td><td>Append-only; every record hashed twice and never edited</td></tr>
   <tr><td>Latest entry</td><td class="mono">{w['latest']}</td></tr>
   <tr><td>Refuses</td><td>A track, a formation probability of its own, and any continuity beyond an exact name match</td></tr>
  </table>
  <p class="small">A decision state is frozen when it is taken, not reconstructed afterwards. A correction
  appends a supersession record; it never rewrites the original.</p>
 </div>"""

    css = (ASSETS / "web.css").read_text() + (ASSETS / "doorway.css").read_text()
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Risk Evidence — Millibar</title>
<meta name="description" content="Published evidence records for parametric tropical-cyclone triggers: what the official record supports, what it cannot reproduce, and what was knowable at the time.">
<meta property="og:title" content="Millibar Risk Evidence">
<meta property="og:description" content="Independent, reproducible evidence for parametric tropical-cyclone triggers. Official sources only.">
<meta property="og:type" content="website"><meta property="og:url" content="{LIVE_URL}">
<link rel="canonical" href="{LIVE_URL}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{css}</style></head><body>
<div class="wrap">
 <div class="mast"><div class="brand">Millibar <span>/ Risk Evidence</span></div>
  <div class="note">Independent research · Official sources only · Not a forecast, loss estimate or claims determination</div></div>
 <header class="title"><div>
  <h1>The evidence behind a parametric trigger, reopened.</h1>
  <p class="lede">Each record here answers one question: which official observation, evaluated
  against which contract version and which geometry, produced the outcome — and where the public
  record runs out, the record stops with it and says so. Every figure traces to an archived
  official product identified by SHA-256. {total_products} products across {len(recs)} events,
  {total_sources} hashed inputs, rebuilt byte-for-byte from those inputs on every run.</p>
 </div><div class="facts">
  <div><span>What this is</span><span>Point-in-time evidence records, reproducible from archived official products</span></div>
  <div><span>What it is not</span><span>A forecast, a loss estimate, a claims determination, or insurance advice</span></div>
  <div><span>Sources</span><span>NHC/CPHC text products, ATCF, Natural Earth, and the policyholder's own publications</span></div>
  <div><span>Method</span><span>Nothing is inferred from an observed outcome; a missing term is reported as missing</span></div>
 </div></header></div>

<div class="finding"><div class="wrap">
 <h2>A record that cannot be rebuilt from its own contents is not evidence.</h2>
 <p>So each of these is a build, not a document: one command reads the archived products and
 produces the page, the one-page brief and the machine-readable manifest, and a second command
 gates them. The source register is generated from the files the build actually opens —
 nothing declared may be absent, and nothing read may go undeclared. <em>Millibar does not
 infer an undisclosed contract term from an observed payout.</em></p>
</div></div>

<div class="wrap">
<section><div class="sec-head"><div class="plate">Settled<small>Trigger evidence records</small></div><div>
 <h2>Events with a published outcome</h2>
 <p>One contract, two events, one evaluator. Each record carries its own contract manifest, an
 event manifest for every official product it reads, and a decision manifest replaying the
 evaluation. Where the 2026 terms are not public, the settlement is reported as not
 reconstructable rather than reverse-engineered from the amount.</p></div></div>
 <div class="recs">{"".join(record_card(r) for r in recs)}</div>
</section>

<section><div class="sec-head"><div class="plate">Prospective<small>Frozen decision states</small></div><div>
 <h2>A state recorded before the outcome is known</h2>
 <p>A settled record is written after the fact, which is exactly what makes it easy to write
 well. The watch is the other half: the authoritative source state at an official issuance,
 captured as it is issued and then never edited.</p></div></div>
 <div class="recs">{watch_row}</div>
</section>

<section><div class="sec-head"><div class="plate">Archive<small>Historical base rates</small></div><div>
 <h2>What the historical record supports</h2>
 <p>Cohorts conditioned on genesis having occurred — historical evidence about pathways, never a
 formation or impact probability, and refused outright where the denominator does not exist.</p></div></div>
 <div class="recs"><div class="rec">
  <h3><a href="../storm-atlas/">Storm Atlas</a></h3>
  <p>A reproducible, versioned archive of every tropical cyclone from its first best-track fix to
  its last, with the environment it formed in, so a live area of interest can be matched to the
  historical cases most like it. Research only.</p>
  <p class="small">Its methodology, quality remedies and refusals are documented in
  <a href="../GENESIS-ARCHIVE.md">GENESIS-ARCHIVE.md</a>.</p>
 </div></div>
</section>

<section><div class="sec-head"><div class="plate">Methodology<small>Standing commitments</small></div><div>
 <h2>The rules every record on this page is built under</h2>
 <p>These are not aspirations. Each one is enforced by a gate that runs on every change, and
 each was written because something went wrong without it.</p></div></div>
 <div class="grid2"><div>
  <h3>Three times, never derived from one another</h3>
  <p>A forecast has a <b>nominal cycle</b> (the synoptic hour it belongs to), an <b>issuance</b>
  and a <b>valid time</b>, and they are stored separately. Forecast lead is
  <span class="mono">valid − nominal_cycle</span> and nothing else. Reading the release hour as
  forecast hour zero is what produced the residual this work retired, and the proof is
  documentary: the discussion products print the forecast table with its lead labels attached,
  and those labels reconcile against the cycle and against nothing else. Both hypotheses are
  scored on every archived discussion; the cycle origin holds on all of them and the
  initial-position origin on none.</p>

  <h3>A source vintage is carried, not smoothed over</h3>
  <p>Where two official products report the same fix differently, both are published as peers
  and neither overwrites the other. Where an archive establishes issuance only to the hour, no
  minute is invented to make it match an archive that has one.</p>
 </div><div>
  <h3>Every input declared, and every declaration read</h3>
  <p>The list of files a build opens is the list its manifest hashes — checked in both
  directions, because the failure that prompted it had both halves: a declared input that was
  never shipped, and the geometry it actually read appearing nowhere in its own register.</p>

  <h3>A refusal is a result</h3>
  <p>A rate without a denominator is not a small rate. An ambiguous cycle is not resolved by
  convention. A settlement that public terms cannot reproduce is reported as not reconstructable,
  with the missing terms named. Nothing here infers a contract term from an outcome.</p>

  <h3>Nothing on this page prices anything</h3>
  <p>These records are evidence about data, vintage, geometry, units and contract version. They
  are not a forecast, a loss estimate or a claims determination, and no page reachable from here
  quotes, ranks or prices a market. The gate that enforces it does not take the word for it: it
  fails on the vocabulary of such a surface appearing anywhere on this page at all.</p>
 </div></div>
 <p class="small" style="margin-top:22px">Source documents, served as repository text:
 {" · ".join(f'<a href="../{f}">{f}</a>' for f, _ in METHOD_DOCS)}</p>
 <table style="margin-top:10px"><tbody>
  {"".join(f'<tr><td class="mono">{f}</td><td>{d}</td></tr>' for f, d in METHOD_DOCS)}
 </tbody></table>
</section>

<footer><p>Independent research by Alec Messino. Not a weather forecast, loss estimate, claims
determination, or insurance advice. Official products remain the property of NOAA/NWS; contract
terms remain the property of the parties.</p>
<p>alec.messino@gmail.com</p></footer>
</div></body></html>"""


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(build())
    print(json.dumps({"records": [r["slug"] for r in records()],
                      "watch_entries": (watch() or {}).get("n")}, indent=1))
