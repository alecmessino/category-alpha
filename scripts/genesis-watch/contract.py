"""Pacific Genesis Watch — the append-only contract.

A frozen decision state is worth exactly as much as the guarantee that it was not
edited afterwards. Prose cannot carry that guarantee, so the rules below are executable
and are gated on every pull request by scripts/check-genesis-watch-append-only.mjs.

THE RULES

  1. A committed snapshot is immutable. Its bytes never change again.
  2. Later outlooks APPEND as new records. They never rewrite an earlier one.
  3. An error in a committed record is corrected by APPENDING a supersession record
     that names what it supersedes and why. The original stays exactly as it was.
  4. Every record carries its own integrity hash, and the ledger carries the hash of
     every record file. Editing a record breaks both.

WHY TWO HASHES. `manifest_sha256_excluding_this_field` is the record's own claim about
its content and travels with it. The ledger's `file_sha256` is the repository's claim
about the bytes on disk. A forger would have to update both plus the ledger's own chain
hash; an honest mistake breaks one and is caught immediately.

THE CANONICAL FORM is `json.dumps(record_without_its_hash_field, indent=1,
ensure_ascii=False)`. That is not a preference: snapshot 0001 arrived with its hash
already computed, and this is the serialisation that reproduces it. Adopting the
incoming record's own convention is what lets snapshot 0001 be imported byte-for-byte
and still verify, rather than being "normalised" on the way in -- which would have been
an edit to a frozen record on the first day of the contract.
"""
from __future__ import annotations

import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WATCH = ROOT / "data" / "genesis-watch"
SNAPSHOTS = WATCH / "snapshots"
RAW = WATCH / "raw"
LEDGER = WATCH / "LEDGER.json"

HASH_FIELD = "manifest_sha256_excluding_this_field"
UTC = timezone.utc


class ContractViolation(Exception):
    """Raised when an operation would break the append-only contract."""


def now_utc() -> str:
    """Wall clock, to the second, in UTC. The ONLY source of capture times.

    Never derived from a source product's issue time. The two are different facts and
    the whole point of snapshot 0001's atlas_state refusal is that conflating them
    manufactures a contemporaneity that did not exist.
    """
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(t: str) -> datetime:
    """One reader for every timestamp this module writes, so none is parsed two ways."""
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def canonical_bytes(record: dict) -> bytes:
    """The bytes a record's integrity hash is taken over."""
    body = copy.deepcopy(record)
    body.pop(HASH_FIELD, None)
    return json.dumps(body, indent=1, ensure_ascii=False).encode("utf-8")


def record_hash(record: dict) -> str:
    return hashlib.sha256(canonical_bytes(record)).hexdigest()


def seal(record: dict) -> dict:
    """Attach a record's own integrity hash. Called once, at write time."""
    out = copy.deepcopy(record)
    out.pop(HASH_FIELD, None)
    out[HASH_FIELD] = hashlib.sha256(canonical_bytes(out)).hexdigest()
    return out


def serialise(record: dict) -> str:
    """The on-disk form: canonical body with the hash field appended last.

    Written this way so that stripping the final field from the file reproduces exactly
    the bytes that were hashed. A reviewer can verify a record with sed and sha256sum.
    """
    body = copy.deepcopy(record)
    h = body.pop(HASH_FIELD, None)
    if h is None:
        raise ContractViolation("record is not sealed")
    text = json.dumps(body, indent=1, ensure_ascii=False)
    assert text.endswith("\n}") or text.endswith("}"), "unexpected serialisation"
    return text[:-1].rstrip() + f",\n \"{HASH_FIELD}\": \"{h}\"\n}}\n"


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_ledger() -> dict:
    if not LEDGER.is_file():
        return {"schema": "millibar.pacific-genesis-watch.ledger/1", "entries": []}
    return json.loads(LEDGER.read_text())


def verify(strict_existing: bool = True) -> list[str]:
    """Check every ledger entry against the file on disk. Returns a list of violations.

    This is the whole contract, executable. It is what makes "append-only" a property of
    the repository rather than an intention.
    """
    problems: list[str] = []
    led = read_ledger()
    entries = led.get("entries", [])
    seen_ids = set()
    prev_committed = None

    for e in entries:
        rid = e.get("record_id")
        path = SNAPSHOTS / e["file"]
        if rid in seen_ids:
            problems.append(f"{rid}: duplicate record_id in the ledger")
        seen_ids.add(rid)

        if not path.is_file():
            problems.append(f"{rid}: ledger names {e['file']}, which is not in the repository")
            continue

        actual = file_sha256(path)
        if strict_existing and actual != e["file_sha256"]:
            problems.append(
                f"{rid}: {e['file']} HAS BEEN EDITED SINCE IT WAS COMMITTED "
                f"(ledger {e['file_sha256'][:12]}…, on disk {actual[:12]}…). "
                f"A committed record is immutable; append a supersession record instead.")
            continue

        rec = json.loads(path.read_text())
        claimed = rec.get(HASH_FIELD)
        recomputed = record_hash(rec)
        if claimed != recomputed:
            problems.append(
                f"{rid}: the record's own integrity hash does not match its content "
                f"(claims {str(claimed)[:12]}…, content hashes {recomputed[:12]}…)")
        if e.get("manifest_sha256") and e["manifest_sha256"] != claimed:
            problems.append(f"{rid}: ledger manifest_sha256 disagrees with the record's own")

        # Committed order must be non-decreasing: the ledger is a chronological append log.
        c = e.get("committed_at_utc")
        if prev_committed and c and c < prev_committed:
            problems.append(f"{rid}: committed_at_utc {c} precedes the previous entry "
                            f"{prev_committed}; the ledger is append-only and ordered")
        prev_committed = c or prev_committed

        # A supersession must name a record that exists and must not be the record itself.
        sup = rec.get("supersedes")
        if sup is not None:
            if sup == rid:
                problems.append(f"{rid}: supersedes itself")
            elif sup not in seen_ids:
                problems.append(f"{rid}: supersedes {sup!r}, which is not an earlier record")

    # A record file that no ledger entry accounts for is as bad as a missing one: it is a
    # frozen state nobody has attested to.
    on_disk = {p.name for p in SNAPSHOTS.glob("*.json")} if SNAPSHOTS.is_dir() else set()
    for name in sorted(on_disk - {e["file"] for e in entries}):
        problems.append(f"{name} is in snapshots/ but has no ledger entry")

    return problems


def append(record: dict, *, record_id: str, kind: str, note: str = "") -> Path:
    """Seal, write and ledger a new record. Refuses to touch anything already committed."""
    led = read_ledger()
    if any(e.get("record_id") == record_id for e in led["entries"]):
        raise ContractViolation(
            f"{record_id} is already committed. A committed record is immutable -- "
            f"append a supersession record with a new id instead of rewriting it.")

    existing = verify()
    if existing:
        raise ContractViolation(
            "the existing ledger does not verify; refusing to append on top of a broken "
            "chain:\n  " + "\n  ".join(existing))

    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    fname = f"{record_id}.json"
    path = SNAPSHOTS / fname
    if path.exists():
        raise ContractViolation(f"{fname} already exists on disk but is not in the ledger")

    sealed = seal(record)
    path.write_text(serialise(sealed), encoding="utf-8")

    led["entries"].append({
        "record_id": record_id,
        "kind": kind,
        "file": fname,
        "file_sha256": file_sha256(path),
        "manifest_sha256": sealed[HASH_FIELD],
        "committed_at_utc": now_utc(),
        "note": note,
    })
    LEDGER.write_text(json.dumps(led, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_all() -> list[dict]:
    """Every committed record, in ledger order."""
    return [json.loads((SNAPSHOTS / e["file"]).read_text()) for e in read_ledger()["entries"]]
