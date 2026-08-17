"""Reading and writing the archive: Parquet tables, a DuckDB view layer, dated snapshots.

FORMAT CHOICE. Parquet tables are the archive; DuckDB is a view over them, not a second copy.
A single .duckdb file would have been simpler to hand around, but it is opaque to git, it
rewrites wholesale on every append, and a corrupted one loses every table at once. Six Parquet
files diff, compress, and fail independently.

VERSIONING, AND WHY IT IS NOT A DAILY FULL COPY. The spec asks for daily versioned snapshots.
Copying six tables into a dated directory every day would grow the repository without bound and
would mostly store bytes identical to yesterday's. Instead a snapshot is a dated MANIFEST -- the
sha256 of every table, its row count, and the provenance of every source that produced it. That
is what makes a past state reproducible: it pins exactly which bytes were current, and the
build is deterministic from the recorded sources. When a table's hash changes, the snapshot
says so; when it does not, the snapshot costs a few hundred bytes.

APPEND-ONLY. `append` never rewrites history: it reads, concatenates, de-duplicates on the
table's declared key, and writes back. `daily_disturbances` is the one table that is genuinely
append-only in the live sense -- a disturbance observed at 06Z stays in the log even after it
is superseded, because the whole point is to know what was visible at the time.
"""

from __future__ import annotations

import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from .provenance import ARCHIVE_DIR, PROCESSING_VERSION, sha256_file, today, _now
from .schema import ALL_TABLES

# The natural key of each table, used to de-duplicate on append. A row whose key already
# exists is REPLACED by the newer one (a season gets post-analysed and its winds change);
# a row whose key is new is added.
TABLE_KEYS = {
    "storms": ("storm_id",),
    "track_points": ("storm_id", "iso_time"),
    "environment": ("storm_id", "iso_time", "env_source", "lead_hours"),
    "genesis_events": ("storm_id",),
    "landfalls": ("storm_id", "landfall_utc", "region", "detection"),
    # Deliberately keyed on the OBSERVATION, not the disturbance: two issuances about the
    # same area are two rows, because the log records what was published when.
    "daily_disturbances": ("observed_utc", "basin", "disturbance_key"),
}


def table_path(name: str, base: Path | None = None) -> Path:
    return (base or ARCHIVE_DIR) / f"{name}.parquet"


def rows_to_table(name: str, rows: list[dict]) -> pa.Table:
    """Build an Arrow table from row dicts under the declared schema.

    Missing keys become nulls; UNKNOWN keys are an error rather than being dropped, because a
    silently ignored column is how a field stops reaching the archive without anyone noticing.
    """
    schema = ALL_TABLES[name]
    names = set(schema.names)
    if rows:
        extra = set(rows[0]) - names
        if extra:
            raise ValueError(f"{name}: unknown columns {sorted(extra)}")
    cols = {f.name: [r.get(f.name) for r in rows] for f in schema}
    return pa.table(cols, schema=schema)


def write_table(name: str, rows: list[dict], base: Path | None = None) -> Path:
    path = table_path(name, base)
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(rows_to_table(name, rows), path, compression="zstd")
    return path


def read_table(name: str, base: Path | None = None) -> pa.Table:
    path = table_path(name, base)
    if not path.exists():
        return ALL_TABLES[name].empty_table()
    return pq.read_table(path, schema=ALL_TABLES[name])


def append(name: str, rows: list[dict], base: Path | None = None) -> tuple[Path, int, int]:
    """Append rows, replacing any whose natural key already exists.

    Returns (path, added, replaced).
    """
    if not rows:
        return table_path(name, base), 0, 0
    key = TABLE_KEYS[name]
    existing = read_table(name, base).to_pylist()
    index = {tuple(r.get(k) for k in key): i for i, r in enumerate(existing)}
    added = replaced = 0
    for row in rows:
        k = tuple(row.get(c) for c in key)
        if k in index:
            existing[index[k]] = row
            replaced += 1
        else:
            index[k] = len(existing)
            existing.append(row)
            added += 1
    return write_table(name, existing, base), added, replaced


def connect(base: Path | None = None):
    """A DuckDB connection with every existing table registered as a view.

    Views, not imports: the Parquet files stay the single copy of the data, so a query can
    never read a stale materialisation of a table that was rebuilt underneath it.
    """
    import duckdb

    base = base or ARCHIVE_DIR
    con = duckdb.connect(database=":memory:")
    for name in ALL_TABLES:
        p = table_path(name, base)
        if p.exists():
            con.execute(f"CREATE VIEW {name} AS SELECT * FROM read_parquet('{p.as_posix()}')")
    return con


def snapshot(base: Path | None = None, *, stamp: str | None = None) -> Path:
    """Write a dated snapshot manifest pinning the exact bytes of every table."""
    base = base or ARCHIVE_DIR
    stamp = stamp or today()
    entry = {
        "snapshot": stamp,
        "written_utc": _now(),
        "processing_version": PROCESSING_VERSION,
        "tables": {},
    }
    for name in ALL_TABLES:
        p = table_path(name, base)
        if not p.exists():
            entry["tables"][name] = None      # explicit: this table did not exist
            continue
        meta = pq.read_metadata(p)
        entry["tables"][name] = {
            "rows": meta.num_rows,
            "bytes": p.stat().st_size,
            "sha256": sha256_file(p),
        }
    out = base / "snapshots" / f"{stamp}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(entry, indent=2, sort_keys=True) + "\n")
    return out


def summary(base: Path | None = None) -> dict:
    base = base or ARCHIVE_DIR
    out = {}
    for name in ALL_TABLES:
        p = table_path(name, base)
        out[name] = pq.read_metadata(p).num_rows if p.exists() else None
    return out
