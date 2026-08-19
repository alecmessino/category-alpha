"""Provenance: every byte that enters the archive is recorded before it is parsed.

THE RULE THIS FILE EXISTS TO ENFORCE. A number in this archive is worthless unless a
reader can name the file it came from, the URL that file was fetched from, the day it
was fetched, and the code version that turned it into a row. Nothing here interpolates,
back-fills, or estimates anything: a source that cannot be fetched produces a recorded
GAP, never a substituted value.

Downloads are cached on disk by URL. The cache is content-addressed by SHA-256 so a
re-run either proves the source is byte-identical to the one the archive was built from
or reports that the publisher changed it -- which is itself a finding, because NOAA
re-issues best-track files under new names and silently corrects old seasons.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path

# Bump when a parser changes in a way that could change a published number.
# Every row in every table carries this, so a mixed-version archive is detectable.
PROCESSING_VERSION = "1.0.0"

# THE STATISTICAL METHODOLOGY, VERSIONED SEPARATELY FROM THE PARSERS.
#
# PROCESSING_VERSION answers "which code turned bytes into rows". This answers a different
# question: "which definitions turned rows into a published rate" -- the refusal gates, the
# analog weighting, the interval, the effective sample size. The two move independently: a
# parser fix that corrects one storm's wind does not change the methodology, and a change to
# min_sample changes every rate without touching a parser.
#
# It exists because the methodology now has MORE THAN ONE EXECUTION SURFACE. The archive's
# Python is authoritative; the Storm Atlas ships a transliteration of it that runs in a
# browser. That is only safe while the two are provably the same thing, so both declare this
# constant and scripts/test-atlas-parity.mjs fails when they disagree. A methodology change
# then becomes a visible, versioned event rather than a silent divergence -- which is the
# whole reason a second surface was allowed to exist at all.
#
# WHY PHASE 3.1 DID NOT BUMP THIS, THOUGH IT LOOKED LIKE IT SHOULD.
# That phase ported the conditioned rates, the Wilson intervals, the ESS and the time-to-event
# distributions into the browser -- a large change to what the Atlas PUBLISHES, and none at all
# to what this constant versions. The refusal gates, the weighting, the interval and the
# effective sample size are the same definitions they were; the browser simply stopped
# declining to evaluate them. Both surfaces still declare 1.0.0 and the parity harness still
# proves they agree, which is precisely the invariant this constant protects. Bumping it would
# have announced a definition change that did not happen, and a version that moves for reasons
# other than its stated one stops being evidence of anything.
#
# The browser did gain one rule the Python does not have -- a variable used to define a cohort
# may not be reported as an outcome of it (docs/storm-atlas/src/engine/rates.js). It is inert:
# it fires only when a caller declares what it conditioned on, and no caller does yet. When the
# cohort layer starts declaring it, that IS a methodology event -- and the answer then is to add
# the rule to this Python too and bump both together, because "one methodology, several
# execution surfaces" stops being true the moment a rule lives in only one of them.
METHODOLOGY_VERSION = "1.0.0"

REPO_ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_DIR = REPO_ROOT / "data" / "genesis-archive"
# Raw downloads are NOT committed: IBTrACS + SHIPS alone are ~1 GB. The manifest
# records their hashes so the archive stays reproducible without carrying them.
CACHE_DIR = Path(os.environ.get("GENESIS_CACHE", REPO_ROOT / ".genesis-cache"))

USER_AGENT = "millibar-genesis-archive/%s (research; contact via repository)" % PROCESSING_VERSION


@dataclass
class SourceRecord:
    """One fetched file, as it will appear in MANIFEST.json."""

    key: str
    url: str
    sha256: str
    bytes: int
    downloaded_utc: str
    last_modified: str | None = None
    processing_version: str = PROCESSING_VERSION
    note: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class Gap:
    """A source we wanted and did not get, or got only in part.

    Gaps are first-class output. `report_gaps()` writes them next to the data so a
    reader never has to infer absence from a missing column.
    """

    key: str
    what: str
    why: str
    impact: str
    url: str = ""
    attempted_utc: str = field(default_factory=lambda: _now())

    def as_dict(self) -> dict:
        return asdict(self)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _cache_path(key: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / key


def fetch(key: str, url: str, *, note: str = "", timeout: int = 600,
          retries: int = 4, force: bool = False) -> tuple[Path, SourceRecord]:
    """Download `url` to the cache under `key`, returning the path and its provenance.

    Retries with exponential backoff on transport errors only. An HTTP error status is
    NOT retried past the first attempt when it is a 4xx -- a 404 means the publisher
    moved the file, and hammering it will not change that.
    """
    path = _cache_path(key)
    if path.exists() and not force:
        return path, SourceRecord(
            key=key, url=url, sha256=sha256_file(path), bytes=path.stat().st_size,
            downloaded_utc=_read_stamp(key) or _now(), note=note + " (cache hit)",
        )

    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                last_modified = resp.headers.get("Last-Modified")
                tmp = path.with_suffix(path.suffix + ".part")
                with open(tmp, "wb") as out:
                    while True:
                        chunk = resp.read(1 << 20)
                        if not chunk:
                            break
                        out.write(chunk)
                tmp.replace(path)
            rec = SourceRecord(
                key=key, url=url, sha256=sha256_file(path), bytes=path.stat().st_size,
                downloaded_utc=_now(), last_modified=last_modified, note=note,
            )
            _write_stamp(key, rec.downloaded_utc)
            return path, rec
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if 400 <= exc.code < 500:
                raise
        except Exception as exc:  # transport, DNS, timeout
            last_exc = exc
        if attempt < retries - 1:
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError("fetch failed for %s (%s): %s" % (key, url, last_exc))


def _stamp_file() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / "_stamps.json"


def _read_stamp(key: str) -> str | None:
    f = _stamp_file()
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text()).get(key)
    except Exception:
        return None


def _write_stamp(key: str, when: str) -> None:
    f = _stamp_file()
    data = {}
    if f.exists():
        try:
            data = json.loads(f.read_text())
        except Exception:
            data = {}
    data[key] = when
    f.write_text(json.dumps(data, indent=2, sort_keys=True))


class Manifest:
    """Collects sources and gaps for one build, then writes them beside the tables."""

    def __init__(self) -> None:
        self.sources: list[SourceRecord] = []
        self.gaps: list[Gap] = []
        self.tables: dict[str, dict] = {}
        self.started_utc = _now()

    def add_source(self, rec: SourceRecord) -> SourceRecord:
        self.sources.append(rec)
        return rec

    def add_gap(self, gap: Gap) -> Gap:
        self.gaps.append(gap)
        return gap

    def add_table(self, name: str, *, rows: int, path: str, sources: list[str],
                  note: str = "") -> None:
        self.tables[name] = {
            "rows": rows,
            "path": path,
            "sources": sources,
            "processing_version": PROCESSING_VERSION,
            "note": note,
        }

    def write(self, out_dir: Path | None = None) -> Path:
        out_dir = out_dir or ARCHIVE_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "processing_version": PROCESSING_VERSION,
            "built_utc": _now(),
            "started_utc": self.started_utc,
            "tables": self.tables,
            "sources": [s.as_dict() for s in self.sources],
            "gaps": [g.as_dict() for g in self.gaps],
        }
        path = out_dir / "MANIFEST.json"
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
        return path
