"""Append an NHC-STATED association for an object whose basis was containment only.

WHAT CHANGED, AND WHERE IT IS ALLOWED TO CHANGE ANYTHING. Record 0003 recorded that Invest
EP982026's ATCF position fell inside the polygon NHC published for D1's area, and said in as
many words that NHC stated no association. NHC's next outlook heads that area

    Western East Pacific (EP98):

which is the association stated by NHC, in an NHC product. That is a stronger basis than
containment, and it arrived AFTER every committed record. So it is appended as its own state
and changes nothing behind it: 0001, 0001b, 0002, 0002c1, 0003 and 0003c1 continue to say
exactly what was supportable when each was written, and containment remains the basis THERE.

WHAT THIS DELIBERATELY DOES NOT DO. It does not re-capture the outlook as a snapshot. A full
capture would run object_id_for over the new names, and NHC appended "(EP98)" to a descriptor
it did not otherwise change -- which an exact-string identity rule reads as a rename, minting
a new object and dropping D1's HORIZON test at the moment NHC supplied MORE identifying
information, not less. The identity rule is not amended here either: a single parenthetical
annotation is not evidence enough to loosen the one rule that keeps this watch from asserting
continuity for free. Both are recorded below as observed and deferred.

Run: python3 scripts/genesis-watch/append_association.py --seq 0004 --object PGW-2026-D1 [--dry-run]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import contract as C

SOURCES = {
    "MIATWOEP.html": "https://www.nhc.noaa.gov/text/MIATWOEP.shtml",
    "MIAHSFEP2.html": "https://www.nhc.noaa.gov/text/MIAHSFEP2.shtml",
    "bep982026.dat": "https://ftp.nhc.noaa.gov/atcf/btk/bep982026.dat",
}
ATCF_ID = "EP982026"
INVEST_TOKEN = "EP98"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "millibar-genesis-watch/1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def pre_text(raw: bytes) -> str:
    t = raw.decode("utf-8", "replace")
    m = re.search(r"<pre>(.*?)</pre>", t, re.S | re.I)
    import html as _h
    return _h.unescape(m.group(1)) if m else t


def outlook_facts(text: str) -> dict:
    """The product's own WMO header, issuance line, and the heading that carries the invest."""
    wmo = re.search(r"^(A\w{3}\d{2}\s+\w{4}\s+\d{6})\s*$", text, re.M)
    issued = re.search(r"^(\d{3,4}\s+(?:AM|PM)\s+\w{3}\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4})\s*$",
                       text, re.M)
    heading = None
    for line in text.splitlines():
        s = line.strip()
        if s.endswith(":") and INVEST_TOKEN in s:
            heading = s
            break
    return {"wmo_header": wmo.group(1) if wmo else None,
            "issuance_line": issued.group(1) if issued else None,
            "heading": heading}


def high_seas_position(text: str) -> dict | None:
    """The High Seas Forecast's own position for the invest -- a PEER, never merged with ATCF."""
    flat = re.sub(r"\s+", " ", text)
    m = re.search(r"INVEST\s+" + INVEST_TOKEN + r"\s*\.\.\.\s*NEAR\s+(\d+(?:\.\d+)?)N\s*"
                  r"(\d+(?:\.\d+)?)W\s*(\d+)\s*MB", flat)
    if not m:
        return None
    return {"position": f"{m.group(1)}N {m.group(2)}W", "mslp_mb": int(m.group(3)),
            "source": "NHC High Seas Forecast (MIAHSFEP2)"}


def atcf_latest(raw: bytes) -> dict | None:
    rows = []
    for line in raw.decode("utf-8", "replace").splitlines():
        f = [x.strip() for x in line.split(",")]
        if len(f) < 28 or f[4] != "BEST":
            continue
        rows.append(f)
    if not rows:
        return None
    f = rows[-1]
    lat = int(f[6][:-1]) / 10
    lon = int(f[7][:-1]) / 10
    return {"valid": f"{f[2][:4]}-{f[2][4:6]}-{f[2][6:8]}T{f[2][8:]}:00Z",
            "position": f"{lat:.1f}N {lon:.1f}W", "vmax_kt": int(f[8]),
            "mslp_mb": int(f[9]) or None, "name_field": f[27],
            "source": "ATCF b-deck bep982026.dat"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seq", required=True)
    ap.add_argument("--object", required=True, help="the existing object id this associates to")
    ap.add_argument("--expect-issued-after", help="WMO header day/time the product must exceed")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    prior = {e["record_id"]: e for e in C.read_ledger()["entries"]}
    for need in ("0003",):
        if need not in prior:
            raise SystemExit(f"record {need} is not committed; nothing to upgrade.")

    acquired = C.now_utc()
    raw = {name: fetch(url) for name, url in SOURCES.items()}
    two = pre_text(raw["MIATWOEP.html"])
    facts = outlook_facts(two)
    if not facts["heading"]:
        raise SystemExit(
            f"REFUSED: no outlook heading in this product carries {INVEST_TOKEN}. NHC does not "
            f"state the association here, so none is appended and the containment basis stands.")
    if a.expect_issued_after and facts["wmo_header"] and \
            facts["wmo_header"].split()[-1] <= a.expect_issued_after:
        raise SystemExit(f"REFUSED: {facts['wmo_header']} is not after {a.expect_issued_after}.")

    hs = high_seas_position(pre_text(raw["MIAHSFEP2.html"]))
    atcf = atcf_latest(raw["bep982026.dat"])

    rec = {
        "schema": "millibar.pacific-genesis-watch.association/1",
        "label": "NHC-STATED ASSOCIATION — APPENDED, EARLIER RECORDS UNCHANGED",
        "record_id": a.seq,
        "appends_to": "0003",
        "appends_to_manifest_sha256": prior["0003"]["manifest_sha256"],
        "object": a.object,
        "why_separate": (
            "0003 recorded that the invest's ATCF position fell inside this area's published "
            "polygon and that NHC stated no association. This product states one. It was issued "
            "after every committed record, so it is appended rather than folded backwards."),
        "timestamps": {
            "source_issued_at": None,
            "source_issued_at_note": (
                f"the product prints its issuance as {facts['issuance_line']!r} in local time; "
                f"its WMO header {facts['wmo_header']!r} carries the UTC day and time group, "
                f"which is what the acquisition below is checked against"),
            "source_wmo_header": facts["wmo_header"],
            "source_acquired_at": acquired,
            "atlas_computed_at": None,
            "atlas_computed_at_note": (
                "No Atlas state is computed for this record. Nothing about the archive changed; "
                "what changed is the strength of one association in the NHC record."),
            "snapshot_committed_at": None,
        },
        "association": {
            "basis_before": "GEOMETRIC CONTAINMENT OF TWO OFFICIAL PRODUCTS (record 0003)",
            "basis_now": "STATED BY NHC IN AN NHC PRODUCT",
            "evidence": {
                "product": "Tropical Weather Outlook (TWOEP)",
                "wmo_header": facts["wmo_header"],
                "issuance_line": facts["issuance_line"],
                "heading_verbatim": facts["heading"],
                "what_it_says": (
                    f"NHC heads this outlook area with the invest identifier itself, so the "
                    f"association between the area and {INVEST_TOKEN} is NHC's own, not a "
                    f"relation computed between two of its products."),
            },
            "nhc_states_this_association": True,
            "supersedes_wording": (
                "From this record forward the association may be described as stated by NHC. "
                "Records 0001 through 0003c1 continue to describe it as containment only, "
                "because that is what was supportable when each was written."),
        },
        "invest_position_peers": {
            "note": ("Two official products place this invest, and they do not agree to the "
                     "tenth of a degree. Both are carried; neither is averaged, reconciled or "
                     "preferred, and no position is plotted except from the product that owns "
                     "it."),
            "high_seas": hs,
            "atcf": atcf,
        },
        "identity": {
            "object_unchanged": a.object,
            "no_new_object_minted": True,
            "why": (
                "NHC appended a parenthetical invest annotation to a descriptor it did not "
                "otherwise change. The identity rule carries an id forward only on a "
                "byte-identical NHC name string, so a full re-capture would read that as a "
                "rename, mint a new object and drop this one's test label -- refusing "
                "continuity at the moment NHC supplied MORE identifying information. This "
                "record therefore associates to the existing object and mints nothing."),
            "identity_rule_unchanged": (
                "object_id_for is NOT amended. One parenthetical annotation is not evidence "
                "enough to loosen the rule that keeps this watch from asserting continuity for "
                "free. If such annotations recur, that is a separate change with its own "
                "evidence."),
        },
        "observed_and_deferred": [
            {"what": "NHC renamed the third outlook area from 'South of Southern Mexico' to "
                     "'South of Southwestern Mexico' in this same product.",
             "consequence": "A full capture would mint a new identifier for it, correctly, the "
                            "way PGW-2026-N4 was minted when that area was last renamed.",
             "why_deferred": "This record is scoped to one association. The rename is recorded "
                             "here as observed so that it is not discovered later as a surprise, "
                             "and it is not acted on without a capture that is about it."},
        ],
        "raw_sha256": {name: sha(b) for name, b in sorted(raw.items())},
        "append_rule": ("This record is immutable once committed. Later states append new "
                        "records; an error is corrected by appending a supersession record, "
                        "never by editing this one or any record before it."),
    }

    if a.dry_run:
        print(json.dumps(rec, indent=1, ensure_ascii=False))
        return 0

    raw_dir = C.ROOT / "data" / "genesis-watch" / "raw" / a.seq
    raw_dir.mkdir(parents=True, exist_ok=True)
    for name, b in raw.items():
        (raw_dir / name).write_bytes(b)

    path = C.append(rec, record_id=a.seq, kind="association",
                    note=f"NHC states the {INVEST_TOKEN} association for {a.object}; "
                         f"basis upgraded from containment. Earlier records unchanged.")
    print(f"appended {path.relative_to(C.ROOT)}")
    print(json.dumps({"heading": facts["heading"], "wmo": facts["wmo_header"],
                      "object": a.object, "high_seas": (hs or {}).get("position"),
                      "atcf": (atcf or {}).get("position")}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
