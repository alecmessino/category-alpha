# Preflight — Cluster 1, Primary Satellite Imagery

The checks that must pass before GOES-18/19 (`s3://noaa-goes18/`, `s3://noaa-goes19/`) and
NASA GIBS raster tiles are wired into this board.

Runnable: `node scripts/preflight-imagery.mjs` (add `--json` for a machine-readable
report). Every decision it makes lives in `scripts/lib/preflight.mjs` and
`scripts/lib/tile-grid.mjs` as a pure function, and every one is made to fire against a
deliberately broken fixture in `scripts/test-preflight.mjs`.

**The verdict is two verdicts.** BUILD says the code is fit to write and review. DEPLOY
says it may run against live infrastructure. Only the second is blocked by the calibration
gate, and collapsing them is how a closed gate gets read as a broken build. The script's
exit code tracks BUILD, so CI fails on a real defect and not on a gate that is expected to
stay shut for months.

**UNKNOWN is not a pass.** A check that could not be decided here is counted separately and
blocks a DEPLOY GO. A preflight that rounds "could not tell" up to "fine" produces a
verdict with the same shape as a real one, which is worse than no verdict.

---

## 1. Data integration and infrastructure

`assets/serverless/serverless.yml` — audited structurally, by nesting, not by string
search. Every fault in this chain produces the same symptom: **a queue depth of zero**,
which from the console is indistinguishable from a quiet satellite. That is the whole
reason these are separable on disk rather than debuggable in production.

| Assertion | What it prevents |
|---|---|
| A queue carries a `RedrivePolicy` with a resolvable `deadLetterTargetArn` and a `maxReceiveCount` ≥ 1 | One unparseable notification redelivers until retention expires and every later object queues behind it. The pipeline stops; the symptom is old imagery, not an error |
| `VisibilityTimeout` ≥ 6× the function timeout | SQS redelivers work the handler is still doing. The object is processed twice and the DLQ fills with successes |
| `FilterPolicyScope: MessageBody` wherever a `FilterPolicy` exists | NODD carries the object key in the message **body**. The default scope is `MessageAttributes`; a body-shaped policy left at the default matches nothing and drops **every** message, silently |
| A `FilterPolicy` exists at all | Subscribing per bucket rather than per product: `ABI-L1b-RadM1` alone is one notification per minute per mesoscale sector |
| `aws:SourceArn` present, inside an `ArnEquals`/`ArnLike`/`StringEquals` block | Without it the queue is writable by any SNS topic in any account — and nothing looks wrong, because delivery works |
| `aws:SourceArn` names the same topic the subscription targets | Pointed at the wrong ARN the policy is airtight and delivers nothing |
| No `s3:GetObject` grant against `noaa-*` in the execution role | Asserted as an **absence**. Granting it breaks nothing visibly; it invites the next unsigned client to be "fixed" into a signed one |

**Unsigned reads** are judged in each dialect, because `--no-sign-request` is an AWS CLI
flag and **does not exist in any SDK**. A checker that greps for that literal across Python
would pass a signed `boto3` client sitting next to a comment mentioning it.

| Transport | The unsigned form |
|---|---|
| `aws s3` / `aws s3api` | `--no-sign-request --region us-east-1` |
| boto3 | `Config(signature_version=UNSIGNED)` |
| s3fs | `S3FileSystem(anon=True)` |
| fsspec / xarray | `storage_options={"anon": True}` |
| plain HTTPS GET against the public REST endpoint | nothing to omit — no signing happens. `scripts/probe-wind.mjs` uses this form against `noaa-gfs-bdp-pds` and needs no marker |

And it is judged **by which bucket**, not by which client. `assets/python/nodd_worker.py`
holds two clients: `_public_s3` unsigned for `noaa-goes19`, `_own_s3` signed for the
derived bucket. Both are correct. An audit that flags every signed S3 client can only be
satisfied by breaking the second one.

**The network path cannot be settled from committed bytes** and reports UNKNOWN:

```bash
aws s3 ls s3://noaa-goes19/ABI-L2-CMIPF/ --no-sign-request --region us-east-1 | head -3
```

A `403 AccessDenied` there means the request was signed after all — check `AWS_PROFILE` and
any `credential_process` before touching the IaC. Run it from the environment that will
host the worker, not from a laptop with a different credential chain.

**No polling.** GOES full disk lands every 10 minutes and the publish instant moves with
scan duration and reprocessing, so a timer is wrong in both directions at once. The check
is scoped to timers within 400 characters of a NOAA bucket listing, because `map.jsx`
re-resolves its GIBS tile URL every five minutes and that is a client-side refresh of a
public tile address, not an S3 poll. An audit that cannot tell those apart would have to be
switched off.

---

## 2. Frame synchronisation and the caching barrier

### The service worker

`docs/sw.js` is audited as three properties that must hold **at once**, and the first is
asserted by **order**, which a grep cannot do:

1. same-origin requests return before the cache is ever opened;
2. `TILE_HOSTS` is exactly `gibs.earthdata.nasa.gov` and `basemaps.cartocdn.com`;
3. no `cache.put` / `cache.add` occurs before both guards.

A file with the same-origin return moved *below* the cache write contains every correct
string and caches `latest.json`. A cached `index.html` or `latest.json` makes the board's
freshness claim false while every indicator on the page keeps saying otherwise.

The audit also asserts tiles are re-issued in **cors** mode. This encodes a bug that already
shipped here: Leaflet requests tiles from `<img>` tags, so the response is **opaque** —
status 0, headers unreadable. The first version guarded on `status === 200`, which is never
true for an opaque response, so it cached exactly nothing and the whole worker was
decorative. The verifier passed, because it was only asserting what was *not* in the cache.

`assets/worker/sw-tile-invalidation.js` is an additive extension and stays behind the
deploy gate: it needs a manifest producer that does not exist yet. Note what it is and is
not — GIBS and GOES tiles are addressed by timestamp, so a cached tile can never be a stale
version of a current tile. Eviction is **quota management, not correctness**, and must never
be widened into a correctness mechanism, because the moment it is, someone will reach for it
to invalidate same-origin.

### The probability pair on the frame

`docs/data/frames.json` is what the scrubber reads. The pair is `{pRaw, pCal}`.

- `scripts/fetch-data.mjs` writes `pRaw` (from `cal.pRaw`, the exact value the calibration
  was computed from, falling back to the raw estimator's own output) alongside `pCal`,
  `pSigma` and `quality`, from one evaluation of one storm state. `hurricaneP` is still
  written under its old name so the 32-hour retained window and every existing consumer
  keep answering.
- A calibrated probability with **no** raw beside it is refused unconditionally, at any
  age: the calibration is computed *from* the raw estimate, so if `pCal` exists then `pRaw`
  existed at that instant and was lost on write.
- Legacy raw-only rows **cannot be backfilled**. The board genuinely had no calibrated
  number then, and writing one in now would be inventing history.

So the fix is in the reader, and it is audited separately (`frame-fallback`). Every
probability accessor in `docs/app/data-loader.js` — `pCalAt`, `pRawAt`, `pSigmaAt`,
`qualityAt`, `hurricanePAt` — must read **strictly from the frame row** and return `null`
when it has nothing. The four move together because they are one reading: a calibrated
probability from the frame beside an evidence tier from the snapshot describes no moment
that ever existed.

The legacy-row waiver is *derived* from that audit rather than taken from a command-line
flag. A flag a person sets because they believe the fix landed outlives the fix.

---

## 3. Map integrity

`scripts/lib/tile-grid.mjs`. The satellite grid is graded from **DOM geometry**, and the
prohibition on pixel reads is itself a check (`auditNoCanvasReads`) rather than a comment,
because somebody will one day want a mean-brightness test.

**Why canvas cannot work here, precisely.** Leaflet builds tiles as plain `<img>` elements
with **no `crossOrigin` attribute**. An image loaded without `crossOrigin` taints the canvas
it is drawn into *regardless of what the server sent* — GIBS does send
`Access-Control-Allow-Origin: *`, and it makes no difference, because the taint rule is
about how the element requested the image, not how the server answered. `drawImage`
succeeds; the `SecurityError` arrives later at `getImageData`, on the deployed board, after
passing against every same-origin fixture.

What is readable cross-origin, with no taint and no second request: `complete`,
`naturalWidth`, `naturalHeight`, and `getBoundingClientRect()`. `map.jsx` sets
`errorTileUrl` to a 1×1 transparent GIF, so an unpublished slot resolves to a tile of
natural size 1×1 — an unambiguous empty-slot signal with no pixel read at all.

Coordinates come from **geometry, not URLs**: GIBS addresses tiles `/{z}/{y}/{x}` and CARTO
addresses them `/{z}/{x}/{y}`, so parsing them out would need a per-host rule and would
silently transpose one of them — which is exactly what makes an adjacency check report holes
that are not there. Leaflet has already placed every tile on a regular lattice; the pitch is
**measured** from the tiles rather than assumed to be 256, because `zoomSnap: 0.25` means a
tile is CSS-scaled at most zooms.

**Two gates, and neither finds the other's fault:**

- **`LIMB_EMPTY_MAX = 0.333`** — empty fraction above 33.3% fails. This is a **policy
  constant, chosen, not derived**. No projection identity produces it: the empty fraction
  depends on where the viewport sits relative to the limb and ranges from 0 under nadir to
  well over half at the edge. A third is where a reader stops calling it "the edge of the
  disk" and starts calling it "the imagery is missing". It is named and overridable so the
  judgement is arguable rather than buried in an inequality. Strictly greater fails, so a
  grid sitting exactly at 33.3% passes. This gate catches **the layer never attaching**.
- **Interior holes** — an empty slot whose four orthogonal neighbours are all present and
  loaded fails at *any* ratio. A limb is a connected boundary: every slot outside the disk
  touches another outside slot or the edge of the lattice. An enclosed empty slot is a tile
  that failed. This gate catches **tiles failing**, at an empty fraction of a few per cent,
  where the ratio gate is nowhere near firing.

**UNKNOWN before FAIL, always.** Fewer than 12 settled tiles, or more than 20% still
loading, or no GIBS layer in the DOM at all, reports 503 rather than a layout error. That
false positive is what teaches an operator to ignore the check. CARTO is excluded from
grading on purpose: it has a tile everywhere on Earth, so folding it into the same ratio
would let a healthy basemap mask a missing satellite layer.

Wired into `scripts/verify-live.mjs`, where UNKNOWN does not fail the build — a sandbox with
no egress to GIBS, or a board with no active cyclone and therefore no satellite layer,
cannot be graded.

---

## 4. Backtest and zero-peek verification

`scripts/lib/backtest-gate.mjs` and `scripts/lib/backtest-runner.mjs`.

**The two decks are gated on different clocks, and that is the whole idea.**

- **A-deck rows are forecasts.** Gated by **issuance** — the cycle DTG in column 3. `tau` is
  never consulted. A row from the 12Z cycle with tau 120 describes a moment five days out
  and was still published at 12Z; a forecaster at 12Z could read all of it. Gating on tau
  throws away the forecasts the exercise is about.
- **B-deck rows are analyses.** Always tau 0, gated by **validity**. A row valid after the
  decision time is the answer sheet, and admitting it is the single most effective way to
  build a backtest that beats the market on paper and loses money in the world.

**Two leaks survive that rule, and both are closed with named, overridable constants.**

- `ADECK_AID_LATENCY_MIN = 60`. **The a-deck fills in progressively after its cycle time.**
  This is not speculation: it is written into this repo's own live verifier, which excuses a
  storm read minutes past 00Z for showing one CARQ record where a read ten minutes later
  shows thirty aids. So `cycle <= t` admits rows that did not exist at `t`, and the leak is
  systematically favourable — the late arrivals are the expensive multi-model consensus
  members, which are also the most skilful. The constant is a policy choice, and it is safe
  to choose because its **direction of safety is known**: raising it can only withhold
  information, never invent it. An over-estimate makes the backtest pessimistic; an
  under-estimate makes it a lie. When in doubt, raise it.
- `BDECK_PUBLICATION_LAG_MIN = 180`. NHC's advisory package for synoptic time T goes out
  around T+3h and the b-deck row for T is written with it, so `validTime <= t` still admits
  the analysis of the hour that has just ended but has not yet been published.

**One problem no constant fixes, and it is reported rather than papered over.** The b-deck an
archive serves today is the **post-season reanalysis**. NHC revises intensities and positions
after the season, so the values a backtest reads are frequently not the values the
operational forecaster had. Perfect timestamp gating still leaves the engine fed a better
analysis of the past than existed at the time. `sealBestTrack` attaches this caveat to every
result and `scoreBacktests` carries it into the roll-up. It cannot be corrected away, only
disclosed.

**Structural defences, not just correct predicates:**

- `visible` and `sealed` are **separate objects**, never one list with an `isFuture` flag.
  An annotated list is one filter-predicate typo away from being handed whole to a model,
  and that typo produces a backtest that looks superb.
- `assertNoLeak` runs on the bundle actually handed to the estimator, after every filter,
  right before the call — because between the gate and the model sits ordinary application
  code, and the whole failure mode of a backtest is that it never complains. It also refuses
  a future timestamp under **any new key**, since a bundle grows fields over time and each
  one is a new way to smuggle the answer in.
- The runner **cannot fetch**. Decks arrive as text or records; the estimator is injected.
  A runner that can fetch can fetch the *current* deck while simulating a past moment, and
  the resulting score is wrong in the flattering direction with nothing in the output to
  show it.
- Decision times land on the **synoptic lattice** (00/06/12/18Z), floored never rounded. A
  backtest stepping every four hours would ask for a probability at 04Z off the 00Z deck — a
  decision no desk ever makes, scored as though it did.
- Scoring reuses `outcomeFromBestTrack` and `summarize` from `scripts/lib/calibration.mjs`
  **unchanged**, which means it inherits the refusal that matters most: **one storm is a
  sample size of one**, however many decision times it stepped through. Forty entries from
  one storm share that storm's single outcome. `scoreBacktests` withholds a score until ten
  distinct storms have resolved, exactly as the live loop does.
- The `{pRaw, pCal}` pair rule is enforced at the estimator boundary too. A calibrated
  probability with no raw beside it is refused at the step, because the paired skill number —
  did the ingested feeds earn their keep — is what the whole exercise is accountable to.

---

## 5. The code contract

Every check returns the repo's flat dictionary. A failure is **exactly three keys**, frozen:

```json
{ "ok": false, "status": 409, "note": "Context String" }
```

A pass may carry `value`. That asymmetry is deliberate: success has something to show,
failure has a reason, and an audit that attaches a partial result to a refusal is how a
refused check gets read downstream as a soft pass. The freeze is what makes it structural
rather than a convention.

Status codes are HTTP-shaped because the rest of this repo's honesty contract carries real
HTTP statuses in the same field:

| Code | Meaning |
|---|---|
| `0` | pass |
| `404` MISSING | the artifact is not there |
| `409` BREACH | present, parses, violates a stated invariant — the interesting one |
| `412` GATE | nothing is broken; a precondition is not met yet |
| `422` MALFORMED | present but unreadable. "I could not read it" and "I read it and it is wrong" need opposite responses |
| `503` UNKNOWN | not decidable here. Never collapsed into a pass or a fail |

---

## Implementation lifecycle

1. **Build and test everything.** Every artifact above is committed, exercised offline, and
   gated in CI against fixtures.
2. **Nothing goes live until the calibration baseline is published.** The gate is `ok: true`
   in `docs/data/calibration.json`, produced by `node scripts/calibrate.mjs`.
3. **Then deploy**, re-running the preflight from the target environment so the
   `anonymous-egress` UNKNOWN resolves.

One precision about step 2, because the phrase "calibration coefficients" invites the wrong
mental model: **nothing here fits coefficients**. `calibrate.mjs` *scores* published
probabilities against NHC best track and refuses to publish a score until enough **distinct
storms** have resolved — the entry count is not the sample size, because every forecast made
during one storm's life shares that storm's single outcome. The artifact written to disk is
a scorecard, and the gate is that scorecard reporting `ok: true`.

A live ingestion pipeline feeding an unscored board publishes probabilities nobody can
grade, which is the one failure this project exists to prevent.
