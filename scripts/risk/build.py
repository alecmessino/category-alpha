import json, re, math, hashlib
from datetime import datetime, timedelta
from pathlib import Path
from shapely.geometry import shape, Point
from shapely.ops import nearest_points
from tec import *

OUT = ROOT / "docs" / "risk" / "lowell-2026"
# brief.html is the PDF's PRINT SOURCE, not a page of the site. It renders at Letter with
# a fixed 8.5x11in body and would be a broken surface if served, so it is built outside
# docs/ and only Chromium ever opens it.
BUILD = Path(__file__).parent / ".build"
ASSETS = Path(__file__).parent / "assets"
LIVE_URL = "https://alecmessino.github.io/category-alpha/risk/lowell-2026/"
recs = load_all()
R = {r.record_id: r for r in recs}

# ---------- geometry ----------
ISLANDS, polys, COAST_PROV = load_coastline()
NIIHAU = ISLANDS["Niihau"]
KAUAI = ISLANDS["Kauai"]


def coast_nm(lat, lon, poly):
    q = nearest_points(poly, Point(lon, lat))[0]
    return gc_nm((lat, lon), (q.y, q.x))


def track(adv):
    pts = [r for r in recs if r.product == "TCM" and r.advisory == adv and r.variant == "regular"
           and (r.kind == "official_forecast" or r.record_id.endswith("-cur"))]
    return sorted(pts, key=lambda r: r.valid)


def t_(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# A closest-approach MINIMUM CAN BE FLAT. On a near-tangent track the profile sits within
# a few metres of its minimum across several samples, so the reported TIME is a tie-break on
# a 15-minute grid, not a measurement to the minute. TIE_NM is the band inside which samples
# are treated as tied, and the width of that band in minutes is carried into the manifest so
# a geometry refresh cannot silently move a printed timestamp without the tie showing.
TIE_NM = 0.05


def closest(adv, poly):
    pts = track(adv)
    prof = []
    for a, b in zip(pts, pts[1:]):
        ta, tb = t_(a.valid), t_(b.valid)
        n = int((tb - ta).total_seconds() / 900)
        for i in range(n + 1):
            u = i / n
            la, lo = a.lat + (b.lat - a.lat) * u, a.lon + (b.lon - a.lon) * u
            prof.append((coast_nm(la, lo, poly), ta + timedelta(seconds=900 * i),
                         a.vmax_kt + (b.vmax_kt - a.vmax_kt) * u))
    d0 = min(p[0] for p in prof)
    tied = [p[1] for p in prof if p[0] - d0 <= TIE_NM]
    best = min(prof, key=lambda p: p[0])
    return best + ((max(tied) - min(tied)).total_seconds() / 60,)


ADVS = [str(i) for i in range(31, 52) if i != 34]
ca = []
for a in ADVS:
    d, t, v, tie = closest(a, NIIHAU)
    dk, tk, _, _ = closest(a, KAUAI)
    cur = R[[k for k in R if k.startswith(f"TCM{a}-") and k.endswith("-cur")][0]]
    ca.append({"advisory": a, "issued": cur.issued, "nominal_cycle": cur.nominal_cycle,
               "niihau_nm": round(d), "niihau_time": t.strftime("%d/%H%MZ"), "wind_kt": round(v / 5) * 5,
               "kauai_nm": round(dk),
               "niihau_time_tie_window_min": round(tie)})

carq_all = sorted([r for r in recs if r.product == "ATCF-CARQ"], key=lambda r: r.valid)
op_best = None
op_prof = []
for a, b in zip(carq_all, carq_all[1:]):
    ta, tb = t_(a.valid), t_(b.valid)
    for i in range(25):
        u = i / 24
        la, lo = a.lat + (b.lat - a.lat) * u, a.lon + (b.lon - a.lon) * u
        d = coast_nm(la, lo, NIIHAU)
        op_prof.append((d, ta + (tb - ta) * u))
        if op_best is None or d < op_best[0]:
            op_best = (d, ta + (tb - ta) * u, a.vmax_kt + (b.vmax_kt - a.vmax_kt) * u, coast_nm(la, lo, KAUAI))
_op_tied = [t for d, t in op_prof if d - op_best[0] <= TIE_NM]
OP_CA = {"niihau_nm": round(op_best[0]), "time": op_best[1].strftime("%d/%H%MZ"),
         "wind_kt": round(op_best[2] / 5) * 5, "kauai_nm": round(op_best[3]),
         "time_tie_window_min": round((max(_op_tied) - min(_op_tied)).total_seconds() / 60)}
PASS_TIME = op_best[1]

# ---------- residual ----------
HD = bearing((R["TCA46-obs"].lat, R["TCA46-obs"].lon), (R["TCA46-p6"].lat, R["TCA46-p6"].lon))
HB = "bearing from TCA 46 observed position (07/1500Z) to its +6 h position (07/2100Z), centred on 18Z"
res_late = residual(R["TCA46-p3"], R["TCM47-072047-prior"], HD, HB)
res_early = residual(R["TCA46-p3"], R["TCP46A-071744"], HD, HB)
env_late = rounding_envelope(R["TCA46-p3"], R["TCM47-072047-prior"], HD)
env_early = rounding_envelope(R["TCA46-p3"], R["TCP46A-071744"], HD)
lead = []
for r in sorted([r for r in recs if r.valid == "2026-09-07T18:00Z" and r.kind != "observation"],
                key=lambda r: (-r.lead_h, r.product)):
    x = residual(r, R["TCM47-072047-prior"], HD, HB)
    lead.append({"id": r.record_id, "product": r.product, "advisory": r.advisory, "lead_h": r.lead_h,
                 "issued": r.issued, "pos": r.position_original, **{k: x[k] for k in ("along_nm", "cross_nm", "total_nm")}})

# ---------- WSP ----------
wsp_path = RAW / "PWSCP4.202609071451.txt"
wsp = {}
for line in wsp_path.read_text().splitlines():
    m = re.match(r"(NIIHAU|BARKING SANDS|LIHUE)\s+(34|50|64)\s.*\(\s*(\d+)\)\s*$", line)
    if m:
        wsp[(m.group(1), m.group(2))] = int(m.group(3))

# ---------- manifests ----------
# EVERY DECLARED INPUT IS HASHED, AND EVERY HASHED INPUT IS READ.
#
# The Rev 3 hand-off hashed raw/ne_10m_land.geojson -- absent from the package, never read
# for geometry -- and left the geometry it DID read out of its own register entirely. Both
# directions are gated now: declared_inputs() is the single list the build opens, the
# register is built from it, and scripts/check-risk-provenance.mjs fails the build if any
# entry is missing, unreadable, or not referenced by the manifest.
PRODUCT_OF = {"TCM": "TCM", "TCP": "TCP", "TCA": "TCA (ICAO aviation)", "TCD": "TCD (discussion)",
              "PWS": "PWS (wind speed probabilities)"}
sources = {}
for r in recs:
    sources.setdefault(r.source_file, {"file": r.source_file, "sha256": r.source_sha256, "product": r.product})
for f in declared_inputs():
    if f.name in sources:
        continue
    if f.name.startswith("TCD"):
        prod = PRODUCT_OF["TCD"]
    elif f.name.startswith("PWS"):
        prod = PRODUCT_OF["PWS"]
    elif f.name == "aep122026.dat":
        prod = "ATCF a-deck (CARQ records used)"
    elif f.name == "hawaii.geojson":
        prod = "Natural Earth 10m coastline, shared repository primitive"
    elif f.name == "SOURCES.json":
        prod = "Coastline provenance register"
    else:
        prod = "raw product"
    sources[f.name] = {"file": f.name, "sha256": sha256(f), "product": prod,
                       "path": str(f.relative_to(ROOT))}

# THE TIME MODEL, PROVEN FROM THE ARCHIVE RATHER THAN ASSERTED.
#
# The discussion companion to each forecast/advisory prints the forecast table with its
# lead labels attached (INIT 07/1500Z ... 12H 08/0000Z). Those labels reconcile with the
# explicit UTC valid times if and only if the lead origin is the nominal synoptic cycle.
# reconcile_lead_labels checks BOTH hypotheses on every discussion in the archive and
# requires the cycle origin to hold while the initial-position origin fails, so the model
# is discriminated by the bytes instead of being adopted by convention.
lead_proof = []
for tcd in sorted(RAW.glob("TCDCP4.*.txt")):
    r = reconcile_lead_labels(tcd)
    if r.get("ok") is not None:
        lead_proof.append({"source_file": tcd.name, **{k: r[k] for k in
                          ("transmitted", "cycle", "init_valid", "from_cycle_ok",
                           "from_init_ok", "labels_are_nhc_lead_set", "ok")}})
TIME_MODEL = {
    "statement": "nominal_cycle, issued and valid are stored separately and never derived "
                 "from one another; forecast lead = valid - nominal_cycle.",
    "retired_model": "valid - issued, i.e. the 15Z release treated as forecast hour zero.",
    "proof": "Discussion lead labels reconcile with explicit UTC valid times only against "
             "the nominal cycle. Checked on every discussion in the archive.",
    "discussions_checked": len(lead_proof),
    "discussions_confirming_cycle_origin": sum(1 for r in lead_proof if r["ok"]),
    "worked_example": next((r for r in lead_proof if r["source_file"] == "TCDCP4.202609071452.txt"), None),
}
assert lead_proof and all(r["ok"] for r in lead_proof), "time-model proof failed on an archived discussion"

manifest = {
    "schema": "millibar.trigger-evidence-record/0.1",
    "event": "EP122026 Lowell",
    "canonical_url": LIVE_URL,
    "contract_manifest": {
        "contract_id": "TNC-HI-REEF (public view)",
        "policyholder": "The Nature Conservancy",
        "broker": "WTW", "insurer": "Munich Re Group company (after a competitive placement)",
        "known_public": {
            "trigger_variable": "officially reported wind speed of active and former hurricanes in the insured area (2024 fact sheet)",
            "threshold": ">=50 kt in the core zone (policyholder releases 2024-2026)",
            "structure_2024": "1 core zone, 3 buffer zones; 555,137 sq km",
            "limits_2024_25": {"minimum": 200000, "per_event": 1000000, "annual": 2000000},
            "minimum_2026": 200000,
            "payout_ladder_2024": "HISTORICAL — NOT ASSUMED FOR 2026",
        },
        "unknown": ["2026 zone polygons", "2026 payout schedule and limits", "designated observation source",
                    "wind definition applied", "treatment of intermediates, corrections and post-season revisions"],
    },
    "event_manifest": {"time_model": TIME_MODEL,
                       "records": [asdict(r) for r in recs], "sources": list(sources.values()),
                       "geometry": {"file": "data/genesis-archive/coastlines/hawaii.geojson",
                                    "selection": "islands selected by properties.name, not by centroid position",
                                    "provenance": COAST_PROV,
                                    "closest_approach_sample_seconds": 900,
                                    "closest_approach_tie_band_nm": TIE_NM}},
    "decision_manifest": {
        "settlement": {"payout_observed": 300000, "status": "NOT_RECONSTRUCTABLE_FROM_PUBLIC_TERMS",
                       "reason": "2026 contract terms not public; payout cell not inferred from amount"},
        "operational": {"authoritative_18z_forecast_found": True, "authoritative_18z_forecast": "TCA46-p3",
                        "residual_status": "PUBLISHED",
                        "residual_vs_revised_fix": res_late, "envelope_revised": env_late,
                        "residual_vs_first_reported_fix": res_early, "envelope_first": env_early,
                        "lead_series_valid_18z": lead, "closest_approach_by_advisory": ca,
                        "operational_closest_approach_niihau": OP_CA,
                        "wsp_adv46_cumulative_120h": {f"{k[0]} {k[1]}kt": v for k, v in wsp.items()},
                        "retired": ["0.0 nm along-track / +13.6 nm cross-track (15Z treated as forecast hour zero; untraceable forecast position). WITHDRAWN -- must not render on any public surface; enforced by scripts/check-retired-residual.mjs.",
                                    "Rev 2 WSP figures 70%/26% (24 h cumulative mislabelled as full-period)",
                                    "Rev 1-2 chart (positions not to scale)"]},
    },
}
OUT.mkdir(parents=True, exist_ok=True)
BUILD.mkdir(exist_ok=True)
(OUT / "lowell-2026.manifest.json").write_text(json.dumps(manifest, indent=1))

# ---------- chart ----------
def chart(w, h, lon0, lon1, lat0, lat1, advs, rings, fs, labels_every=1, faint=()):
    sx = w / (lon1 - lon0)
    sy = h / (lat1 - lat0)
    X = lambda lo: (lo - lon0) * sx
    Y = lambda la: (lat1 - la) * sy
    g = [f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Mono, Menlo, monospace" font-size="{fs}" role="img" aria-label="Hurricane Lowell official track and forecast vintages near the main Hawaiian Islands">']
    g.append('<g stroke="var(--rule,#C6D2D4)" stroke-width="1">')
    for lo in range(math.ceil(lon0), math.floor(lon1) + 1):
        if lo % 2 == 0:
            g.append(f'<line x1="{X(lo):.1f}" y1="0" x2="{X(lo):.1f}" y2="{h}"/>')
    for la in range(math.ceil(lat0), math.floor(lat1) + 1):
        if la % 2 == 0:
            g.append(f'<line x1="0" y1="{Y(la):.1f}" x2="{w}" y2="{Y(la):.1f}"/>')
    g.append('</g><g fill="var(--mute,#6F8590)">')
    for lo in range(math.ceil(lon0), math.floor(lon1) + 1):
        if lo % 2 == 0:
            g.append(f'<text x="{X(lo)+4:.1f}" y="{h-6}">{-lo}°W</text>')
    for la in range(math.ceil(lat0), math.floor(lat1) + 1):
        if la % 2 == 0 and 16 < Y(la) < h - 24:
            g.append(f'<text x="4" y="{Y(la)-4:.1f}">{la}°N</text>')
    g.append('</g>')
    for p in polys:
        pts = " ".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in p.exterior.coords)
        g.append(f'<polygon points="{pts}" fill="var(--ink,#10202B)" opacity=".82"/>')
    for name, la, lo in (("Niʻihau", 21.35, -161.55), ("Kauaʻi", 22.35, -159.8), ("Oʻahu", 21.85, -158.3), ("Maui", 21.2, -156.6), ("Hawaiʻi", 19.6, -154.9)):
        if lon0 < lo < lon1:
            g.append(f'<text x="{X(lo):.1f}" y="{Y(la):.1f}" fill="var(--ink-2,#3B5260)">{name}</text>')
    if rings:
        cur = R["TCM46-071451-cur"]
        cx, cy = X(cur.lon), Y(cur.lat)
        kx = sx / (60 * math.cos(math.radians(cur.lat)))
        ky = sy / 60
        for thr, dash in (("34", "2 4"), ("50", "4 3"), ("64", "")):
            ne, se, sw, nw = cur.radii_nm[thr]
            def arc(r, a0, a1):
                ptsx = []
                for i in range(0, 31):
                    a = math.radians(a0 + (a1 - a0) * i / 30)
                    ptsx.append((cx + r * math.sin(a) * kx, cy - r * math.cos(a) * ky))
                return ptsx
            path = arc(ne, 0, 90) + arc(se, 90, 180) + arc(sw, 180, 270) + arc(nw, 270, 360)
            d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in path) + " Z"
            g.append(f'<path d="{d}" fill="none" stroke="var(--chart,#2E6E8E)" stroke-width="1.1" stroke-dasharray="{dash}"/>')
            g.append(f'<text x="{cx + ne*kx*0.72 + 3:.1f}" y="{cy - ne*ky*0.72:.1f}" fill="var(--chart,#2E6E8E)">{thr} kt</text>')
    for adv in faint:
        pts = track(adv)
        g.append('<polyline points="' + " ".join(f"{X(r.lon):.1f},{Y(r.lat):.1f}" for r in pts) +
                 '" fill="none" stroke="var(--chart-soft,#B9D3DF)" stroke-width="1"/>')
    n = len(advs)
    for i, adv in enumerate(advs):
        pts = track(adv)
        op = 0.35 + 0.65 * i / max(1, n - 1)
        g.append(f'<polyline points="' + " ".join(f"{X(r.lon):.1f},{Y(r.lat):.1f}" for r in pts) +
                 f'" fill="none" stroke="var(--chart,#2E6E8E)" stroke-opacity="{op:.2f}" stroke-width="1.8" stroke-dasharray="6 4"/>')
        inside = [r for r in pts if lat0 + 0.6 < r.lat < lat1 - 0.4 and lon0 < r.lon < lon1]
        anchor = min(inside, key=lambda r: abs(r.lat - (lat0 + (lat1 - lat0) * 0.55)))
        g.append(f'<text x="{X(anchor.lon)-6:.1f}" y="{Y(anchor.lat)+4:.1f}" text-anchor="end" fill="var(--chart,#2E6E8E)" fill-opacity="{max(op,0.6):.2f}">Adv {adv}</text>')
    carq = sorted([r for r in recs if r.product == "ATCF-CARQ" and "2026-09-04" <= r.valid <= "2026-09-09"], key=lambda r: r.valid)
    carq = [r for r in carq if lat0 < r.lat < lat1 and lon0 < r.lon < lon1]
    g.append('<polyline points="' + " ".join(f"{X(r.lon):.1f},{Y(r.lat):.1f}" for r in carq) +
             '" fill="none" stroke="var(--ink,#10202B)" stroke-width="2.2"/>')
    for r in carq:
        g.append(f'<circle cx="{X(r.lon):.1f}" cy="{Y(r.lat):.1f}" r="2.6" fill="var(--ink,#10202B)"/>')
        if r.valid[11:13] == "00":
            g.append(f'<text x="{X(r.lon)+6:.1f}" y="{Y(r.lat)+4:.1f}" fill="var(--ink,#10202B)">{r.valid[8:10]}/00Z {int(r.vmax_kt)} kt</text>')
    g.append("</svg>")
    return "\n".join(g)


CHART_WEB = chart(760, 820, -165.2, -155.2, 13.0, 23.8, ["38", "42", "46", "49"], True, 12,
                  faint=[a for a in ADVS if a not in ("38", "42", "46", "49") and int(a) >= 36])
CHART_PDF = chart(660, 450, -164.6, -157.2, 16.0, 24.2, ["38", "42", "46", "49"], False, 12.5)

# ---------- shared fragments ----------
def fnum(v):
    return f"{v:+.1f}".replace("-", "−")


cadef = {c["advisory"]: c for c in ca}
PIVOTS = ["38", "42", "46", "49"]
pivot_line = " → ".join(f"Adv {a} {cadef[a]['niihau_nm']} nm" for a in PIVOTS)


def lead_rows():
    rows = []
    for x in lead:
        rows.append(f'<tr><td>{x["product"]} {x["advisory"]}</td><td>{x["issued"][8:10]}/{x["issued"][11:13]}{x["issued"][14:16]}Z</td>'
                    f'<td class="num">{x["lead_h"]:.0f} h</td><td class="mono pl">{x["pos"]}</td><td class="num">{fnum(x["along_nm"])}</td>'
                    f'<td class="num">{fnum(x["cross_nm"])}</td><td class="num">{x["total_nm"]:.1f}</td></tr>')
    return "\n".join(rows)


def ca_rows():
    mx = max(c["niihau_nm"] for c in ca)
    out = []
    for c in ca:
        after = t_(c["issued"]) > PASS_TIME
        if after:
            out.append(f'<tr class="after"><td>Adv {c["advisory"]}</td><td>{c["nominal_cycle"][8:10]}/{c["nominal_cycle"][11:13]}Z</td>'
                       f'<td>{c["issued"][8:10]}/{c["issued"][11:13]}{c["issued"][14:16]}Z</td><td colspan="5" class="small">Issued after the operational closest approach; storm already past</td></tr>')
            continue
        out.append(f'<tr><td>Adv {c["advisory"]}</td><td>{c["nominal_cycle"][8:10]}/{c["nominal_cycle"][11:13]}Z</td>'
                   f'<td>{c["issued"][8:10]}/{c["issued"][11:13]}{c["issued"][14:16]}Z</td>'
                   f'<td class="barcell"><span class="hb" style="width:{100*c["niihau_nm"]/mx:.0f}%"></span></td>'
                   f'<td class="num">{c["niihau_nm"]} nm</td><td class="num">{c["niihau_time"]}</td><td class="num">{c["wind_kt"]} kt</td><td class="num">{c["kauai_nm"]} nm</td></tr>')
    out.append(f'<tr class="optrack"><td colspan="3"><b>Operational track</b> (ATCF, interpolated)</td><td></td>'
               f'<td class="num"><b>{OP_CA["niihau_nm"]} nm</b></td><td class="num">{OP_CA["time"]}</td><td class="num">{OP_CA["wind_kt"]} kt</td><td class="num">{OP_CA["kauai_nm"]} nm</td></tr>')
    return "\n".join(out)


def chrono_rows():
    rows = []
    sel = [r for r in recs if r.product in ("TCM", "TCP", "TCA") and (r.record_id.endswith("-cur") or r.product == "TCP" or r.record_id.endswith("-obs") or r.record_id.endswith("-prior"))]
    for r in sorted(sel, key=lambda r: (r.valid, r.issued or "", r.product)):
        cls = {"observation": "Observation"}.get(r.kind, r.kind)
        label = {"TCM": "Forecast/Advisory", "TCP": "Public advisory", "TCA": "Aviation advisory"}[r.product]
        if r.variant == "special": label = "Special " + label.lower()
        if r.variant == "intermediate": label = "Intermediate public advisory"
        if r.record_id.endswith("-prior"): label += ", prior-position line"
        note = r.note if ("correction" in r.note or "prior" in r.note) else ""
        if r.record_id.startswith("TCM34S"):
            note = "two transmissions; later one moves the fix 0.1° N and E"
        rows.append(f'<tr><td>{label} {r.advisory}</td><td class="mono">{(r.nominal_cycle or "—")[8:16].replace("T"," ")}</td>'
                    f'<td class="mono">{(r.issued or "—")[8:16].replace("T"," ")}</td><td class="mono">{r.valid[8:16].replace("T"," ")}</td>'
                    f'<td class="mono">{r.position_original}</td><td class="mono">{r.vmax_original or "—"}</td><td>{cls}</td><td class="small">{note}</td></tr>')
    return "\n".join(rows), len(sel)


CHRONO, NCHRONO = chrono_rows()
n_files = len({r.source_file for r in recs if r.product in ("TCM", "TCP", "TCA")})

LADDER = """<tr><td>50 kt</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num core">$200k</td></tr>
<tr><td>64 kt</td><td class="num">—</td><td class="num">—</td><td class="num">$200k</td><td class="num core">$300k</td></tr>
<tr><td>83 kt</td><td class="num">—</td><td class="num">$200k</td><td class="num">$300k</td><td class="num core">$450k</td></tr>
<tr><td>96 kt</td><td class="num">$200k</td><td class="num">$300k</td><td class="num">$450k</td><td class="num core">$600k</td></tr>
<tr><td>113 kt</td><td class="num">$300k</td><td class="num">$450k</td><td class="num">$600k</td><td class="num core">$750k</td></tr>
<tr><td>137 kt</td><td class="num">$450k</td><td class="num">$600k</td><td class="num">$750k</td><td class="num core">$1.0m</td></tr>"""

W = wsp
REG_ROWS = "\n".join(
    f'<tr><td class="mono">{s["file"]}</td><td>{s["product"]}</td><td class="mono small">{s["sha256"][:16]}…</td></tr>'
    for s in sorted(sources.values(), key=lambda s: s["file"]))

CSS_COMMON = (ASSETS / "web.css").read_text()

web = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lowell 2026 — Trigger evidence record · Millibar Risk Evidence</title>
<meta name="description" content="Point-in-time evidence record for the Hawaiʻi reef parametric policy's Lowell payout: what the public record supports, what it cannot reproduce, and what was knowable advisory by advisory.">
<meta property="og:title" content="Lowell 2026 — Trigger evidence record">
<meta property="og:description" content="Independent, reproducible evidence for a parametric tropical-cyclone trigger. Official sources only.">
<meta property="og:type" content="article"><meta property="og:url" content="{LIVE_URL}">
<link rel="canonical" href="{LIVE_URL}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{CSS_COMMON}</style></head><body>
<div class="wrap">
 <div class="mast"><div class="brand">Millibar <span>/ Risk Evidence</span></div>
  <div class="note">Trigger evidence record · Hurricane Lowell (EP12 2026) · Hawaiʻi reef parametric policy · Rev 3, 17 September 2026</div></div>
 <header class="title"><div>
  <h1>Lowell paid $300,000. Here is what the record can and cannot show.</h1>
  <p class="lede">A point-in-time reconstruction of the Hawaiʻi coral-reef parametric policy's second 2026 payout, built from {n_files} official CPHC/NHC products and the policyholder's published terms. Where the public record stops, this record stops with it.</p>
 </div><div class="facts">
  <div><span>Policyholder</span><span>The Nature Conservancy; first US reef policy 2022, redesigned 2024</span></div>
  <div><span>Broker</span><span>WTW</span></div>
  <div><span>Insurer</span><span>Munich Re Group company, after a competitive placement</span></div>
  <div><span>Public trigger</span><span>Officially reported wind of 50 kt or more in the core zone; payout scales with wind and proximity</span></div>
  <div><span>Published 2024–25 limits</span><span>$200k minimum · $1m per event · $2m annual</span></div>
  <div><span>2026 terms</span><span>$200k minimum confirmed by the policyholder. Full schedule, limits and geometry not publicly reproduced.</span></div>
  <div><span>2026 payouts</span><span>Lala $200,000 (21 Aug) · Lowell $300,000 (15 Sep)</span></div>
 </div></header></div>

<div class="finding"><div class="wrap">
 <h2>The public 2026 terms are insufficient to independently reconstruct the $300,000 payout cell.</h2>
 <p>The 2024 fact sheet states that payouts are triggered and calculated from officially reported wind speeds and proximity to the core zone. The 2026 zone geometry, payout schedule, designated observation source and wind definition are not published. <em>Millibar does not infer an undisclosed contract term from an observed payout.</em> Supplied with the schedule, the same evaluator resolves this record deterministically.</p>
</div></div>

<div class="wrap">
<section><div class="sec-head"><div class="plate">Plate A<small>Settlement evidence</small></div><div>
 <h2>What the contract and the official record actually support</h2>
 <p>Settlement evidence answers one question: which official observation, evaluated against which contract version, produced the payout. Forecasts never appear on this plate unless the contract itself settles on them.</p></div></div>
 <div class="grid2"><div>
  <h3>Established from public sources</h3>
  <table>
   <tr><td>Trigger variable</td><td>Officially reported wind speed of active and former hurricanes in the insured area (2024 terms)</td></tr>
   <tr><td>Geometry, 2024 design</td><td>One core zone, three buffer zones; 555,137 sq km covered</td></tr>
   <tr><td>Threshold</td><td>At least 50 kt in the core zone qualifies; higher wind and closer proximity pay more</td></tr>
   <tr><td>Lowell outcome</td><td>$300,000, the second payout in three weeks, routed to the Hawaiʻi Emergency Reef Restoration Network</td></tr>
   <tr><td>Renewal</td><td>Annual. The 2025 renewal was described as unchanged from 2024. No 2026 publication reproducing the schedule has been located.</td></tr>
  </table>
  <div class="unres"><strong>Not available in the public record</strong><ul>
   <li>Georeferenced 2026 zone polygons</li><li>The 2026 wind × zone payout schedule and limits</li>
   <li>Designated observation source and the wind definition applied</li>
   <li>Treatment of intermediate advisories, corrections and post-season revisions</li></ul></div>
  <p style="margin-top:18px"><span class="status">Not reconstructable from public terms</span></p>
 </div><div>
  <h3>Historical contract terms, 2024 fact sheet</h3>
  <p class="small">Context only. Not assumed for 2026. X, Y and Z are buffer zones; I is the core zone.</p>
  <table class="ladder"><thead><tr><th>Wind threshold</th><th class="num">X</th><th class="num">Y</th><th class="num">Z</th><th class="num core">I</th></tr></thead><tbody>{LADDER}</tbody></table>
  <p class="small" style="margin-top:12px">Under the 2024 ladder, $300,000 corresponds to three distinct cells (64 kt in I, 83 kt in Z, 96 kt in Y). The amount alone cannot identify which condition was met, so the 2026 schedule is required rather than inferred.</p>
 </div></div>
</section>

<section><div class="sec-head"><div class="plate">Plate B<small>Operational replay</small></div><div>
 <h2>What a risk desk could have known, advisory by advisory</h2>
 <p>Operational replay answers a different question: what was knowable at each issuance time, with no later information leaking backward. It is evidence of exposure and decision timing, not of settlement. Every regular, special, intermediate, corrected and aviation product from Advisory 31 (4 Sep, 03Z) to Advisory 51 (8 Sep, 21Z) is ingested.</p></div></div>

 <div class="grid-chart"><figure>
  <div class="chart-frame">{CHART_WEB}</div>
  <div class="legend"><span><i class="sw"></i>Operational track, ATCF working best track (6-hourly)</span>
   <span><i class="sw dash"></i>Forecast tracks, Advisories 38, 42, 46, 49 (darker is later)</span>
   <span><i class="sw faint"></i>Other advisory forecasts, 36–50</span></div>
  <figcaption>Plotted to scale on an equirectangular projection. Coastlines: Natural Earth 1:10m land, generalized, not contract geometry. Wind radii are the official quadrant radii (NE/SE/SW/NW, nautical miles) from Forecast/Advisory 46 at 07/1500Z.</figcaption>
 </figure>
 <div>
  <h3>Forecast track distance to the Niʻihau coastline</h3>
  <p class="small">Closest point of each advisory's forecast track to the Natural Earth Niʻihau coastline, with Kauaʻi for comparison. Derived by Millibar: linear interpolation between official forecast points at 15-minute steps. Not an official product.</p>
  <table class="ca"><thead><tr><th>Adv</th><th>Cycle</th><th>Issued</th><th></th><th class="num">Niʻihau</th><th class="num">At</th><th class="num">Wind</th><th class="num">Kauaʻi</th></tr></thead>
  <tbody>{ca_rows()}</tbody></table>
 </div></div>

 <div class="grid2" style="margin-top:40px"><div>
  <h3>Three-hour residual, Advisory 46 at 18Z</h3>
  <p style="margin-bottom:12px"><span class="status ok">Published: authoritative 18Z forecast sourced</span></p>
  <p>The aviation advisory issued with Advisory 46 (TCAPA4, 07/1500Z) carries an official 18Z position interpolated by NHC from its forecast: <span class="mono">N1810 W16217</span>, degrees and minutes, or 18.167N 162.283W. Its nominal cycle is 12Z, so its lead is 6 hours even though the product labels it "+3 HR" from issuance.</p>
  <div class="residual">
   <div><div class="v">{fnum(res_late["along_nm"])} nm</div><div class="l">Along-track. The storm ran behind the forecast.</div></div>
   <div><div class="v">{fnum(res_late["cross_nm"])} nm</div><div class="l">Cross-track, positive to the right of the forecast track.</div></div>
  </div>
  <p class="small">Against the 18Z fix as revised in Advisory 47 and matched by the ATCF working best track (18.0N 162.2W). Reporting precision of ±0.05° spans {fnum(env_late["along_nm"][0])} to {fnum(env_late["along_nm"][1])} nm along and {fnum(env_late["cross_nm"][0])} to {fnum(env_late["cross_nm"][1])} nm across. Against the first-reported 46A fix (18.0N 162.1W) the same forecast gives {fnum(res_early["along_nm"])} nm along and {fnum(res_early["cross_nm"])} nm across. Track direction {res_late["heading_deg"]}°: {HB}. Post-season best track not yet published; these values may change when it is.</p>
  <div class="unres"><strong>Retired</strong><ul>
   <li><b>Withdrawn after a time-base audit:</b> an earlier Millibar figure of 0.0 nm along-track and +13.6 nm cross-track. It treated the 15Z release as forecast hour zero and used a position not traceable to an official product. Its "timing verified" reading does not survive: the storm was behind the forecast track. The forecast lead is measured from the nominal cycle, and the archived discussion's own lead labels are the proof.</li>
   <li>Revision 2 wind-probability figures (70% and 26%), which were 24-hour cumulative values presented as totals.</li>
   <li>The Revision 1–2 chart, whose plotted positions were not to scale.</li></ul></div>
 </div><div>
  <h3>Every official forecast valid at 07/1800Z</h3>
  <p class="small">Same verifying fix and track direction throughout. Positive cross-track means the storm ended up to the right of the forecast track. No cardinal-direction claim is made: right-of-track is defined by the track direction printed beside it, and a separate cardinal decomposition is not computed here.</p>
  <table><thead><tr><th>Product</th><th>Issued</th><th class="num">Lead</th><th class="pl">Position</th><th class="num">Along</th><th class="num">Cross</th><th class="num">Total</th></tr></thead>
  <tbody>{lead_rows()}</tbody></table>
  <p class="small" style="margin-top:10px">Every vintage from 72 hours out placed the 18Z center west of where the storm was. The eastward error narrowed from about 85 nm at 60 hours to about 8 nm at 6 hours.</p>

  <h3 style="margin-top:26px">NHC location wind probabilities, issued with Advisory 46</h3>
  <p class="small">NHC location wind probabilities — not contract payout probabilities. Cumulative, 12Z Mon to 12Z Sat (forecast hours 0–120).</p>
  <div class="prob">
   <span>Niʻihau · 34 kt</span><div class="bar"><i style="width:{W[("NIIHAU","34")]}%"></i><b>{W[("NIIHAU","34")]}%</b></div>
   <span>Niʻihau · 50 kt</span><div class="bar"><i style="width:{W[("NIIHAU","50")]}%"></i><b>{W[("NIIHAU","50")]}%</b></div>
   <span>Niʻihau · 64 kt</span><div class="bar"><i style="width:{W[("NIIHAU","64")]}%"></i><b>{W[("NIIHAU","64")]}%</b></div>
   <span>Barking Sands · 50 kt</span><div class="bar"><i style="width:{W[("BARKING SANDS","50")]}%"></i><b>{W[("BARKING SANDS","50")]}%</b></div>
   <span>Līhuʻe · 34 kt</span><div class="bar"><i style="width:{W[("LIHUE","34")]}%"></i><b>{W[("LIHUE","34")]}%</b></div>
   <span>Līhuʻe · 50 kt</span><div class="bar"><i style="width:{W[("LIHUE","50")]}%"></i><b>{W[("LIHUE","50")]}%</b></div>
  </div>
 </div></div>

 <h3 style="margin-top:40px">Complete official chronology, 4–8 September</h3>
 <p class="small">{NCHRONO} position records from {n_files} products. Times are day and UTC. Nominal cycle, issuance and valid time are stored separately; a forecast's lead is measured from its nominal cycle. Corrections and re-transmissions stay in the lineage beside the version they supersede.</p>
 <div class="scroll"><table class="chrono"><thead><tr><th>Product</th><th>Cycle</th><th>Issued</th><th>Valid</th><th>Position (as issued)</th><th>Wind (as issued)</th><th>Class</th><th>Lineage</th></tr></thead>
 <tbody>{CHRONO}</tbody></table></div>
</section>

<section><div class="sec-head"><div class="plate">The product<small>Trigger Evidence Record</small></div><div>
 <h2>Reopen the evidence behind a storm trigger</h2>
 <p>Each contract gets a machine-readable record: a contract manifest, an event manifest for every official product used, and a decision manifest that replays the evaluation. This page and its one-page brief are renderings of those manifests.</p></div></div>
 <div class="uses">
  <div><h3>Event evidence</h3><p>Reconstruct which official observation, under which contract version and geometry, satisfied a trigger, and state a refusal when a term is missing.</p></div>
  <div><h3>Trigger watch</h3><p>Replay what was knowable at each advisory, with corrections kept and later information never leaking backward.</p></div>
  <div><h3>Renewal evidence</h3><p>Re-run a contract definition across the historical record with exact n/N, intervals, known data-defect windows and explicit refusals.</p></div>
 </div>
 <p style="margin-top:26px;max-width:72ch">Basis risk between a wind trigger and reef damage is inherent to the design and is documented here, not eliminated. What this record reduces are disputes about data, vintage, geometry, units and contract version.</p>
</section>

<section class="register"><div class="sec-head"><div class="plate">Provenance<small>Source register</small></div><div>
 <h2>Every value on this page traces to one of these</h2>
 <p>Official products are archived byte-for-byte and identified by SHA-256. Public documents are cited by publisher and date.</p></div></div>
 <table><thead><tr><th>Source</th><th>Used for</th><th>Class</th></tr></thead><tbody>
  <tr><td>CPHC/NHC Forecast/Advisories 31–51 (incl. special 34), EP122026</td><td>Fixes, intensities, pressures, quadrant wind radii, forecast positions</td><td class="cls">Official</td></tr>
  <tr><td>CPHC/NHC Public Advisories 31–51, intermediates 40A–50A, corrections 45 and 48</td><td>Public-product fixes, intermediate positions, correction lineage</td><td class="cls">Official</td></tr>
  <tr><td>CPHC/NHC ICAO aviation advisories (TCAPA4) with Advisories 31–51</td><td>Authoritative interpolated 18Z forecast position; track direction</td><td class="cls">Official</td></tr>
  <tr><td>CPHC/NHC Wind Speed Probabilities 46 (PWSCP4)</td><td>Location wind probabilities</td><td class="cls">Official</td></tr>
  <tr><td>ATCF public aids, aep122026 (CARQ records)</td><td>Operational working best track, 6-hourly</td><td class="cls">Official, operational</td></tr>
  <tr><td>Natural Earth 1:10m land</td><td>Coastlines and coastline distances</td><td class="cls">Public-domain geometry</td></tr>
  <tr><td>TNC, 2024 Hawaiʻi Reef Insurance fact sheet; 2025 renewal release; Lowell release, 15–16 Sep 2026</td><td>Trigger basis, zone structure, 2024 ladder and limits, 2026 minimum and payouts</td><td class="cls">Policyholder</td></tr>
  <tr><td>WTW releases, Nov 2022 and Feb 2024; Insurance Journal and Insurance Business, Feb 2024 (placement reported as seven bids)</td><td>Broker, insurer, competitive placement</td><td class="cls">Broker, trade press</td></tr>
  <tr><td>Honolulu Star-Advertiser, Yale Climate Connections, ABC7, Sep 2026</td><td>Corroboration of the forecast shift only; no value on this page depends on them</td><td class="cls">Press</td></tr>
  <tr><td>Millibar derivations</td><td>Coastline distances, residual, rounding envelope, track direction</td><td class="cls">Derived</td></tr>
 </tbody></table>
 <details style="margin-top:18px"><summary>Archived files and hashes ({len(sources)})</summary>
 <table><thead><tr><th>File</th><th>Product</th><th>SHA-256</th></tr></thead><tbody>{REG_ROWS}</tbody></table></details>
</section>

<footer><p>Independent research by Alec Messino. Not a weather forecast, loss estimate, claims determination, or insurance advice. Official products remain the property of NOAA/NWS; contract terms remain the property of the parties.</p>
<p>One-page brief: <a href="Millibar-Lowell-2026-Event-Brief.pdf">Millibar-Lowell-2026-Event-Brief.pdf</a> &nbsp;·&nbsp; Machine-readable record: <a href="lowell-2026.manifest.json">lowell-2026.manifest.json</a></p></footer>
</div></body></html>"""

(OUT / "index.html").write_text(web)

BRIEF_CSS = (ASSETS / "brief.css").read_text()
brief = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Lowell 2026 event brief</title><style>{BRIEF_CSS}</style></head>
<body><div class="page">
 <div class="mast"><div><b>Millibar</b> <span>/ Risk Evidence</span></div><div><span>Event brief · Hurricane Lowell, EP12 2026 · Hawaiʻi reef parametric policy · 17 Sep 2026 · Rev 3</span></div></div>
 <h1>Lowell paid $300,000. The public contract record cannot reproduce the payout cell.</h1>
 <p class="lede">A point-in-time reconstruction from official CPHC/NHC products and the policyholder's published terms. Reopen the evidence behind a storm trigger.</p>
 <div class="band"><h2>The 2026 zone geometry, payout schedule, designated observation source and wind definition are not published.</h2>
 <p>The 2024 fact sheet states that payouts are triggered and calculated from officially reported wind speeds and proximity to the core zone. <em>Millibar does not infer an undisclosed contract term from an observed payout.</em> Supplied with the schedule, the same evaluator resolves this brief deterministically.</p></div>
 <div class="cols"><div>
  <h3>A. Established from public sources</h3>
  <table>
   <tr><td class="k">Policyholder</td><td>The Nature Conservancy; first US reef policy 2022, redesigned 2024</td></tr>
   <tr><td class="k">Broker / insurer</td><td>WTW; Munich Re Group company after a competitive placement</td></tr>
   <tr><td class="k">Trigger basis</td><td>Officially reported wind; ≥50 kt in core zone; more wind, closer storm, larger payout</td></tr>
   <tr><td class="k">Published 2024–25 limits</td><td>$200k minimum · $1m per event · $2m annual</td></tr>
   <tr><td class="k">2026</td><td>$200k minimum confirmed. Lala $200,000 (21 Aug) · Lowell $300,000 (15 Sep)</td></tr>
  </table>
  <h3 style="margin-top:6pt">Historical 2024 payout ladder <span class="tag">— not assumed for 2026</span></h3>
  <table><thead><tr><th>Wind</th><th class="num">X</th><th class="num">Y</th><th class="num">Z</th><th class="num core">I (core)</th></tr></thead>{LADDER}</table>
  <p class="cap">$300,000 sits in three distinct 2024 cells; the amount alone cannot identify the condition met.</p>
  <h3 style="margin-top:6pt">B. Missing from the public record</h3>
  <ul><li>Georeferenced 2026 zone polygons</li><li>The 2026 wind × zone payout schedule and limits</li>
   <li>Designated observation source and wind definition</li><li>Treatment of intermediates, corrections and revisions</li></ul>
  <div class="stamp">Not reconstructable from public terms</div>
 </div><div>
  <h3>C. Operational replay: selected official vintages</h3>
  <div class="chart">{CHART_PDF}</div>
  <p class="cap">Solid: operational track. Dashed: Advisories 38, 42, 46, 49 (darker is later). Coastlines Natural Earth 1:10m, not contract geometry. Forecast-track distance to Niʻihau coastline: {pivot_line} (derived). NHC location wind probabilities, not contract payout probabilities, Adv 46: Niʻihau {W[("NIIHAU","50")]}% for 50 kt, {W[("NIIHAU","64")]}% for 64 kt.</p>
  <h3 style="margin-top:6pt">D. Residual, Advisory 46 at 18Z</h3>
  <p class="cap vsrc">Both against NHC's official interpolated 18Z position, aviation advisory 46. Track direction {res_late["heading_deg"]}°.</p>
  <div class="vints">
   <div class="vint">
    <div class="vh">As known at 18Z · Intermediate 46A</div>
    <p class="res"><span class="big">{fnum(res_early["along_nm"])} nm</span> along</p>
    <p class="res"><span class="big">{fnum(res_early["cross_nm"])} nm</span> right-of-track</p>
   </div>
   <div class="vint">
    <div class="vh">Revised at 21Z · Advisory 47</div>
    <p class="res"><span class="big">{fnum(res_late["along_nm"])} nm</span> along</p>
    <p class="res"><span class="big">{fnum(res_late["cross_nm"])} nm</span> right-of-track</p>
   </div>
  </div>
  <p class="peer">Same forecast. Same valid time. The verifying observation changed with the source vintage.</p>
  <p class="cap audit">Earlier Millibar 0.0 nm along-track calculation withdrawn after time-base audit.</p>
 </div></div>
 <div class="foot"><div>
  <p><b>Provenance.</b> CPHC/NHC Forecast/Advisories, Public and Intermediate Advisories, ICAO aviation advisories and Wind Speed Probabilities 31–51 (EP122026) · ATCF public aids · Natural Earth 1:10m · TNC 2024 fact sheet, 2025 renewal and 2026 Lowell release · WTW releases 2022 and 2024.</p>
  <p>Independent research by Alec Messino. Not a weather forecast, loss estimate, claims determination, or insurance advice.</p>
 </div><div>
  <p><b>Full evidence record</b>, with the complete {n_files}-product chronology, manifests and hashes:</p>
  <p>alec.messino@gmail.com</p>
 </div>
 <p class="urlrow"><a class="mono url" href="{LIVE_URL}">{LIVE_URL}</a></p>
 </div>
</div></body></html>"""
(BUILD / "brief.html").write_text(brief)
print(json.dumps({"n_products": n_files, "n_records": len(recs), "chrono_rows": NCHRONO,
                  "res_late": res_late, "res_early": res_early, "pivots": pivot_line,
                  "wsp": {f"{a} {b}": v for (a, b), v in wsp.items()}}, indent=1))
