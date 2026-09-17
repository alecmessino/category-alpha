"""Capture one Pacific Genesis Watch decision state: NHC source + contemporaneous Atlas.

WHAT A SNAPSHOT IS. The authoritative NHC source state at an official outlook issuance, and
the Storm Atlas state as the repository actually held it when that source was acquired, in
one sequence, with four timestamps kept apart:

    source_issued_at        what the product says about itself
    source_acquired_at      when this process fetched it
    atlas_computed_at       when the Atlas state was computed
    snapshot_committed_at   when the record entered the ledger

None is derived from another and none is ever backdated. Snapshot 0001 is an ARCHIVED NHC
BASELINE precisely because its Atlas state could not be captured alongside it; this module
exists so that every snapshot from 0002 onward does not have that gap.

WHAT IT REFUSES, STRUCTURALLY

  * An NHC or invest identifier that no captured source states. GTWO area numbers are
    product-local and are carried as such, never as a persistent disturbance id.
  * A formation probability of its own. NHC's is the only one, carried verbatim.
  * A GIS 0% in place of the product's textual "near 0 percent". The text is authoritative
    and the repository's own parser already refuses the coercion; the GIS attribute is
    carried beside it so both are visible.
  * Any track. No official NHC forecast track exists for a pre-genesis disturbance, and an
    outlook polygon is not a cone.
  * Identity continuity across snapshots that the products do not support.

IT REUSES THE REPOSITORY'S PARSERS. genesis.sources.two_archive reads the text outlook and
already treats "near 0 percent" as a label rather than a number; genesis.sources.gtwo reads
the shapefiles with the standard library. Re-implementing either here would mean two
readers of one product, free to disagree.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "scripts"))

import contract as C           # noqa: E402
import atlas_state as A        # noqa: E402
from genesis.sources import gtwo, two_archive as TA   # noqa: E402

SOURCES = {
    "MIATWOEP.html": "https://www.nhc.noaa.gov/text/MIATWOEP.shtml",
    "HFOTWOCP.html": "https://www.nhc.noaa.gov/text/HFOTWOCP.shtml",
    "TWOEP.xml": "https://www.nhc.noaa.gov/xml/TWOEP.xml",
    "TWOCP.xml": "https://www.nhc.noaa.gov/xml/TWOCP.xml",
    "CurrentStorms.json": "https://www.nhc.noaa.gov/CurrentStorms.json",
    "gtwo_shapefiles.zip": "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip",
}

UA = {"User-Agent": "millibar-genesis-watch/1 (+https://github.com/alecmessino/category-alpha)"}


def fetch(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def pre_text(raw: bytes) -> str:
    """The product text out of NHC's HTML wrapper, unescaped and otherwise untouched."""
    s = raw.decode("utf-8", "replace")
    m = re.search(r"<pre>(.*?)</pre>", s, re.S | re.I)
    return html.unescape(m.group(1) if m else s)


def gis_vintage(zip_bytes: bytes) -> str | None:
    """The GIS product's own stamp, from the shapefile member names."""
    for n in zipfile.ZipFile(io.BytesIO(zip_bytes)).namelist():
        m = re.search(r"_(\d{12})\.", n)
        if m:
            return m.group(1)
    return None


def rings_to_geojson(rings: list) -> dict | None:
    if not rings:
        return None
    return {"type": "Polygon", "coordinates": [[[float(x), float(y)] for x, y in r] for r in rings]}


def pacific_gis(gis_areas: list[dict]) -> list[dict]:
    """The Pacific GTWO polygons, in the product's own area order.

    NHC's GIS carries ONE 'Pacific' basin covering both the East and Central Pacific -- it
    does not split them the way the two text products do. So the basin field is filtered on
    exactly what the .dbf prints, and the Atlantic areas are dropped because this watch is
    Pacific-only.
    """
    out = [a for a in gis_areas if (a.get("basin") or "").strip().lower() == "pacific"]
    return sorted(out, key=lambda a: int(a.get("area_number") or 0))


def merge_text_areas(ep: dict, cp: dict) -> list[dict]:
    """One object per disturbance, with every product that describes it attached.

    CPHC's outlook re-describes systems that are also in NHC's East Pacific outlook -- today
    two of the three, with identical titles and identical probabilities. Emitting those twice
    would double-count the watch's own object set. They are merged on an EXACT title match
    and the second product is recorded as corroboration, with any disagreement between the
    two carried rather than silently resolved.

    A Central Pacific area with no East Pacific counterpart is its own object. Nothing is
    merged on prose similarity or geography: that would be this system deciding two
    disturbances are one, which is the IDENTITY test's whole subject.
    """
    merged: list[dict] = []
    for a in ep.get("areas", []):
        merged.append({"text": a, "primary_product": "TWOEP", "also_described_in": []})
    for a in cp.get("areas", []):
        hit = next((m for m in merged if (m["text"].get("title") or "") == (a.get("title") or "")), None)
        if hit is None:
            merged.append({"text": a, "primary_product": "TWOCP", "also_described_in": []})
            continue
        disagreements = {
            k: {"TWOEP": hit["text"].get(k), "TWOCP": a.get(k)}
            for k in ("prob_48h_text", "prob_7d_text", "prob_48h_pct", "prob_7d_pct")
            if hit["text"].get(k) != a.get(k)
        }
        hit["also_described_in"].append({
            "product": "TWOCP",
            "matched_on": "exact NHC area title",
            "text": a.get("text"),
            "disagreements_with_primary": disagreements or None,
            "note": ("CPHC describes the same disturbance. Merged on the title string alone; "
                     "no continuity or equivalence is inferred from geography or wording."),
        })
    return merged


def attach_gis(merged: list[dict], gis: list[dict]) -> list[dict]:
    """Attach polygons by product order, or refuse for all of them.

    The text products print no area number and the GIS does, so the pairing is ordinal. If
    the counts disagree the join is REFUSED wholesale rather than aligned by guesswork: a
    disturbance carrying another disturbance's polygon is worse than one carrying none.
    """
    if len(merged) != len(gis):
        for m in merged:
            m["gis"] = None
            m["join"] = {"ok": False, "basis": None,
                         "refusal": (f"GIS/text area count mismatch: {len(merged)} merged text "
                                     f"areas, {len(gis)} Pacific GIS areas. No polygon is "
                                     f"attached to any object in this snapshot.")}
        return merged
    for m, g in zip(merged, gis):
        m["gis"] = g
        m["join"] = {"ok": True, "gis_area_number": g.get("area_number"),
                     "basis": ("ordinal: the text products print no area number, the GIS does, "
                               "and both are published in the same order within the basin")}
    return merged


def object_id_for(title: str, prior: list[tuple[str, dict]], year: int,
                  next_index: list[int]) -> dict:
    """Assign an internal id, and never invent continuity.

    An id is carried forward ONLY when a previous snapshot carried the identical NHC name
    string. Anything looser -- overlapping polygons, similar prose, nearby centroids -- would
    be this system asserting that two disturbances are the same object, which is the exact
    claim the IDENTITY test exists to keep it from making for free.
    """
    # THE LEDGER IS THE AUTHORITY ON IDENTITY. Snapshot 0001 arrived frozen and carries no
    # record_id field of its own, so reading one out of the record yielded "?" and the
    # attribution lost the record it came from. Record 0002 shipped with that defect and is
    # corrected by an appended supersession record rather than edited.
    for rec_id, rec in prior:
        for o in rec.get("objects", []):
            if (o.get("nhc_name") or "") == title:
                return {"millibar_object_id": o["millibar_object_id"],
                        # The test travels with the IDENTIFIER, because the test is a question
                        # asked of a particular object. A new object never inherits one: that
                        # would be continuity asserted through the back door.
                        "test": o.get("test"),
                        "identity_basis": (f"carried forward from record {rec_id}: "
                                           f"identical NHC name string"),
                        "continuity_asserted": "name-string match only; no physical continuity "
                                               "is claimed beyond what NHC's own wording states"}
    next_index[0] += 1
    return {"millibar_object_id": f"PGW-{year}-N{next_index[0]}",
            "test": None,
            "test_note": ("No test is assigned. The three tests are questions asked of objects "
                          "that were already being followed; giving one to a new object would "
                          "assert the continuity this identifier explicitly refuses."),
            "identity_basis": "new internal identifier; no earlier snapshot carries this NHC name",
            "continuity_asserted": "none"}


def build_object(pair: dict, ident: dict) -> dict:
    t, g = pair["text"], pair.get("gis")
    geom = None
    if g:
        poly = rings_to_geojson(g.get("rings"))
        geom = {"points": ({"type": "Point", "coordinates": [g.get("lon"), g.get("lat")]}
                           if g.get("lat") is not None else None),
                "areas": poly}
    return {
        **ident,
        "id_note": "Internal Millibar identifier. Not an NHC identifier.",
        "nhc_gtwo_area_number": (str(pair["join"].get("gis_area_number"))
                                 if pair["join"].get("ok") else None),
        "nhc_area_number_note": ("Product-local area number in this GTWO GIS vintage; "
                                 "not a persistent disturbance ID."),
        "join": pair["join"],
        "primary_product": pair.get("primary_product"),
        "also_described_in": pair.get("also_described_in") or [],
        "nhc_name": t.get("title"),
        "official_description": t.get("text"),
        "formation_prob_48h": {
            "official_text": f"{t.get('prob_48h_label')}, {t.get('prob_48h_text')}",
            "official_pct": t.get("prob_48h_pct"),
            "official_qualifier": t.get("prob_48h_qualifier"),
            "gis_attribute": (g or {}).get("prob_48h_pct"),
            "gis_label": (g or {}).get("prob_48h_label"),
            "text_gis_disagreement": (
                None if (g or {}).get("prob_48h_pct") == t.get("prob_48h_pct") else
                {"text": t.get("prob_48h_text"), "gis": (g or {}).get("prob_48h_pct"),
                 "resolution": "the text stands; the GIS value is carried, not displayed in "
                               "its place"}),
            "authority": ("The TEXT product is authoritative. Where it prints 'near 0 percent' "
                          "the value is a LABEL at the bottom of the scale, not the number 0, "
                          "and the GIS attribute -- which does print 0 -- is carried beside it "
                          "rather than in place of it."),
        },
        "formation_prob_7d": {
            "official_text": f"{t.get('prob_7d_label')}, {t.get('prob_7d_text')}",
            "official_pct": t.get("prob_7d_pct"),
            "official_qualifier": t.get("prob_7d_qualifier"),
            "gis_attribute": (g or {}).get("prob_7d_pct"),
            "gis_label": (g or {}).get("prob_7d_label"),
            "text_gis_disagreement": (
                None if (g or {}).get("prob_7d_pct") == t.get("prob_7d_pct") else
                {"text": t.get("prob_7d_text"), "gis": (g or {}).get("prob_7d_pct"),
                 "resolution": "the text stands"}),
        },
        "classification": "pre-genesis disturbance",
        "geometry": geom,
        "geometry_source": ("NHC gtwo_shapefiles.zip, read by scripts/genesis/sources/gtwo.py"
                            if geom else None),
        "lifecycle": {"OUTLOOK": None, "INVEST_GUIDANCE": None, "DEPRESSION": None,
                      "NAMED": None, "OFFICIAL_FORECAST": None, "OBSERVATION": None,
                      "POST_SEASON": None},
        "not_yet_knowable": ["formation", "designation", "official track", "intensity",
                             "landfall or coastal impact"],
        "refusals": [
            "No track plotted: no official NHC track exists for a pre-genesis disturbance, "
            "and a Tropical Weather Outlook formation polygon is not a forecast cone.",
            "No invest or model-guidance association claimed: none is sourced here.",
            "Invented NHC or invest identifiers refused; the internal id above is Millibar's.",
        ],
    }


def capture(seq: str, *, dry_run: bool = False) -> dict:
    prior = list(zip([e["record_id"] for e in C.read_ledger()["entries"]], C.load_all()))
    raw_dir = C.RAW / seq
    acquired_bytes: dict[str, bytes] = {}

    for name, url in SOURCES.items():
        acquired_bytes[name] = fetch(url)
    source_acquired_at = C.now_utc()          # after the last byte lands, not before the first

    ep = TA.parse_outlook(pre_text(acquired_bytes["MIATWOEP.html"]), url=SOURCES["MIATWOEP.html"])
    cp = TA.parse_outlook(pre_text(acquired_bytes["HFOTWOCP.html"]), url=SOURCES["HFOTWOCP.html"])
    gis = gtwo.read_areas(acquired_bytes["gtwo_shapefiles.zip"])
    storms = json.loads(acquired_bytes["CurrentStorms.json"].decode("utf-8", "replace"))

    issued = ep.get("issuance_utc")
    issued_iso = issued.strftime("%Y-%m-%dT%H:%MZ") if issued else None
    if issued_iso is None:
        raise SystemExit("REFUSED: the text outlook does not state an issuance time.")

    year = int(issued_iso[:4])
    used = [int(m.group(1)) for _, r in prior for o in r.get("objects", [])
            for m in [re.search(r"-[A-Z](\d+)$", o.get("millibar_object_id", ""))] if m]
    next_index = [max(used) if used else 0]

    pairs = attach_gis(merge_text_areas(ep, cp), pacific_gis(gis))
    objects = [build_object(p, object_id_for(p["text"].get("title"), prior, year, next_index))
               for p in pairs]

    atlas_computed_at = C.now_utc()
    atlas = A.compute(objects, captured_at=atlas_computed_at,
                      source_issued_at=issued_iso, simultaneous=True)

    if not dry_run:
        raw_dir.mkdir(parents=True, exist_ok=True)
        for name, b in acquired_bytes.items():
            (raw_dir / name).write_bytes(b)

    record = {
        "schema": "millibar.pacific-genesis-watch.snapshot/2",
        "label": "FROZEN DECISION STATE",
        "record_id": seq,
        "sequence_note": ("Snapshot 0001 is an archived NHC baseline with no contemporaneous "
                          "Atlas state; its Atlas state is the separate record 0001b. From this "
                          "record onward, both states are captured in the same sequence."),
        "timestamps": {
            "source_issued_at": issued_iso,
            "source_acquired_at": source_acquired_at,
            "atlas_computed_at": atlas_computed_at,
            "snapshot_committed_at": None,
            "note": ("Four distinct facts, never conflated and never backdated. "
                     "snapshot_committed_at is filled by the ledger entry, written after this "
                     "record is sealed, so it is null inside the record itself."),
        },
        "contemporaneity": {
            "atlas_captured_with_source": True,
            "acquisition_lag_min": None,
            "statement": ("The Atlas state was computed against the repository as it stood "
                          "when this source state was acquired. No Atlas state is reconstructed "
                          "for any earlier moment."),
        },
        "products": {
            "TWOEP": {"wmo": ep.get("wmo_header"), "issued": issued_iso,
                      "local": ep.get("issued_local"), "forecaster": ep.get("forecaster"),
                      "is_special": ep.get("is_special"), "parse_status": ep.get("parse_status")},
            "TWOCP": {"wmo": cp.get("wmo_header"),
                      "issued": (cp["issuance_utc"].strftime("%Y-%m-%dT%H:%MZ")
                                 if cp.get("issuance_utc") else None),
                      "parse_status": cp.get("parse_status")},
            "GTWO_GIS": {"vintage": gis_vintage(acquired_bytes["gtwo_shapefiles.zip"])},
            "CurrentStorms": {"activeStorms": len(storms.get("activeStorms", []))},
        },
        "global_state": {
            "active_tropical_cyclones": len(storms.get("activeStorms", [])),
            "pacific_pre_genesis_objects": len(objects),
            "excluded": "Atlantic GTWO (out of scope for the Pacific Genesis Watch)",
        },
        "objects": objects,
        "raw_sha256": {n: hashlib.sha256(b).hexdigest() for n, b in sorted(acquired_bytes.items())},
        "raw_dir": str(raw_dir.relative_to(C.ROOT)),
        "atlas_state": atlas,
        "append_rule": ("This record is immutable once committed. Later outlooks append. An "
                        "error is corrected by appending a supersession record, never by "
                        "editing this one."),
    }
    record["contemporaneity"]["acquisition_lag_min"] = round(
        (C.parse_iso(source_acquired_at) - C.parse_iso(issued_iso)).total_seconds() / 60, 1)
    return record


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seq", required=True, help="record id, e.g. 0002")
    ap.add_argument("--dry-run", action="store_true",
                    help="fetch, parse and print without writing or ledgering")
    ap.add_argument("--expect-issued-after",
                    help="refuse unless the outlook's issuance is strictly after this ISO time. "
                         "This is what makes a capture PROSPECTIVE rather than a re-capture of "
                         "an outlook already in the sequence.")
    a = ap.parse_args()

    rec = capture(a.seq, dry_run=a.dry_run)
    issued = rec["timestamps"]["source_issued_at"]
    if a.expect_issued_after and issued <= a.expect_issued_after:
        print(f"REFUSED: outlook issuance {issued} is not after {a.expect_issued_after}. "
              f"The next official issuance has not been published yet; nothing is captured "
              f"and nothing is backdated.", file=sys.stderr)
        return 3

    if a.dry_run:
        print(json.dumps({k: v for k, v in rec.items() if k not in ("objects", "atlas_state")},
                         indent=1)[:2000])
        for o in rec["objects"]:
            print(f"  {o['millibar_object_id']}  {o['nhc_name']}")
            print(f"     48h {o['formation_prob_48h']['official_text']} "
                  f"(pct={o['formation_prob_48h']['official_pct']}, "
                  f"gis={o['formation_prob_48h']['gis_attribute']})")
            print(f"     7d  {o['formation_prob_7d']['official_text']} "
                  f"(pct={o['formation_prob_7d']['official_pct']})")
        return 0

    path = C.append(rec, record_id=a.seq, kind="nhc-source-and-atlas-state",
                    note=f"Prospective capture at outlook issuance {issued}.")
    print(f"wrote {path.relative_to(C.ROOT)}")
    print("violations:", C.verify() or "none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
