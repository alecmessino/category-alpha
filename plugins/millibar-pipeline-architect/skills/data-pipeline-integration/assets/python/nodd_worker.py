"""NODD SQS worker — GOES object notification to derived artifact.

Chain: NODD SNS topic -> SQS -> this handler. No polling anywhere.

THE ANONYMOUS-ACCESS RULE. The GOES buckets are public AWS Open Data. This worker's
execution role has no path to them and must not be given one: it reads them UNSIGNED.
A signed request from a role without a trust path returns 403 AccessDenied, which is
byte-for-byte indistinguishable from a missing object and will send you debugging the
wrong layer for an afternoon.

THE ORDERING RULE. The derived artifact is written first and the manifest last. The
manifest is the commit point. A manifest naming an artifact that does not exist yet is
a board that looks live while showing nothing — the exact failure this project exists
to prevent.

THE HONESTY RULE. A failure records {ok: false, status, note} with value null. The
previous granule is never substituted for the one that failed.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import re
from typing import Any

import boto3
from botocore import UNSIGNED
from botocore.config import Config
from botocore.exceptions import ClientError

LOG = logging.getLogger()
LOG.setLevel(logging.INFO)

SOURCE_BUCKET = os.environ.get("SOURCE_BUCKET", "noaa-goes19")
DERIVED_BUCKET = os.environ["DERIVED_BUCKET"]
PRODUCT_PREFIX = os.environ.get("PRODUCT_PREFIX", "ABI-L2-CMIPF/")

# Unsigned client for the public source bucket. This is the --no-sign-request equivalent.
_public_s3 = boto3.client(
    "s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED)
)
# Ordinary signed client for our own derived bucket.
_own_s3 = boto3.client("s3")

# GOES key timestamps are YYYYDDDHHMMSSm: 4-digit year, 3-digit day-of-year, HHMMSS,
# then one tenth-second digit. Day-of-year, not day-of-month — the single most common
# off-by-one in this stack, and it only shows up at month boundaries.
_SCAN_START = re.compile(r"_s(?P<stamp>\d{14})_")


def scan_start_from_key(key: str) -> dt.datetime | None:
    """Parse the scan-start instant out of a GOES object key.

    Returns None for a key that does not carry one rather than raising: an unexpected
    key shape is a real state (NOAA adds products), and it must not take down the batch.
    """
    m = _SCAN_START.search(key)
    if not m:
        return None
    stamp = m.group("stamp")
    year, doy, hh, mm, ss = (
        int(stamp[0:4]), int(stamp[4:7]), int(stamp[7:9]), int(stamp[9:11]), int(stamp[11:13])
    )
    return dt.datetime(year, 1, 1, tzinfo=dt.timezone.utc) + dt.timedelta(
        days=doy - 1, hours=hh, minutes=mm, seconds=ss
    )


def synoptic_floor(when: dt.datetime) -> dt.datetime:
    """Floor to the ATCF 6-hourly synoptic slot (00/06/12/18Z). Floor, never round."""
    when = when.astimezone(dt.timezone.utc)
    return when.replace(hour=(when.hour // 6) * 6, minute=0, second=0, microsecond=0)


def iso_z(when: dt.datetime) -> str:
    """ISO 8601 UTC with a Z suffix, second precision — the project timestamp format."""
    return when.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def s3_records(sqs_body: str) -> list[dict[str, Any]]:
    """Extract S3 event records from an SQS message body.

    NODD delivers an SNS envelope whose Message field is the S3 Event Notification
    JSON. With raw message delivery enabled the S3 JSON arrives directly, so both
    shapes are handled — a subscription flipped to raw delivery should change latency,
    not correctness.
    """
    outer = json.loads(sqs_body)
    inner = json.loads(outer["Message"]) if "Message" in outer else outer
    return inner.get("Records", [])


def process_object(bucket: str, key: str) -> dict[str, Any]:
    """Fetch one granule's metadata unsigned and emit a normalized descriptor.

    Kept to a HEAD deliberately: the full-disk CMIP payload is tens of megabytes and
    the reprojection belongs in a sized batch job, not on the notification path. What
    this worker owes the board is the answer to "what is the newest slot, and is it
    real" — within seconds of the object landing.
    """
    scanned = scan_start_from_key(key)
    try:
        head = _public_s3.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        # A 403 here means somebody signed the request. Say so, rather than letting it
        # read as a missing object.
        note = (
            "403 on a public bucket — the client is signing requests; it must use "
            "Config(signature_version=UNSIGNED)"
            if status == 403
            else str(exc)
        )
        return {"ok": False, "status": status, "note": note, "key": key, "value": None}

    return {
        "ok": True,
        "status": 200,
        "note": None,
        "key": key,
        "source": f"{bucket}/{key.split('/')[0]}",
        "cluster": 1,
        "observed_at": iso_z(scanned) if scanned else None,
        "synoptic_time": iso_z(synoptic_floor(scanned)) if scanned else None,
        "value": {
            "bytes": head["ContentLength"],
            "etag": head["ETag"].strip('"'),
            "last_modified": iso_z(head["LastModified"]),
        },
    }


def write_manifest(entries: list[dict[str, Any]]) -> None:
    """Write the manifest LAST. It is the commit point for everything above it."""
    fresh = [e for e in entries if e.get("ok") and e.get("observed_at")]
    manifest = {
        "generated_at": iso_z(dt.datetime.now(dt.timezone.utc)),
        "source_bucket": SOURCE_BUCKET,
        "product_prefix": PRODUCT_PREFIX,
        "latest_observed_at": max((e["observed_at"] for e in fresh), default=None),
        # Slots the page hands to sw.js so it can evict superseded TILE entries.
        # Tile hosts only — the service worker never touches same-origin requests.
        "superseded_slots": sorted({e["synoptic_time"] for e in fresh}),
        "entries": entries,
    }
    _own_s3.put_object(
        Bucket=DERIVED_BUCKET,
        Key="manifest.json",
        Body=json.dumps(manifest, separators=(",", ":")).encode(),
        ContentType="application/json",
        # The manifest is the freshness claim. It must never be served from an edge
        # cache after the artifact behind it has moved on.
        CacheControl="no-cache, max-age=0, must-revalidate",
    )


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    """SQS batch handler with partial-batch failure reporting.

    Only genuinely retryable records go back on the queue. A malformed notification is
    logged and dropped, because redelivering it forever would stall every object behind
    it — which is what the DLQ and maxReceiveCount exist to bound.
    """
    entries: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []

    for record in event.get("Records", []):
        message_id = record["messageId"]
        try:
            for s3_rec in s3_records(record["body"]):
                bucket = s3_rec["s3"]["bucket"]["name"]
                key = s3_rec["s3"]["object"]["key"]
                if not key.startswith(PRODUCT_PREFIX):
                    # Belt and braces behind the SNS body filter — if the filter policy
                    # scope is ever wrong, this keeps the wrong products out of the
                    # manifest instead of quietly widening it.
                    continue
                entries.append(process_object(bucket, key))
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            LOG.error("unparseable notification %s: %s", message_id, exc)
        except ClientError as exc:
            LOG.warning("retryable AWS error on %s: %s", message_id, exc)
            failures.append({"itemIdentifier": message_id})

    if entries:
        write_manifest(entries)

    LOG.info(
        "processed=%d ok=%d failed_records=%d",
        len(entries),
        sum(1 for e in entries if e["ok"]),
        len(failures),
    )
    return {"batchItemFailures": failures}
