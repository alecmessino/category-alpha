# Event-Driven Ingest — NODD SNS → SQS → Worker → `sw.js`

Lifecycle rule 4. Ingestion is driven by NOAA NODD notifications, not by a polling loop.

## Why polling is a defect here

GOES full disk lands every 10 minutes. A 60-second poll makes about nine wasted
`ListObjectsV2` calls for every useful one, and still adds up to 60 seconds of latency to
the one that matters. A 10-minute poll aligned to the scan clock drifts, because the
publish instant moves with scan duration and reprocessing. The notification carries the
key you want, at the moment it exists, with no listing at all.

## Topics

```
arn:aws:sns:us-east-1:123901341784:NewGOES19Object     GOES-East  (operational)
arn:aws:sns:us-east-1:123901341784:NewGOES18Object     GOES-West  (operational)
arn:aws:sns:us-east-1:123901341784:NewGOES16Object     archive
arn:aws:sns:us-east-1:123901341784:NewGOES17Object     archive
```

The NODD publisher account is `123901341784` and the topics live in `us-east-1`. Confirm
the exact topic names against the current NODD documentation before a first deploy — NOAA
adds topics as satellites rotate into service, and subscribing to a topic that does not
exist fails at apply time rather than silently, which is the good case.

Message payload is an S3 Event Notification envelope: a `Records` array, each with
`s3.bucket.name` and `s3.object.key`.

## Chain

```
NODD SNS topic  ──subscribe──▶  your SQS queue  ──trigger──▶  Lambda worker
  (NOAA acct)                    (your acct)                       │
                                                                   ├─▶ derived artifact → S3
                                                                   └─▶ manifest.json (versioned)
                                                                            │
                                                            page fetches manifest
                                                                            │
                                                            postMessage ──▶ sw.js
                                                                            │
                                                     evict superseded TILE entries only
```

Two things make this correct rather than merely fashionable:

1. **The queue is the buffer.** A GLM burst publishes 180 notifications in an hour. SQS
   absorbs that; a synchronous SNS→Lambda subscription throttles and drops.
2. **A redrive policy is mandatory.** Without a DLQ, a single unparseable notification
   redelivers until the retention window expires, and every later object queues behind it.

## Filtering at the subscription

Subscribe once per product, not once per bucket. NODD notifies on **every** object, and
`ABI-L1b-RadM1` alone is one object per minute per sector.

SNS message-body filtering (`FilterPolicyScope = "MessageBody"`) matches on the S3 event
JSON itself:

```json
{
  "Records": {
    "s3": {
      "object": {
        "key": [{ "prefix": "ABI-L2-CMIPF/" }]
      }
    }
  }
}
```

Validate this against a captured NODD notification before relying on it. A mis-scoped
filter policy — for example leaving the default `MessageAttributes` scope while writing a
body-shaped policy — drops **everything**, silently, and presents as "the feed stopped".
Confirm by publishing one real captured message through the topic and asserting the queue
depth moves.

## Terraform

Full module: `assets/terraform/nodd-goes-ingest.tf`. It provisions the queue, the DLQ, the
cross-account queue policy, the SNS subscription with the body filter, and the Lambda event
source mapping. The queue policy condition is the part most often got wrong:

```hcl
condition {
  test     = "ArnEquals"
  variable = "aws:SourceArn"
  values   = [local.nodd_topic_arn]
}
```

Without that condition the queue is writable by any SNS topic in any account. With the
condition pointed at the wrong ARN, NODD's deliveries are rejected and the queue simply
stays empty — indistinguishable, from the console, from a quiet satellite.

## Worker

Full handler: `assets/python/nodd_worker.py`. Its contract:

- Read `Records[].s3.object.key` from the SNS envelope inside the SQS body.
- Fetch the object **unsigned** (`Config(signature_version=UNSIGNED)`) — the worker's
  execution role has no path to a NOAA bucket and a signed request returns
  `403 AccessDenied`, which reads exactly like a missing object.
- Write the derived artifact, then write the manifest **last**. The manifest is the commit
  point; a manifest naming an artifact that does not exist yet is a stale board that looks
  live.
- On failure, record `{ok: false, status, note}` and leave the value `null`. Never
  substitute the previous granule for the one that failed.

## Service-worker invalidation

`docs/sw.js` in this repo caches raster tiles from `gibs.earthdata.nasa.gov` and
`basemaps.cartocdn.com` **only**, and never touches same-origin requests. That constraint
is load-bearing: a cached `index.html` or `latest.json` would make the terminal's freshness
claim false while every indicator on the page kept saying otherwise.

So invalidation driven by a NODD event may evict superseded tile-slot entries and nothing
else. Extension pattern, preserving the existing contract:

```js
/* Additive to docs/sw.js. Evicts tile entries for imagery slots that a NODD-driven
   manifest update has superseded. Same-origin requests remain untouched — the worker
   still has no opinion about index.html or latest.json. */
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "TILE_SLOTS_SUPERSEDED") return;
  const stale = new Set(msg.slots || []);        // e.g. ["2026-08-15T18:00:00Z"]
  if (!stale.size) return;

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const req of await cache.keys()) {
      const url = new URL(req.url);
      if (!TILE_HOSTS.some((h) => url.hostname.endsWith(h))) continue;  // belt and braces
      if ([...stale].some((slot) => url.pathname.includes(slot))) await cache.delete(req);
    }
  })());
});
```

Page side, after the manifest reports a newer imagery slot:

```js
const reg = await navigator.serviceWorker.ready;
reg.active?.postMessage({ type: "TILE_SLOTS_SUPERSEDED", slots: supersededSlots });
```

In practice GIBS and GOES tiles are addressed by timestamp, so a cached tile can never be
a stale version of a current tile — it is either the tile for that slot or it does not
exist. Eviction here is a quota-management measure, not a correctness measure, and it must
never be extended into one by widening its scope to same-origin.

## Serverless Framework

`assets/serverless/serverless.yml` expresses the same topology for teams already on that
toolchain, including the `existingSns`-style external-topic subscription and the same DLQ
and filter-policy requirements.

## Failure modes

| Symptom | Cause |
|---|---|
| Queue depth flat at zero | Filter policy scope left at `MessageAttributes` with a body-shaped policy |
| Queue depth flat at zero, no filter | Queue policy `aws:SourceArn` condition points at the wrong topic |
| Lambda invoked, `403` on every fetch | Signed S3 client — needs `UNSIGNED` |
| One bad message stalls the pipeline | No redrive policy / DLQ |
| Board shows imagery older than the manifest | Manifest written before the artifact |
| Board looks live but is stale | Service worker widened past tile hosts |
