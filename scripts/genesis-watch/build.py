"""Render the Pacific Genesis Watch surface from the committed snapshot sequence.

ONE COMPACT INSTITUTIONAL SURFACE, not a weather dashboard. It answers, for each object NHC
is watching: what the official state IS, where, what NHC says about motion and expectation,
what the archive can say as historical evidence, what is NOT YET KNOWABLE, and what would
have to happen next for any of that to change.

WHAT IT WILL NOT DRAW

  * A track. None exists for a pre-genesis disturbance. A formation-area polygon is not a
    forecast cone and is labelled as such everywhere it appears.
  * A probability of its own. NHC's is the only one on the page, in NHC's own words.
  * A GIS 0% where the product printed "near 0 percent". The text is authoritative; the GIS
    value is shown beside it, as a disagreement, not in place of it.
  * A regeneration rate without a denominator.

Every value is read from a committed record. The page computes nothing.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import contract as C   # noqa: E402

OUT = C.ROOT / "docs" / "risk" / "genesis-watch"

LIFECYCLE = ["OUTLOOK", "INVEST_GUIDANCE", "DEPRESSION", "NAMED", "OFFICIAL_FORECAST",
             "OBSERVATION", "POST_SEASON"]
LIFECYCLE_LABEL = {
    "OUTLOOK": "Outlook", "INVEST_GUIDANCE": "Invest / guidance", "DEPRESSION": "Depression",
    "NAMED": "Named cyclone", "OFFICIAL_FORECAST": "Official forecast",
    "OBSERVATION": "Observation", "POST_SEASON": "Post-season record",
}

E = html.escape


def esc(v) -> str:
    return E(str(v)) if v is not None else "—"


def polygon_svg(geom: dict | None, w: int = 300, h: int = 150) -> str:
    """The formation-area polygon, at a locator scale, labelled for what it is.

    Drawn because "where" is one of the questions the surface has to answer and prose alone
    does not answer it. Drawn SMALL and without a heading, a centre marker or a time axis,
    because every one of those would make an outlook polygon read like a cone.
    """
    if not geom or not geom.get("areas"):
        return '<p class="nil">No polygon: the GIS join was refused for this object.</p>'
    rings = geom["areas"]["coordinates"]
    pts = [p for r in rings for p in r]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    sx = (w - 8) / max(x1 - x0, 1e-6)
    sy = (h - 8) / max(y1 - y0, 1e-6)
    s = min(sx, sy)
    ox = 4 + ((w - 8) - (x1 - x0) * s) / 2
    oy = 4 + ((h - 8) - (y1 - y0) * s) / 2
    body = []
    for r in rings:
        d = " ".join(f"{ox + (x - x0) * s:.1f},{oy + (y1 - y) * s:.1f}" for x, y in r)
        body.append(f'<polygon points="{d}" fill="#DCE8EE" stroke="#2E6E8E" stroke-width="1.2"/>')
    pt = geom.get("points")
    if pt and pt.get("coordinates"):
        px, py = pt["coordinates"]
        body.append(f'<circle cx="{ox + (px - x0) * s:.1f}" cy="{oy + (y1 - py) * s:.1f}" '
                    f'r="2.4" fill="#10202B"/>')
    return (f'<svg viewBox="0 0 {w} {h}" width="100%" role="img" '
            f'aria-label="NHC formation-area polygon. Not a forecast cone.">'
            + "".join(body) + "</svg>"
            + '<p class="cap">NHC formation-area polygon, this outlook’s own GIS geometry. '
              '<b>Not a forecast cone.</b> No official track exists for this object; the dot is '
              'the polygon’s published centroid, not a cyclone centre.</p>')


def lifecycle_rail(life: dict) -> str:
    cells = []
    for k in LIFECYCLE:
        v = (life or {}).get(k)
        state = "reached" if v else "null"
        note = esc(v) if v else "not reached"
        cells.append(f'<li class="{state}"><span class="lk">{LIFECYCLE_LABEL[k]}</span>'
                     f'<span class="lv">{note}</span></li>')
    return ('<ol class="rail">' + "".join(cells) + "</ol>"
            + '<p class="cap">The common lifecycle. <b>Not every object occupies every state, '
              'and a state never reached is a fact about the object, not a gap in the record.</b></p>')


def atlas_block(obj_id: str, atlas: dict) -> str:
    entry = next((o for o in (atlas or {}).get("objects", [])
                  if o.get("millibar_object_id") == obj_id), None)
    if not entry:
        return '<p class="nil">No Atlas state recorded for this object in this snapshot.</p>'
    c = entry.get("cohort") or {}
    out = []
    if not c.get("available"):
        out.append(f'<p class="refuse">REFUSED — {esc(c.get("refusal"))}</p>')
    else:
        d = c.get("definition") or {}
        out.append(
            '<dl class="kv">'
            f'<dt>Cohort</dt><dd>{esc(d.get("kind"))}, radius {esc(d.get("radius_km"))} km, '
            f'month {esc((d.get("season_months") or [None])[0])}</dd>'
            f'<dt>n</dt><dd>{esc(c.get("n"))}</dd>'
            f'<dt>Effective sample size</dt><dd>{esc(round(c.get("effective_sample_size") or 0, 1))}</dd>'
            f'<dt>Sufficient</dt><dd>{"yes" if c.get("sufficient") else "NO — below the minimum sample"}</dd>'
            "</dl>")
        rates = [(b, r) for b, r in (c.get("intensity_rates") or {}).items()
                 if r.get("rate") is not None]
        if rates:
            def _row(b, r):
                ci = r.get("ci95")
                ci_txt = f"{ci[0] * 100:.0f}\u2013{ci[1] * 100:.0f}%" if ci else "\u2014"
                return (f"<tr><td>{E(b.upper())}</td>"
                        f"<td class='n'>{r['count']}/{r['n_storms']}</td>"
                        f"<td class='n'>{r['rate'] * 100:.0f}%</td>"
                        f"<td class='n'>{ci_txt}</td></tr>")
            rows = "".join(_row(b, r) for b, r in rates)
            out.append('<table class="rates"><thead><tr><th>Reached</th><th class="n">n</th>'
                       '<th class="n">Rate</th><th class="n">95% interval</th></tr></thead>'
                       f"<tbody>{rows}</tbody></table>")
        out.append(f'<p class="cap"><b>Historical evidence, not a forecast.</b> {esc(c.get("interpretation"))}</p>')

    ident = entry.get("identity") or {}
    if ident.get("regeneration_rate") == "REFUSED":
        out.append(f'<p class="refuse">REGENERATION RATE REFUSED — {esc(ident.get("refusal"))}</p>')
    elif ident.get("lineage_preserved"):
        out.append(f'<p class="cap">{esc(ident.get("lineage_preserved"))}</p>')
    return "".join(out)


def object_card(o: dict, atlas: dict) -> str:
    p48, p7 = o.get("formation_prob_48h") or {}, o.get("formation_prob_7d") or {}

    def prob_row(label: str, p: dict) -> str:
        dis = p.get("text_gis_disagreement")
        extra = ""
        if dis:
            extra = (f'<div class="dis">GIS attribute prints <b>{esc(dis.get("gis"))}</b>. '
                     f'The text stands: <b>{esc(dis.get("text"))}</b>. The GIS value is carried, '
                     f'not displayed in its place.</div>')
        return (f'<div class="prob"><span class="pl">{E(label)}</span>'
                f'<span class="pv">{esc(p.get("official_text"))}</span>{extra}</div>')

    also = o.get("also_described_in") or []
    also_html = ""
    if also:
        bits = []
        for a in also:
            d = a.get("disagreements_with_primary")
            bits.append(f'{esc(a.get("product"))} describes the same disturbance'
                        + (f' — <b>disagrees on {esc(", ".join(d))}</b>' if d else ", in agreement")
                        + f'. Matched on {esc(a.get("matched_on"))}.')
        also_html = f'<p class="cap">{" ".join(bits)}</p>'

    refusals = "".join(f"<li>{esc(r)}</li>" for r in (o.get("refusals") or []))
    nyk = "".join(f"<li>{esc(x)}</li>" for x in (o.get("not_yet_knowable") or []))
    geom = o.get("geometry")
    pt = ((geom or {}).get("points") or {}).get("coordinates")
    where = (f'{abs(pt[1]):.1f}°{"N" if pt[1] >= 0 else "S"} '
             f'{abs(pt[0]):.1f}°{"W" if pt[0] < 0 else "E"}') if pt else "—"

    return f"""
<article class="obj">
  <header>
    <div class="oid">{esc(o.get("millibar_object_id"))}{(f'<span class="tag">{E(o["test"])} TEST</span>' if o.get("test") else '<span class="tag new">NEW OBJECT · NO TEST ASSIGNED</span>')}</div>
    <h2>{esc(o.get("nhc_name"))}</h2>
    <p class="idnote">{esc(o.get("id_note"))} GTWO area {esc(o.get("nhc_gtwo_area_number"))} —
      {esc(o.get("nhc_area_number_note"))}</p>
  </header>

  <section><h3>NHC state</h3>
    <p class="state">{esc(o.get("classification"))}</p>
    {prob_row("Formation, 48 h", p48)}
    {prob_row("Formation, 7 d", p7)}
  </section>

  <section><h3>Where</h3>
    <p class="where">{E(where)}</p>
    {polygon_svg(geom)}
  </section>

  <section><h3>Motion / expectation, in NHC&rsquo;s words</h3>
    <p class="quote">{esc(o.get("official_description"))}</p>
    {also_html}
  </section>

  <section><h3>Atlas evidence</h3>
    {atlas_block(o.get("millibar_object_id"), atlas)}
  </section>

  <section><h3>Not yet knowable</h3>
    <ul class="nyk">{nyk}</ul>
    <ul class="refusals">{refusals}</ul>
  </section>

  <section><h3>Next state change</h3>
    {lifecycle_rail(o.get("lifecycle"))}
  </section>
</article>"""


def changes_since(prev: dict, cur: dict) -> list[dict]:
    """What moved between two decision states. Reported, never scored.

    This is the prospective-verification ledger the watch exists to accumulate: probabilities,
    geometry, wording, designation, and the objects that appeared or left. It compares only
    values that are already committed in both records, and it says nothing about whether a
    change was right -- that is a later question, answered against what actually happened, and
    it is not a prediction contest either way.
    """
    out = []
    pi = {o["millibar_object_id"]: o for o in prev.get("objects", [])}
    ci = {o["millibar_object_id"]: o for o in cur.get("objects", [])}

    for oid, o in ci.items():
        if oid not in pi:
            out.append({"object": oid, "kind": "APPEARED", "detail":
                        f"{o.get('nhc_name')} — {o.get('identity_basis')}"})
            continue
        p = pi[oid]
        for horizon, key in (("48 h", "formation_prob_48h"), ("7 d", "formation_prob_7d")):
            a = (p.get(key) or {}).get("official_text")
            b = (o.get(key) or {}).get("official_text")
            if a != b:
                out.append({"object": oid, "kind": f"FORMATION {horizon}",
                            "detail": f"{a} \u2192 {b}"})
        if (p.get("nhc_name") or "") != (o.get("nhc_name") or ""):
            out.append({"object": oid, "kind": "NHC NAME",
                        "detail": f"{p.get('nhc_name')} \u2192 {o.get('nhc_name')}"})
        if (p.get("official_description") or "") != (o.get("official_description") or ""):
            out.append({"object": oid, "kind": "WORDING",
                        "detail": "NHC\u2019s description changed; both are preserved verbatim "
                                  "in their own records"})
        pg = ((p.get("geometry") or {}).get("points") or {}).get("coordinates")
        cg = ((o.get("geometry") or {}).get("points") or {}).get("coordinates")
        if pg and cg and (round(pg[0], 2), round(pg[1], 2)) != (round(cg[0], 2), round(cg[1], 2)):
            out.append({"object": oid, "kind": "GEOMETRY",
                        "detail": f"polygon centroid {abs(pg[1]):.1f}\u00b0N {abs(pg[0]):.1f}\u00b0W "
                                  f"\u2192 {abs(cg[1]):.1f}\u00b0N {abs(cg[0]):.1f}\u00b0W"})
        for lk, label in (("DEPRESSION", "designation"), ("NAMED", "name"),
                          ("INVEST_GUIDANCE", "invest / guidance")):
            if (p.get("lifecycle") or {}).get(lk) != (o.get("lifecycle") or {}).get(lk):
                out.append({"object": oid, "kind": "LIFECYCLE",
                            "detail": f"{label}: {(p.get('lifecycle') or {}).get(lk)} \u2192 "
                                      f"{(o.get('lifecycle') or {}).get(lk)}"})

    for oid, o in pi.items():
        if oid not in ci:
            out.append({"object": oid, "kind": "NO LONGER CARRIED",
                        "detail": f"{o.get('nhc_name')} is not in this outlook. That is the "
                                  f"product\u2019s statement, not a judgement about the system."})
    return out


# ---------------------------------------------------------------------------------------
# THE SHARED PACIFIC PLATE.
#
# One camera, three disturbances, so a reader can compare them instead of reconciling three
# unrelated thumbnails. Everything drawn here comes from a committed record: the polygons and
# the disturbance points are the GTWO geometry the snapshot froze, the invest positions are
# the ATCF and High Seas products that own them, and the coastline is the repository's
# registered primitive, used as geographic reference and nothing else.
#
# WHAT IS DELIBERATELY NOT DRAWN. No track: none exists before genesis. No cone: a formation
# polygon is not one. No shaded probability field: NHC's formation chance is a number in a
# sentence, and painting it across a polygon would invent a spatial distribution NHC did not
# publish. No analog density surface: the archive's evidence is a COUNT, and a count is not a
# probability. Probabilities are printed as text, analogs as n.
# ---------------------------------------------------------------------------------------
PLATE_LON0, PLATE_LON1 = -162.0, -100.0
PLATE_LAT0, PLATE_LAT1 = 5.0, 25.0
PLATE_COASTS = ("mexico.geojson", "central_america.geojson", "hawaii.geojson")
INVEST_LABEL = "EP98"
# A label that must sit near an outline gets a halo in the plate background colour.
HALO = ('paint-order="stroke" stroke="var(--soft)" stroke-width="3.2" '
        'stroke-linejoin="round" ')


def _coast_rings():
    """Registered coastline primitives, as plain rings. Geographic reference only."""
    import json as _j
    out = []
    base = C.ROOT / "data" / "genesis-archive" / "coastlines"
    for name in PLATE_COASTS:
        p = base / name
        if not p.is_file():
            continue
        for ft in _j.loads(p.read_text()).get("features", []):
            g = ft.get("geometry") or {}
            cs = g.get("coordinates") or []
            polys = [cs] if g.get("type") == "Polygon" else cs
            for poly in polys:
                if poly and poly[0]:
                    out.append(poly[0])
    return out


def _dms(lat, lon):
    return f"{abs(lat):.1f}{'N' if lat >= 0 else 'S'} {abs(lon):.1f}{'W' if lon < 0 else 'E'}"


def pacific_plate(objects, atlas_objs, invest, assoc, w=880, h=284):
    sx = w / (PLATE_LON1 - PLATE_LON0)
    sy = h / (PLATE_LAT1 - PLATE_LAT0)
    X = lambda lo: (lo - PLATE_LON0) * sx          # noqa: E731
    Y = lambda la: (PLATE_LAT1 - la) * sy          # noqa: E731

    g = [f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
         f'font-family="IBM Plex Mono, Menlo, monospace" font-size="12" role="img" '
         f'aria-label="One East Pacific camera showing the three official NHC formation '
         f'polygons this watch is following, with the invest positions that two official '
         f'products place inside the western area.">']

    # graticule
    g.append('<g stroke="var(--rule)" stroke-width="1" opacity=".55">')
    for lo in range(int(PLATE_LON0), int(PLATE_LON1) + 1, 10):
        g.append(f'<line x1="{X(lo):.1f}" y1="0" x2="{X(lo):.1f}" y2="{h}"/>')
    for la in range(int(PLATE_LAT0), int(PLATE_LAT1) + 1, 5):
        g.append(f'<line x1="0" y1="{Y(la):.1f}" x2="{w}" y2="{Y(la):.1f}"/>')
    g.append('</g><g fill="var(--mute)" font-size="10.5">')
    for lo in range(int(PLATE_LON0), int(PLATE_LON1) + 1, 10):
        # The last tick sits on the frame, so it is anchored inward rather than allowed
        # to run off the plate. A label that leaves the viewBox is clipped, not small.
        _edge = X(lo) > w - 40
        g.append(f'<text x="{(X(lo) - 3) if _edge else (X(lo) + 3):.1f}" y="{h-5}" '
                 f'text-anchor="{"end" if _edge else "start"}">{abs(lo)}\u00b0W</text>')
    for la in range(int(PLATE_LAT0) + 5, int(PLATE_LAT1) + 1, 5):
        g.append(f'<text x="3" y="{Y(la)-3:.1f}">{la}°N</text>')
    g.append('</g>')

    # land, as reference
    g.append('<g fill="var(--ink)" opacity=".18">')
    for ring in _coast_rings():
        pts = " ".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in ring
                       if PLATE_LON0 - 8 < x < PLATE_LON1 + 8 and PLATE_LAT0 - 8 < y < PLATE_LAT1 + 8)
        if pts.count(",") > 2:
            g.append(f'<polygon points="{pts}"/>')
    g.append('</g>')

    # THE THREE OFFICIAL POLYGONS. They overlap heavily, so each outline gets its own dash and
    # carries its own label INSIDE the shape -- a label floating at the disturbance point binds
    # to the dot, not to the outline, and with three overlapping areas that is ambiguous.
    DASH = ("", "7 4", "2 3")
    for i, o in enumerate(objects):
        geom = (o.get("geometry") or {})
        rings = (geom.get("areas") or {}).get("coordinates") or []
        label_at = None
        for ring in rings:
            pts = " ".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in ring)
            g.append(f'<polygon points="{pts}" fill="var(--accent)" fill-opacity=".10" '
                     f'stroke="var(--accent)" stroke-width="1.5" '
                     f'stroke-dasharray="{DASH[i % len(DASH)]}"/>')
            xs = [x for x, _ in ring]
            ys = [y for _, y in ring]
            if label_at is None or min(xs) < label_at[0]:
                label_at = (min(xs), sum(ys) / len(ys))
        if label_at:
            g.append(f'<text x="{X(label_at[0]) + 8:.1f}" y="{Y(label_at[1]) + 4:.1f}" '
                     f'fill="var(--accent)" font-size="12.5" font-weight="600" ' + HALO + f'>'
                     f'{esc(o["millibar_object_id"].replace("PGW-2026-", ""))}</text>')
        pt = (geom.get("points") or {}).get("coordinates")
        if pt:
            g.append(f'<circle cx="{X(pt[0]):.1f}" cy="{Y(pt[1]):.1f}" r="3.2" '
                     f'fill="var(--accent)"/>')

    # THE INVEST, FROM EACH PRODUCT THAT OWNS A POSITION. The peers sit within a degree of each
    # other, so two labels at two crosses overlap into noise. Both crosses are drawn; one
    # callout names both, and neither is averaged into a single "position".
    marks = []
    if assoc:
        peers = assoc.get("invest_position_peers") or {}
        for key, label in (("atcf", "ATCF b-deck"), ("high_seas", "High Seas Forecast")):
            p = peers.get(key)
            if p:
                marks.append((p["position"], label))
    elif invest:
        f = invest["invest"]["latest_fix"]
        marks.append((f["position"], "ATCF b-deck"))

    plotted = []
    for pos, label in marks:
        m = re.match(r"([\d.]+)N\s+([\d.]+)W", pos)
        if not m:
            continue
        la, lo = float(m.group(1)), -float(m.group(2))
        x, y = X(lo), Y(la)
        plotted.append((x, y, pos, label))
        g.append(f'<g stroke="var(--warn)" stroke-width="2.4">'
                 f'<line x1="{x-5.5:.1f}" y1="{y-5.5:.1f}" x2="{x+5.5:.1f}" y2="{y+5.5:.1f}"/>'
                 f'<line x1="{x-5.5:.1f}" y1="{y+5.5:.1f}" x2="{x+5.5:.1f}" y2="{y-5.5:.1f}"/></g>')
    # NO TEXT ON THE PLATE FOR THESE. The peers sit within a degree of each other and
    # directly on D1's boundary, where any label -- haloed or not -- is read through an
    # outline and a fill. The crosses stay; the positions are named in the legend below,
    # where they are legible and still unmistakably two separate official products.
    g.append("</svg>")
    return "\n".join(g)


def plate_peers(assoc, invest) -> str:
    """Both official positions, named under the plate rather than crowded onto it."""
    rows = []
    if assoc:
        peers = assoc.get("invest_position_peers") or {}
        for key in ("atcf", "high_seas"):
            p = peers.get(key)
            if p:
                rows.append((p["position"], p["source"], p.get("valid")))
    elif invest:
        f = invest["invest"]["latest_fix"]
        rows.append((f["position"], invest["invest"]["source"]["file"], f.get("valid")))
    if not rows:
        return ""
    items = "".join(
        f'<li><span class="mono">{esc(pos)}</span> &middot; {esc(src)}'
        + (f' &middot; <span class="mono">{esc(valid)}</span>' if valid else "") + '</li>'
        for pos, src, valid in rows)
    return (f'<div class="peers"><b>&times; Invest {INVEST_LABEL}</b>, as placed by '
            f'{len(rows)} official products:<ul>{items}</ul>'
            f'<span class="cap">Carried as peers. Neither is averaged into the other, and '
            f'no position is plotted except from the product that owns it.</span></div>')


# THE THREE QUESTIONS. A test label is the watch's own word for what a disturbance is being
# used to answer, and the line beside it is that question in plain words. The mapping is keyed
# to a label the RECORDS carry -- an unknown label falls through as itself rather than being
# dropped or guessed at.
QUESTION = {
    "HORIZON": "How early is a watch worth anything?",
    "IDENTITY": "Is this the same system as before?",
    "EXPOSURE CLOCK": "How long until this matters to a coastline?",
    "CONTINUITY": "Does anything carry over when NHC renames an area?",
}


def atlas_by_stage(entries: list, records: list, snaps: list) -> dict:
    """For each snapshot, the Atlas cohort it is accompanied by, keyed by object.

    A snapshot either carries its own Atlas state or has one APPENDED against it, and the two
    are not interchangeable: 0001's was appended hours later and says so. Either way the state
    is found through the ledger rather than by position.
    """
    out = {}
    for sid, snap in snaps:
        atlas = snap.get("atlas_state")
        if not atlas or atlas.get("status"):
            atlas = next((r.get("atlas_state") for e, r in zip(entries, records)
                          if r.get("appends_to") == sid
                          and r.get("schema", "").startswith(
                              "millibar.pacific-genesis-watch.atlas-append")), None)
        objs = (atlas or {}).get("objects") or []
        out[sid] = {(o.get("object_id") or o.get("millibar_object_id")): o for o in objs}
    return out


def pct_token(p: dict | None) -> str | None:
    """The percentage AS THE PRODUCT PRINTED IT, never a number re-derived from it.

    Two traps sit in this one line. "near 0 percent" is a LABEL at the bottom of NHC's scale
    and not the integer zero, so it is carried as the words it is. And the first snapshot in
    this sequence carries no parsed percentage at all -- only the official text -- so a band
    built on `official_pct` would silently print nothing for the earlier of the two states it
    exists to compare. The token is read out of the text and printed verbatim.
    """
    t = (p or {}).get("official_text") or ""
    tok = re.sub(r"\s*percent\s*$", "", t.split(",")[-1].strip()).strip()
    return tok or None


def finding_band(snaps: list, stages: dict) -> str:
    """The three questions as DATA, not as three essays.

    Every figure is read from the frozen records: the percentages are NHC's own, as printed,
    at the first and latest state; the counts are the archive's cohort sizes at those same
    states; the identity lines are what the record says about continuity. No line here
    restates a number sitting next to it.
    """
    first_id, first = snaps[0]
    last_id, last = snaps[-1]
    first_by = {o.get("millibar_object_id"): o for o in first.get("objects", [])}
    tests = {o.get("millibar_object_id"): o.get("test")
             for _s, snap in snaps for o in snap.get("objects", []) if o.get("test")}

    cols = []
    for o in last.get("objects", []):
        oid = o["millibar_object_id"]
        prior = first_by.get(oid)
        test = tests.get(oid)
        lines = []

        if o.get("continuity_asserted") == "none":
            # A NEW IDENTIFIER INHERITS NOTHING, and the band must not hand it a test label
            # through the back door. CONTINUITY is the open question this object raises, which
            # is not the same thing as a test it carries -- so the label resolves to the
            # question and the column says outright that no test came with it.
            test = None
            lines = [("verdict", "NEW IDENTIFIER"), ("verdict", "NO INHERITED TEST")]
        else:
            if prior is not None:
                a, b = (pct_token(prior.get("formation_prob_48h")),
                        pct_token(prior.get("formation_prob_7d")))
                c, d = (pct_token(o.get("formation_prob_48h")),
                        pct_token(o.get("formation_prob_7d")))
                if None not in (a, b, c, d):
                    lines.append(("prob", f"{esc(a)}/{esc(b)} &rarr; {esc(c)}/{esc(d)}"))
            ident = (stages.get(last_id, {}).get(oid) or {}).get("identity") or {}
            na = (stages.get(first_id, {}).get(oid) or {}).get("cohort") or {}
            nb = (stages.get(last_id, {}).get(oid) or {}).get("cohort") or {}
            if ident.get("regeneration_rate") == "REFUSED":
                # The sharper refusal takes the column. A generic "rate refused" beside it
                # would be the same fact twice; the cohort counts are on this object's card.
                lines.append(("verdict", "REGENERATION RATE REFUSED"))
            else:
                if na.get("n") is not None and nb.get("n") is not None:
                    lines.append(("n", f"n {esc(na['n'])} &rarr; {esc(nb['n'])}"))
                if na.get("sufficient") is not None and nb.get("sufficient") is not None:
                    lines.append(("verdict",
                                  "RATE SUPPORTED &rarr; REFUSED"
                                  if na["sufficient"] and not nb["sufficient"]
                                  else "RATE REFUSED" if not nb["sufficient"]
                                  else "RATE SUPPORTED"))

        label = test or "CONTINUITY"
        body = "".join(f'<div class="fl {cls}">{txt}</div>' for cls, txt in lines)
        cols.append(f'<div class="fcol">'
                    f'<div class="fh">{esc(oid.replace("PGW-2026-", ""))}'
                    f'<span> &mdash; {esc(label)}</span></div>'
                    f'<div class="fq">{esc(QUESTION.get(label, ""))}</div>{body}</div>')
    return "".join(cols)


def band_note(snaps: list) -> str:
    """The one fact the band's new-identifier column rests on and cannot state inside itself."""
    _, first = snaps[0]
    _, last = snaps[-1]
    last_ids = {o.get("millibar_object_id") for o in last.get("objects", [])}
    new = [o for o in last.get("objects", []) if o.get("continuity_asserted") == "none"]
    retired = [o for o in first.get("objects", [])
               if o.get("millibar_object_id") not in last_ids]
    if not (new and retired):
        return ""
    r, n = retired[0], new[0]
    return (f'<p class="bnote">NHC renamed the area between the two states. '
            f'<span class="mono">{esc(r.get("millibar_object_id"))}</span> carried '
            f'{esc(r.get("test"))}; <span class="mono">{esc(n.get("millibar_object_id"))}</span> '
            f'was minted in its place and inherits none of it.</p>')


def evidence_line(assoc) -> str:
    """One sentence. The containment-to-stated transition, and what it does not do."""
    if not assoc:
        return ""
    ev = (assoc.get("association") or {}).get("evidence") or {}
    head = (ev.get("heading_verbatim") or "").rstrip(":")
    # THE CITATION IS NOT DECORATION. Saying only that an outlook "labeled the area" leaves
    # the strength of the claim to the reader; the record's own finding is that NHC states the
    # association itself, and scripts/check-risk-doorway.mjs fails this page if the record says
    # that and the page does not.
    return (f'<p class="eline">EP982026 was first associated by containment; a later NHC '
            f'outlook explicitly labeled the area &ldquo;{esc(head)}.&rdquo; Earlier records '
            f'remain unchanged. <span class="cite">NHC states this association itself, in '
            f'{esc(ev.get("product"))} '
            f'<span class="mono">{esc(ev.get("wmo_header"))}</span>.</span></p>')


def invest_section(invest: dict | None) -> str:
    """The invest state, or the refusal that stood in every record before it."""
    if not invest:
        return ('<p class="cap">No invest has been designated for any object in this sequence. '
                'Model guidance stays refused, because naming an invest without a source would '
                'be a guess about which disturbance it belongs to.</p>')
    g = (invest.get("atlas_state") or {}).get("model_guidance") or {}
    a = invest.get("association") or {}
    t = invest.get("timestamps") or {}
    guidance = ("admissible for this object only, under its mandatory label"
                if g.get("available") else "refused")
    return (
        '  <dl class="kv wide">\n'
        f'    <dt>ATCF identifier</dt><dd class="mono">{esc(invest["invest"]["atcf_id"])}</dd>\n'
        f'    <dt>Designated INVEST at</dt><dd class="mono">{esc(t.get("invest_designated_at"))}</dd>\n'
        f'    <dt>Acquired at</dt><dd class="mono">{esc(t.get("source_acquired_at"))}</dd>\n'
        f'    <dt>Association</dt><dd>{esc(a.get("object"))}, by containment</dd>\n'
        '    <dt>NHC states this association</dt><dd>'
        + ("yes" if a.get("nhc_states_this_association") else "no") + '</dd>\n'
        f'    <dt>Model guidance</dt><dd>{guidance}</dd>\n'
        '  </dl>\n'
        f'  <p class="cap">{esc(a.get("why_not_stronger"))}</p>\n'
        f'  <p class="cap">{esc(a.get("if_rejected"))}</p>\n'
        '  <p class="cap"><b>What changed for the Atlas.</b> '
        f'{esc((invest.get("atlas_state") or {}).get("what_changed_for_the_atlas"))}</p>')


def build() -> Path:
    """THE LEDGER IS THE AUTHORITY ON IDENTITY, not a field inside a record.

    Snapshot 0001 arrived frozen and carries no `record_id` of its own -- only
    `snapshot_seq: 1`. Its identifier is the one the ledger attested when it was committed.
    Reading identity out of the records themselves means every record must agree on a field
    the first one does not have, which is how a hardcoded "0001" ends up in a renderer.
    """
    ledger = C.read_ledger()
    entries = ledger["entries"]
    records = C.load_all()
    by_id = {e["record_id"]: r for e, r in zip(entries, records)}

    snaps = [(e["record_id"], r) for e, r in zip(entries, records)
             if r.get("schema", "").startswith("millibar.pacific-genesis-watch.snapshot")]
    if not snaps:
        raise SystemExit("no snapshot records committed")
    latest_id, latest = snaps[-1]

    atlas = latest.get("atlas_state")
    atlas_src = ""
    if atlas and atlas.get("status") != "NOT CAPTURED IN THIS SNAPSHOT":
        atlas_note = ("Atlas state captured with this source state, against the repository as "
                      "it then stood.")
    else:
        appended_id, appended = next(
            ((e["record_id"], r) for e, r in zip(entries, records)
             if r.get("appends_to") == latest_id
             and r.get("schema", "").startswith("millibar.pacific-genesis-watch.atlas-append")),
            (None, None))
        if appended is None:
            atlas = None
            atlas_note = (f"No Atlas state has been appended for record {esc(latest_id)}. The "
                          f"snapshot records that its own Atlas state was not captured, and "
                          f"nothing is reconstructed for it.")
        else:
            atlas = appended.get("atlas_state")
            atlas_note = (f'Atlas state for this snapshot is the separately timestamped record '
                          f'{esc(appended_id)}, captured later than the NHC source issuance. It '
                          f'is not contemporaneous and does not claim to be.')
            # The Atlas time belongs to a DIFFERENT record from the one committed above, and
            # can postdate it. Saying which record it came from is what keeps the table from
            # reading as one object's timeline.
            atlas_src = f" <span class=\"src\">(record {esc(appended_id)})</span>"

    ts = latest.get("timestamps") or {}
    issued = ts.get("source_issued_at") or (latest.get("products", {}).get("TWOEP", {}) or {}).get("issued")
    acquired = ts.get("source_acquired_at") or latest.get("captured_at_utc")
    committed = next((e["committed_at_utc"] for e in entries
                      if e["record_id"] == latest_id), None)

    seq_rows = "".join(
        f'<tr><td class="mono">{esc(e["record_id"])}</td><td>{esc(e["kind"])}</td>'
        f'<td class="mono">{esc(e["committed_at_utc"])}</td>'
        f'<td class="mono sha">{esc(e["manifest_sha256"][:16])}…</td></tr>'
        for e in entries)

    # THE TEST LABEL IS RESOLVED FROM HISTORY, NOT GUESSED. An object that was being followed
    # under a test keeps it; a newly identified object has none, and the page says so rather
    # than borrowing the label of the object it replaced in the product's ordering.
    test_by_id = {}
    for r in records:
        for o in r.get("objects", []):
            if o.get("test"):
                test_by_id[o.get("millibar_object_id")] = o["test"]
    for o in latest.get("objects", []):
        if not o.get("test"):
            o["test"] = test_by_id.get(o.get("millibar_object_id"))
    objects = "".join(object_card(o, atlas) for o in latest.get("objects", []))

    # The invest designation, resolved through the LEDGER like every other identity here.
    invest = next((r for e, r in zip(entries, records)
                   if e.get("kind") == "invest-designation"), None)
    assoc = next((r for e, r in zip(entries, records) if e.get("kind") == "association"), None)

    # THE PLATE'S OBJECTS CARRY THEIR TEST, resolved the way the brief resolves it: a test is
    # assigned once and travels with the identifier, so the latest snapshot's copy of an object
    # does not repeat it. The frozen records are not mutated -- these are shallow copies.
    first_tests = {o.get("millibar_object_id"): o.get("test")
                   for _sid, _snap in snaps for o in _snap.get("objects", []) if o.get("test")}
    plate_objects = [{**o, "test": o.get("test") or first_tests.get(o.get("millibar_object_id"))}
                     for o in latest.get("objects", [])]
    plate_atlas = {(o.get("object_id") or o.get("millibar_object_id")): o
                   for o in ((atlas or {}).get("objects") or [])}
    plate_svg = pacific_plate(plate_objects, plate_atlas, invest, assoc)
    plate_peers_html = plate_peers(assoc, invest)
    stages = atlas_by_stage(entries, records, snaps)
    band_html = finding_band(snaps, stages)
    band_note_html = band_note(snaps)
    evidence_html = evidence_line(assoc)
    invest_html = invest_section(invest)

    prev_snap = snaps[-2][1] if len(snaps) > 1 else None
    if prev_snap is None:
        changes_html = ('<p class="nil">This is the first decision state in the sequence; there '
                        'is nothing to compare it against.</p>')
    else:
        deltas = changes_since(prev_snap, latest)
        rows = "".join(f'<tr><td class="mono">{esc(d["object"])}</td>'
                       f'<td>{esc(d["kind"])}</td><td>{esc(d["detail"])}</td></tr>'
                       for d in deltas)
        changes_html = (
            f'<p class="cap">Against record {esc(snaps[-2][0])}. Reported, never scored: whether '
            f'a change was right is a later question answered against what actually happened, '
            f'and success does not require a storm to form.</p>'
            + (f'<table class="seq"><thead><tr><th>Object</th><th>What</th><th>Change</th></tr>'
               f'</thead><tbody>{rows}</tbody></table>'
               if deltas else '<p class="nil">Nothing this comparison covers changed.</p>'))
    global_refusals = "".join(f"<li>{esc(r)}</li>" for r in ((atlas or {}).get("refusals") or []))

    page = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pacific Genesis Watch — Millibar</title>
<meta name="description" content="Frozen decision states for pre-genesis Pacific disturbances: the authoritative NHC source state, the Storm Atlas state captured alongside it, and what is not yet knowable. Not a forecast.">
<link rel="canonical" href="https://alecmessino.github.io/category-alpha/risk/genesis-watch/">
<style>{STYLE}</style>
</head><body>
<div class="wrap">
<header class="mast">
  <div><b>Millibar</b> <span>/ Risk Evidence</span></div>
  <div><a href="../lowell-2026/">Lowell 2026</a></div>
</header>

<div class="titlerow"><h1>Pacific Genesis Watch</h1>
  <span class="sub">Frozen decision states</span><span class="nf">Not a forecast</span></div>

<section class="lede">
  <h2 class="hl">Three disturbances.<br>Three different questions.<br>One frozen decision state.</h2>
  <div class="plate-frame">{plate_svg}</div>
  <p class="pcap">NHC&rsquo;s own formation polygons, and the invest fixes that fall inside one of
    them. <b>Not a forecast cone.</b> No official cyclone track is rendered, because none exists.</p>
  <div class="band">{band_html}</div>
  {band_note_html}
  {evidence_html}
</section>

<p class="recnote"><b>Formation probability is not impact probability.</b> It is the chance a
  tropical cyclone forms, not the chance anything is affected if one does. It holds for every
  object below.</p>

{objects}

<section class="state">
  <h3>This decision state</h3>
  <dl class="kv wide">
    <dt>Record</dt><dd class="mono">{esc(latest_id)}</dd>
    <dt>Source issued at</dt><dd class="mono">{esc(issued)}</dd>
    <dt>Source acquired at</dt><dd class="mono">{esc(acquired)}</dd>
    <dt>Atlas computed at{atlas_src}</dt><dd class="mono">{esc((atlas or {}).get("atlas_computed_at_utc"))}</dd>
    <dt>Snapshot committed at</dt><dd class="mono">{esc(committed)}</dd>
    <dt>Active tropical cyclones</dt><dd>{esc((latest.get("global_state") or {}).get("active_tropical_cyclones"))}</dd>
    <dt>Pre-genesis objects</dt><dd>{esc((latest.get("global_state") or {}).get("pacific_pre_genesis_objects"))}</dd>
  </dl>
  <p class="cap">Four timestamps, kept apart. {atlas_note}</p>
</section>

<section class="state">
  <h3>The invest, as its own record stated it at designation</h3>
  {invest_html}
  {plate_peers_html}
</section>

<section class="state">
  <h3>What changed since the previous decision state</h3>
  {changes_html}
</section>

<section class="state">
  <h3>What this watch refuses to say</h3>
  <ul class="refusals big">{global_refusals}</ul>
</section>

<section class="state">
  <h3>The sequence</h3>
  <p class="cap">Append-only. A committed record is never edited; a correction appends a
    supersession record naming what it supersedes. Enforced by
    <span class="mono">scripts/check-genesis-watch-append-only.mjs</span> and
    <span class="mono">scripts/genesis-watch/tests/</span>, not by this sentence.</p>
  <table class="seq"><thead><tr><th>Record</th><th>Kind</th><th>Committed (UTC)</th>
    <th>Integrity hash</th></tr></thead><tbody>{seq_rows}</tbody></table>
  <p class="cap">The plate&rsquo;s coastline is the repository&rsquo;s registered Natural Earth
    primitive, geographic reference only. No polygon is shaded by a probability: NHC publishes a
    number in a sentence, not a spatial distribution.</p>
</section>

<footer>
  <p>Independent research by Alec Messino. Not a weather forecast, loss estimate, claims
     determination, or insurance advice. Official products remain the property of NOAA/NWS.</p>
  <p class="mono"><a href="https://alecmessino.github.io/category-alpha/risk/genesis-watch/">https://alecmessino.github.io/category-alpha/risk/genesis-watch/</a></p>
</footer>
</div></body></html>
"""
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(page, encoding="utf-8")
    return OUT / "index.html"


STYLE = """
:root{--ink:#10202B;--ink2:#3B5260;--mute:#6F8590;--rule:#C6D2D4;--bg:#fff;--soft:#F3F6F6;
      --accent:#2E6E8E;--warn:#B8571F}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font:15px/1.5 "IBM Plex Sans","Helvetica Neue",Arial,sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:24px 16px 56px}
.mast{display:flex;justify-content:space-between;align-items:baseline;
      border-bottom:1px solid var(--rule);padding-bottom:8px;font-size:13px;color:var(--mute)}
.mast b{color:var(--ink);font-weight:600}
.mast a{color:var(--accent)}
.titlerow{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px;margin:13px 0 0}
h1{font-size:21px;font-weight:600;letter-spacing:-.01em;margin:0}
.sub{margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
h2{font-size:20px;font-weight:500;margin:2px 0 4px;letter-spacing:-.01em}
h3{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);
   margin:16px 0 6px;padding-top:8px;border-top:1px solid var(--rule)}
section.state{margin:22px 0}
.obj{border:1px solid var(--rule);padding:16px;margin:0 0 22px;background:var(--bg)}
.obj>header{border-bottom:2px solid var(--ink);padding-bottom:8px}
.oid{font:12px/1 "IBM Plex Mono",Menlo,monospace;color:var(--mute);letter-spacing:.06em}
.tag{margin-left:10px;background:var(--ink);color:#fff;padding:2px 6px;font-size:10px;letter-spacing:.1em}
.tag.new{background:var(--warn)}
.idnote{margin:4px 0 0;font-size:12px;color:var(--mute)}
.state p.state{margin:0 0 6px}
.prob{margin:0 0 6px}
.pl{display:inline-block;min-width:130px;font-size:12px;color:var(--mute)}
.pv{font-size:17px;font-weight:500}
.dis{margin:4px 0 0 130px;border-left:2px solid var(--warn);padding-left:8px;font-size:12px;color:var(--ink2)}
.where{font:16px/1.3 "IBM Plex Mono",Menlo,monospace;margin:0 0 6px}
.quote{margin:0;padding-left:10px;border-left:2px solid var(--rule);color:var(--ink2);font-size:14px}
/* THE FIRST VIEWPORT. One headline, one plate, one band of findings, one sentence of
   evidence. Everything that explains how the page is built sits below it, not beside it. */
.lede{margin:12px 0 30px;border-top:2px solid var(--ink);padding-top:14px}
/* The three sentences break where the markup breaks them, never where a measure runs out. */
.hl{font-size:34px;line-height:1.12;font-weight:500;letter-spacing:-.028em;margin:0 0 13px;
    max-width:none}
.plate-frame{border:1px solid var(--rule);background:var(--soft);padding:6px}
.plate-frame svg{display:block;width:100%;height:auto;max-width:none;border:0;background:none}
.pcap{font-size:12px;color:var(--mute);margin:7px 0 0;max-width:86ch;line-height:1.45}
.pcap b{color:var(--ink)}
.nf{padding:2px 7px;border:1px solid var(--warn);color:var(--warn);text-transform:uppercase;
    letter-spacing:.12em;font-size:10px;white-space:nowrap}
.band{display:grid;grid-template-columns:repeat(3,1fr);margin:20px 0 0;
      border-top:2px solid var(--ink);border-bottom:1px solid var(--rule)}
.fcol{padding:12px 20px 11px 0;border-right:1px solid var(--rule)}
.fcol+.fcol{padding-left:20px}
.fcol:last-child{border-right:0}
.fh{font:600 12px/1.2 "IBM Plex Mono",Menlo,monospace;letter-spacing:.07em;margin:0 0 5px}
.fh span{color:var(--mute);font-weight:400}
.fq{font-size:12.5px;color:var(--mute);margin:0 0 12px;line-height:1.3;min-height:2.6em}
.fl{font:500 19px/1.2 "IBM Plex Mono",Menlo,monospace;margin:0 0 4px;letter-spacing:-.015em}
.fl.n{font-size:15px;color:var(--ink2)}
.fl.verdict{font:600 11px/1.35 "IBM Plex Sans","Helvetica Neue",Arial,sans-serif;
            letter-spacing:.09em;color:var(--warn);margin:7px 0 0}
.fl.verdict+.fl.verdict{margin-top:2px}
.bnote{font-size:12px;color:var(--mute);margin:9px 0 0;max-width:88ch;line-height:1.45}
.eline{font-size:14.5px;line-height:1.5;margin:13px 0 0;max-width:80ch;
       border-left:3px solid var(--accent);padding-left:13px}
.eline .cite{display:block;font-size:11.5px;color:var(--mute);margin-top:3px}
.peers{margin:14px 0 0;font-size:13px}
.peers ul{margin:6px 0 4px;padding-left:18px}
.peers li{margin:2px 0}
.peers .cap{display:block;color:var(--mute);font-size:11.5px}
@media (max-width:760px){
  .hl{font-size:25px;max-width:none}
  .band{grid-template-columns:1fr}
  .fcol{border-right:0;border-bottom:1px solid var(--rule);padding:13px 0}
  .fcol+.fcol{padding-left:0}
  .fcol:last-child{border-bottom:0}
  .fq{min-height:0;margin-bottom:8px}
}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:2px 14px;margin:0 0 8px;font-size:13px}
.kv.wide{grid-template-columns:max-content 1fr}
.kv dt{color:var(--mute)}
.kv dd{margin:0}
.cap{font-size:12px;color:var(--mute);margin:6px 0 0;line-height:1.45}
.recnote{font-size:13px;color:var(--ink2);margin:26px 0 14px;padding-top:14px;border-top:2px solid var(--ink);max-width:86ch}
.nil{font-size:13px;color:var(--mute);font-style:italic;margin:4px 0}
.refuse{border-left:2px solid var(--warn);padding-left:8px;font-size:12.5px;color:var(--ink2);margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}
th{text-align:left;font-weight:500;color:var(--mute);font-size:11px;letter-spacing:.06em;
   text-transform:uppercase;border-bottom:1px solid var(--rule);padding:4px 6px 4px 0}
td{padding:4px 6px 4px 0;border-bottom:1px solid var(--rule)}
td.n,th.n{text-align:right}
.sha{color:var(--mute)}
.src{font-size:11px;color:var(--mute);font-weight:400}
.mono{font-family:"IBM Plex Mono",Menlo,monospace}
ul.nyk,ul.refusals{margin:4px 0;padding-left:18px;font-size:13px}
ul.refusals{color:var(--ink2)}
ul.refusals.big{font-size:13.5px}
ol.rail{list-style:none;margin:6px 0;padding:0;display:grid;
        grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:1px;background:var(--rule)}
ol.rail li{background:var(--soft);padding:7px 8px}
ol.rail li.reached{background:#DCE8EE}
ol.rail li.null{background:var(--soft);color:var(--mute)}
.lk{display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.lv{display:block;font-size:11px;margin-top:2px;font-family:"IBM Plex Mono",Menlo,monospace}
svg{display:block;border:1px solid var(--rule);background:var(--soft);max-width:320px}
footer{border-top:2px solid var(--ink);margin-top:28px;padding-top:10px;font-size:12px;color:var(--mute)}
footer a{color:var(--mute)}
@media (max-width:560px){.dis{margin-left:0}.pl{min-width:0;display:block}}
"""

if __name__ == "__main__":
    print(build())
