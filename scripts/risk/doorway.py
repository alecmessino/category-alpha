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
import re
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


def esc(v) -> str:
    import html as _h
    return _h.escape("" if v is None else str(v), quote=True)


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
    # Singular and plural, because "2 correction" reads as a typo and a doorway that cannot
    # count its own records is not reassuring about the ones it is pointing at.
    SAYS = {"nhc-source-state": ("official source state", "official source states"),
            "nhc-source-and-atlas-state": ("source state with the Atlas state beside it",
                                           "source states with the Atlas state beside them"),
            "atlas-state-append": ("Atlas state appended to an earlier capture",
                                   "Atlas states appended to earlier captures"),
            "invest-designation": ("invest designation, sourced from ATCF",
                                   "invest designations, sourced from ATCF"),
            "association": ("association stated by NHC, upgrading an earlier containment basis",
                            "associations stated by NHC, upgrading earlier containment bases"),
            "correction": ("correction, appended over a record left unedited",
                           "corrections, appended over records left unedited")}
    counts = {}
    for e in entries:
        k = e.get("kind", "?")
        counts[k] = counts.get(k, 0) + 1
    kinds = {}
    for k, n in counts.items():
        pair = SAYS.get(k)
        # An unrecognised kind falls through as ITSELF. The earlier form indexed `pair`
        # before testing it, which held only while every kind happened to be known -- the
        # first genuinely new record kind turned a fallback into a crash.
        kinds[k if pair is None else (pair[0] if n == 1 else pair[1])] = n
    # THE ASSOCIATION'S STRENGTH IS READ, NEVER ASSUMED. A later record can upgrade it from
    # geometric containment to an association NHC states itself, and this doorway must not
    # outrun the records -- nor keep saying "containment only" after they stop.
    assoc, n_objects = None, None
    snaps = LEDGER.parent / "snapshots"
    for e in entries:
        f = snaps / e.get("file", "")
        if not f.is_file():
            continue
        rec = json.loads(f.read_text())
        if rec.get("objects"):
            n_objects = len(rec["objects"])
        a = rec.get("association")
        if e.get("kind") == "invest-designation" and a:
            assoc = {"invest": (rec.get("invest") or {}).get("atcf_id"), "stated": False}
        if e.get("kind") == "association" and a:
            assoc = {"invest": None, "stated": bool(a.get("nhc_states_this_association"))}
            ev = a.get("evidence") or {}
            head = ev.get("heading_verbatim") or ""
            m = re.search(r"\(([A-Z]{2}\d{2})\)", head)
            if m:
                assoc["invest"] = m.group(1)
    return {"n": len(entries), "kinds": kinds, "n_objects": n_objects, "association": assoc,
            "latest": max((e.get("committed_at_utc", "") for e in entries), default=""),
            "url": "https://alecmessino.github.io/category-alpha/risk/genesis-watch/"}


# ---------------------------------------------------------------------------------------
# TWO OFFICIAL OBSERVATIONS, TWO KNOWN PAYOUTS, ONE STEP NOBODY CAN EXPLAIN FROM THE PUBLIC
# RECORD.
#
# Both points are read from the published manifests, and both are on ONE basis: the closest
# approach of the OPERATIONAL working best track, which is the same quantity for each event.
# The Lala record separately documents a 70 kt / 21 nm advisory-track figure; that is a
# different basis and it stays on the Lala page rather than being mixed into this axis pair.
#
# WHY THE 2024 LADDER APPEARS AS LINES AND NOT AS CELLS. The historical ladder is indexed by
# WIND and by ZONE. Wind is an axis here. Zone is not a distance -- it is a set of polygons
# that the 2026 contract has never published, and drawing zone bands against nautical miles
# would be this page inventing the geometry the whole record refuses to infer. So the wind
# thresholds are drawn, faintly and as historical reference, and the dimension that would
# turn a wind into a payout is left visibly absent. That absence is the finding.
# ---------------------------------------------------------------------------------------
LADDER_KT_2024 = (50, 64, 83, 96, 113, 137)


def comparison_figure(recs, w=660, h=420):
    pts = []
    for r in recs:
        m = json.loads((OUT / r["slug"] / f"{r['slug']}.manifest.json").read_text())
        op = m["decision_manifest"]["operational"]
        ca = op.get("operational_closest_approach_hawaii") or \
            op.get("operational_closest_approach_niihau")
        island = "Hawaiʻi Island" if "operational_closest_approach_hawaii" in op else "Niʻihau"
        nm = ca.get("hawaii_nm", ca.get("niihau_nm"))
        pts.append({"name": m["event"].split()[-1], "nm": nm, "kt": ca["wind_kt"],
                    "payout": m["decision_manifest"]["settlement"]["payout_observed"],
                    "at": ca["time"], "island": island, "slug": r["slug"]})
    if len(pts) < 2:
        return "", pts

    pad_l, pad_r, pad_t, pad_b = 52, 96, 18, 44
    x0, x1 = 0.0, max(p["nm"] for p in pts) * 1.45
    y0, y1 = 40.0, 145.0
    X = lambda v: pad_l + (v - x0) / (x1 - x0) * (w - pad_l - pad_r)   # noqa: E731
    Y = lambda v: h - pad_b - (v - y0) / (y1 - y0) * (h - pad_t - pad_b)  # noqa: E731

    g = [f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
         f'font-family="IBM Plex Mono, Menlo, monospace" font-size="11" role="img" '
         f'aria-label="Two settled events on one axis pair: officially reported wind against '
         f'closest approach of the operational track. The 2024 historical wind thresholds are '
         f'drawn as faint reference lines; the zone dimension that would turn a wind into a '
         f'payout is not public and is not drawn.">']

    # the 2024 wind rows -- historical reference, deliberately unlabelled as payouts
    g.append('<g stroke="var(--rule)" stroke-dasharray="3 4" stroke-width="1">')
    for kt in LADDER_KT_2024:
        g.append(f'<line x1="{pad_l}" y1="{Y(kt):.1f}" x2="{w - pad_r}" y2="{Y(kt):.1f}"/>')
    g.append('</g><g fill="var(--mute)" font-size="10">')
    for kt in LADDER_KT_2024:
        g.append(f'<text x="{w - pad_r + 6}" y="{Y(kt) + 3:.1f}">{kt} kt</text>')
    g.append(f'<text x="{w - pad_r + 6}" y="{Y(LADDER_KT_2024[-1]) - 12:.1f}">2024 rows</text>')
    g.append('</g>')

    # axes
    g.append(f'<g stroke="var(--ink)" stroke-width="1.2">'
             f'<line x1="{pad_l}" y1="{pad_t}" x2="{pad_l}" y2="{h - pad_b}"/>'
             f'<line x1="{pad_l}" y1="{h - pad_b}" x2="{w - pad_r}" y2="{h - pad_b}"/></g>')
    g.append('<g fill="var(--mute)" font-size="10">')
    for v in range(0, int(x1) + 1, 10):
        g.append(f'<line x1="{X(v):.1f}" y1="{h - pad_b}" x2="{X(v):.1f}" y2="{h - pad_b + 4}" '
                 f'stroke="var(--ink-2)"/>')
        g.append(f'<text x="{X(v):.1f}" y="{h - pad_b + 16}" text-anchor="middle">{v}</text>')
    for v in range(40, 141, 20):
        g.append(f'<text x="{pad_l - 7}" y="{Y(v) + 3:.1f}" text-anchor="end">{v}</text>')
    g.append('</g>')
    g.append(f'<text x="{(pad_l + w - pad_r) / 2:.0f}" y="{h - 6}" text-anchor="middle" '
             f'fill="var(--ink-2)" font-size="11">closest approach of the operational track, nm</text>')
    g.append(f'<text transform="translate(13,{(pad_t + h - pad_b) / 2:.0f}) rotate(-90)" '
             f'text-anchor="middle" fill="var(--ink-2)" font-size="11">'
             f'officially reported wind, kt</text>')

    # the two events
    for i, p in enumerate(pts):
        x, y = X(p["nm"]), Y(p["kt"])
        g.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="var(--signal)"/>')
        # Both label lines clear the marker. An earlier pair of offsets put the figures line
        # three pixels above the centre, i.e. straight through the dot it was labelling.
        above = i == 0
        g.append(f'<text x="{x:.1f}" y="{y + (-30 if above else 26):.1f}" text-anchor="middle" '
                 f'fill="var(--ink)" font-size="13" font-weight="600">{esc(p["name"])}</text>')
        g.append(f'<text x="{x:.1f}" y="{y + (-15 if above else 41):.1f}" text-anchor="middle" '
                 f'fill="var(--ink-2)" font-size="11">'
                 f'{esc(p["kt"])} kt &#183; {esc(p["nm"])} nm &#183; ${p["payout"]//1000}k</text>')
    return "\n".join(g) + "</svg>", pts

def watch_headline(w: dict | None) -> tuple[str, str]:
    """What the watch can be said to hold, at exactly the strength its records support."""
    if not w:
        return ("", "")
    n = w.get("n_objects")
    assoc = w.get("association")
    if assoc and assoc.get("stated"):
        second = (f"{n} objects &middot; NHC names {esc(assoc['invest'])} in this area&rsquo;s "
                  f"outlook heading")
    elif assoc:
        second = (f"{n} objects &middot; {esc(assoc['invest'])} inside D1 polygon &middot; "
                  f"containment only")
    else:
        second = f"{n} objects"
    return ("Frozen before outcome", second)


def hero_tiles(pts: list, w: dict | None) -> str:
    """Three objects, each answering what happened and what is not knowable from it."""
    tiles = []
    for p in pts:
        tiles.append(
            f'<a class="tile" href="{esc(p["slug"])}/">'
            f'<div class="tname">{esc(p["name"])}</div>'
            f'<div class="tstate">Settled &middot; public cell unknown</div>'
            f'<div class="tfig"><b>${p["payout"] // 1000}k</b> &middot; {esc(p["kt"])} kt '
            f'&middot; {esc(p["nm"])} nm</div>'
            f'</a>')
    if w:
        state, second = watch_headline(w)
        tiles.append(
            f'<a class="tile" href="genesis-watch/">'
            f'<div class="tname">Pacific Genesis Watch</div>'
            f'<div class="tstate">{esc(state)}</div>'
            f'<div class="tfig">{second}</div>'
            f'</a>')
    return "".join(tiles)

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
    cmp_svg, cmp_pts = comparison_figure(recs)
    tiles = hero_tiles(cmp_pts, w)
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
 <header class="hero"><div>
  <h1>Reopen the evidence behind a storm decision or trigger.</h1>
  <p class="lede">Two parametric events settled in the 2026 Pacific season, and one watch
  frozen before its outcome is known. Every observation below is public. Neither payout can be
  traced to a 2026 contract cell, because the schedule and the zone polygons are not published
  &mdash; and this record says so rather than closing the gap with an inference.</p>
 </div></header>
 <div class="tiles">{tiles}</div>
</div>

<div class="finding"><div class="wrap">
 <h2>Millibar does not infer a 2026 contract term from a payout.</h2>
 <p>The 2024 fact sheet says payouts are calculated from officially reported wind and proximity
 to a core zone. The 2026 schedule, zone polygons, designated observation source and wind
 definition are not public. So the observations are reported exactly as the official products
 state them, and the step between them is left unexplained &mdash; because the public record
 does not explain it.</p>
</div></div>

<div class="wrap">
<section class="compare"><div class="sec-head"><div class="plate">Two events<small>One axis pair</small></div><div>
 <h2>Two official observations. Two known payouts. One step the public record cannot account for.</h2>
 <p>Both points are the closest approach of the <b>operational working best track</b> &mdash; one
 basis, the same quantity for each event, read from each record&rsquo;s own manifest. The Lala record
 separately documents a 70 kt / 21 nm figure from the advisory track; that is a different basis
 and it stays on its own page rather than being mixed into this comparison.</p></div></div>
 <div class="cmp-grid">
  <figure class="cmp-fig">{cmp_svg}
   <figcaption>Faint horizontal lines are the wind rows of the <b>2024 TNC fact sheet &mdash;
   historical terms, not assumed for 2026</b>. The ladder&rsquo;s other axis is <em>zone</em>, and a
   zone is a polygon, not a distance. It is not drawn, because the 2026 polygons are not
   published and plotting them against nautical miles would be this page inventing the geometry
   the record refuses to infer. The missing axis is the finding.</figcaption>
  </figure>
  <div class="cmp-note">
   <h3>What the figure supports</h3>
   <ul><li>Both winds and both distances are official, on one stated basis.</li>
    <li>Both payouts are as the policyholder published them.</li>
    <li>The 2024 wind rows are public, so they are drawn &mdash; faintly, and as history.</li></ul>
   <h3>What it does not</h3>
   <ul><li>No 2026 payout cell is identified for either event.</li>
    <li>No reason is offered for the $100,000 step.</li>
    <li>No zone boundary is drawn, estimated or implied.</li></ul>
   <p><span class="status">Not reconstructable from public 2026 terms</span></p>
  </div>
 </div>
</section>
</div>

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
 <p class="counts">Across the {len(recs)} settled events listed above: <b>{total_products}
 archived official products</b> and <b>{total_sources} hashed inputs</b>. A rebuild of either
 record is byte-identical to what is published here, and that is checked rather than claimed.</p>
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
