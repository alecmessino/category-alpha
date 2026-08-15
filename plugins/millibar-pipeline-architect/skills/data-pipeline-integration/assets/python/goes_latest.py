"""Anonymous GOES granule resolution against AWS Open Data.

FOR BACKFILL AND POINT LOOKUPS ONLY. Live ingestion is event-driven off the NODD SNS
topics (see nodd_worker.py and ../terraform/nodd-goes-ingest.tf). Full disk lands every
10 minutes, so a 60-second lister makes ~9 wasted LIST calls per useful object and still
adds up to 60 seconds of latency to the one that matters.

Every S3 call here is UNSIGNED. That is the boto3 equivalent of --no-sign-request, and
it is a correctness requirement rather than a convenience: a signed request from a role
without a trust path to noaa-goes* returns 403 AccessDenied, which is indistinguishable
from a missing object.

    python3 goes_latest.py --product ABI-L2-CMIPF --band 13
"""

from __future__ import annotations

import argparse
import datetime as dt

import boto3
from botocore import UNSIGNED
from botocore.client import BaseClient
from botocore.config import Config

UTC = dt.timezone.utc

# GOES-19 is operational GOES-East; GOES-18 is operational GOES-West. GOES-16 and
# GOES-17 remain readable as archives. Do not hardcode G16 in a pattern built today.
SATELLITES = {"19": "noaa-goes19", "18": "noaa-goes18", "17": "noaa-goes17", "16": "noaa-goes16"}
REGION = "us-east-1"

# Full-disk products publish every 10 min, CONUS every 5, mesoscale every 1, GLM every
# 20 s. This drives how far back a lookback walks before concluding nothing is there.
CADENCE_MIN = {"F": 10, "C": 5, "M1": 1, "M2": 1, "GLM": 1}


def client() -> BaseClient:
    """Unsigned S3 client — the --no-sign-request equivalent."""
    return boto3.client("s3", region_name=REGION, config=Config(signature_version=UNSIGNED))


def prefix_for(product: str, when: dt.datetime) -> str:
    """NODD key prefix for one UTC hour.

    The path component is DAY OF YEAR, zero-padded to three digits (%j) — not day of
    month. The two agree for the first nine days of January and diverge everywhere
    else, which is why this bug only ever surfaces in production.
    """
    when = when.astimezone(UTC)
    return f"{product}/{when:%Y}/{when.timetuple().tm_yday:03d}/{when:%H}/"


def latest_granule(
    product: str = "ABI-L2-CMIPF",
    band: int | None = 13,
    satellite: str = "19",
    now: dt.datetime | None = None,
    lookback_hours: int = 2,
) -> str | None:
    """Newest key for `product`, walking back hour by hour.

    Returns None rather than raising when nothing is found. An absent granule is a real
    and expected state — a scan slot that has not landed yet — and it must not read as a
    pipeline fault.
    """
    bucket = SATELLITES[satellite]
    s3 = client()
    now = now or dt.datetime.now(UTC)

    for hours_back in range(lookback_hours + 1):
        stamp = now - dt.timedelta(hours=hours_back)
        prefix = prefix_for(product, stamp)
        if band is not None:
            # Narrowing the prefix to the band avoids listing all 16 bands of the hour.
            prefix += f"OR_{product}-M6C{band:02d}"

        keys: list[str] = []
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
            keys.extend(obj["Key"] for obj in page.get("Contents", []))

        if keys:
            # Keys sort lexicographically by scan-start stamp, which is monotonic within
            # a product, so max() is the newest without parsing anything.
            return max(keys)

    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--product", default="ABI-L2-CMIPF")
    parser.add_argument("--band", type=int, default=13, help="ABI band; omit for GLM")
    parser.add_argument("--satellite", default="19", choices=sorted(SATELLITES))
    parser.add_argument("--no-band", action="store_true", help="do not filter by band")
    args = parser.parse_args()

    key = latest_granule(
        product=args.product,
        band=None if args.no_band else args.band,
        satellite=args.satellite,
    )
    if key is None:
        # Distinguishable from a failure: this prints a state, and exits 0.
        print(f"no granule found for {args.product} in the last 2 hours")
        return

    bucket = SATELLITES[args.satellite]
    print(f"s3://{bucket}/{key}")
    print(f"aws s3 cp s3://{bucket}/{key} . --no-sign-request --region {REGION}")


if __name__ == "__main__":
    main()
