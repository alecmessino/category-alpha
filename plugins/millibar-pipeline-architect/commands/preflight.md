---
description: Check the deploy gate before building a pipeline — calibration baseline, anonymous S3 path, and existing readers.
allowed-tools: Read, Grep, Glob, Bash
---

Run the pre-deploy checks. Report each as PASS / FAIL / UNKNOWN with the evidence, then
give a single go / no-go verdict.

## 1. Baseline pre-requisite (the gate)

These pipelines deploy only AFTER the historical calibration loop baseline is published.

- Read `docs/data/calibration.json`. Does it carry a published baseline, or is the scorer
  still withholding one for want of resolved storms?
- If it is absent or unpublished: **FAIL**. Say plainly that ingestion may be built and
  tested but must not be deployed live, and why — a pipeline feeding an unscored board
  publishes probabilities nobody can grade.
- `node scripts/calibrate.mjs --dry` reports without writing, if the developer wants the
  current state.

## 2. Anonymous S3 path

Confirm the public-bucket path works unsigned, before any IaC is written:

```bash
aws s3 ls s3://noaa-goes19/ABI-L2-CMIPF/ --no-sign-request --region us-east-1 | head -3
```

- `403 AccessDenied` here means the request was signed. Check for `AWS_PROFILE` /
  credential-process interference, and confirm the SDK client uses
  `Config(signature_version=UNSIGNED)`.
- If the AWS CLI is not installed, report **UNKNOWN** rather than assuming either way.

## 3. Existing readers

Grep `scripts/` and `docs/app/` for the host of whatever feed is about to be built. This
repo already ingests NHC/ATCF (`scripts/ingest.mjs`, `scripts/lib/atcf.mjs`), TGFTP recon
(`scripts/lib/recon.mjs`), SHIPS (`scripts/lib/ships.mjs`), NOMADS GFS
(`scripts/fetch-wind.mjs`, `scripts/grib2.mjs`), Kalshi and Polymarket
(`scripts/fetch-data.mjs`), and NASA GIBS tiles (`docs/app/map.jsx`, `docs/sw.js`).
Report any overlap as **FAIL — extend, do not duplicate**, naming the file to extend.

## 4. Service-worker contract

If the work touches caching, confirm `docs/sw.js` still restricts itself to
`gibs.earthdata.nasa.gov` and `basemaps.cartocdn.com` and still returns early on
same-origin requests. Any change that lets it cache or evict same-origin is a **FAIL**:
it would let a stale board look live.

## 5. Polling check

Grep the diff or the target script for `setInterval`, `while True`, and scheduled
`s3 ls` against a NOAA bucket. Ingestion is event-driven off
`arn:aws:sns:us-east-1:123901341784:NewGOES*`. A poll against a NODD bucket is a **FAIL**
with the SNS topic named as the fix.

## Verdict

One line: **GO** or **NO-GO**, and if NO-GO, the single blocking item.
