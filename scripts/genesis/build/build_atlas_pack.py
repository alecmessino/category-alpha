"""Pack the archive into the binary the Storm Atlas reads in a browser.

WHY THIS EXISTS. Until now the only path from this archive to a browser was
`emit_panel.py` -> `docs/data/analogs.json`: 24 KB of pre-aggregated rates for the three
systems that happen to be live, carrying at most eight analog cases and NO track geometry.
That is a renderer's payload, and it is the right shape for the terminal's panel. It cannot
answer "show me every storm that formed here and where it went", because the 224,153 track
points it would need have never left the Parquet.

This emits those rows. Not as Parquet -- a browser cannot read Parquet without a multi-megabyte
wasm decoder, which would cost more than the data. Not as JSON -- 224k objects parse in seconds
and cost four times the bytes. As COLUMNAR TYPED ARRAYS, which is what the data already is: the
browser fetches, gunzips, and takes zero-copy views over the result. There is no parse step.

WHAT THIS FILE IS NOT ALLOWED TO DO. It does not compute a rate, an interval, a probability or a
skill number. It moves rows and it precomputes indexes that are pure functions of those rows.
Every derived column it does emit -- the cat2/cat4/cat5 crossings the archive does not store, the
per-storm landfall count, the subbasin membership mask -- is computed by REPLICATING THE
ARCHIVE'S OWN RULE, in this process, against the same tables, and is emitted under a `derived:`
source key so nothing downstream can mistake it for a column IBTrACS published.

PRECISION IS A CORRECTNESS PROPERTY HERE, NOT A SIZE TRADE-OFF.
The Atlas ships a transliteration of `retrieval/analogs.py` that must agree with the Python to
within a measured tolerance (scripts/test-atlas-parity.mjs). Any column that feeds that
arithmetic -- genesis latitude and longitude, peak wind, the hours-to-event distributions -- is
therefore written as float64 and never quantised, because a value rounded on the way out is a
disagreement the parity test would blame on the port. Columns that feed only the SCREEN are
quantised aggressively: track positions are stored as int16 hundredths of a degree, which is
lossless because IBTrACS publishes them on exactly that grid (verified: max deviation 9.1e-13
degrees over all 224,153 points), and winds and pressures are integral knots and millibars.

CONTAINER FORMAT
    magic    b"MBATLAS1"
    hdrlen   uint32 little-endian
    header   JSON, hdrlen bytes -- column offsets, dtypes, string dictionaries, provenance
    blob     column bytes, each aligned to 8 so a Float64Array view needs no copy
The whole file is then gzipped. The header compresses with the data, and the browser un-gzips
with DecompressionStream, so this needs no decompression library at either end.

THREE FILES, NOT ONE, AND THE SPLIT IS DELIBERATE.
    atlas-core    storms, genesis_events, landfalls, indexes   -- changes when the archive does
    atlas-tracks  224,153 track points                         -- changes only on a rebuild
    atlas-env     32,881 environment rows                      -- lazy; the Atlas does not need
                                                                  it to draw a map
The daily job appends a handful of rows and re-runs this. Writing one 2.5 MB blob every time
would put ~10 MB of near-identical binary into git every day. Each file is rewritten only when
its content actually changes, so the track block -- the big one -- is written when tracks change
and not otherwise.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import struct
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from ..provenance import (ARCHIVE_DIR, METHODOLOGY_VERSION, PROCESSING_VERSION, REPO_ROOT,
                          sha256_file)
from ..schema import THRESHOLDS_KT
from ..store import read_table, table_path

OUT_DIR = REPO_ROOT / "docs" / "storm-atlas" / "data"

MAGIC = b"MBATLAS1"
PACK_FORMAT = 1

# Sentinels. A browser typed array has no null bitmap, so absence is carried in-band and the
# value chosen must be one the column cannot legitimately hold. int16 columns are winds,
# pressures and scaled coordinates, none of which reach -32768; int32 columns are minutes since
# epoch, which reach -62 million at 1851 and are nowhere near INT32_MIN.
I16_NULL = -32768
I32_NULL = -2147483648

MS_PER_MIN = 60000

# The subbasins that get a bit in the membership mask, in bit order. This is the index behind
# `_storms_entering()` in retrieval/analogs.py -- the guard that keeps Iniki in a Hawaii query.
# Measured on this archive: 116 storms have a Central Pacific GENESIS, 664 have at least one CP
# track point. Filtering Hawaii work on genesis subbasin discards 548 storms including the most
# destructive hurricane ever to strike Hawaii, which formed at 134W in the East Pacific.
SUBBASIN_BITS = ["NA", "EP", "CP", "CS", "GM", "AS", "WP", "NI"]

# The window inside which an environment record counts as "the environment at genesis".
# Same constant, same reason, as retrieval/analogs.py:482.
ENV_GENESIS_WINDOW_H = 12.0


# --------------------------------------------------------------------------------------
# column encoders
# --------------------------------------------------------------------------------------

def _col(arr: np.ndarray, dtype: str, **meta) -> dict:
    """A column descriptor plus its bytes, ready for the writer."""
    return {"dtype": dtype, "_bytes": arr.tobytes(), "_n": len(arr), **meta}


def f64(values) -> dict:
    """Full precision, NaN for null. Used for anything the query engine does arithmetic on."""
    a = np.array([np.nan if v is None else float(v) for v in values], dtype=np.float64)
    return _col(a, "f64", null="nan")


def i32(values) -> dict:
    a = np.array([I32_NULL if v is None else int(v) for v in values], dtype=np.int32)
    return _col(a, "i32", null=I32_NULL)


def i16(values) -> dict:
    """Integral columns only. Asserts integrality rather than rounding silently."""
    out = np.empty(len(values), dtype=np.int16)
    for i, v in enumerate(values):
        if v is None or (isinstance(v, float) and v != v):
            out[i] = I16_NULL
            continue
        f = float(v)
        if f != round(f):
            raise ValueError(f"i16 column carries a non-integral value {f!r}; use f64")
        out[i] = int(round(f))
    return _col(out, "i16", null=I16_NULL)


# How far off the 1/scale grid a value may sit before the packer refuses it. IBTrACS publishes
# positions on the 0.01-degree grid, so a real deviation is tiny and arises only from the
# archive's own arithmetic: `signed_lon` subtracts 360 from an eastern longitude, and
# 180.1 - 360 lands one ULP away from -179.9. Measured over all 224,153 points the worst case
# is 2.8e-14 degrees, about three nanometres. This bound is four orders of magnitude looser
# than that and eight orders tighter than the published precision, so it admits the arithmetic
# and refuses an actual precision loss.
GRID_TOLERANCE_DEG = 1e-9


def i16_scaled(values, scale: int) -> dict:
    """Fixed-point, with the deviation it introduces MEASURED AND DECLARED rather than assumed.

    Quantising a coordinate is a lie unless the size of the lie is on the record. This raises
    if any value sits further off the 1/scale grid than GRID_TOLERANCE_DEG, and reports the
    worst deviation it did accept, which the manifest publishes and the pack test asserts a
    bound on.
    """
    out = np.empty(len(values), dtype=np.int16)
    worst = 0.0
    for i, v in enumerate(values):
        if v is None or (isinstance(v, float) and v != v):
            out[i] = I16_NULL
            continue
        x = float(v) * scale
        r = round(x)
        dev = abs(x - r) / scale
        if dev > GRID_TOLERANCE_DEG:
            raise ValueError(f"value {v!r} is {dev} off the 1/{scale} grid -- pack it as f64")
        worst = max(worst, dev)
        out[i] = int(r)
    return _col(out, "i16", null=I16_NULL, scale=scale, quantised=1.0 / scale,
                max_deviation=worst)


def t_min(values) -> dict:
    """Timestamps as minutes since the epoch, for columns published on synoptic hours.

    The Parquet declares timestamp[s] and the files on disk are TIMESTAMP_MILLIS -- Arrow
    coerced on write. pyarrow hands back datetimes either way, so this converts from the
    datetime and the discrepancy cannot reach the browser.

    IT RAISES ON A SUB-MINUTE VALUE RATHER THAN TRUNCATING. Best-track fixes are on the hour,
    so minutes are lossless and half the width of milliseconds -- but landfalls are not: 997 of
    3,379 are segment crossings interpolated to the second, and quietly dropping up to 59
    seconds off a landfall time is precisely the kind of invisible rounding this archive
    refuses. Those columns use t_ms instead, and this assertion is what makes choosing wrong a
    build failure rather than a silent one.
    """
    out = np.empty(len(values), dtype=np.int32)
    for i, v in enumerate(values):
        if v is None:
            out[i] = I32_NULL
            continue
        dt = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        secs = dt.timestamp()
        if secs % 60 != 0:
            raise ValueError(f"{v!r} is not on a whole minute; this column needs t_ms")
        out[i] = int(secs) // 60
    return _col(out, "i32", null=I32_NULL, unit="minutes_since_epoch")


def t_ms(values) -> dict:
    """Timestamps as float64 milliseconds since the epoch -- the unit JS Date takes directly.

    float64 holds every integer below 2^53 exactly, so this is lossless for any instant within
    285,000 years of the epoch. int32 seconds would not be: 1851 is -3.74e9 seconds, past
    INT32_MIN, so the archive's oldest landfalls would overflow.
    """
    out = np.empty(len(values), dtype=np.float64)
    for i, v in enumerate(values):
        if v is None:
            out[i] = np.nan
            continue
        dt = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        out[i] = round(dt.timestamp() * 1000)
    return _col(out, "f64", null="nan", unit="milliseconds_since_epoch")


def dict_str(values) -> dict:
    """String column as a dictionary plus codes. Code 0 is always null.

    Every string column in this archive is low-cardinality relative to its length -- 3,959
    storm ids over 3,959 rows is the worst case and still worth dictionarising, because the
    codes then gzip to almost nothing and the ids appear once each in the header.
    """
    seen: dict = {}
    order: list = []
    for v in values:
        if v is None or v in seen:
            continue
        seen[v] = len(order) + 1
        order.append(v)
    width = np.uint8 if len(order) < 255 else np.uint16
    codes = np.array([0 if v is None else seen[v] for v in values], dtype=width)
    return _col(codes, "u8" if width is np.uint8 else "u16", dictionary=order, null=0)


def bool3(values) -> dict:
    """0 = unknown, 1 = false, 2 = true.

    A two-state encoding would have to pick a side for NULL, and on this archive NULL means
    something specific: `storms.reached_cat1` is NULL for 276 storms whose intensity was never
    recorded. Those are not storms that failed to reach hurricane strength.
    """
    a = np.array([0 if v is None else (2 if v else 1) for v in values], dtype=np.uint8)
    return _col(a, "u8", null=0, encoding="0=unknown,1=false,2=true")


def u32(arr) -> dict:
    return _col(np.asarray(arr, dtype=np.uint32), "u32")


def u16(arr) -> dict:
    return _col(np.asarray(arr, dtype=np.uint16), "u16")


def u8(arr) -> dict:
    return _col(np.asarray(arr, dtype=np.uint8), "u8")


# --------------------------------------------------------------------------------------
# writer
# --------------------------------------------------------------------------------------

class Pack:
    def __init__(self, kind: str, header_extra: dict):
        self.kind = kind
        self.header = {"format": PACK_FORMAT, "kind": kind, "tables": {}, "indexes": {},
                       **header_extra}
        self.blob = bytearray()

    def _place(self, col: dict) -> dict:
        # 8-byte alignment so a Float64Array can be a view rather than a copy.
        while len(self.blob) % 8:
            self.blob.append(0)
        off = len(self.blob)
        self.blob.extend(col["_bytes"])
        out = {k: v for k, v in col.items() if not k.startswith("_")}
        out["offset"] = off
        out["length"] = col["_n"]
        return out

    def table(self, name: str, rows: int, columns: dict, note: str = "") -> None:
        self.header["tables"][name] = {
            "rows": rows,
            "note": note,
            "columns": {k: self._place(v) for k, v in columns.items()},
        }

    def index(self, name: str, col: dict, note: str = "") -> None:
        entry = self._place(col)
        entry["note"] = note
        self.header["indexes"][name] = entry

    def to_bytes(self) -> bytes:
        hdr = json.dumps(self.header, sort_keys=True, separators=(",", ":")).encode("utf-8")
        # Pad the header so the blob STARTS on an 8-byte boundary. Aligning blocks within the
        # blob is not enough: a TypedArray view is taken against the whole ArrayBuffer, so what
        # has to be a multiple of 8 is 12 + len(header) + block offset, not the block offset
        # alone. Without this a Float64Array view throws outright, which is at least a loud
        # failure -- but padding costs at most seven spaces and removes the class of bug.
        pad = (-(12 + len(hdr))) % 8
        hdr += b" " * pad
        return MAGIC + struct.pack("<I", len(hdr)) + hdr + bytes(self.blob)


def _write_if_changed(path: Path, payload: bytes) -> tuple[bool, int]:
    """Gzip and write only when the content differs.

    mtime is not content. This job runs four times a day and mostly produces identical bytes;
    rewriting anyway would put a fresh multi-megabyte binary into git on every run.
    `mtime=0` keeps gzip's own header deterministic so identical input gives identical output.
    """
    buf = gzip.compress(payload, compresslevel=9, mtime=0)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == buf:
        return False, len(buf)
    path.write_bytes(buf)
    return True, len(buf)


# --------------------------------------------------------------------------------------
# derived columns -- each replicates a rule that already exists in this package
# --------------------------------------------------------------------------------------

def _is_tropical(stage, nature) -> bool:
    """Mirror of build/genesis_events.py's tropicality test, imported rather than guessed."""
    from .genesis_events import _is_tropical as impl
    return impl(stage, nature)


def derive_crossings(points_by_storm: dict, storm_ids: list) -> dict:
    """The cat2/cat4/cat5 crossings the archive computes and does not store.

    `build_genesis_events` evaluates every threshold in THRESHOLDS_KT and then writes only
    ts/cat1/cat3 to the row -- cat2 has no column at all, and cat4/cat5 have a timestamp but no
    hours-to-event. The Atlas needs the full ladder to draw a lifecycle, so this re-runs THAT
    loop, on the same pool, with the same rules:

      * crossings are established on OBSERVED points only; a track with no observed point at
        all falls back to its full point list and is flagged upstream by the archive's own
        `source_key = derived:ibtracs+interpolated_only`
      * only points at or after genesis are eligible
      * the crossing is the FIRST point at or above the threshold, not the maximum

    Emitted under `derived:atlas_pack` so a reader can never mistake these for IBTrACS columns.
    """
    out = {k: [] for k in ("cat2_t", "cat4_t", "cat5_t",
                           "hours_to_cat2", "hours_to_cat4", "hours_to_cat5")}
    for sid in storm_ids:
        pts = points_by_storm.get(sid, [])
        observed = [p for p in pts if p["quality"] != "interpolated"]
        pool = observed or pts
        tropical = [p for p in pool if _is_tropical(p["stage"], p["nature"])]
        gen_t = tropical[0]["iso_time"] if tropical else None
        after = [p for p in pool if gen_t is None or p["iso_time"] >= gen_t]
        for key in ("cat2", "cat4", "cat5"):
            thr = THRESHOLDS_KT[key]
            hit = next((p for p in after
                        if p["vmax_kt"] is not None and p["vmax_kt"] == p["vmax_kt"]
                        and p["vmax_kt"] >= thr), None)
            out[f"{key}_t"].append(hit["iso_time"] if hit else None)
            out[f"hours_to_{key}"].append(
                (hit["iso_time"] - gen_t).total_seconds() / 3600.0
                if (hit and gen_t) else None)
    return out


def subbasin_masks(points_by_storm: dict, storm_ids: list) -> np.ndarray:
    """One bit per subbasin the storm was EVER in, from its track points.

    This is `_storms_entering()` precomputed. Doing it in the browser would mean a full scan of
    224,153 rows on every query that filters by basin, which is the one filter a Hawaii question
    always uses.
    """
    bit = {name: 1 << i for i, name in enumerate(SUBBASIN_BITS)}
    out = np.zeros(len(storm_ids), dtype=np.uint8)
    for i, sid in enumerate(storm_ids):
        m = 0
        for p in points_by_storm.get(sid, []):
            b = bit.get(p["subbasin"])
            if b:
                m |= b
        out[i] = m
    return out


def env_at_genesis(env_rows: list, storm_ids: list, genesis_t: list) -> tuple:
    """Per storm: the environment row nearest genesis, and how far away in time it is.

    Same selection rule as retrieval/analogs.py:468-482 -- nearest `iso_time` to the storm's
    genesis, then DISCARDED if it is more than 12 hours away. Precomputed because the Atlas
    needs to say "this storm has no archived environment near genesis" for the majority of the
    record, and answering that should not require loading the environment table at all.

    Returns (row index into the environment pack, |dt| in hours). Index -1 and NaN mean there is
    no qualifying row -- which is the answer for 1876-1979 in its entirety, since SHIPS begins
    in 1982.
    """
    want = {sid: t for sid, t in zip(storm_ids, genesis_t) if t is not None}
    best: dict = {}
    for i, r in enumerate(env_rows):
        sid = r["storm_id"]
        t = want.get(sid)
        if t is None or r["iso_time"] is None:
            continue
        dt = abs((r["iso_time"] - t).total_seconds())
        if sid not in best or dt < best[sid][0]:
            best[sid] = (dt, i)
    idx, dth = [], []
    for sid in storm_ids:
        hit = best.get(sid)
        if hit is None or hit[0] > ENV_GENESIS_WINDOW_H * 3600:
            idx.append(-1)
            dth.append(None)
        else:
            idx.append(hit[1])
            dth.append(hit[0] / 3600.0)
    return np.array(idx, dtype=np.int32), dth




# --------------------------------------------------------------------------------------
# the build
# --------------------------------------------------------------------------------------

def _rows(name: str, base: Path) -> list[dict]:
    return read_table(name, base).to_pylist()


def _provenance(base: Path) -> dict:
    """What the pack was built from, hashed.

    The snapshot hashes are read off the files this run actually opened rather than copied
    from MANIFEST.json, because the manifest is written by the full build and is NOT rewritten
    by the daily append -- it currently under-reports `environment` by 39 rows. The manifest's
    GAPS are copied, because those are findings and belong on screen.
    """
    tables = {}
    for name in ("storms", "track_points", "genesis_events", "landfalls", "environment",
                 "daily_disturbances"):
        p = table_path(name, base)
        if p.exists():
            tables[name] = {"sha256": sha256_file(p), "bytes": p.stat().st_size}
    manifest = base / "MANIFEST.json"
    man = json.loads(manifest.read_text()) if manifest.exists() else {}
    # A deterministic identity for the archive state this pack was built from. It replaces a
    # wall-clock build time on purpose: with a timestamp in the header every run produced
    # different bytes, and _write_if_changed could then never find anything unchanged -- which
    # is the whole mechanism keeping a megabyte of identical track binary out of git four times
    # a day. The pack's currency is the ARCHIVE's currency, and this is what states it.
    stamp = hashlib.sha256(
        "".join(f"{k}:{v['sha256']}" for k, v in sorted(tables.items())).encode()
    ).hexdigest()[:16]
    return {
        "archive_dir": "data/genesis-archive",
        "archive_stamp": stamp,
        "table_sha256": tables,
        "archive_built_utc": man.get("built_utc"),
        "archive_sources": [s.get("key") for s in man.get("sources", [])],
        "gaps": man.get("gaps", []),
    }


def build(base: Path | None = None, out_dir: Path | None = None) -> dict:
    base = base or ARCHIVE_DIR
    out = out_dir or OUT_DIR

    storms = _rows("storms", base)
    genesis = {g["storm_id"]: g for g in _rows("genesis_events", base)}
    tracks = _rows("track_points", base)
    landfalls = _rows("landfalls", base)
    env = _rows("environment", base)

    sids = [s["storm_id"] for s in storms]
    row_of = {sid: i for i, sid in enumerate(sids)}
    if len(row_of) != len(sids):
        raise ValueError("storms.storm_id is not unique -- the pack keys everything on it")

    by_storm: dict = {}
    for p in tracks:
        by_storm.setdefault(p["storm_id"], []).append(p)
    for pts in by_storm.values():
        pts.sort(key=lambda p: p["iso_time"])
    orphans = sorted(set(by_storm) - set(row_of))
    if orphans:
        raise ValueError(f"track points reference {len(orphans)} unknown storms")

    g = [genesis.get(sid, {}) for sid in sids]
    genesis_t = [x.get("genesis_utc") for x in g]

    # Every table is re-ordered so that one storm's rows are one contiguous slice, and the
    # per-storm offset/count indexes are built against THAT order. Sorting happens before any
    # index is computed so an index can never point into a different ordering than the one
    # shipped -- which is the bug this ordering discipline exists to make impossible.
    ordered, tp_off, tp_cnt = [], [], []
    for sid in sids:
        pts = by_storm.get(sid, [])
        tp_off.append(len(ordered))
        tp_cnt.append(len(pts))
        ordered.extend(pts)
    if len(ordered) != len(tracks):
        raise ValueError("re-ordering lost track points")
    if tp_cnt and max(tp_cnt) > 65535:
        raise ValueError("a storm has more than 65535 points; storm_count needs uint32")

    lf = sorted(landfalls, key=lambda r: (row_of.get(r["storm_id"], 1 << 30), r["landfall_utc"]))
    if any(r["storm_id"] not in row_of for r in lf):
        raise ValueError("a landfall references an unknown storm")
    lf_off, lf_cnt = [0] * len(sids), [0] * len(sids)
    for i, r in enumerate(lf):
        k = row_of[r["storm_id"]]
        if lf_cnt[k] == 0:
            lf_off[k] = i
        lf_cnt[k] += 1

    # ENVIRONMENT KEEPS ITS ARCHIVE ORDER, and that is a parity requirement rather than a
    # convenience. retrieval/analogs.py standardises an env_vector against the MATCHED POOL by
    # summing each field over `env_by_storm.values()`, whose iteration order is the order the
    # rows were first seen while scanning the environment table. Floating-point addition is not
    # associative, so re-ordering the table changes the mean in its last bits, which changes the
    # standard deviation, which changes every environment weight. The browser can only reproduce
    # the Python's arithmetic if it walks the rows in the same order the Python did.
    #
    # Per-storm access therefore goes through a permutation instead of a contiguous slice.
    env_sorted = env
    env_idx, env_dt = env_at_genesis(env_sorted, sids, genesis_t)
    env_order = sorted(range(len(env)),
                       key=lambda i: (row_of.get(env[i]["storm_id"], 1 << 30), env[i]["iso_time"]))
    env_off, env_cnt = [0] * len(sids), [0] * len(sids)
    for pos, i in enumerate(env_order):
        k = row_of.get(env[i]["storm_id"])
        if k is None:
            continue
        if env_cnt[k] == 0:
            env_off[k] = pos
        env_cnt[k] += 1

    derived = derive_crossings(by_storm, sids)

    prov = _provenance(base)
    common = {
        "archive_stamp": prov["archive_stamp"],
        "archive_built_utc": prov["archive_built_utc"],
        "processing_version": PROCESSING_VERSION,
        "methodology_version": METHODOLOGY_VERSION,
        "provenance": prov,
    }
    written: dict = {}

    # ---- tracks -----------------------------------------------------------------------
    def tcol(key):
        return [p[key] for p in ordered]

    tp = Pack("tracks", common)
    tp.table("track_points", len(ordered), {
        # int16 hundredths of a degree -- lossless on this archive, and i16_scaled raises
        # rather than rounds if that ever stops being true.
        "lat": i16_scaled(tcol("lat"), 100),
        "lon": i16_scaled(tcol("lon"), 100),
        "t": t_min(tcol("iso_time")),
        "vmax_kt": i16(tcol("vmax_kt")),
        "mslp_mb": i16(tcol("mslp_mb")),
        "stage": dict_str(tcol("stage")),
        "nature": dict_str(tcol("nature")),
        "basin": dict_str(tcol("basin")),
        "subbasin": dict_str(tcol("subbasin")),
        "quality": dict_str(tcol("quality")),
        "synoptic": bool3(tcol("synoptic")),
    }, note=("ordered by storm (storms row order) then time. hours_since_genesis is NOT packed: "
             "it is exactly (t - genesis_t)/60 on every row of this archive (verified: 0 rows "
             "differ in nullness, max error 0.0) and is derived in the browser. "
             "storm_speed_kt, storm_dir_deg and dist2land_km are in the archive and not packed "
             "-- no Phase 1 surface reads them."))
    tp.index("storm_offset", u32(tp_off), "first track-point row for storms[i]")
    tp.index("storm_count", u16(tp_cnt), "track-point count for storms[i]")
    written["atlas-tracks-v1.bin.gz"] = tp.to_bytes()

    # ---- core -------------------------------------------------------------------------
    def scol(key):
        return [s[key] for s in storms]

    def gcol(key):
        return [x.get(key) for x in g]

    def lcol(key):
        return [r[key] for r in lf]

    cp = Pack("core", common)
    cp.table("storms", len(storms), {
        "storm_id": dict_str(scol("storm_id")),
        "atcf_id": dict_str(scol("atcf_id")),
        "name": dict_str(scol("name")),
        "basin": dict_str(scol("basin")),
        "subbasin": dict_str(scol("subbasin")),
        "season": i32(scol("season")),
        "genesis_t": t_min(scol("genesis_utc")),
        "genesis_lat": f64(scol("genesis_lat")),
        "genesis_lon": f64(scol("genesis_lon")),
        "end_t": t_min(scol("end_utc")),
        "max_vmax_kt": f64(scol("max_vmax_kt")),
        "min_mslp_mb": f64(scol("min_mslp_mb")),
        "max_category": dict_str(scol("max_category")),
        "reached_ts": bool3(scol("reached_ts")),
        "reached_cat1": bool3(scol("reached_cat1")),
        "reached_cat3": bool3(scol("reached_cat3")),
        "named": bool3(scol("named")),
        "track_points": i32(scol("track_points")),
        "track_type": dict_str(scol("track_type")),
        "provisional": bool3(scol("provisional")),
        "source_key": dict_str(scol("source_key")),
    }, note=("subbasin here is the subbasin AT GENESIS, which is the wrong filter for a "
             "landfall question -- use the subbasin_mask index for 'was ever here'. "
             "Coordinates are float64 because the analog distance is computed from them."))
    cp.table("genesis_events", len(sids), {
        "genesis_t": t_min(gcol("genesis_utc")),
        "genesis_lat": f64(gcol("genesis_lat")),
        "genesis_lon": f64(gcol("genesis_lon")),
        "first_track_t": t_min(gcol("first_track_utc")),
        "first_track_lat": f64(gcol("first_track_lat")),
        "first_track_lon": f64(gcol("first_track_lon")),
        "first_track_stage": dict_str(gcol("first_track_stage")),
        "td_t": t_min(gcol("td_utc")),
        "ts_t": t_min(gcol("ts_utc")),
        "ts_lat": f64(gcol("ts_lat")),
        "ts_lon": f64(gcol("ts_lon")),
        "cat1_t": t_min(gcol("cat1_utc")),
        "cat1_lat": f64(gcol("cat1_lat")),
        "cat1_lon": f64(gcol("cat1_lon")),
        "cat3_t": t_min(gcol("cat3_utc")),
        "cat4_t": t_min(gcol("cat4_utc")),
        "cat5_t": t_min(gcol("cat5_utc")),
        "hours_to_ts": f64(gcol("hours_to_ts")),
        "hours_to_cat1": f64(gcol("hours_to_cat1")),
        "hours_to_cat3": f64(gcol("hours_to_cat3")),
        "hours_to_peak": f64(gcol("hours_to_peak")),
        "peak_vmax_kt": f64(gcol("peak_vmax_kt")),
        "season": i32(gcol("season")),
        "source_key": dict_str(gcol("source_key")),
    }, note=("row-aligned to storms. two_first_mention_utc, two_first_lat, two_first_lon, "
             "two_lead_hours and invest_id are NOT packed: they are NULL on all 3,959 rows and "
             "pregenesis_source is 'none' everywhere, because the TWO back-fill has never been "
             "merged into this table. Recorded in manifest.empty_in_archive so the absence is "
             "stated rather than merely invisible."))
    cp.table("landfalls", len(lf), {
        "storm_row": u16([row_of[r["storm_id"]] for r in lf]),
        "season": i32(lcol("season")),
        "region": dict_str(lcol("region")),
        "sub_region": dict_str(lcol("sub_region")),
        # sub-minute: 997 of these are segment crossings interpolated to the second
        "t": t_ms(lcol("landfall_utc")),
        "lat": f64(lcol("lat")),
        "lon": f64(lcol("lon")),
        "vmax_kt": f64(lcol("vmax_kt")),
        "mslp_mb": f64(lcol("mslp_mb")),
        "category": dict_str(lcol("category")),
        "stage": dict_str(lcol("stage")),
        "hurricane_at_landfall": bool3(lcol("hurricane_at_landfall")),
        "ts_at_landfall": bool3(lcol("ts_at_landfall")),
        "detection": dict_str(lcol("detection")),
        "implied_speed_kt": f64(lcol("implied_speed_kt")),
        "suspect_relocation": bool3(lcol("suspect_relocation")),
        "closest_approach_km": f64(lcol("closest_approach_km")),
        "source_key": dict_str(lcol("source_key")),
    }, note=("ordered by (storm, landfall time). `category` is NULL on rows where a segment "
             "crossing's bracketing fixes disagree about the Saffir-Simpson class -- that is a "
             "withheld class, not a missing one, and Iniki 1992 is one of them."))
    cp.index("landfall_offset", u32(lf_off), "first landfall row for storms[i]")
    cp.index("landfall_count", u16(lf_cnt), "landfall count for storms[i] (0 for most storms)")
    cp.index("subbasin_mask", u8(subbasin_masks(by_storm, sids)),
             "bit per subbasin EVER entered, bit order " + ",".join(SUBBASIN_BITS))
    cp.index("cat2_t", t_min(derived["cat2_t"]), "derived:atlas_pack -- no such archive column")
    cp.index("cat2_hours", f64(derived["hours_to_cat2"]), "derived:atlas_pack")
    cp.index("cat4_hours", f64(derived["hours_to_cat4"]), "derived:atlas_pack")
    cp.index("cat5_hours", f64(derived["hours_to_cat5"]), "derived:atlas_pack")
    cp.index("env_order", u32(env_order),
             "environment rows grouped by (storm, time); the env pack itself keeps ARCHIVE order")
    cp.index("env_offset", u32(env_off), "storms[i]'s first position within env_order")
    cp.index("env_count", u16(env_cnt), "environment row count for storms[i]")
    cp.index("env_at_genesis_row", _col(env_idx, "i32", null=-1),
             f"nearest environment row within {ENV_GENESIS_WINDOW_H}h of genesis, else -1; "
             "indexes the environment pack's row order")
    cp.index("env_at_genesis_dt_h", f64(env_dt),
             "|t(env) - t(genesis)| in hours, NaN where there is no qualifying row")
    written["atlas-core-v1.bin.gz"] = cp.to_bytes()

    # ---- environment (lazy) -----------------------------------------------------------
    def ecol(key):
        return [r[key] for r in env_sorted]

    ep = Pack("env", common)
    ep.table("environment", len(env_sorted), {
        "storm_row": i32([row_of.get(r["storm_id"], -1) for r in env_sorted]),
        "atcf_id": dict_str(ecol("atcf_id")),
        "t": t_min(ecol("iso_time")),
        "lat": f64(ecol("lat")),
        "lon": f64(ecol("lon")),
        "env_source": dict_str(ecol("env_source")),
        "shear_kt": f64(ecol("shear_kt")),
        "shear_dir_deg": f64(ecol("shear_dir_deg")),
        "rh_mid_pct": f64(ecol("rh_mid_pct")),
        "rh_lo_pct": f64(ecol("rh_lo_pct")),
        "rh_hi_pct": f64(ecol("rh_hi_pct")),
        "vort850_1e5": f64(ecol("vort850_1e5")),
        "div200_1e7": f64(ecol("div200_1e7")),
        "pot_intensity_kt": f64(ecol("pot_intensity_kt")),
        "sst_c": f64(ecol("sst_c")),
        "ohc_kj_cm2": f64(ecol("ohc_kj_cm2")),
        "mslp_env_mb": f64(ecol("mslp_env_mb")),
        "tpw_mm": f64(ecol("tpw_mm")),
        "u200_kt": f64(ecol("u200_kt")),
        "t200_c": f64(ecol("t200_c")),
        "gpi": f64(ecol("gpi")),
        "gpi_method": dict_str(ecol("gpi_method")),
        "lead_hours": f64(ecol("lead_hours")),
        "source_key": dict_str(ecol("source_key")),
    }, note=("ARCHIVE ORDER, deliberately -- see the comment in build(): the analog query's "
             "environment standardisation sums over rows in scan order, and re-ordering them "
             "would change the standard deviation in its last bits and every environment weight "
             "with it. Use the env_order index for per-storm access. storm_row is -1 where the "
             "SHIPS ATCF id was never adopted by IBTrACS; those rows can never match a storm and "
             "are kept so the gap stays countable. mslp_env_mb is the storm's OWN central "
             "pressure on ships_dev rows and ambient pressure elsewhere -- never pool across "
             "env_source."))
    written["atlas-env-v1.bin.gz"] = ep.to_bytes()

    return _emit(out, written, storms, g, ordered, lf, env_sorted, tp_cnt, env_idx, common)


def _track_geometry_deviation(ordered) -> float:
    worst = 0.0
    for p in ordered:
        for v in (p["lat"], p["lon"]):
            worst = max(worst, abs(float(v) - round(float(v) * 100) / 100))
    return worst


def _count(values) -> dict:
    out: dict = {}
    for v in values:
        k = "null" if v is None else str(v)
        out[k] = out.get(k, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def _emit(out: Path, written: dict, storms, g, ordered, lf, env_sorted, tp_cnt, env_idx,
          common) -> dict:
    """Write the packs and the manifest the Atlas reads first.

    THE MANIFEST IS NOT A FILE LISTING. It is the first thing the browser fetches and the only
    thing it needs to paint the archive's scale, so it carries the counts, and it carries them
    from THIS BUILD rather than from MANIFEST.json -- which is stale for `environment` by 39
    rows and does not mention `daily_disturbances` at all. It also carries the absences:
    a field that exists in the schema and is null on every row is recorded by name, because
    "we do not have this" is a finding and the alternative is a UI that quietly renders nothing.
    """
    files = {}
    changed = []
    for name, payload in written.items():
        did, size = _write_if_changed(out / name, payload)
        files[name] = {"bytes": size, "raw_bytes": len(payload),
                       "sha256": hashlib.sha256(payload).hexdigest()}
        if did:
            changed.append(name)

    env_with_genesis = int((env_idx >= 0).sum())
    manifest = {
        **common,
        "pack_format": PACK_FORMAT,
        "files": files,
        "counts": {
            "storms": len(storms),
            "track_points": len(ordered),
            "genesis_events": len(storms),
            "landfalls": len(lf),
            "environment": len(env_sorted),
        },
        "quality": {
            "track_points": _count([p["quality"] for p in ordered]),
            "landfall_detection": _count([r["detection"] for r in lf]),
            "landfall_category_withheld": sum(1 for r in lf if r["category"] is None),
            "env_source": _count([r["env_source"] for r in env_sorted]),
            "storms_with_genesis": sum(1 for s in storms if s["genesis_utc"] is not None),
            "storms_with_env_at_genesis": env_with_genesis,
            "storms_with_no_track_points": sum(1 for c in tp_cnt if c == 0),
            # Storms whose threshold crossings rest on interpolated points because the track
            # carries no observed point at all. The archive flags these itself, in the
            # genesis_events source_key, and the flag must survive into the Atlas.
            "storms_interpolated_only": sum(
                1 for x in g if str(x.get("source_key", "")).endswith("+interpolated_only")),
        },
        "empty_in_archive": {
            "genesis_events.two_first_mention_utc": "NULL on every row",
            "genesis_events.two_first_lat": "NULL on every row",
            "genesis_events.two_first_lon": "NULL on every row",
            "genesis_events.two_lead_hours": "NULL on every row",
            "genesis_events.invest_id": "NULL on every row",
            "genesis_events.pregenesis_source": "'none' on every row",
            "environment.lead_hours": "0.0 on every row -- analysis time only, no forecast leads",
            "_note": ("These columns exist in scripts/genesis/schema.py and carry no data in "
                      "this archive. The per-storm pre-genesis linkage they imply has never "
                      "been merged; the linkage that does exist is "
                      "daily_disturbances.resolved_storm_id, which this pack does not carry."),
        },
        "not_packed": {
            "track_points": ["storm_speed_kt", "storm_dir_deg", "dist2land_km",
                             "hours_since_genesis (exactly derivable)"],
            "daily_disturbances": "whole table -- pre-genesis evidence is a later phase",
            "_note": ("Absent from the pack, present in the archive. Nothing here was dropped "
                      "because it was inconvenient; each is unread by any surface this pack "
                      "serves."),
        },
        "track_geometry": {
            "quantised_to_deg": 0.01,
            "max_deviation_deg": _track_geometry_deviation(ordered),
            "note": ("Track positions are carried as int16 hundredths of a degree, which is "
                     "IBTrACS's own published precision. The deviation above is the worst "
                     "difference between an archive value and its packed form; it arises from "
                     "the archive's signed-longitude arithmetic, not from a loss of source "
                     "precision. Genesis, threshold-crossing and landfall coordinates -- the "
                     "ones the query engine computes distances from -- are carried as float64 "
                     "and are not quantised at all."),
        },
        "thresholds_kt": dict(THRESHOLDS_KT),
        "subbasin_bits": SUBBASIN_BITS,
        "env_genesis_window_hours": ENV_GENESIS_WINDOW_H,
        # ENVIRONMENTAL COVERAGE, IN THE MANIFEST RATHER THAN IN THE ENV PACK.
        #
        # The environment block is nearly a megabyte and is loaded lazily, so a surface that
        # wanted to say "this condition can only be evaluated on a third of the record" would
        # have had to download the whole thing to find out. The manifest is a few kilobytes and
        # arrives first, so the coverage travels there and the caveat can be shown BEFORE the
        # reader commits to an environment-conditioned question.
        #
        # Broken out PER SOURCE and never summed into one number, because the sources are not
        # interchangeable: `ships_dev+csst` carries a CLIMATOLOGICAL sea-surface temperature
        # where `ships_dev` carries an observed one. Measured on this archive, no storm draws
        # on more than one source -- the partition is clean per storm -- but a matched POOL can
        # still mix them, and a reader standardising shear across such a pool is entitled to
        # know that some of its SSTs are climatology.
        "env_coverage": _env_coverage(env_sorted, storms),
    }
    out.mkdir(parents=True, exist_ok=True)
    mpath = out / "atlas-manifest.json"
    mtext = json.dumps(manifest, indent=1, sort_keys=True) + "\n"
    if not mpath.exists() or mpath.read_text() != mtext:
        mpath.write_text(mtext)
        changed.append("atlas-manifest.json")

    total = sum(f["bytes"] for f in files.values())
    return {"files": files, "changed": changed, "total_gz_bytes": total,
            "counts": manifest["counts"], "manifest": str(out / "atlas-manifest.json")}


# --------------------------------------------------------------------------------------
# expectations -- what scripts/test-atlas-pack.mjs checks the pack against
# --------------------------------------------------------------------------------------
#
# THE POINT OF THIS FILE IS THAT IT IS NOT COMPUTED FROM THE PACK.
# A test that hashes the pack and compares it to a hash of the pack proves only that gzip is
# deterministic. These digests are computed from the PARQUET, by this process, over the logical
# values -- so the Node test reproducing them from the pack is evidence that the packer moved
# the archive faithfully and that the browser's decoder reads it back the same way. Any drift
# in either direction fails, offline, on a pull request.
#
# The canonical encoding is byte-level rather than textual so the two languages cannot disagree
# about number formatting: a float is its eight IEEE-754 bytes, not its repr.

FNV_OFFSET = 0x811C9DC5
FNV_PRIME = 0x01000193

# pack column -> (archive column, logical kind). The Node test reads this list out of the
# emitted file, so there is exactly one declaration of what is being compared.
EXPECT_COLUMNS = {
    "storms": [
        ("storm_id", "storm_id", "str"), ("atcf_id", "atcf_id", "str"),
        ("name", "name", "str"), ("basin", "basin", "str"),
        ("subbasin", "subbasin", "str"), ("season", "season", "num"),
        ("genesis_t", "genesis_utc", "time"), ("genesis_lat", "genesis_lat", "num"),
        ("genesis_lon", "genesis_lon", "num"), ("end_t", "end_utc", "time"),
        ("max_vmax_kt", "max_vmax_kt", "num"), ("min_mslp_mb", "min_mslp_mb", "num"),
        ("max_category", "max_category", "str"), ("reached_ts", "reached_ts", "bool"),
        ("reached_cat1", "reached_cat1", "bool"), ("reached_cat3", "reached_cat3", "bool"),
        ("named", "named", "bool"), ("track_points", "track_points", "num"),
        ("track_type", "track_type", "str"), ("provisional", "provisional", "bool"),
        ("source_key", "source_key", "str"),
    ],
    "genesis_events": [
        ("genesis_t", "genesis_utc", "time"), ("genesis_lat", "genesis_lat", "num"),
        ("genesis_lon", "genesis_lon", "num"), ("first_track_t", "first_track_utc", "time"),
        ("first_track_lat", "first_track_lat", "num"),
        ("first_track_lon", "first_track_lon", "num"),
        ("first_track_stage", "first_track_stage", "str"), ("td_t", "td_utc", "time"),
        ("ts_t", "ts_utc", "time"), ("ts_lat", "ts_lat", "num"), ("ts_lon", "ts_lon", "num"),
        ("cat1_t", "cat1_utc", "time"), ("cat1_lat", "cat1_lat", "num"),
        ("cat1_lon", "cat1_lon", "num"), ("cat3_t", "cat3_utc", "time"),
        ("cat4_t", "cat4_utc", "time"), ("cat5_t", "cat5_utc", "time"),
        ("hours_to_ts", "hours_to_ts", "num"), ("hours_to_cat1", "hours_to_cat1", "num"),
        ("hours_to_cat3", "hours_to_cat3", "num"), ("hours_to_peak", "hours_to_peak", "num"),
        ("peak_vmax_kt", "peak_vmax_kt", "num"), ("season", "season", "num"),
        ("source_key", "source_key", "str"),
    ],
    # lat/lon carry a quantisation scale: the pack stores them as int16 hundredths of a
    # degree, so the expectation is digested against the quantised value and the deviation is
    # reported separately. Digesting against the raw double instead would fail on 1,507 of
    # 224,153 longitudes for a three-nanometre difference, which would train a reader to
    # ignore this gate.
    "track_points": [
        ("lat", "lat", "num", 100), ("lon", "lon", "num", 100), ("t", "iso_time", "time"),
        ("vmax_kt", "vmax_kt", "num"), ("mslp_mb", "mslp_mb", "num"),
        ("stage", "stage", "str"), ("nature", "nature", "str"), ("basin", "basin", "str"),
        ("subbasin", "subbasin", "str"), ("quality", "quality", "str"),
        ("synoptic", "synoptic", "bool"),
    ],
    "landfalls": [
        ("season", "season", "num"), ("region", "region", "str"),
        ("sub_region", "sub_region", "str"), ("t", "landfall_utc", "time"),
        ("lat", "lat", "num"), ("lon", "lon", "num"), ("vmax_kt", "vmax_kt", "num"),
        ("mslp_mb", "mslp_mb", "num"), ("category", "category", "str"),
        ("stage", "stage", "str"),
        ("hurricane_at_landfall", "hurricane_at_landfall", "bool"),
        ("ts_at_landfall", "ts_at_landfall", "bool"), ("detection", "detection", "str"),
        ("implied_speed_kt", "implied_speed_kt", "num"),
        ("suspect_relocation", "suspect_relocation", "bool"),
        ("closest_approach_km", "closest_approach_km", "num"),
        ("source_key", "source_key", "str"),
    ],
    "environment": [
        ("t", "iso_time", "time"), ("lat", "lat", "num"), ("lon", "lon", "num"),
        ("env_source", "env_source", "str"), ("shear_kt", "shear_kt", "num"),
        ("shear_dir_deg", "shear_dir_deg", "num"), ("rh_mid_pct", "rh_mid_pct", "num"),
        ("rh_lo_pct", "rh_lo_pct", "num"), ("rh_hi_pct", "rh_hi_pct", "num"),
        ("vort850_1e5", "vort850_1e5", "num"), ("div200_1e7", "div200_1e7", "num"),
        ("pot_intensity_kt", "pot_intensity_kt", "num"), ("sst_c", "sst_c", "num"),
        ("ohc_kj_cm2", "ohc_kj_cm2", "num"), ("mslp_env_mb", "mslp_env_mb", "num"),
        ("tpw_mm", "tpw_mm", "num"), ("u200_kt", "u200_kt", "num"),
        ("t200_c", "t200_c", "num"), ("gpi", "gpi", "num"),
        ("gpi_method", "gpi_method", "str"), ("lead_hours", "lead_hours", "num"),
        ("source_key", "source_key", "str"),
    ],
}


class _Fnv:
    """FNV-1a, 32-bit -- the same hash the terminal already uses for evidence content."""

    def __init__(self):
        self.h = FNV_OFFSET

    def feed(self, data: bytes) -> None:
        h = self.h
        for b in data:
            h = ((h ^ b) * FNV_PRIME) & 0xFFFFFFFF
        self.h = h

    def null(self):
        self.feed(b"\x00")

    def number(self, v: float):
        self.feed(b"\x01" + struct.pack("<d", float(v)))

    def string(self, v: str):
        self.feed(b"\x02" + v.encode("utf-8") + b"\x00")

    def boolean(self, v: bool):
        self.feed(b"\x03" + (b"\x01" if v else b"\x00"))


def _env_coverage(env: list, storms: list) -> dict:
    """Per-source environmental coverage, for the manifest.

    Reports how much of the record each environment source can speak for, so a surface can say
    what an environment condition would cost BEFORE the reader commits to one. Kept per source
    and deliberately not summed: the sources are not interchangeable.

    `storms_any` is the union across sources and is the only figure that answers "can this
    archive be asked an environmental question at all" -- measured here at roughly a third of
    the record, none of it before 1982, which is a fact about SHIPS rather than about weather.
    """
    total = len(storms)
    by_source: dict = {}
    seen_any: set = set()
    for r in env:
        src = r.get("env_source") or "unknown"
        sid = r.get("storm_id")
        b = by_source.setdefault(src, {"rows": 0, "storms": set(), "first": None, "last": None})
        b["rows"] += 1
        if sid:
            b["storms"].add(sid)
            seen_any.add(sid)
        t = r.get("iso_time")
        if t is not None:
            ts = str(t)
            if b["first"] is None or ts < b["first"]:
                b["first"] = ts
            if b["last"] is None or ts > b["last"]:
                b["last"] = ts
    return {
        "storms_total": total,
        "storms_any_source": len(seen_any),
        "by_source": {
            k: {"rows": v["rows"], "storms": len(v["storms"]),
                "first_utc": v["first"], "last_utc": v["last"]}
            for k, v in sorted(by_source.items())
        },
        "note": ("Sources are reported separately and must not be pooled: ships_dev+csst "
                 "carries a CLIMATOLOGICAL sea-surface temperature where ships_dev carries an "
                 "observed one. No storm in this archive draws on more than one source, but a "
                 "matched pool can contain storms from several."),
    }


def _digest(values, kind: str, quantise: int | None = None) -> dict:
    f = _Fnv()
    nulls = 0
    worst = 0.0
    if quantise:
        q = []
        for v in values:
            if v is None or (isinstance(v, float) and v != v):
                q.append(v)
                continue
            r = round(float(v) * quantise) / quantise
            worst = max(worst, abs(float(v) - r))
            q.append(r)
        values = q
    for v in values:
        if v is None or (kind == "num" and isinstance(v, float) and v != v):
            nulls += 1
            f.null()
        elif kind == "num":
            f.number(v)
        elif kind == "str":
            f.string(v)
        elif kind == "bool":
            f.boolean(bool(v))
        elif kind == "time":
            dt = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
            f.number(round(dt.timestamp() * 1000))
        else:
            raise ValueError(kind)
    out = {"n": len(values), "nulls": nulls, "fnv1a32": f.h}
    if quantise:
        out["quantised_to"] = 1.0 / quantise
        out["max_deviation"] = worst
    return out


def expectations(base: Path | None = None) -> dict:
    """Digest every packed column, read from the archive, in the pack's row order."""
    base = base or ARCHIVE_DIR
    storms = _rows("storms", base)
    sids = [s["storm_id"] for s in storms]
    row_of = {sid: i for i, sid in enumerate(sids)}
    genesis = {g["storm_id"]: g for g in _rows("genesis_events", base)}

    by_storm: dict = {}
    for p in _rows("track_points", base):
        by_storm.setdefault(p["storm_id"], []).append(p)
    for pts in by_storm.values():
        pts.sort(key=lambda p: p["iso_time"])
    ordered = [p for sid in sids for p in by_storm.get(sid, [])]

    lf = sorted(_rows("landfalls", base),
                key=lambda r: (row_of.get(r["storm_id"], 1 << 30), r["landfall_utc"]))
    env = _rows("environment", base)   # archive order -- see build()

    src = {
        "storms": storms,
        "genesis_events": [genesis.get(sid, {}) for sid in sids],
        "track_points": ordered,
        "landfalls": lf,
        "environment": env,
    }
    out = {"columns": {}, "rows": {k: len(v) for k, v in src.items()},
           "methodology_version": METHODOLOGY_VERSION,
           "processing_version": PROCESSING_VERSION,
           "archive_stamp": _provenance(base)["archive_stamp"]}
    for table, cols in EXPECT_COLUMNS.items():
        rows = src[table]
        entry = {}
        for spec in cols:
            pack_col, arch_col, kind = spec[0], spec[1], spec[2]
            quant = spec[3] if len(spec) > 3 else None
            entry[pack_col] = {"archive_column": arch_col, "kind": kind,
                               **_digest([r.get(arch_col) for r in rows], kind, quant)}
        out["columns"][table] = entry
    # Derived columns are checked against a re-derivation, not against an archive column --
    # the archive has none. The Node side recomputes nothing; it digests what the pack carries
    # and this side digests what the archive's own crossing rule produces.
    derived = derive_crossings(by_storm, sids)
    out["derived"] = {
        "cat2_t": _digest(derived["cat2_t"], "time"),
        "cat2_hours": _digest(derived["hours_to_cat2"], "num"),
        "cat4_hours": _digest(derived["hours_to_cat4"], "num"),
        "cat5_hours": _digest(derived["hours_to_cat5"], "num"),
        "subbasin_mask": _digest([int(x) for x in subbasin_masks(by_storm, sids)], "num"),
        "landfall_count": _digest(_landfall_counts(lf, row_of, len(sids)), "num"),
    }
    return out


def _landfall_counts(lf, row_of, n) -> list:
    counts = [0] * n
    for r in lf:
        counts[row_of[r["storm_id"]]] += 1
    return counts
