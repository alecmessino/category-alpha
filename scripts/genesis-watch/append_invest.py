"""Append the Invest 98E designation to the watch, from the first authoritative state for it.

WHAT IS NEW, AND WHAT IS NOT. The Tropical Weather Outlook standing at capture time is the
same 17:53Z product record 0002 already holds, so re-snapshotting it would append nothing but
a second copy of a frozen state. What IS new is elsewhere: ATCF now carries a b-deck for
EP982026 whose latest entry is designated INVEST where its earlier entries read GENESIS024.
That transition is the authoritative state this record appends from, and nothing earlier.

THE ASSOCIATION IS GEOMETRY, NOT IDENTITY. No NHC product states that Invest 98E is any
particular outlook area: the text names no invest, and the GTWO shapefile's attributes are
basin, area number and two probabilities. So the association recorded here is exactly what can
be computed from two official products -- the invest's own ATCF position falls inside the
polygon NHC published for one Pacific area and inside no other -- and it is labelled as that
rather than as NHC having said so. A reader who rejects containment as a basis can drop the
association and keep every other value in this record.

Run: python3 scripts/genesis-watch/append_invest.py --seq 0003 [--dry-run]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import atlas_state
import contract as C
from genesis.sources import gtwo

BDECK_URL = "https://ftp.nhc.noaa.gov/atcf/btk/bep982026.dat"
GTWO_URL = "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"
ATCF_ID = "EP982026"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "millibar-genesis-watch/1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def bdeck_rows(raw: bytes) -> list[dict]:
    """Every BEST row, with the name field the row carries for itself."""
    out = []
    for line in raw.decode("utf-8", "replace").splitlines():
        f = [x.strip() for x in line.split(",")]
        if len(f) < 28 or f[4] != "BEST":
            continue
        out.append({
            "valid": datetime.strptime(f[2], "%Y%m%d%H").replace(tzinfo=timezone.utc),
            "lat": int(f[6][:-1]) / 10 * (1 if f[6][-1] == "N" else -1),
            "lon": int(f[7][:-1]) / 10 * (-1 if f[7][-1] == "W" else 1),
            "vmax_kt": int(f[8]), "mslp_mb": int(f[9]) or None, "stage": f[10],
            "name": f[27],
        })
    return out


def designation_transition(rows: list[dict]) -> dict:
    """The first row designated INVEST, and the label it was carrying before it.

    The b-deck names itself: earlier rows read GENESIS024, the latest reads INVEST. That
    change IS the designation, stated by the product rather than inferred from its existence.
    """
    first = next((r for r in rows if r["name"] == "INVEST"), None)
    if first is None:
        raise SystemExit(f"{ATCF_ID} carries no row designated INVEST; nothing to append.")
    before = [r for r in rows if r["valid"] < first["valid"]]
    prior = before[-1]["name"] if before else None
    return {"designated_invest_at": C.iso(first["valid"]) if hasattr(C, "iso")
            else first["valid"].strftime("%Y-%m-%dT%H:%MZ"),
            "prior_label": prior,
            "prior_label_rows": len(before),
            "evidence": ("the b-deck's own storm-name field: "
                         f"{prior!r} through {before[-1]['valid']:%d/%H%MZ}, "
                         f"{first['name']!r} from {first['valid']:%d/%H%MZ}"),
            "position_at_designation": f"{abs(first['lat']):.1f}"
                                       f"{'N' if first['lat'] >= 0 else 'S'} "
                                       f"{abs(first['lon']):.1f}"
                                       f"{'W' if first['lon'] < 0 else 'E'}",
            "vmax_kt_at_designation": first["vmax_kt"],
            "stage_at_designation": first["stage"]}


def containment(lat: float, lon: float, areas: list[dict]) -> dict:
    """Which published Pacific polygon, if exactly one, contains the invest position."""
    from shapely.geometry import Point, Polygon
    p = Point(lon, lat)
    hits = []
    for a in areas:
        if not str(a.get("basin", "")).lower().startswith("pac"):
            continue
        rings = a.get("rings") or []
        if any(Polygon(r).contains(p) for r in rings if len(r) >= 4):
            hits.append(a)
    if len(hits) != 1:
        return {"unique": False, "n_containing": len(hits),
                "refusal": ("the invest position is inside "
                            f"{len(hits)} published Pacific polygons, so containment does not "
                            "single one out. No association is recorded.")}
    a = hits[0]
    return {"unique": True, "basin": a["basin"], "area_number": a["area_number"],
            "gis_vintage": a.get("issuance_stamp"),
            "prob_48h_pct": a.get("prob_48h_pct"), "prob_7d_pct": a.get("prob_7d_pct")}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seq", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    prior = {e["record_id"]: e for e in C.read_ledger()["entries"]}
    if "0002" not in prior:
        raise SystemExit("record 0002 is not committed; nothing to append to.")

    acquired = C.now_utc()
    bdeck = fetch(BDECK_URL)
    gis_bytes = fetch(GTWO_URL)

    rows = bdeck_rows(bdeck)
    trans = designation_transition(rows)
    latest = rows[-1]
    areas = gtwo.read_areas(gis_bytes)
    cont = containment(latest["lat"], latest["lon"], areas)

    # The object this lands on is resolved through the LEDGER, the way identity is resolved
    # everywhere else in this sequence -- never by position in a list.
    latest_snapshot = json.loads(
        (C.SNAPSHOTS / prior["0002"]["file"]).read_text(encoding="utf-8"))
    target = None
    if cont.get("unique"):
        for o in latest_snapshot.get("objects", []):
            if str(o.get("nhc_gtwo_area_number")) == str(cont["area_number"]):
                target = o
                break

    invest_ids = [ATCF_ID] if (target and cont.get("unique")) else None
    guidance = atlas_state.guidance_availability(invest_ids)
    cohort = atlas_state.cohort_for(latest["lat"], latest["lon"], latest["valid"].month)

    rec = {
        "schema": "millibar.pacific-genesis-watch.invest-designation/1",
        "label": "INVEST DESIGNATION — APPENDED, EARLIER RECORDS UNCHANGED",
        "record_id": a.seq,
        "appends_to": "0002",
        "appends_to_manifest_sha256": prior["0002"]["manifest_sha256"],
        "appends_to_note": ("0002 is corrected in provenance only by 0002c1; every value this "
                            "record builds on is unaffected by that correction."),
        "why_separate": (
            "The Tropical Weather Outlook standing at capture time is the same 17:53Z product "
            "0002 already holds, so no new source state exists for it and none is invented. "
            "What is new is the ATCF designation of " + ATCF_ID + ", which 0002 predates."),
        # THE SEQUENCE'S FOUR TIMES, ON EVERY RECORD KIND. A new schema does not get to carry
        # a different set: the contract is that issuance, acquisition, computation and commit
        # are never conflated, and a key left out is not checkable. Where one genuinely does
        # not exist -- an ATCF deck publishes no issuance time -- it is null WITH THE REASON,
        # which is a stronger statement than omitting it.
        "timestamps": {
            "source_issued_at": None,
            "source_issued_at_refusal": (
                "The ATCF b-deck carries no issuance time. Its entries are valid at synoptic "
                "hours and the file is republished continuously, so no issuance is claimed. "
                "invest_designated_at below is a VALID time, not an issuance."),
            "invest_designated_at": trans["designated_invest_at"],
            "source_acquired_at": acquired,
            "atlas_computed_at": C.now_utc(),
            "snapshot_committed_at": None,
        },
        "contemporaneity": {
            "atlas_captured_with_source": True,
            "acquired_after_designation_by_minutes": round(
                (datetime.strptime(acquired, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                 - datetime.strptime(trans["designated_invest_at"], "%Y-%m-%dT%H:%MZ")
                 .replace(tzinfo=timezone.utc)).total_seconds() / 60),
            "note": ("This record is NOT contemporaneous with the designation itself. The "
                     "b-deck entry is valid at the synoptic hour shown; it is published "
                     "afterwards, and this is the first acquisition of it. Nothing is "
                     "backdated to the designation hour."),
        },
        "invest": {
            "atcf_id": ATCF_ID,
            "designation": trans,
            "latest_fix": {
                "valid": latest["valid"].strftime("%Y-%m-%dT%H:%MZ"),
                "position": f"{latest['lat']:.1f}N {abs(latest['lon']):.1f}W",
                "vmax_kt": latest["vmax_kt"], "mslp_mb": latest["mslp_mb"],
                "stage": latest["stage"],
            },
            "source": {"file": "bep982026.dat", "url": BDECK_URL, "sha256": sha(bdeck)},
            "refusals": [
                "No track is plotted. An invest is not a tropical cyclone and carries no "
                "official forecast track.",
                "An invest number is a working label that is reused every season. It is not a "
                "persistent storm identifier and it is not an NHC forecast of anything.",
            ],
        },
        "association": {
            "object": (target or {}).get("millibar_object_id"),
            "nhc_gtwo_area_number": cont.get("area_number"),
            "basis": "GEOMETRIC CONTAINMENT OF TWO OFFICIAL PRODUCTS",
            "what_was_computed": (
                "the invest's own ATCF position at its latest fix falls inside the polygon NHC "
                "published for this area in the GTWO shapefile, and inside no other Pacific "
                "polygon in the same product"),
            "nhc_states_this_association": False,
            "why_not_stronger": (
                "No NHC product names an invest against an outlook area: the text outlook names "
                "no invest, and the shapefile's attributes are basin, area number and two "
                "probabilities. Containment is a relation between two official products, not a "
                "statement by either of them."),
            "if_rejected": (
                "Drop this block. Every other value in this record -- the designation, its "
                "evidence, the fix, the hashes -- stands without it."),
            **{k: v for k, v in cont.items() if k in ("unique", "n_containing", "refusal",
                                                      "gis_vintage")},
        },
        "text_gis_agreement": {
            "note": ("0002 recorded a disagreement: the 17:53Z text said 40 percent for this "
                     "area while the 17:28Z GIS vintage still said 20, and the text stood. The "
                     "GIS vintage current at this capture is read here for the same area."),
            "gis_vintage": cont.get("gis_vintage"),
            "gis_prob_48h_pct": cont.get("prob_48h_pct"),
            "gis_prob_7d_pct": cont.get("prob_7d_pct"),
            "resolution": ("the later GIS vintage now carries the text's figure; the earlier "
                           "disagreement is not edited out of 0002, which stands as captured"),
        },
        "atlas_state": {
            "archive": atlas_state.archive_version(),
            "methodology": atlas_state.methodology_hash(),
            "model_guidance": guidance,
            "cohort_at_invest_position": cohort,
            "environment": atlas_state.environmental_availability(),
            "refusals": [
                "No formation probability is computed. NHC's is the only one, in NHC's words.",
                atlas_state.NOT_A_FORECAST,
            ],
            "what_changed_for_the_atlas": (
                "Model guidance was refused in every earlier record because no invest "
                "association was sourced and naming one would have been a guess about which "
                "disturbance it belonged to. A designated invest with a position now exists, "
                "and containment singles out one area, so guidance becomes admissible FOR THAT "
                "OBJECT ONLY and only under its mandatory label. Nothing about the other two "
                "disturbances changes."
                if guidance.get("available") else
                "Model guidance stays refused: no invest association is sourced."),
        },
        "raw_sha256": {"bep982026.dat": sha(bdeck), "gtwo_shapefiles.zip": sha(gis_bytes)},
        "append_rule": ("This record is immutable once committed. Later states append new "
                        "records; an error is corrected by appending a supersession record, "
                        "never by editing this one or any record before it."),
    }

    if a.dry_run:
        print(json.dumps(rec, indent=1, ensure_ascii=False))
        return 0

    raw_dir = C.ROOT / "data" / "genesis-watch" / "raw" / a.seq
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / "bep982026.dat").write_bytes(bdeck)
    (raw_dir / "gtwo_shapefiles.zip").write_bytes(gis_bytes)

    path = C.append(rec, record_id=a.seq, kind="invest-designation",
                    note=f"{ATCF_ID} designated INVEST; association by containment, not by NHC")
    print(f"appended {path}")
    print(json.dumps({"designated": trans["designated_invest_at"],
                      "prior_label": trans["prior_label"],
                      "object": rec["association"]["object"],
                      "area": cont.get("area_number"),
                      "guidance_available": guidance.get("available")}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
