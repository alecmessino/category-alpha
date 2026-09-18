"""The stable identity of the archive content a cohort answer depends on.

WHY THIS EXISTS, AND WHY `archive_stamp` COULD NOT DO THE JOB.

`provenance.archive_stamp` digests all six archive tables, two of which are SUPPOSED to change
every day: `daily_disturbances` (the TWO ingest) and `environment` (rows appended per storm per
analysis hour). Measured across seven consecutive ingest commits, all with `archive_built_utc`
fixed at 2026-08-18T05:18:57Z, the stamp took seven different values while the four tables a
cohort answer is computed from did not move at all:

    genesis_events  5fe9f13d...   constant  x7
    landfalls       5cfd2f72...   constant  x7
    storms          ec45a235...   constant  x7
    track_points    865d9053...   constant  x7
    environment                   changed   x7
    daily_disturb.                changed   x7

So a counterparty who cited the stamp cited a value that moved several times a day over an
archive that had not changed. `archive_stamp` remains a perfectly good BUILD identifier and is
not removed; it simply stops being the thing an outside party is asked to verify.

WHAT THIS IDENTIFIER GUARANTEES, EXACTLY

  It names the archive content that determines the historical cohort / replay answer.

It does NOT certify the packed binary the browser reads. That bridge already exists and is
already machine-checked: scripts/test-atlas-pack.mjs digests every packed column FROM the
Parquet and recomputes it FROM the pack through the browser's own accessors, and CI runs it as
"Verify the Atlas pack still says what the archive says". The two together are the guarantee;
neither is asked to be the other.

THE HASHING CONTRACT IS VERSIONED. `DERIVATION` travels in the manifest beside the digest, so a
future change to what is hashed -- a fifth table, a different payload shape -- is a new version
rather than a silent reinterpretation of the same field name.
"""
from __future__ import annotations

import hashlib
import json

# THE ONE LIST. Every archive table whose CONTENT determines a cohort answer, and the source of
# truth for both the derivation below and scripts/test-atlas-cohort-identity.mjs. The Atlas
# engine carries the same list as COHORT_SOURCE_TABLES in docs/storm-atlas/src/engine/cohort.js
# and the gate fails if the two disagree, so a cohort dependency cannot be added on one side
# without the identity being extended on the other.
#
#   storms          membership, season, basin, max intensity -- every filter and intensity row
#   genesis_events  the genesis position and time the whole query is keyed to
#   landfalls       the landfall rows and their intensity at crossing
#   track_points    the derived threshold crossings behind time-to-event
COHORT_TABLES: tuple[str, ...] = ("genesis_events", "landfalls", "storms", "track_points")

DERIVATION = "cohort-archive-id/1"


def cohort_archive_id(table_sha256: dict) -> str:
    """The full SHA-256 over the cohort-driving tables' digests, as canonical JSON.

    The payload is a LIST in COHORT_TABLES order, not a dict, so the ordering is fixed by the
    constant rather than by whatever a dict happens to iterate. Each entry carries the table's
    own sha256 and its byte length; the digest alone decides content, and the length is carried
    so the payload states what it hashed rather than only the hash of it.

    Raises if a cohort-driving table is missing from the manifest: an identity computed over
    three tables that claims to cover four is worse than no identity at all.
    """
    missing = [t for t in COHORT_TABLES if t not in table_sha256]
    if missing:
        raise KeyError(f"cohort-driving table(s) absent from table_sha256: {', '.join(missing)}")
    payload = json.dumps(
        [[t, table_sha256[t]["sha256"], table_sha256[t]["bytes"]] for t in COHORT_TABLES],
        sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def identity_fields(table_sha256: dict) -> dict:
    """The three keys that travel in `provenance`, together."""
    return {
        "cohort_archive_id": cohort_archive_id(table_sha256),
        "cohort_archive_id_derivation": DERIVATION,
        "cohort_archive_id_tables": list(COHORT_TABLES),
    }


def _stamp(manifest_path: str) -> int:
    """Write the identity into an existing manifest from its own table_sha256.

    This exists so the identity can be added to a manifest WITHOUT re-running the pack build,
    which would rewrite every packed binary and move every file digest -- the exact churn this
    work is characterising. It is safe because it derives from digests already in the file, and
    because scripts/test-atlas-cohort-identity.mjs recomputes the value independently: a stale
    or hand-edited id fails CI rather than sitting there looking plausible.
    """
    import pathlib
    p = pathlib.Path(manifest_path)
    m = json.loads(p.read_text())
    prov = m.get("provenance") or {}
    fields = identity_fields(prov["table_sha256"])
    if all(prov.get(k) == v for k, v in fields.items()):
        print(f"unchanged  {fields['cohort_archive_id']}")
        return 0
    prov.update(fields)
    m["provenance"] = prov
    p.write_text(json.dumps(m, indent=1, sort_keys=True) + "\n")
    print(f"stamped    {fields['cohort_archive_id']}  ({DERIVATION})")
    return 0


if __name__ == "__main__":
    import sys
    raise SystemExit(_stamp(sys.argv[1]))
