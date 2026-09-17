"""The Lala 2026 record: its figures and its prose.

Second event, same contract, same machinery. The evaluator is tec.py and the build is
record.py; nothing about this storm is special-cased in either.
"""
import json, re
from datetime import datetime, timedelta
from pathlib import Path
from tec import *
from record import Record, contract_manifest, fnum, t_, TIE_NM, BUILD, ASSETS

REC = Record("lala-2026")
EV = REC.ev
recs, R, polys = REC.recs, REC.R, REC.polys
ISLANDS, COAST_PROV = REC.islands, REC.coast_prov
OUT, LIVE_URL = REC.out, REC.live_url
coast_nm, track, closest = REC.coast_nm, REC.track, REC.closest

# ---------- geometry ----------
# Lala passed the chain from the southeast, so the island that matters is the one it passed
# first and closest. Oahu is carried beside it as the comparison the reader will reach for.
BIG = ISLANDS["Island of Hawaii"]
OAHU = ISLANDS["Oahu"]

ADVS = [str(i) for i in range(1, 21)]
ca = []
for a in ADVS:
    d, t, v, tie = closest(a, BIG)
    do, _, _, _ = closest(a, OAHU)
    cur = R[[k for k in R if k.startswith(f"TCM{a}-") and k.endswith("-cur")][0]]
    ca.append({"advisory": a, "issued": cur.issued, "nominal_cycle": cur.nominal_cycle,
               "hawaii_nm": round(d), "hawaii_time": t.strftime("%d/%H%MZ"), "wind_kt": round(v / 5) * 5,
               "oahu_nm": round(do), "hawaii_time_tie_window_min": round(tie)})

op_best, _op_tie = REC.operational_closest(BIG, second=OAHU)
OP_CA = {"hawaii_nm": round(op_best[0]), "time": op_best[1].strftime("%d/%H%MZ"),
         "wind_kt": round(op_best[2] / 5) * 5, "oahu_nm": round(op_best[3]),
         "time_tie_window_min": round(_op_tie)}
PASS_TIME = op_best[1]

# ---------- residual ----------
# THE VERIFYING TIME IS A SYNOPTIC HOUR, because that is where official forecasts land.
# Lala's closest approach falls at 16/0330Z, between cycles; no forecast row is valid then,
# and none is interpolated to make one. 16/0000Z is the last synoptic hour before the pass
# and the one every vintage from 72 h out has a row for.
VALID = "2026-08-16T00:00Z"
o00, o06 = R["CARQ-2026081600"], R["CARQ-2026081606"]
HD = bearing((o00.lat, o00.lon), (o06.lat, o06.lon))
# The heading is DERIVED from two official positions, then checked against the number the
# product prints for the same motion. Neither is taken on its own.
STATED = re.search(r"PRESENT MOVEMENT TOWARD THE [A-Z- ]+ OR\s+(\d+) DEGREES",
                   (EV.raw / "TCMCP2.adv015.txt").read_text()).group(1)
HB = (f"bearing from the operational 16/0000Z position to the 16/0600Z position, centred on the "
      f"valid time; Advisory 15 states {STATED}° for the same motion")

# TWO VINTAGES OF THE SAME FIX, exactly as the Lowell record reports them: what the public
# record said at the valid time, and what the next forecast/advisory said about that moment
# three hours later. Here they agree to the printed digit. That is a result, not an absence
# of one -- the same check moved Lowell's 18Z residual by 2.3 nm.
obs_first = R["TCP14A-160000"]        # intermediate advisory, as known at 00Z
obs_rev = R["TCM15-160300-prior"]     # prior-position line in Advisory 15, as revised at 03Z
VINTAGES_AGREE = (obs_first.lat, obs_first.lon) == (obs_rev.lat, obs_rev.lon)

res_late = residual(R["TCM13-151500-f1600"], obs_rev, HD, HB)
res_early = residual(R["TCM13-151500-f1600"], obs_first, HD, HB)
env_late = rounding_envelope(R["TCM13-151500-f1600"], obs_rev, HD)
env_early = rounding_envelope(R["TCM13-151500-f1600"], obs_first, HD)
FC12, OBS = R["TCM13-151500-f1600"], obs_rev
FC12_NM, OBS_NM = round(coast_nm(FC12.lat, FC12.lon, BIG)), round(coast_nm(OBS.lat, OBS.lon, BIG))

lead = []
for r in sorted([r for r in recs if r.valid == VALID and r.kind != "observation"],
                key=lambda r: (-r.lead_h, r.product)):
    x = residual(r, obs_rev, HD, HB)
    lead.append({"id": r.record_id, "product": r.product, "advisory": r.advisory, "lead_h": r.lead_h,
                 "issued": r.issued, "pos": r.position_original,
                 **{k: x[k] for k in ("along_nm", "cross_nm", "total_nm")}})

# ---------- WSP ----------
# Advisory 14 is the last full cycle issued BEFORE the closest approach, so it is the last
# official probability statement a desk had while the outcome was still open.
wsp_path = EV.raw / "PWSCP2.adv014.txt"
wsp = {}
for line in wsp_path.read_text().splitlines():
    m = re.match(r"([A-Z' ]+?)\s+(34|50|64)\s+.*\(\s*(\d+)\)\s*$", line)
    if m and m.group(1).strip() in ("HILO", "SOUTH POINT", "HONOLULU", "KAHULUI", "LIHUE"):
        wsp[(m.group(1).strip(), m.group(2))] = int(m.group(3))

# ---------- manifests ----------
sources = REC.source_register()
TIME_MODEL = REC.time_model(worked_example="TCDCP2.adv001.txt")
CYCLE_FROM_LABELS = sorted(a for a, b in CYCLE_BASIS.get(EV.slug, {}).items()
                           if b == "discussion-lead-labels")

manifest = {
    "schema": "millibar.trigger-evidence-record/0.1",
    "event": EV.label,
    "canonical_url": LIVE_URL,
    "contract_manifest": contract_manifest(),
    "event_manifest": {"time_model": {**TIME_MODEL,
                                      "cycle_from_discussion_labels": CYCLE_FROM_LABELS},
                       "issuance_provenance": REC.issuance_provenance(),
                       "records": [asdict(r) for r in recs], "sources": sources,
                       "geometry": REC.geometry_manifest()},
    "decision_manifest": {
        "settlement": {"payout_observed": 200000, "status": "NOT_RECONSTRUCTABLE_FROM_PUBLIC_TERMS",
                       "reason": "2026 contract terms not public; payout cell not inferred from amount. "
                                 "Under the 2024 ladder $200,000 is the minimum and appears in four "
                                 "distinct cells (50 kt in I, 64 kt in Z, 83 kt in Y, 96 kt in X)."},
        "operational": {"verifying_valid_time": VALID,
                        "verifying_time_basis": "last synoptic hour before the operational closest "
                                                "approach; no forecast row is valid at 16/0330Z and "
                                                "none is interpolated",
                        "residual_status": "PUBLISHED",
                        "observation_vintages_agree": VINTAGES_AGREE,
                        "residual_vs_revised_fix": res_late, "envelope_revised": env_late,
                        "residual_vs_first_reported_fix": res_early, "envelope_first": env_early,
                        "lead_series_valid_00z": lead, "closest_approach_by_advisory": ca,
                        "operational_closest_approach_hawaii": OP_CA,
                        "forecast_track_crossed_island_on_advisories":
                            [c["advisory"] for c in ca if c["hawaii_nm"] == 0],
                        "wsp_adv14_cumulative_120h": {f"{k[0]} {k[1]}kt": v for k, v in wsp.items()},
                        "aviation_advisories_archived": False,
                        "aviation_advisories_note":
                            "No ICAO aviation advisory (TCA) is archived for this event, so NHC's own "
                            "off-cycle interpolated positions -- the basis of the Lowell record's 18Z "
                            "residual -- are not available here and none is reconstructed."}},
}

# ---------- chart ----------
ARIA = "Hurricane Lala official track and forecast vintages past the main Hawaiian Islands"
PIVOTS = ["5", "9", "13", "15"]
CHART_WEB = REC.chart(760, 700, -163.0, -152.6, 15.6, 23.4, PIVOTS, 12, ARIA,
                      ring_record=R["TCM15-160300-cur"],
                      faint=[a for a in ADVS if a not in PIVOTS and int(a) >= 3],
                      carq_from="2026-08-14", carq_to="2026-08-18", label_hour="00")
CHART_PDF = REC.chart(660, 450, -162.4, -153.4, 16.4, 22.6, PIVOTS, 12.5, ARIA,
                      carq_from="2026-08-14", carq_to="2026-08-18", label_hour="00")

# ---------- fragments ----------
cadef = {c["advisory"]: c for c in ca}
pivot_line = " → ".join(f"Adv {a} {cadef[a]['hawaii_nm']} nm" for a in PIVOTS)
n_files = len({r.source_file for r in recs if r.product in ("TCM", "TCP", "TCU")})

LADDER = """<tr><td>50 kt</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num core">$200k</td></tr>
<tr><td>64 kt</td><td class="num">—</td><td class="num">—</td><td class="num">$200k</td><td class="num core">$300k</td></tr>
<tr><td>83 kt</td><td class="num">—</td><td class="num">$200k</td><td class="num">$300k</td><td class="num core">$450k</td></tr>
<tr><td>96 kt</td><td class="num">$200k</td><td class="num">$300k</td><td class="num">$450k</td><td class="num core">$600k</td></tr>
<tr><td>113 kt</td><td class="num">$300k</td><td class="num">$450k</td><td class="num">$600k</td><td class="num core">$750k</td></tr>
<tr><td>137 kt</td><td class="num">$450k</td><td class="num">$600k</td><td class="num">$750k</td><td class="num core">$1.0m</td></tr>"""
W = wsp


def lead_rows():
    return "\n".join(
        f'<tr><td>{x["product"]} {x["advisory"]}</td><td>{x["issued"][8:10]}/{x["issued"][11:13]}{x["issued"][14:16]}Z</td>'
        f'<td class="num">{x["lead_h"]:.0f} h</td><td class="mono pl">{x["pos"]}</td><td class="num">{fnum(x["along_nm"])}</td>'
        f'<td class="num">{fnum(x["cross_nm"])}</td><td class="num">{x["total_nm"]:.1f}</td></tr>' for x in lead)


def ca_rows():
    mx = max(c["hawaii_nm"] for c in ca)
    out = []
    for c in ca:
        if t_(c["issued"]) > PASS_TIME:
            out.append(f'<tr class="after"><td>Adv {c["advisory"]}</td><td>{c["nominal_cycle"][8:10]}/{c["nominal_cycle"][11:13]}Z</td>'
                       f'<td>{c["issued"][8:10]}/{c["issued"][11:13]}{c["issued"][14:16]}Z</td>'
                       f'<td colspan="5" class="small">Issued after the operational closest approach; storm already past</td></tr>')
            continue
        land = c["hawaii_nm"] == 0
        cell = ('<td class="num">over land</td>' if land else f'<td class="num">{c["hawaii_nm"]} nm</td>')
        out.append(f'<tr><td>Adv {c["advisory"]}</td><td>{c["nominal_cycle"][8:10]}/{c["nominal_cycle"][11:13]}Z</td>'
                   f'<td>{c["issued"][8:10]}/{c["issued"][11:13]}{c["issued"][14:16]}Z</td>'
                   f'<td class="barcell"><span class="hb" style="width:{100*c["hawaii_nm"]/mx:.0f}%"></span></td>'
                   f'{cell}<td class="num">{c["hawaii_time"]}</td><td class="num">{c["wind_kt"]} kt</td>'
                   f'<td class="num">{c["oahu_nm"]} nm</td></tr>')
    out.append(f'<tr class="optrack"><td colspan="3"><b>Operational track</b> (ATCF, interpolated)</td><td></td>'
               f'<td class="num"><b>{OP_CA["hawaii_nm"]} nm</b></td><td class="num">{OP_CA["time"]}</td>'
               f'<td class="num">{OP_CA["wind_kt"]} kt</td><td class="num">{OP_CA["oahu_nm"]} nm</td></tr>')
    return "\n".join(out)


def chrono_rows():
    sel = [r for r in recs if r.product in ("TCM", "TCP", "TCU")
           and (r.record_id.endswith("-cur") or r.product in ("TCP", "TCU") or r.record_id.endswith("-prior"))]
    rows = []
    for r in sorted(sel, key=lambda r: (r.valid, r.issued or "", r.product)):
        cls = {"observation": "Observation"}.get(r.kind, r.kind)
        label = {"TCM": "Forecast/Advisory", "TCP": "Public advisory", "TCU": "Tropical cyclone update"}[r.product]
        if r.variant == "special": label = "Special " + label.lower()
        if r.variant == "intermediate": label = "Intermediate public advisory"
        if r.record_id.endswith("-prior"): label += ", prior-position line"
        note = r.note if ("correction" in r.note or "prior" in r.note) else ""
        rows.append(f'<tr><td>{label} {r.advisory or ""}</td><td class="mono">{(r.nominal_cycle or "—")[8:16].replace("T"," ")}</td>'
                    f'<td class="mono">{(r.issued or "—")[8:16].replace("T"," ")}</td><td class="mono">{r.valid[8:16].replace("T"," ")}</td>'
                    f'<td class="mono">{r.position_original}</td><td class="mono">{r.vmax_original or "—"}</td><td>{cls}</td><td class="small">{note}</td></tr>')
    return "\n".join(rows), len(sel)


CHRONO, NCHRONO = chrono_rows()
REG_ROWS = "\n".join(
    f'<tr><td class="mono">{s["file"]}</td><td>{s["product"]}</td><td class="mono small">{s["sha256"][:16]}…</td></tr>'
    for s in sorted(sources, key=lambda s: s["file"]))
CROSSED = [c["advisory"] for c in ca if c["hawaii_nm"] == 0]

CSS_COMMON = (ASSETS / "web.css").read_text()

web = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lala 2026 — Trigger evidence record · Millibar Risk Evidence</title>
<meta name="description" content="Point-in-time evidence record for the Hawaiʻi reef parametric policy's Lala payout: what the public record supports, what it cannot reproduce, and what was knowable advisory by advisory.">
<meta property="og:title" content="Lala 2026 — Trigger evidence record">
<meta property="og:description" content="Independent, reproducible evidence for a parametric tropical-cyclone trigger. Official sources only.">
<meta property="og:type" content="article"><meta property="og:url" content="{LIVE_URL}">
<link rel="canonical" href="{LIVE_URL}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{CSS_COMMON}</style></head><body>
<div class="wrap">
 <div class="mast"><div class="brand">Millibar <span>/ Risk Evidence</span></div>
  <div class="note">Trigger evidence record · Hurricane Lala (CP01 2026) · Hawaiʻi reef parametric policy · 17 September 2026</div></div>
 <header class="title"><div>
  <h1>Lala paid $200,000 — the stated minimum — after 70 kt passed {ca[14]['hawaii_nm']} nm off Hawaiʻi Island.</h1>
  <p class="lede">A point-in-time reconstruction of the Hawaiʻi coral-reef parametric policy's first 2026 payout, built from {n_files} official CPHC/NHC products and the policyholder's published terms. The same contract paid $300,000 for Lowell three weeks later. Nothing in the public record explains the difference, and this record does not invent it.</p>
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
 <h2>Officially reported wind reached 70 kt within {ca[14]['hawaii_nm']} nm of Hawaiʻi Island, and the payout was the stated minimum. The public terms cannot tell you whether those two facts are related.</h2>
 <p>The 2024 fact sheet states that payouts are triggered and calculated from officially reported wind speeds and proximity to the core zone. The 2026 zone geometry, payout schedule, designated observation source and wind definition are not published, so neither the amount nor the difference from Lowell's $300,000 can be traced to a condition. <em>Millibar does not infer an undisclosed contract term from an observed payout.</em> Supplied with the schedule, the same evaluator resolves this record deterministically.</p>
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
   <tr><td>Official wind at closest approach</td><td>Forecast/Advisory 15 reports 70 kt at 16/0300Z; the public advisory reports the same system as 80 mph</td></tr>
   <tr><td>Lala outcome</td><td>$200,000, the first of two payouts in the 2026 season, at the confirmed 2026 minimum</td></tr>
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
  <p class="small" style="margin-top:12px">Under the 2024 ladder, $200,000 is the floor of the schedule and corresponds to four distinct cells (50 kt in I, 64 kt in Z, 83 kt in Y, 96 kt in X). A minimum payout is the one amount that carries the least information about which condition was met, so the 2026 schedule is required rather than inferred.</p>
 </div></div>
</section>

<section><div class="sec-head"><div class="plate">Plate B<small>Operational replay</small></div><div>
 <h2>What a risk desk could have known, advisory by advisory</h2>
 <p>Operational replay answers a different question: what was knowable at each issuance time, with no later information leaking backward. It is evidence of exposure and decision timing, not of settlement. Every regular, intermediate and corrected advisory and every off-schedule update from Advisory 1 (12 Aug, 15Z) to Advisory 64 (28 Aug, 09Z) is ingested; the plate below shows the island passage.</p></div></div>

 <div class="grid-chart"><figure>
  <div class="chart-frame">{CHART_WEB}</div>
  <div class="legend"><span><i class="sw"></i>Operational track, ATCF working best track (6-hourly)</span>
   <span><i class="sw dash"></i>Forecast tracks, Advisories {", ".join(PIVOTS)} (darker is later)</span>
   <span><i class="sw faint"></i>Other advisory forecasts, 3–20</span></div>
  <figcaption>Plotted to scale on an equirectangular projection. Coastlines: Natural Earth 1:10m land, generalized, not contract geometry. Wind radii are the official quadrant radii (NE/SE/SW/NW, nautical miles) from Forecast/Advisory 15 at 16/0300Z.</figcaption>
 </figure>
 <div>
  <h3>Forecast track distance to the Hawaiʻi Island coastline</h3>
  <p class="small">Closest point of each advisory's forecast track to the Natural Earth Hawaiʻi Island coastline, with Oʻahu at the same instant for comparison. Derived by Millibar: linear interpolation between official forecast points at 15-minute steps. Not an official product. Four advisories put the forecast track over the island itself; those are marked <em>over land</em> rather than given a distance of zero, because a track that crosses a coastline has no closest approach to report.</p>
  <table class="ca"><thead><tr><th>Adv</th><th>Cycle</th><th>Issued</th><th></th><th class="num">Hawaiʻi I.</th><th class="num">At</th><th class="num">Wind</th><th class="num">Oʻahu</th></tr></thead>
  <tbody>{ca_rows()}</tbody></table>
 </div></div>

 <div class="grid2" style="margin-top:40px"><div>
  <h3>Twelve-hour residual, Advisory 13 at 16/0000Z</h3>
  <p style="margin-bottom:12px"><span class="status ok">Published: verifying fix agrees across vintages</span></p>
  <p>Lala's closest approach falls at {OP_CA["time"]}, between synoptic cycles. No official forecast row is valid at that instant and none is interpolated here, so the residual is reported at 16/0000Z — the last synoptic hour before the pass, and the one every vintage from 72 hours out carries a row for.</p>
  <div class="residual">
   <div><div class="v">{fnum(res_late["along_nm"])} nm</div><div class="l">Along-track. The storm ran behind the forecast.</div></div>
   <div><div class="v">{fnum(res_late["cross_nm"])} nm</div><div class="l">Cross-track, positive to the right of the forecast track.</div></div>
  </div>
  <p class="small">Advisory 13's 12-hour forecast placed the centre at {FC12.position_original}, {FC12_NM} nm from the Hawaiʻi Island coastline. It arrived at {OBS.position_original}, {OBS_NM} nm out — behind and to the left of the forecast track, which is to say further from the island than forecast, not closer. Reporting precision of ±0.05° spans {fnum(env_late["along_nm"][0])} to {fnum(env_late["along_nm"][1])} nm along and {fnum(env_late["cross_nm"][0])} to {fnum(env_late["cross_nm"][1])} nm across. Track direction {res_late["heading_deg"]}°: {HB}. Post-season best track not yet published; these values may change when it is.</p>
  <div class="unres"><strong>Both observation vintages of the 16/0000Z fix agree</strong>
   <p class="small" style="margin:8px 0 0">Intermediate Advisory 14A reported {obs_first.position_original} at the valid time. Advisory 15's prior-position line, issued three hours later, reports {obs_rev.position_original} for the same moment, and the ATCF working best track matches. The residual is therefore the same against either vintage — {fnum(res_early["along_nm"])} nm along and {fnum(res_early["cross_nm"])} nm across. That agreement is a result, not an absence of one: the identical check moved the Lowell record's 18Z residual by 2.3 nm across track, and it is run here for the same reason.</p></div>
 </div><div>
  <h3>Every official forecast valid at 16/0000Z</h3>
  <p class="small">Same verifying fix and track direction throughout. Positive cross-track means the storm ended up to the right of the forecast track. No cardinal-direction claim is made: right-of-track is defined by the track direction printed beside it, and a separate cardinal decomposition is not computed here.</p>
  <table><thead><tr><th>Product</th><th>Issued</th><th class="num">Lead</th><th class="pl">Position</th><th class="num">Along</th><th class="num">Cross</th><th class="num">Total</th></tr></thead>
  <tbody>{lead_rows()}</tbody></table>
  <p class="small" style="margin-top:10px">Every vintage from 72 hours out placed the 00Z centre to the left of where the storm was — that is, on the side away from the island — except the 36-hour forecast, which was closest of all in total error while sitting furthest across track. Total error did not fall monotonically with lead time.</p>

  <h3 style="margin-top:26px">NHC location wind probabilities, issued with Advisory 14</h3>
  <p class="small">NHC location wind probabilities — not contract payout probabilities. Cumulative, forecast hours 0–120, from the last full cycle issued before the closest approach.</p>
  <div class="prob">
   <span>South Point · 34 kt</span><div class="bar"><i style="width:{W[("SOUTH POINT","34")]}%"></i><b>{W[("SOUTH POINT","34")]}%</b></div>
   <span>South Point · 50 kt</span><div class="bar"><i style="width:{W[("SOUTH POINT","50")]}%"></i><b>{W[("SOUTH POINT","50")]}%</b></div>
   <span>South Point · 64 kt</span><div class="bar"><i style="width:{W[("SOUTH POINT","64")]}%"></i><b>{W[("SOUTH POINT","64")]}%</b></div>
   <span>Hilo · 34 kt</span><div class="bar"><i style="width:{W[("HILO","34")]}%"></i><b>{W[("HILO","34")]}%</b></div>
   <span>Kahului · 34 kt</span><div class="bar"><i style="width:{W[("KAHULUI","34")]}%"></i><b>{W[("KAHULUI","34")]}%</b></div>
   <span>Honolulu · 34 kt</span><div class="bar"><i style="width:{W[("HONOLULU","34")]}%"></i><b>{W[("HONOLULU","34")]}%</b></div>
  </div>
 </div></div>

 <h3 style="margin-top:40px">Complete official chronology, 12–28 August</h3>
 <p class="small">{NCHRONO} position records from {n_files} products. Times are day and UTC. Nominal cycle, issuance and valid time are stored separately; a forecast's lead is measured from its nominal cycle. Corrections and re-transmissions stay in the lineage beside the version they supersede.</p>
 <div class="scroll"><table class="chrono"><thead><tr><th>Product</th><th>Cycle</th><th>Issued</th><th>Valid</th><th>Position (as issued)</th><th>Wind (as issued)</th><th>Class</th><th>Lineage</th></tr></thead>
 <tbody>{CHRONO}</tbody></table></div>
</section>

<section><div class="sec-head"><div class="plate">Plate C<small>Source vintage</small></div><div>
 <h2>Two things this archive cannot do that the Lowell archive could</h2>
 <p>Both records are built by the same evaluator from the same kind of products. They were not acquired the same way, and the difference is carried rather than smoothed over.</p></div></div>
 <div class="grid2"><div>
  <h3>Issuance time is known to the hour, not the minute</h3>
  <p>The Lowell products were captured from the WMO feed as they went out, so each filename carries a transmission time to the minute — a 15Z advisory transmitted at 14:51Z. These products come from NHC's public archive, which replaces the transmission group with the literal <span class="mono">TTAA00 PHFO DDHHMM</span>. The minute is not in these bytes and is not reconstructed. Every issuance time on this page is the hour the product prints for itself.</p>
  <p class="small">Where a public advisory prints only a local stamp, the UTC instant is derived from the fixed HST offset and then required to reproduce the UTC hour the product states in its own summary line. Eleven PM HST on the 16th is 09Z on the 17th, and a record that got the date from the wrong line would be wrong by a day rather than by an hour. Disagreement is refused, not resolved.</p>
 </div><div>
  <h3>No ICAO aviation advisory is archived</h3>
  <p>The Lowell record's headline residual is measured against NHC's <em>own</em> interpolated position for an off-cycle hour, taken from the aviation advisory issued alongside Advisory 46. No aviation product for Lala is held in the public archive, so that construction is unavailable here. This record does not substitute an interpolation of its own: it reports at a synoptic hour, where official forecast rows actually exist.</p>
  <h3 style="margin-top:22px">Three cycles proven from the discussion, not the advisory</h3>
  <p class="small">A forecast/advisory's nominal cycle is normally recoverable from its own rows, because they land on the canonical lead set and on nothing else. Advisories {", ".join(CYCLE_FROM_LABELS)} print only five rows as the system dissipates, and a five-row set beginning at +12 h is equally canonical read as +24 h from a cycle six hours earlier. The evaluator refuses that ambiguity rather than resolving it by convention, and takes the cycle from the companion discussion, which prints the lead label outright.</p>
 </div></div>
 <p class="small" style="margin-top:22px;max-width:78ch">Neither limitation touches a figure on this page: the island passage is covered by forecast/advisories, public advisories and off-schedule updates, all of which state their own times, and the residual is reported at a synoptic hour against official rows.</p>
</section>

<section><div class="sec-head"><div class="plate">The product<small>Trigger Evidence Record</small></div><div>
 <h2>Reopen the evidence behind a storm trigger</h2>
 <p>Each contract gets a machine-readable record: a contract manifest, an event manifest for every official product used, and a decision manifest that replays the evaluation. This page and its one-page brief are renderings of those manifests. This is the second record against the same contract manifest, produced by the same evaluator with no logic written for this storm.</p></div></div>
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
  <tr><td>CPHC/NHC Forecast/Advisories 1–64, CP012026</td><td>Fixes, intensities, pressures, quadrant wind radii, forecast positions</td><td class="cls">Official</td></tr>
  <tr><td>CPHC/NHC Public Advisories 1–64 with 27 intermediates</td><td>Public-product fixes, intermediate positions, correction lineage</td><td class="cls">Official</td></tr>
  <tr><td>CPHC/NHC Tropical Cyclone Updates (11)</td><td>Off-schedule positions and observed wind reports during the island passage</td><td class="cls">Official</td></tr>
  <tr><td>CPHC/NHC Tropical Cyclone Discussions 1–64</td><td>Lead-label proof of the time model; nominal cycle for Advisories {", ".join(CYCLE_FROM_LABELS)}</td><td class="cls">Official</td></tr>
  <tr><td>CPHC/NHC Wind Speed Probabilities 1–64 (PWSCP2)</td><td>Location wind probabilities</td><td class="cls">Official</td></tr>
  <tr><td>ATCF public aids, acp012026 (CARQ records)</td><td>Operational working best track, 6-hourly</td><td class="cls">Official, operational</td></tr>
  <tr><td>Natural Earth 1:10m land</td><td>Coastlines and coastline distances</td><td class="cls">Public-domain geometry</td></tr>
  <tr><td>TNC, 2024 Hawaiʻi Reef Insurance fact sheet; 2025 renewal release; 2026 event releases</td><td>Trigger basis, zone structure, 2024 ladder and limits, 2026 minimum and payouts</td><td class="cls">Policyholder</td></tr>
  <tr><td>WTW releases, Nov 2022 and Feb 2024</td><td>Broker, insurer, competitive placement</td><td class="cls">Broker</td></tr>
  <tr><td>Millibar derivations</td><td>Coastline distances, residual, rounding envelope, track direction</td><td class="cls">Derived</td></tr>
 </tbody></table>
 <details style="margin-top:18px"><summary>Archived files and hashes ({len(sources)})</summary>
 <table><thead><tr><th>File</th><th>Product</th><th>SHA-256</th></tr></thead><tbody>{REG_ROWS}</tbody></table></details>
</section>

<footer><p>Independent research by Alec Messino. Not a weather forecast, loss estimate, claims determination, or insurance advice. Official products remain the property of NOAA/NWS; contract terms remain the property of the parties.</p>
<p>One-page brief: <a href="Millibar-Lala-2026-Event-Brief.pdf">Millibar-Lala-2026-Event-Brief.pdf</a> &nbsp;·&nbsp; Machine-readable record: <a href="lala-2026.manifest.json">lala-2026.manifest.json</a></p></footer>
</div></body></html>"""

BRIEF_CSS = (ASSETS / "brief.css").read_text()
brief = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Lala 2026 event brief</title><style>{BRIEF_CSS}</style></head>
<body><div class="page">
 <div class="mast"><div><b>Millibar</b> <span>/ Risk Evidence</span></div><div><span>Event brief · Hurricane Lala, CP01 2026 · Hawaiʻi reef parametric policy · 17 Sep 2026</span></div></div>
 <h1>Lala paid $200,000 — the minimum. The public contract record cannot reproduce the payout cell.</h1>
 <p class="lede">A point-in-time reconstruction from official CPHC/NHC products and the policyholder's published terms. Reopen the evidence behind a storm trigger.</p>
 <div class="band"><h2>70 kt was officially reported {ca[14]['hawaii_nm']} nm off Hawaiʻi Island, and the payout was the minimum.</h2>
 <p>The 2026 zone geometry, payout schedule, observation source and wind definition are not published, so neither the amount nor the $100,000 difference from Lowell traces to a condition. <em>Millibar does not infer an undisclosed contract term from an observed payout.</em></p></div>
 <div class="cols"><div>
  <h3>A. Established from public sources</h3>
  <table>
   <tr><td class="k">Policyholder</td><td>The Nature Conservancy; first US reef policy 2022, redesigned 2024</td></tr>
   <tr><td class="k">Broker / insurer</td><td>WTW; Munich Re Group company after a competitive placement</td></tr>
   <tr><td class="k">Trigger basis</td><td>Officially reported wind; ≥50 kt in core zone; more wind and closer pays more</td></tr>
   <tr><td class="k">Wind at pass</td><td>70 kt, Forecast/Advisory 15 at 16/0300Z; 80 mph in the public advisory</td></tr>
   <tr><td class="k">Published 2024–25 limits</td><td>$200k minimum · $1m per event · $2m annual</td></tr>
   <tr><td class="k">2026</td><td>$200k minimum confirmed. Lala $200,000 (21 Aug) · Lowell $300,000 (15 Sep)</td></tr>
  </table>
  <h3 style="margin-top:6pt">Historical 2024 payout ladder <span class="tag">— not assumed for 2026</span></h3>
  <table><thead><tr><th>Wind</th><th class="num">X</th><th class="num">Y</th><th class="num">Z</th><th class="num core">I (core)</th></tr></thead>{LADDER}</table>
  <p class="cap">$200,000 is the floor of the 2024 schedule and sits in four cells; a minimum payout carries the least information about which condition was met.</p>
  <h3 style="margin-top:6pt">B. Missing from the public record</h3>
  <ul><li>Georeferenced 2026 zone polygons</li><li>The 2026 wind × zone payout schedule and limits</li>
   <li>Designated observation source and wind definition</li><li>Treatment of intermediates and revisions</li></ul>
  <div class="stamp">Not reconstructable from public terms</div>
 </div><div>
  <h3>C. Operational replay: selected official vintages</h3>
  <div class="chart">{CHART_PDF}</div>
  <p class="cap">Solid: operational track. Dashed: Advisories {", ".join(PIVOTS)} (darker is later). Coastlines Natural Earth 1:10m, not contract geometry. Forecast-track distance to the Hawaiʻi Island coastline: {pivot_line} (derived); Advisories {", ".join(CROSSED)} put the track over the island. NHC location wind probabilities, not contract payout probabilities, Adv 14: South Point {W[("SOUTH POINT","50")]}% for 50 kt, {W[("SOUTH POINT","64")]}% for 64 kt.</p>
  <h3 style="margin-top:6pt">D. Residual, Advisory 13 at 16/0000Z</h3>
  <p class="cap vsrc">Both against Advisory 13's 12-hour forecast, at a synoptic hour: the closest approach at {OP_CA["time"]} falls between cycles, where no official row exists. Track direction {res_late["heading_deg"]}°.</p>
  <div class="vints">
   <div class="vint">
    <div class="vh">As known at 00Z · Intermediate 14A</div>
    <p class="res"><span class="big">{fnum(res_early["along_nm"])} nm</span> along</p>
    <p class="res"><span class="big">{fnum(res_early["cross_nm"])} nm</span> right-of-track</p>
   </div>
   <div class="vint">
    <div class="vh">Revised at 03Z · Advisory 15</div>
    <p class="res"><span class="big">{fnum(res_late["along_nm"])} nm</span> along</p>
    <p class="res"><span class="big">{fnum(res_late["cross_nm"])} nm</span> right-of-track</p>
   </div>
  </div>
  <p class="peer">Same forecast. Same valid time. Here the two source vintages report the same fix, and the residual does not move.</p>
  <p class="cap audit">No ICAO aviation advisory is archived for this event; no off-cycle interpolated position is used or reconstructed.</p>
 </div></div>
 <div class="foot"><div>
  <p><b>Provenance.</b> CPHC/NHC Forecast/Advisories, Public and Intermediate Advisories, Updates, Discussions and Wind Speed Probabilities 1–64 (CP012026) · ATCF public aids · Natural Earth 1:10m · TNC 2024 fact sheet, 2025 renewal, 2026 releases · WTW 2022, 2024.</p>
  <p>Independent research by Alec Messino. Not a weather forecast, loss estimate, claims determination, or insurance advice.</p>
 </div><div>
  <p><b>Full evidence record</b>, with the complete {n_files}-product chronology, manifests and hashes:</p>
  <p>alec.messino@gmail.com</p>
 </div>
 <p class="urlrow"><a class="mono url" href="{LIVE_URL}">{LIVE_URL}</a></p>
 </div>
</div></body></html>"""

REC.write(manifest, web, brief)
print(json.dumps({"n_products": n_files, "n_records": len(recs), "chrono_rows": NCHRONO,
                  "res_late": res_late, "res_early": res_early, "pivots": pivot_line,
                  "crossed": CROSSED, "op_closest": OP_CA,
                  "wsp": {f"{a} {b}": v for (a, b), v in wsp.items()}}, indent=1))
