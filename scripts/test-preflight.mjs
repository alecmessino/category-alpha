#!/usr/bin/env node
/* Tests for the preflight gate and the map-integrity grader.
 *
 * Every check in this suite is made to FIRE. `scripts/lib/deploy-target.mjs` already paid
 * for that lesson: a guard was verified by reading it, it parsed, a grep found it, it
 * looked right, and it was dead — the only way to know was to hand it the bad input and
 * watch what happened. So each audit here gets the real committed artifact (which must
 * pass) and a deliberately broken one (which must fail, with the specific status that says
 * WHY). A test that only ever proves the happy path proves that the function returns.
 *
 * Run: node scripts/test-preflight.mjs
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PF, yamlIndex, yamlAt, auditServerlessTopology, auditUnsignedReads,
  auditServiceWorkerBarrier, auditFrameProbabilityPairs, auditLoaderProbabilityFallback,
  auditCalibrationGate, auditNoPolling,
} from "./lib/preflight.mjs";
import {
  gradeTileGrid, enclosedVoids, auditNoCanvasReads, anchorLattice, tileDiskClass,
  tileLatRange, tileLonRange, geocentricAngleDeg,
  LIMB_ANGLE_DEG, LIMB_MARGIN_DEG, LIMB_EMPTY_MAX, MIN_GRADED_TILES, SUB_SATELLITE_LON,
} from "./lib/tile-grid.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = "plugins/millibar-pipeline-architect/skills/data-pipeline-integration";
const slurp = (rel) => readFile(resolve(ROOT, rel), "utf8");

let fail = 0;
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const ck = (n, cond, detail) => { if (!cond) fail++; console.log((cond ? "  ok   " : "  FAIL ") + n + (cond ? "" : `  — ${detail}`)); };
/* Failures must carry EXACTLY the three-key flat payload. Asserted structurally, because
   an audit that quietly attaches a partial result to a refusal is how a refused check gets
   read downstream as a soft pass. */
const isFlatFailure = (r) => r && r.ok === false && typeof r.status === "number"
  && typeof r.note === "string" && Object.keys(r).length === 3;

const SLS = await slurp(`${PLUGIN}/assets/serverless/serverless.yml`);

console.log("\n[1] the YAML subset reader indexes nesting, not just strings");
{
  const ix = yamlIndex(SLS);
  eq("the filter scope is found under the subscription, not merely present in the file",
    yamlAt(ix, "resources.Resources.NoddSubscription.Properties.FilterPolicyScope"), "MessageBody");
  /* An ARN value contains colons; splitting a key at the FIRST colon rather than the first
     colon-SPACE would file this under "arn" and every assertion about it would miss. */
  eq("a value full of colons still indexes under its own key",
    yamlAt(ix, "resources.Resources.NoddSubscription.Properties.TopicArn"), "${self:custom.noddTopicArn}");
  eq("and so does a key containing colons", yamlAt(ix, "resources.Resources.IngestQueue.Properties.RedrivePolicy.deadLetterTargetArn.Fn::GetAtt"), "[IngestDLQ, Arn]");
  eq("sequence members get indices", yamlAt(ix, "resources.Resources.NoddSubscription.Properties.FilterPolicy.Records.s3.object.key[0].prefix"), "${self:custom.productPrefix}");
  eq("the SourceArn condition indexes inside its condition block",
    yamlAt(ix, "resources.Resources.IngestQueuePolicy.Properties.PolicyDocument.Statement[0].Condition.ArnEquals.aws:SourceArn"), "${self:custom.noddTopicArn}");
  eq("a trailing comment is not part of the value", yamlAt(ix, "resources.Resources.IngestQueue.Properties.VisibilityTimeout"), "180");
}

console.log("\n[2] the ingest-chain audit passes the real config and refuses each way it can break");
{
  eq("the committed serverless.yml passes", auditServerlessTopology(SLS).ok, true);

  /* 2a. No DLQ. One unparseable notification then redelivers until retention expires and
     every later object queues behind it — the pipeline stops and the symptom is old
     imagery, not an error. */
  const noDlq = SLS.replace(/\n        RedrivePolicy:[\s\S]*?maxReceiveCount: 5/, "");
  const rNoDlq = auditServerlessTopology(noDlq);
  ck("a queue with no RedrivePolicy is refused", !rNoDlq.ok && rNoDlq.status === PF.BREACH, JSON.stringify(rNoDlq).slice(0, 160));
  ck("and the refusal is the flat three-key payload", isFlatFailure(rNoDlq), JSON.stringify(Object.keys(rNoDlq)));

  /* 2b. THE HIGH-VALUE ONE. A body-shaped filter policy left at the default
     MessageAttributes scope matches nothing and drops every message, silently. */
  /* Targeted at the PROPERTY, with its indentation. serverless.yml explains the setting in
     a comment above it, and a bare string replace rewrites the comment and leaves the
     property alone — which is how this assertion first "passed" while testing nothing. */
  const wrongScope = SLS.replace("        FilterPolicyScope: MessageBody",
                                 "        FilterPolicyScope: MessageAttributes");
  const rScope = auditServerlessTopology(wrongScope);
  ck("MessageAttributes scope with a body-shaped policy is refused", !rScope.ok && rScope.status === PF.BREACH, rScope.note);
  ck("and the note names the silent-drop consequence", /drops every notification silently/.test(rScope.note), rScope.note);

  const noScope = SLS.replace("        FilterPolicyScope: MessageBody\n", "");
  ck("the broken fixture really is broken — the property, not the comment above it",
    !/^\s{8}FilterPolicyScope: MessageBody$/m.test(wrongScope), "fixture did not change the property");
  ck("an ABSENT scope is refused too — the default is MessageAttributes",
    !auditServerlessTopology(noScope).ok, "an unset scope must not read as MessageBody");

  /* 2c. No aws:SourceArn. The queue becomes writable by any SNS topic in any account, and
     nothing about the pipeline looks wrong, because delivery works. */
  const noCond = SLS.replace(/\n              Condition:[\s\S]*?aws:SourceArn: \$\{self:custom\.noddTopicArn\}/, "");
  const rCond = auditServerlessTopology(noCond);
  ck("a queue policy with no aws:SourceArn is refused", !rCond.ok && rCond.status === PF.BREACH, rCond.note);

  /* 2d. The condition present but pointed at the wrong topic: airtight, and delivers
     nothing. From the console this is indistinguishable from a quiet satellite. */
  const wrongArn = SLS.replace(
    "                  aws:SourceArn: ${self:custom.noddTopicArn}",
    "                  aws:SourceArn: arn:aws:sns:us-east-1:123901341784:NewGOES16Object");
  const rArn = auditServerlessTopology(wrongArn);
  ck("a SourceArn naming a different topic than the subscription is refused", !rArn.ok, rArn.note);
  ck("and the note says the queue would simply stay empty", /stay empty/.test(rArn.note), rArn.note);

  /* 2e. A visibility timeout under the handler's runtime makes SQS redeliver work still in
     progress; the DLQ then fills with successes. */
  const shortVis = SLS.replace("VisibilityTimeout: 180", "VisibilityTimeout: 60");
  ck("a visibility timeout under 6x the function timeout is refused", !auditServerlessTopology(shortVis).ok, "60s against a 30s handler");

  /* 2f. Granting the role read access to the public bucket. Nothing breaks visibly; it
     just invites the next unsigned client to be "fixed" into a signed one. */
  const granted = SLS.replace(
    '          Resource: "arn:aws:s3:::${self:custom.derivedBucket}/*"',
    '          Resource: "arn:aws:s3:::noaa-goes19/*"');
  ck("an s3 grant against a public NOAA bucket is refused", !auditServerlessTopology(granted).ok, "the bucket is read unsigned");

  eq("an empty file is MISSING, not BREACH", auditServerlessTopology("").status, PF.MISSING);
}

console.log("\n[3] unsigned reads are judged in each dialect, and by WHICH bucket");
{
  const real = [];
  for (const p of [`${PLUGIN}/assets/python/nodd_worker.py`, `${PLUGIN}/references/cluster-1-satellite-imagery.md`]) {
    real.push({ path: p, text: await slurp(p) });
  }
  const r = auditUnsignedReads(real);
  ck("the committed worker and reference pass", r.ok, r.note);
  /* The regression this encodes: the first version flagged four signed reads in files
     where every one of them was correct. Three were CLI statements whose
     --no-sign-request sat on a backslash continuation line, and the fourth was
     nodd_worker.py's SIGNED client for its OWN derived bucket, which is not a public-bucket
     read at all. An audit that has to be worked around by breaking the code is worse than
     no audit. */
  ck("the signed client for the private derived bucket is understood, not flagged",
    r.ok && r.value.botoSignedPrivate === 1, JSON.stringify(r.value));

  eq("a CLI statement with the flag on a continuation line passes",
    auditUnsignedReads([{ path: "x.md", text: "aws s3 ls s3://noaa-goes19/ABI/ \\\n  --no-sign-request --region us-east-1\n" }]).ok, true);
  const bare = auditUnsignedReads([{ path: "x.md", text: "aws s3 ls s3://noaa-goes19/ABI/ --region us-east-1\n" }]);
  ck("and one genuinely missing it is refused", !bare.ok && bare.status === PF.BREACH, bare.note);

  const signedPublic = auditUnsignedReads([{ path: "y.py", text:
    'import boto3\nSRC = "noaa-goes19"\ns3 = boto3.client("s3")\ns3.get_object(Bucket=SRC, Key=k)\n' }]);
  ck("a SIGNED client used against a public bucket is refused", !signedPublic.ok, signedPublic.note);
  ck("and the note names the 403 that reads like a missing object",
    /403 AccessDenied/.test(signedPublic.note), signedPublic.note);

  const signedPrivate = auditUnsignedReads([{ path: "y.py", text:
    'import boto3\nSRC = "noaa-goes19"\nown = boto3.client("s3")\nown.put_object(Bucket=DERIVED, Key=k)\n' }]);
  ck("the same signed client against a non-public bucket passes", signedPrivate.ok, signedPrivate.note);

  const s3fsBad = auditUnsignedReads([{ path: "z.py", text: 'fs = S3FileSystem()\nfs.open("noaa-goes19/x.nc")\n' }]);
  ck("s3fs without anon=True is refused", !s3fsBad.ok, s3fsBad.note);
  eq("and nothing to audit is UNKNOWN, not a pass", auditUnsignedReads([{ path: "q.md", text: "no s3 here" }]).status, PF.UNKNOWN);
}

console.log("\n[4] the service-worker barrier is audited by ORDER, which a grep cannot do");
{
  const SW = await slurp("docs/sw.js");
  ck("the committed sw.js passes", auditServiceWorkerBarrier(SW).ok, auditServiceWorkerBarrier(SW).note);

  const widened = SW.replace(
    'const TILE_HOSTS = ["gibs.earthdata.nasa.gov", "basemaps.cartocdn.com"];',
    'const TILE_HOSTS = ["gibs.earthdata.nasa.gov", "basemaps.cartocdn.com", "cdn.example.com"];');
  ck("a widened host list is refused", !auditServiceWorkerBarrier(widened).ok, "every added host becomes cacheable");

  /* THE ONE A GREP MISSES. Every correct string is still in the file; the same-origin
     return has simply moved below the cache write. The result caches latest.json. */
  const reordered = SW.replace("  if (url.origin === self.location.origin) return;                 // never our own assets\n", "")
    .replace("  event.respondWith((async () => {", "  event.respondWith((async () => {\n    if (url.origin === self.location.origin) return fetch(req);");
  const rOrder = auditServiceWorkerBarrier(reordered);
  ck("a same-origin guard moved below the cache write is refused",
    !rOrder.ok, "the file still contains every correct string");
  ck("and the refusal is the flat three-key payload", isFlatFailure(rOrder), JSON.stringify(Object.keys(rOrder)));

  const noWrite = SW.replace("cache.put(req, res.clone());", "/* nothing */");
  const rNoWrite = auditServiceWorkerBarrier(noWrite);
  ck("a worker that caches nothing at all is refused", !rNoWrite.ok, rNoWrite.note);
  ck("and the note recalls the opaque-response bug that made it decorative",
    /opaque/.test(rNoWrite.note), rNoWrite.note);
}

console.log("\n[5] the probability pair on the frame");
{
  const frame = (tsZ, storms) => ({ tsZ, storms });
  const paired = { frames: [frame("2026-08-15T00:00:00Z", { AL092026: { hurricaneP: 0.4, pCal: 0.55 } })] };
  ck("a paired frame passes", auditFrameProbabilityPairs(paired).ok, JSON.stringify(auditFrameProbabilityPairs(paired)));

  /* Unconditionally wrong at any age: the calibration is COMPUTED from the raw estimate,
     so if the calibrated value exists the raw one existed at that instant and was lost. */
  const calOnly = { frames: [frame("2026-08-15T00:00:00Z", { AL092026: { pCal: 0.55 } })] };
  const rCal = auditFrameProbabilityPairs(calOnly);
  ck("a calibrated probability with no raw beside it is refused", !rCal.ok && rCal.status === PF.BREACH, rCal.note);

  /* A raw-only row written AFTER the writer started pairing is a live regression. */
  const regressed = { frames: [
    frame("2026-08-15T00:00:00Z", { AL092026: { hurricaneP: 0.4, pCal: 0.55 } }),
    frame("2026-08-15T00:20:00Z", { AL092026: { hurricaneP: 0.42 } }),
  ] };
  const rReg = auditFrameProbabilityPairs(regressed);
  ck("a raw-only row from the paired writer is refused", !rReg.ok && rReg.status === PF.BREACH, rReg.note);

  /* Legacy rows predating the pairing writer CANNOT be fixed — the board genuinely had no
     calibrated number then — so they are reported and age out. What keeps them safe is the
     loader check in [6], which is why these are two independent checks and not one with a
     waiver flag threaded between them. */
  const legacy = { frames: [
    frame("2026-08-14T00:00:00Z", { AL092026: { hurricaneP: 0.3 } }),
    frame("2026-08-15T00:00:00Z", { AL092026: { hurricaneP: 0.4, pCal: 0.55 } }),
  ] };
  const rLeg = auditFrameProbabilityPairs(legacy);
  ck("legacy raw-only rows pass and are reported, not waived by a flag", rLeg.ok, rLeg.note);
  ck("and the report says they are ageing out", /ageing out/.test(rLeg.note), rLeg.note);
  eq("an empty history is UNKNOWN, not a pass", auditFrameProbabilityPairs({ frames: [] }).status, PF.UNKNOWN);
}

console.log("\n[6] and the loader that reads it must not reach across time");
{
  const LD = await slurp("docs/app/data-loader.js");
  const rOk = auditLoaderProbabilityFallback(LD);
  ck("the committed loader reads strictly from the frame", rOk.ok, rOk.note);
  ck("and all four accessors were actually found — a check that finds none must not pass",
    rOk.ok && rOk.value.accessors.length === 4, JSON.stringify(rOk.value));

  /* The exact line that shipped, restored. It prints the CURRENT calibrated probability
     under a timestamp from two days earlier. */
  const leaking = LD.replace(
    "pCalAt: (f) => { const r = fs(f); return r && r.pCal != null ? r.pCal : null; },",
    "pCalAt: (f) => { const r = fs(f); return r && r.pCal != null ? r.pCal : (s.hurricanePCal ? s.hurricanePCal.p : null); },");
  const rLeak = auditLoaderProbabilityFallback(leaking);
  ck("a snapshot fallback in the probability group is refused", !rLeak.ok && rLeak.status === PF.BREACH, rLeak.note);
  ck("and the note says what the operator would actually see",
    /stale value dressed as current/.test(rLeak.note), rLeak.note);
  eq("a loader with no probability accessors at all is MALFORMED, not a pass",
    auditLoaderProbabilityFallback("export const x = 1;").status, PF.MALFORMED);
}

console.log("\n[7] the deploy gate");
{
  const cal = JSON.parse(await slurp("docs/data/calibration.json"));
  const r = auditCalibrationGate(cal);
  eq("the live scorecard is unpublished, so the gate is shut", r.ok, false);
  eq("and it is a GATE, not a defect", r.status, PF.GATE);
  ck("the refusal is the flat three-key payload", isFlatFailure(r), JSON.stringify(Object.keys(r)));
  ck("and it says what may still be done", /may be built, tested and reviewed/.test(r.note), r.note);
  eq("a published baseline opens it", auditCalibrationGate({
    ok: true, counts: { resolvedStorms: 12 },
    brier: { calibrated: 0.14, raw: 0.19, market: 0.16 },
  }).ok, true);
  eq("a missing file is MISSING", auditCalibrationGate(null).status, PF.MISSING);
}

console.log("\n[8] no polling against a NODD bucket — and legitimate timers are left alone");
{
  const poll = auditNoPolling([{ path: "bad.py", text:
    'while True:\n    r = s3.list_objects_v2(Bucket="noaa-goes19", Prefix=p)\n    time.sleep(60)\n' }]);
  ck("a listing loop against a NOAA bucket is refused", !poll.ok, poll.note);
  ck("and the fix names the SNS topic", /NewGOES\*/.test(poll.note), poll.note);

  /* map.jsx re-resolves its GIBS tile URL every five minutes. That is a client-side
     refresh of a public tile address, not an S3 poll, and an audit that cannot tell the
     difference would have to be switched off. */
  const MAP = await slurp("docs/app/map.jsx");
  ck("the map's 5-minute GIBS re-resolve is not an S3 poll",
    auditNoPolling([{ path: "docs/app/map.jsx", text: MAP }]).ok, "a tile URL refresh is not a bucket listing");
}

console.log("\n[9] the limb is PREDICTED from orbital geometry, not thresholded");
{
  /* The horizon falls out of the orbit radius. It is not a number anyone chose. */
  ck("the limb angle is 81.30 degrees", Math.abs(LIMB_ANGLE_DEG - 81.2995) < 0.001, String(LIMB_ANGLE_DEG));

  /* Tile arithmetic, checked against values that can be worked by hand. z=4 gives a 16x16
     lattice; x=6 spans 45W..22.5W and y=7 spans the equator to 21.94N. */
  eq("tile lon range", tileLonRange(4, 6).map((v) => Math.round(v * 10) / 10), [-45, -22.5]);
  eq("tile lat range", tileLatRange(4, 7).map((v) => Math.round(v * 10) / 10), [0, 21.9]);
  /* The sub-satellite point is on the equator, so a point on the equator is exactly its
     longitude difference away from nadir. */
  eq("a point due east of nadir on the equator", Math.round(geocentricAngleDeg(0, -45, -75.2)), 30);
  eq("and latitude adds to it", Math.round(geocentricAngleDeg(30, -75.2, -75.2)), 30);

  const EAST = SUB_SATELLITE_LON["GOES-East"];
  eq("a tile over the western Atlantic is squarely inside the GOES-East disk", tileDiskClass(4, 6, 7, EAST), "inside");
  eq("a tile over west Africa straddles the limb and is judged by neither gate", tileDiskClass(4, 8, 8, EAST), "edge");
  eq("a tile over the Indian Ocean is off the disk entirely", tileDiskClass(4, 11, 8, EAST), "outside");
  eq("and a global mosaic has no limb at all — everything must be filled", tileDiskClass(4, 11, 8, null), "inside");

  /* The lattice anchor: DOM column/row to tile x/y. */
  eq("two agreeing loaded tiles fix the offset",
    anchorLattice([{ col: 0, row: 0, key: "4/7/6" }, { col: 1, row: 0, key: "4/7/7" }]), { z: 4, dx: 6, dy: 7, anchors: 2 });
  eq("one is not enough", anchorLattice([{ col: 0, row: 0, key: "4/7/6" }]), null);
  ck("and disagreeing ones are refused rather than averaged",
    anchorLattice([{ col: 0, row: 0, key: "4/7/6" }, { col: 1, row: 0, key: "4/9/9" }]) === null, "a bad fit must not be used");

  /* A geolocated lattice: 4 columns x 3 rows anchored at z4 x3..x6, y6..y8. GOES-East sits
     at 75.2W and a z4 tile is 22.5 degrees wide, so that block spans 112.5W..45W and
     21.9S..41.0N — the Gulf and the western Atlantic, every corner inside the disk with the
     worst at 53 degrees from nadir against a 78.3 degree bound.
     Loaded tiles carry their key; blanks have had src replaced by errorTileUrl and carry
     none, which is the real DOM state and the reason the lattice has to be anchored. */
  const grid = (rows, layer = "GOES-East_ABI_GeoColor") => ({
    ok: true,
    layers: [{ pane: "tile-pane", host: "gibs.earthdata.nasa.gov", layer, pitch: 256,
      tiles: rows.flatMap((row, r) => [...row].map((ch, c) => {
        const loaded = ch === "L";
        return { col: c, row: r, w: loaded ? 256 : ch === "B" ? 1 : 0, h: loaded ? 256 : ch === "B" ? 1 : 0,
          state: loaded ? "loaded" : ch === "B" ? "blank" : ch === "F" ? "failed" : "pending",
          key: loaded ? `4/${r + 6}/${c + 3}` : null };
      })) }],
  });

  const full = grid(["LLLL", "LLLL", "LLLL"]);
  ck("a full in-disk grid passes", gradeTileGrid(full).ok, JSON.stringify(gradeTileGrid(full)).slice(0, 260));
  ck("and the pass says the prediction was used, not a ratio",
    /in-disk slot\(s\) all filled/.test(gradeTileGrid(full).note), gradeTileGrid(full).note);

  /* THE CASE THE OLD RATIO GOT BACKWARDS, PART ONE. One missing tile over open water the
     satellite is plainly looking at. 1 of 12 is 8.3% empty — nowhere near the old 33.3%
     gate, and it is unambiguously imagery that should exist. */
  const oneOut = grid(["LLLL", "LFLL", "LLLL"]);
  const rOne = gradeTileGrid(oneOut);
  ck("a single empty in-disk slot fails at 8.3% empty", !rOne.ok && rOne.status === 409, rOne.note);
  ck("and the note gives its position and how far from nadir it is",
    /from nadir, limb is 81\.3/.test(rOne.note), rOne.note);

  /* THE CASE THE OLD RATIO GOT BACKWARDS, PART TWO. A viewport straddling the eastern limb:
     half of it is genuinely off the disk. The old gate failed this correct render at 50%;
     the prediction passes it, because the geometry says the satellite cannot see those
     slots. Anchored at x5..x10, y7..y8 — 67.5W..67.5E, so x5..x7 are inside, x8 straddles
     the limb and is judged by neither gate, and x9..x10 are past the horizon. */
  const atLimb = {
    ok: true,
    layers: [{ pane: "tile-pane", host: "gibs.earthdata.nasa.gov", layer: "GOES-East_ABI_GeoColor", pitch: 256,
      tiles: ["LLLBBB", "LLLBBB"].flatMap((row, r) => [...row].map((ch, c) => {
        const loaded = ch === "L";
        return { col: c, row: r, w: loaded ? 256 : 1, h: loaded ? 256 : 1,
          state: loaded ? "loaded" : "blank", key: loaded ? `4/${r + 7}/${c + 5}` : null };
      })) }],
  };
  const rLimb = gradeTileGrid(atLimb);
  ck("50% empty at the limb PASSES — the old 33.3% gate failed this correct render",
    rLimb.ok, rLimb.note);
  ck("and the report separates off-disk and straddling slots from judged ones",
    /off-disk/.test(rLimb.note) && /straddling the limb \(unjudged\)/.test(rLimb.note), rLimb.note);

  /* THE BLIND SPOT IN THE OLD HOLE TEST. A 2x2 block of failures — the shape a CDN error or
     a rate limit actually produces. Every member had an empty orthogonal neighbour, so the
     four-neighbours test caught none of them. The flood fill has no such gap. */
  const block = [
    { col: 1, row: 1, state: "failed" }, { col: 2, row: 1, state: "failed" },
    { col: 1, row: 2, state: "failed" }, { col: 2, row: 2, state: "failed" },
  ];
  const ring = [];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    if (block.some((b) => b.col === c && b.row === r)) continue;
    ring.push({ col: c, row: r, state: "loaded" });
  }
  const v = enclosedVoids([...ring, ...block]);
  eq("a 2x2 enclosed block is four voids in one region", [v.voids.length, v.regions], [4, 1]);
  eq("and an empty region touching the border is not a void",
    enclosedVoids([{ col: 0, row: 0, state: "blank" }, { col: 1, row: 0, state: "loaded" },
                   { col: 0, row: 1, state: "loaded" }, { col: 1, row: 1, state: "loaded" }]).voids.length, 0);
  /* Eight-connected on purpose: the disk boundary is not tile-aligned, so a real limb is
     ragged and can reach the viewport edge diagonally. Four-connected flooding would call
     that a void and fail a correct render. */
  eq("a diagonal limb sliver reaching the corner is not a void",
    enclosedVoids([{ col: 0, row: 0, state: "loaded" }, { col: 1, row: 0, state: "loaded" }, { col: 2, row: 0, state: "blank" },
                   { col: 0, row: 1, state: "loaded" }, { col: 1, row: 1, state: "blank" }, { col: 2, row: 1, state: "loaded" },
                   { col: 0, row: 2, state: "loaded" }, { col: 1, row: 2, state: "loaded" }, { col: 2, row: 2, state: "loaded" }]).voids.length, 0);

  /* A void with no geolocation at all still fails — gate 2 stands alone. */
  const noKeys = { ok: true, layers: [{ pane: "tile-pane", host: "gibs.earthdata.nasa.gov", layer: null, pitch: 256,
    tiles: [...ring, ...block].map((t) => ({ ...t, w: t.state === "loaded" ? 256 : 0, h: 0, key: null })) }] };
  ck("an enclosed void fails even when the tiles cannot be geolocated", !gradeTileGrid(noKeys).ok, gradeTileGrid(noKeys).note);

  /* A GLOBAL MOSAIC HAS NO LIMB. If the map fell through to the VIIRS daily fallback, every
     empty slot is a fault. The old ratio gate passed a broken VIIRS render happily. */
  const viirs = grid(["LLLL", "LLBL", "LLLL"], "VIIRS_NOAA20_CorrectedReflectance_TrueColor");
  const rViirs = gradeTileGrid(viirs);
  ck("one empty slot in a global mosaic fails — a polar-orbiter mosaic has no limb",
    !rViirs.ok, rViirs.note);
  ck("and the note says so rather than quoting a disk", /global mosaic/.test(rViirs.note), rViirs.note);

  /* GATE 3: the blank map. No in-disk fault (nothing is loaded to bound the disk against),
     no enclosed void (every empty slot is border-connected). This is the failure the whole
     check exists to catch and only the coverage bound sees it. */
  const blank = { ok: true, layers: [{ pane: "tile-pane", host: "gibs.earthdata.nasa.gov", layer: "GOES-East_ABI_GeoColor", pitch: 256,
    tiles: Array.from({ length: 16 }, (_, i) => ({ col: i % 4, row: Math.floor(i / 4), w: 1, h: 1, state: "blank", key: null })) }] };
  const rBlank = gradeTileGrid(blank);
  ck("a completely blank layer fails", !rBlank.ok && rBlank.status === 409, rBlank.note);
  ck("and it fires the coarse ratio, saying the tiles could not be geolocated",
    /could not be geolocated/.test(rBlank.note), rBlank.note);
  eq("which is the only place the old 33.3% constant survives", LIMB_EMPTY_MAX, 0.333);

  /* UNKNOWN BEFORE FAIL, always. A pane that has not laid out must never report as a layout
     error — that false positive is what teaches an operator to ignore the check. */
  eq("too few tiles to measure is UNKNOWN", gradeTileGrid(grid(["LB", "LL"])).status, 503);
  eq("a census taken mid-load is UNKNOWN", gradeTileGrid(grid(["PPPP", "PPPP", "LLLL"])).status, 503);
  eq("and so is a document with no GIBS layer at all", gradeTileGrid({ ok: true, layers: [] }).status, 503);
  eq("the minimum graded size is stated, not implied", MIN_GRADED_TILES, 12);
  eq("and so is the margin pulled in from the horizon", LIMB_MARGIN_DEG, 3);

  /* CARTO is excluded on purpose: it has a tile everywhere on Earth, so folding it into the
     same grading would let a healthy basemap mask a missing satellite layer. */
  eq("a CARTO-only document is not graded as if it were the satellite layer",
    gradeTileGrid({ ok: true, layers: [{ pane: "tile-pane", host: "basemaps.cartocdn.com", layer: null, pitch: 256, tiles: [] }] }).status, 503);
}

console.log("\n[10] and the canvas prohibition is a check, not a comment");
{
  const r = auditNoCanvasReads([{ path: "scripts/lib/tile-grid.mjs", text: await slurp("scripts/lib/tile-grid.mjs") }]);
  ck("the grader itself reads no pixels", r.ok, r.note);
  const bad = auditNoCanvasReads([{ path: "future.mjs", text:
    "const c = document.createElement('canvas');\nctx.drawImage(tile,0,0);\nconst px = ctx.getImageData(0,0,1,1);\n" }]);
  ck("a mean-brightness check reaching for getImageData is refused", !bad.ok, bad.note);
  ck("and the note explains that CORS headers do not save it",
    /no crossOrigin attribute/.test(bad.note), bad.note);
}

console.log(fail ? `\n${fail} preflight check(s) FAILED\n` : "\nall preflight checks passed\n");
process.exit(fail ? 1 : 0);
