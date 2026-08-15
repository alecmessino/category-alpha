---
description: Scaffold an ingestion pipeline for one Resource Master List endpoint — IaC, payload, and parser.
argument-hint: "<resource> [--iac terraform|serverless] [--out <dir>]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

Scaffold a complete, runnable ingestion path for the resource named in `$ARGUMENTS`.

Load `${CLAUDE_PLUGIN_ROOT}/skills/data-pipeline-integration/SKILL.md` and the reference
for the resource's cluster before writing anything.

## Order of work

1. **Name the cluster.** `[Cluster N — <name>]`. If the resource is not in the Master
   List, say so, place it in the nearest cluster, and mark it an extension.

2. **Run the preflight checks** from `/millibar:preflight` — at minimum the calibration
   gate and the existing-reader grep. If this repo already reads the feed, extend that
   file instead of scaffolding a new one, and say which file and why.

3. **State transport, cadence, auth** in three lines before any code.

4. **Emit the artifacts.** Copy and adapt from
   `${CLAUDE_PLUGIN_ROOT}/skills/data-pipeline-integration/assets/`:

   - Anonymous-S3 feeds → `terraform/nodd-goes-ingest.tf` or `serverless/serverless.yml`,
     plus `python/nodd_worker.py`. Honor `--iac`; default to Terraform.
   - HTTP/REST feeds → a Python client with the route in one named constant, the timestamp
     triple from `python/alpha_timestamps.py`, and the `{ok, status, note, value}` record
     shape.
   - GRIB feeds → the proxy-filter call FIRST (GribStream, NOMADS `filter_*.pl`, or an
     `.idx` byte-range), then the local `cfgrib` open. Never a full-cycle download.
   - Caching work → `worker/sw-tile-invalidation.js` and `worker/manifest-listener.js`,
     appended to `docs/sw.js` without widening its host list.

   Write to `--out` if given; otherwise propose paths and confirm before writing.

## Non-negotiables in everything you emit

- `--no-sign-request` / `Config(signature_version=UNSIGNED)` / `anon=True` on every public
  NOAA/AWS Open Data call.
- Event-driven off the NODD SNS topics. No polling loop.
- GRIB filtered at the proxy before any local transformation.
- `tropycal` / `xarray` / `cfgrib` / `shapely` rather than a hand-rolled parser, unless
  nothing covers the product — and then written against a committed live-sample fixture,
  with unestablished fields captured verbatim and given no meaning.
- Cluster 4 records carry `observed_at`, `synoptic_time`, `btk_key`.
- Failures record `{ok: false, status, note}` with `value: null`. No synthesized fallback.
- No placeholders. Account-specific values become named variables with real defaults.

## Close

State the failure modes for what you built — what a broken feed looks like, and what the
pipeline records when it breaks — then restate the deploy gate: this ships after the
historical calibration loop baseline is published.
