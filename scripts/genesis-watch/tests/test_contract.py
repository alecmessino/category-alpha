"""The append-only contract, enforced by tests rather than by prose.

Every rule below is one a reviewer would otherwise have to take on trust. Each is made to
fire against a temporary ledger, so a change that quietly disables the contract fails here
instead of silently permitting a rewritten decision state.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

import contract as C


# ---------------------------------------------------------------------------------------
# The committed sequence, as it actually stands in the repository.
# ---------------------------------------------------------------------------------------

def test_the_live_ledger_verifies():
    assert C.verify() == []


def test_snapshot_0001_is_byte_for_byte_as_received():
    """It arrived frozen. Importing it must not have changed a byte.

    The hash below is of the file as delivered. If a future change 'normalises' the record
    -- reformats it, sorts its keys, rewrites its unicode -- this fails, which is the point:
    the first record of an append-only sequence is the one most tempting to tidy up.
    """
    p = C.SNAPSHOTS / "0001.manifest.json"
    assert C.file_sha256(p) == "d52186c8afbcc675b261bdff9adbaf4c8b9c3a5cbfd2cff6bcb4801a872216f8"
    rec = json.loads(p.read_text())
    assert rec["snapshot_seq"] == 1
    assert rec["captured_at_utc"] == "2026-09-17T16:23:22Z"
    assert rec["products"]["TWOEP"]["issued"] == "2026-09-17T11:54Z"


def test_snapshot_0001_still_verifies_under_the_canonical_form():
    """The contract adopted 0001's own serialisation rather than imposing one on it."""
    rec = json.loads((C.SNAPSHOTS / "0001.manifest.json").read_text())
    assert C.record_hash(rec) == rec[C.HASH_FIELD]


def test_snapshot_0001_atlas_state_is_not_backfilled():
    """Its own refusal is load-bearing and must survive.

    0001's source products were issued 11:54Z and its manifest was captured at 16:23:22Z. It
    is an archived NHC baseline, not a joint NHC + Atlas decision state, and it says so. A
    later record must never reach back and fill this in.
    """
    rec = json.loads((C.SNAPSHOTS / "0001.manifest.json").read_text())
    assert rec["atlas_state"]["status"] == "NOT CAPTURED IN THIS SNAPSHOT"
    assert "must not be backfilled" in rec["atlas_state"]["reason"]


def test_the_atlas_append_is_separate_and_later():
    """0001b carries its own capture time and does not claim simultaneity."""
    rec = json.loads((C.SNAPSHOTS / "0001b.json").read_text())
    assert rec["appends_to"] == "0001"
    assert rec["simultaneity"]["claimed"] is False
    assert rec["timestamps"]["source_issued_at"] == "2026-09-17T11:54Z"
    atlas = C.parse_iso(rec["timestamps"]["atlas_computed_at"])
    issued = C.parse_iso(rec["timestamps"]["source_issued_at"])
    assert atlas > issued, "the Atlas state must not be dated at or before the source issuance"
    assert rec["atlas_state"]["contemporaneous_with_source"] is False
    assert "NOT RECOVERABLE" in rec["atlas_state"]["timing_statement"]


def _corrections_for(record_id: str) -> list[dict]:
    """Every appended correction that supersedes a record."""
    return [r for r in C.load_all()
            if r.get("schema", "").startswith("millibar.pacific-genesis-watch.correction")
            and r.get("supersedes") == record_id]


def test_every_record_keeps_its_timestamps_apart():
    """No record may conflate issuance, acquisition, computation and commit.

    READ AS CORRECTED, WHICH IS WHAT THE CONTRACT ACTUALLY PROMISES. A frozen record is never
    edited, so a record that shipped with a field missing carries that gap forever and an
    appended correction is the only thing that can supply it. Checking each record in
    isolation would therefore demand the one thing the contract forbids. The invariant is over
    the sequence: the four times, apart, for every record that states any of them -- in the
    record itself or in a correction that names it.

    This is not a softer rule. An uncorrected record missing a key still fails here, and a
    correction only counts for the record it explicitly supersedes.
    """
    keys = {"source_issued_at", "source_acquired_at", "atlas_computed_at",
            "snapshot_committed_at"}
    for rec in C.load_all():
        ts = rec.get("timestamps")
        if not ts:
            continue
        present = set(ts)
        for corr in _corrections_for(rec.get("record_id")):
            present |= set((corr.get("fix") or {}).get("timestamps_as_they_should_read") or {})
        missing = keys - present
        assert not missing, (
            f"{rec.get('record_id')} states no {', '.join(sorted(missing))}, and no appended "
            f"correction supplies it")
        # snapshot_committed_at belongs to the ledger, which is written after sealing.
        if "snapshot_committed_at" in ts:
            assert ts["snapshot_committed_at"] is None


def test_commit_times_come_from_the_ledger_and_are_after_issuance():
    led = C.read_ledger()
    for e in led["entries"]:
        rec = json.loads((C.SNAPSHOTS / e["file"]).read_text())
        issued = ((rec.get("timestamps") or {}).get("source_issued_at")
                  or (rec.get("products", {}).get("TWOEP", {}) or {}).get("issued"))
        if issued:
            assert C.parse_iso(e["committed_at_utc"]) > C.parse_iso(issued), (
                f"{e['record_id']} was committed at or before its own source issuance")


# ---------------------------------------------------------------------------------------
# The contract itself, exercised against a temporary ledger.
# ---------------------------------------------------------------------------------------

@pytest.fixture()
def sandbox(tmp_path, monkeypatch):
    """A ledger of its own, so the contract is tested without touching the real sequence."""
    snaps = tmp_path / "snapshots"
    snaps.mkdir()
    monkeypatch.setattr(C, "WATCH", tmp_path)
    monkeypatch.setattr(C, "SNAPSHOTS", snaps)
    monkeypatch.setattr(C, "LEDGER", tmp_path / "LEDGER.json")
    C.append({"schema": "t/1", "record_id": "0001", "body": "original", "n": 1},
             record_id="0001", kind="test")
    return tmp_path


def test_a_committed_record_cannot_be_re_appended(sandbox):
    with pytest.raises(C.ContractViolation, match="already committed"):
        C.append({"schema": "t/1", "record_id": "0001", "body": "rewritten"},
                 record_id="0001", kind="test")


def test_editing_a_committed_record_is_detected(sandbox):
    p = C.SNAPSHOTS / "0001.json"
    p.write_text(p.read_text().replace('"original"', '"quietly changed"'))
    problems = C.verify()
    assert problems and "HAS BEEN EDITED SINCE IT WAS COMMITTED" in problems[0]


def test_even_a_whitespace_edit_is_detected(sandbox):
    """Good faith is not a defence. Any byte change breaks the attestation."""
    p = C.SNAPSHOTS / "0001.json"
    p.write_text(p.read_text() + "\n")
    assert any("EDITED" in x for x in C.verify())


def test_rehashing_an_edited_record_does_not_launder_it(sandbox):
    """Fixing up the record's own hash still leaves the ledger's file hash wrong."""
    p = C.SNAPSHOTS / "0001.json"
    rec = json.loads(p.read_text())
    rec["body"] = "quietly changed"
    p.write_text(C.serialise(C.seal(rec)))
    problems = C.verify()
    assert problems and "EDITED" in problems[0]


def test_appending_onto_a_broken_chain_is_refused(sandbox):
    p = C.SNAPSHOTS / "0001.json"
    p.write_text(p.read_text().replace('"original"', '"tampered"'))
    with pytest.raises(C.ContractViolation, match="broken chain"):
        C.append({"schema": "t/1", "record_id": "0002"}, record_id="0002", kind="test")


def test_a_correction_appends_a_supersession_and_leaves_the_original(sandbox):
    """The prescribed way to fix an error, and the proof it does not rewrite history."""
    before = (C.SNAPSHOTS / "0001.json").read_bytes()
    C.append({"schema": "t/1", "record_id": "0001-c1", "supersedes": "0001",
              "reason": "the original overstated something", "body": "corrected"},
             record_id="0001-c1", kind="supersession")
    assert (C.SNAPSHOTS / "0001.json").read_bytes() == before
    assert C.verify() == []
    ids = [e["record_id"] for e in C.read_ledger()["entries"]]
    assert ids == ["0001", "0001-c1"]


def test_a_supersession_must_name_an_earlier_record(sandbox):
    C.append({"schema": "t/1", "record_id": "0002", "supersedes": "9999"},
             record_id="0002", kind="supersession")
    assert any("supersedes" in x and "9999" in x for x in C.verify())


def test_a_record_cannot_supersede_itself(sandbox):
    C.append({"schema": "t/1", "record_id": "0002", "supersedes": "0002"},
             record_id="0002", kind="supersession")
    assert any("supersedes itself" in x for x in C.verify())


def test_an_unattested_record_file_is_caught(sandbox):
    (C.SNAPSHOTS / "0009.json").write_text('{"schema": "t/1"}')
    assert any("no ledger entry" in x for x in C.verify())


def test_a_ledger_entry_without_a_file_is_caught(sandbox):
    led = C.read_ledger()
    led["entries"].append({"record_id": "0003", "kind": "test", "file": "0003.json",
                           "file_sha256": "0" * 64, "manifest_sha256": "0" * 64,
                           "committed_at_utc": C.now_utc()})
    C.LEDGER.write_text(json.dumps(led, indent=1))
    assert any("not in the repository" in x for x in C.verify())


def test_the_serialised_form_is_verifiable_by_hand(sandbox):
    """Strip the last field from the file and the remainder is what was hashed.

    This is what lets a reviewer check a record with sed and sha256sum instead of trusting
    this module.
    """
    text = (C.SNAPSHOTS / "0001.json").read_text()
    rec = json.loads(text)
    body = copy.deepcopy(rec)
    body.pop(C.HASH_FIELD)
    assert C.record_hash(rec) == rec[C.HASH_FIELD]
    assert json.dumps(body, indent=1, ensure_ascii=False).encode() == C.canonical_bytes(rec)
