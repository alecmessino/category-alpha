---
description: Check the deploy gate before building a pipeline — calibration baseline, anonymous S3 path, and existing readers.
allowed-tools: Read, Grep, Glob, Bash
---

## 1. Run the gate

```
node scripts/preflight-imagery.mjs          # add --json for a machine-readable report
```

It decides seven of the eight checks from committed bytes and prints PASS / FAIL / UNKNOWN
with the evidence for each. A check decided by reading is a check that passes when somebody
is tired, so do not re-derive by hand what it already decided — read its output.

**Two verdicts, and they are different questions.** BUILD says the code is fit to write and
review. DEPLOY says it may run against live infrastructure. Only DEPLOY is blocked by the
calibration gate, and the exit code tracks BUILD, so a gate expected to stay shut for months
does not fail a pull request.

**UNKNOWN is not a pass.** It blocks a DEPLOY GO and is reported separately.

## 2. Settle the one check it cannot make

`anonymous-egress` reports UNKNOWN by construction — no network here.

```bash
aws s3 ls s3://noaa-goes19/ABI-L2-CMIPF/ --no-sign-request --region us-east-1 | head -3
```

Run it **from the environment that will host the worker**, not from a laptop with a
different credential chain. A `403 AccessDenied` means the request was signed after all:
check `AWS_PROFILE` and any `credential_process` before touching the IaC. If the AWS CLI is
absent, report UNKNOWN rather than assuming either way.

## 3. Do not duplicate an existing reader

The preflight does not check this — it is a judgement about the feed being asked for, not
about the tree. Grep `scripts/` and `docs/app/` for its host first. This repo already
ingests NHC/ATCF (`scripts/ingest.mjs`, `scripts/lib/atcf.mjs`), TGFTP recon
(`scripts/lib/recon.mjs`), SHIPS (`scripts/lib/ships.mjs`), NOMADS GFS
(`scripts/fetch-wind.mjs`, `scripts/grib2.mjs`), Kalshi and Polymarket
(`scripts/fetch-data.mjs`), and NASA GIBS tiles (`docs/app/map.jsx`, `docs/sw.js`). Overlap
is **FAIL — extend, do not duplicate**, naming the file to extend.

## 4. Verdict

One line: **BUILD GO/NO-GO** and **DEPLOY GO/NO-GO**, each with its single blocking item.

Why every threshold in the script is the value it is, and what each check prevents:
`skills/data-pipeline-integration/references/preflight-satellite-imagery.md`.
