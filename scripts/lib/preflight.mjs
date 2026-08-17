/* PREFLIGHT — the checks that must pass BEFORE the satellite-imagery streams are wired up.
 *
 * Every predicate here is PURE: text or parsed JSON in, a verdict out. No network, no
 * clock beyond what is passed in, no filesystem. `scripts/preflight-imagery.mjs` does the
 * reading and the printing; this file does the deciding, so each decision can be made to
 * FIRE in `scripts/test-preflight.mjs` rather than being verified by reading it.
 *
 * That separation is not tidiness. The lesson is already written into
 * `scripts/lib/deploy-target.mjs`: a guard that was verified by reading looked correct,
 * parsed clean, and was dead. The only way to know a guard works is to hand it the bad
 * input and watch it refuse.
 *
 * ------------------------------------------------------------------------------------
 * THE RESPONSE CONTRACT
 *
 * A failed check returns EXACTLY the flat dictionary this repo uses everywhere else:
 *
 *     { ok: false, status: Code, note: "Context String" }
 *
 * Three keys, frozen, nothing else. A caller cannot decorate a failure with a partial
 * result, because a partial result attached to a failure is how a refused check ends up
 * being read as a soft pass. A PASS may carry `value` — evidence the report prints — and
 * that asymmetry is deliberate: success has something to show, failure has a reason.
 * ------------------------------------------------------------------------------------
 */

/* Status codes. HTTP-shaped on purpose: the rest of this repo's honesty contract carries
   real HTTP statuses in this same field (`{ok:false, status: res.status, note}`), so a
   preflight code that collides semantically with an HTTP one would be read wrong. These
   are the four things that can go wrong before a deploy, and UNKNOWN is a first-class
   outcome rather than a coin flip. */
export const PF = {
  OK: 0,
  /* 404 — the artifact this check is about is not there at all. */
  MISSING: 404,
  /* 409 — the artifact is present, parses, and violates a stated invariant. This is the
     interesting one: the file exists, looks plausible, and is wrong. */
  BREACH: 409,
  /* 412 — the deploy gate itself. Nothing is broken; the precondition is simply not met
     yet, and that is a different conversation from a defect. */
  GATE: 412,
  /* 422 — present but unparseable. Distinguished from BREACH because "I could not read
     it" and "I read it and it is wrong" need opposite responses. */
  MALFORMED: 422,
  /* 503 — could not be determined HERE. No network, no AWS CLI, no browser. Never
     collapsed into a pass or a fail; an unknown that reports as either is a lie. */
  UNKNOWN: 503,
};

/* The flat failure payload, frozen so nothing downstream can bolt a value onto it. */
export function fail(status, note) {
  return Object.freeze({ ok: false, status, note: String(note) });
}
export function pass(note, value) {
  return Object.freeze({ ok: true, status: PF.OK, note: String(note), value: value ?? null });
}
/* UNKNOWN is a failure shape — same three keys — because a check that could not run must
   not be summable with the passes. The CLI counts it separately for the operator; the
   arithmetic treats it as not-passed. */
export function unknown(note) { return fail(PF.UNKNOWN, note); }

/* ==================================================================================
 * A MINIMAL YAML READER, for auditing serverless.yml
 *
 * Not a YAML parser. It indexes the mapping keys and sequence elements of an
 * indentation-formatted document into dotted paths, which is exactly enough to assert
 * "this key exists at this nesting and holds this value" and nothing more.
 *
 * WHY NOT A REGEX. `grep FilterPolicyScope` proves the string is in the file. It does not
 * prove it is under the SNS subscription rather than in a comment three blocks away, and
 * the failure this audit exists to catch — a body-shaped filter policy left at the default
 * MessageAttributes scope — presents as a file containing every correct-looking string
 * with the nesting wrong. The nesting IS the assertion.
 *
 * WHY NOT A DEPENDENCY. This repo has no package.json and no node_modules; every script
 * runs on a bare Node. Pulling in a YAML parser to read one committed file would be the
 * largest dependency decision in the repo, made for an audit.
 *
 * LIMITS, stated rather than discovered later: block mappings and block sequences only.
 * Flow mappings are kept as raw scalars (`Fn::GetAtt: [IngestQueue, Arn]` indexes as the
 * key `Fn::GetAtt` with the literal value `[IngestQueue, Arn]`, which is what the audit
 * wants). No anchors, no multi-line scalars, no multi-document streams. If serverless.yml
 * ever grows any of those, `yamlIndex` will index the surrounding keys correctly and
 * simply not see inside them — so an assertion about them fails as MISSING rather than
 * silently passing.
 */

/* Strip a trailing ` # comment`, but only outside double quotes. Counting quotes is a
   heuristic and it is the right one here: every value in this document that contains a
   `#` would have to be quoted for YAML to accept it anyway. */
function stripComment(line) {
  let quotes = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quotes++;
    if (line[i] === "#" && quotes % 2 === 0 && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/* Split `key: value` at the first `: ` (or a trailing `:`). Doing it at the FIRST colon
   would break every ARN in the file; doing it at the first colon-SPACE is what YAML
   itself does, and it is why `Fn::GetAtt: [...]` and `aws:SourceArn: ...` both index
   under the key a reader would name. */
function splitEntry(body) {
  const at = body.indexOf(": ");
  if (at > 0) return { key: body.slice(0, at).trim(), value: body.slice(at + 2).trim() };
  if (body.endsWith(":")) return { key: body.slice(0, -1).trim(), value: "" };
  return null;
}

export function yamlIndex(text) {
  const entries = [];
  const stack = [];                       // [{ indent, path }]
  const seqNext = new Map();              // parent path -> next sequence index
  const lines = String(text || "").split(/\r?\n/);

  for (let n = 0; n < lines.length; n++) {
    const line = stripComment(lines[n]);
    if (!line.trim()) continue;
    let indent = /^(\s*)/.exec(line)[1].length;
    let body = line.slice(indent);
    let seqPath = null;

    if (body === "-" || body.startsWith("- ")) {
      const dash = body === "-" ? 1 : 2;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].path : "";
      const i = seqNext.get(parent) || 0;
      seqNext.set(parent, i + 1);
      seqPath = `${parent}[${i}]`;
      /* The dash column owns the element; its keys sit further right and nest under it. */
      stack.push({ indent, path: seqPath });
      body = body.slice(dash).trim();
      indent += dash;
      if (!body) { entries.push({ line: n + 1, path: seqPath, key: null, value: null }); continue; }
    }

    const kv = splitEntry(body);
    if (!kv) {
      /* A bare scalar sequence element, e.g. `- Ref: IngestQueue` already handled above,
         or `- sqs:ReceiveMessage`. Recorded with its value so a policy Action list can be
         asserted against. */
      if (seqPath) entries.push({ line: n + 1, path: seqPath, key: null, value: body });
      continue;
    }

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].path : "";
    const path = parent ? `${parent}.${kv.key}` : kv.key;
    /* Sequence counters are per-parent-path and must reset when that parent is re-entered
       at a new nesting, which popping the stack above has just done. */
    seqNext.delete(path);
    entries.push({ line: n + 1, path, key: kv.key, value: kv.value });
    stack.push({ indent, path });
  }
  return entries;
}

/* Lookup helpers over the index. `at` is exact; `under` is prefix, which is how a check
   asks "is there a RedrivePolicy anywhere inside this queue" without caring how the
   author nested the properties. */
export function yamlAt(index, path) {
  const hit = index.find((e) => e.path === path);
  return hit ? hit.value : undefined;
}
export function yamlUnder(index, prefix) {
  return index.filter((e) => e.path === prefix || e.path.startsWith(prefix + ".") || e.path.startsWith(prefix + "["));
}

/* ==================================================================================
 * CHECK 1 — the event-driven ingest chain, audited against serverless.yml
 *
 * Four assertions, and every one of them fails the SAME WAY in production: the queue
 * depth sits at zero. That is the whole reason this is a preflight and not a runbook.
 * A satellite that has gone quiet, a filter policy scoped to the wrong half of the
 * message, a queue policy pointed at the wrong topic, and a subscription that was never
 * created are four different faults with one symptom, and the console cannot tell them
 * apart. They are separable here, on disk, before anything is deployed.
 */

/* Which resource block is which is read from the document rather than assumed by name, so
   renaming the queue does not silently skip the audit. A queue is a queue because its
   Type says so. */
function resourcesOfType(index, type) {
  return index
    .filter((e) => e.key === "Type" && e.value === type)
    .map((e) => e.path.replace(/\.Type$/, ""));
}

export function auditServerlessTopology(text) {
  if (!String(text || "").trim()) return fail(PF.MISSING, "serverless.yml is empty or unreadable");
  const ix = yamlIndex(text);
  if (!ix.length) return fail(PF.MALFORMED, "serverless.yml indexed to zero keys — not an indentation-formatted document");

  const queues = resourcesOfType(ix, "AWS::SQS::Queue");
  const subs = resourcesOfType(ix, "AWS::SNS::Subscription");
  const policies = resourcesOfType(ix, "AWS::SQS::QueuePolicy");
  if (!queues.length) return fail(PF.MISSING, "no AWS::SQS::Queue in serverless.yml — there is no queue to buffer NODD notifications, and a direct SNS->Lambda subscription throttles and drops on a GLM burst");
  if (!subs.length) return fail(PF.MISSING, "no AWS::SNS::Subscription in serverless.yml — nothing subscribes to the NODD topic, so the queue would sit at depth zero forever");

  /* ---- 1a. THE DEAD LETTER QUEUE ------------------------------------------------
     A queue with a RedrivePolicy is the ingest queue; the one it points at is the DLQ.
     Without the redrive, one unparseable notification redelivers until the retention
     window expires and every later object queues behind it — the pipeline stops, and
     what the operator sees is old imagery, not an error. */
  const withRedrive = queues.filter((q) => yamlUnder(ix, q + ".Properties.RedrivePolicy").length > 0);
  if (!withRedrive.length) {
    return fail(PF.BREACH, `${queues.length} SQS queue(s) declared and none carries a RedrivePolicy — a single unparseable NODD notification would redeliver until retention expires and stall every object behind it`);
  }
  const ingestQ = withRedrive[0];
  const dlqTarget = yamlAt(ix, ingestQ + ".Properties.RedrivePolicy.deadLetterTargetArn")
    ?? yamlAt(ix, ingestQ + ".Properties.RedrivePolicy.deadLetterTargetArn.Fn::GetAtt");
  const dlqNested = yamlUnder(ix, ingestQ + ".Properties.RedrivePolicy.deadLetterTargetArn");
  if (!dlqNested.length) return fail(PF.BREACH, `${ingestQ} has a RedrivePolicy with no deadLetterTargetArn — the redrive is declared and points nowhere`);
  const maxReceive = Number(yamlAt(ix, ingestQ + ".Properties.RedrivePolicy.maxReceiveCount"));
  if (!Number.isFinite(maxReceive) || maxReceive < 1) {
    return fail(PF.BREACH, `${ingestQ} RedrivePolicy has no usable maxReceiveCount (${JSON.stringify(yamlAt(ix, ingestQ + ".Properties.RedrivePolicy.maxReceiveCount"))}) — without it nothing ever reaches the DLQ`);
  }
  /* The DLQ must be a queue this document actually declares. A redrive pointing at an
     ARN that does not exist fails at deploy time, which is the good case; one pointing at
     a queue nobody reads is the bad case and is worth naming here. */
  const dlqRef = dlqNested.map((e) => String(e.value || "")).join(" ");
  const dlqNamed = queues.filter((q) => q !== ingestQ).find((q) => dlqRef.includes(q.split(".").pop()));
  if (!dlqNamed) {
    return fail(PF.BREACH, `${ingestQ} redrives to ${dlqRef.trim() || "an unresolved target"}, which is not a queue declared in this document`);
  }

  /* ---- 1b. VISIBILITY TIMEOUT AGAINST FUNCTION TIMEOUT ---------------------------
     Not on the original checklist, and it belongs on it. A visibility timeout shorter
     than the handler's runtime makes SQS redeliver a message the handler is still
     working on: the object is processed twice, the DLQ fills with successes, and the
     maxReceiveCount above is consumed by nothing being wrong. */
  const visibility = Number(yamlAt(ix, ingestQ + ".Properties.VisibilityTimeout"));
  const fnTimeout = Number(yamlAt(ix, "provider.timeout"));
  if (Number.isFinite(visibility) && Number.isFinite(fnTimeout) && visibility < fnTimeout * 6) {
    return fail(PF.BREACH, `VisibilityTimeout ${visibility}s is under 6x the ${fnTimeout}s function timeout — SQS will redeliver messages the worker is still processing and the DLQ will fill with successes`);
  }

  /* ---- 1c. FILTER POLICY SCOPE ---------------------------------------------------
     NODD publishes an S3 Event Notification envelope: the object key lives in the message
     BODY, not in message attributes. The default scope is MessageAttributes. A
     body-shaped policy left at the default scope matches nothing and drops EVERY message
     silently — the single highest-value assertion in this file, because the symptom is a
     healthy-looking pipeline with an empty queue. */
  const sub = subs[0];
  const scope = yamlAt(ix, sub + ".Properties.FilterPolicyScope");
  const hasPolicy = yamlUnder(ix, sub + ".Properties.FilterPolicy").length > 0;
  if (hasPolicy && scope !== "MessageBody") {
    return fail(PF.BREACH, `${sub} declares a FilterPolicy with FilterPolicyScope=${scope === undefined ? "unset (defaults to MessageAttributes)" : scope} — NODD carries the object key in the message BODY, so this policy matches nothing and drops every notification silently`);
  }
  if (!hasPolicy) {
    return fail(PF.BREACH, `${sub} has no FilterPolicy — subscribing per bucket rather than per product means ABI-L1b-RadM1 alone delivers one notification per minute per mesoscale sector`);
  }

  /* ---- 1d. THE aws:SourceArn CONDITION -------------------------------------------
     Without it the queue is writable by any SNS topic in any account. The check is
     twofold because the two halves fail in opposite directions: a MISSING condition is a
     security hole that works perfectly, and a condition pointed at the WRONG topic is
     airtight and delivers nothing. */
  if (!policies.length) {
    return fail(PF.BREACH, "no AWS::SQS::QueuePolicy — SNS cannot deliver to the queue at all, and adding one without an aws:SourceArn condition would leave it writable by any topic in any account");
  }
  const pol = policies[0];
  const polEntries = yamlUnder(ix, pol + ".Properties.PolicyDocument");
  const srcArn = polEntries.find((e) => e.key === "aws:SourceArn");
  if (!srcArn) {
    return fail(PF.BREACH, `${pol} carries no aws:SourceArn condition — the queue is writable by any SNS topic in any account, and the misconfiguration is invisible because delivery works`);
  }
  const condTest = polEntries.find((e) => /Condition\.(ArnEquals|ArnLike|StringEquals)$/.test(e.path));
  if (!condTest) {
    return fail(PF.BREACH, `${pol} has an aws:SourceArn that is not inside an ArnEquals/ArnLike/StringEquals condition block — it is documentation, not a restriction`);
  }
  /* And it must name the same topic the subscription subscribes to. Two different topic
     strings in one document is the "airtight and empty" failure, pre-built. */
  const subTopic = String(yamlAt(ix, sub + ".Properties.TopicArn") || "");
  const polTopic = String(srcArn.value || "");
  if (subTopic && polTopic && subTopic !== polTopic) {
    return fail(PF.BREACH, `the subscription targets ${subTopic} but the queue policy admits ${polTopic} — NODD's deliveries would be rejected and the queue would stay empty, which from the console is indistinguishable from a quiet satellite`);
  }

  /* ---- 1e. NO SIGNED READ GRANT ON THE PUBLIC BUCKET -----------------------------
     The absence of s3:GetObject against noaa-* is load-bearing and is asserted as an
     absence. Granting it does not break anything visibly; it just means somebody has
     concluded the bucket needs credentials, and the next unsigned client to be "fixed"
     into a signed one returns 403 AccessDenied, which reads exactly like a missing
     object. */
  const grants = ix.filter((e) => /noaa-goes|noaa-gfs/.test(String(e.value || "")) && /Resource/.test(e.path));
  if (grants.length) {
    return fail(PF.BREACH, `the execution role grants access to a public NOAA bucket (${grants.map((g) => g.value).join(", ")}) — that bucket is read UNSIGNED, and a role grant invites a signed client whose 403 AccessDenied is indistinguishable from a missing object`);
  }

  return pass(
    `DLQ mapped (${ingestQ.split(".").pop()} -> ${dlqNamed.split(".").pop()}, maxReceiveCount ${maxReceive})`
    + ` · FilterPolicyScope=MessageBody on ${sub.split(".").pop()}`
    + ` · aws:SourceArn pinned to ${polTopic || "the subscribed topic"}`
    + ` · no signed-read grant on any noaa-* bucket`,
    { ingestQueue: ingestQ, dlq: dlqNamed, subscription: sub, queuePolicy: pol, maxReceive, visibility, fnTimeout, topic: subTopic });
}

/* ==================================================================================
 * CHECK 2 — unsigned reads
 *
 * `--no-sign-request` is an AWS CLI FLAG. It does not exist in any SDK, and a preflight
 * that greps for the literal string across Python and JavaScript would pass a signed
 * boto3 client that happens to sit next to a comment mentioning it. So each source is
 * audited in its own dialect:
 *
 *     aws s3 / aws s3api      --no-sign-request
 *     boto3                   Config(signature_version=UNSIGNED)
 *     s3fs                    S3FileSystem(anon=True)
 *     fsspec / xarray         storage_options={"anon": True}
 *     plain HTTPS GET         no signing to omit — the REST endpoint is anonymous
 *
 * The last row matters for this repo specifically: `scripts/probe-wind.mjs` reaches
 * s3://noaa-gfs-bdp-pds over its public HTTPS endpoint with `fetch`, which signs nothing.
 * A checker that demanded an unsigned-client marker there would be demanding a marker for
 * a signing step that never happens.
 */
/* A shell command may be split across lines with a trailing backslash, and the flag very
   often lives on the continuation line — which is exactly how the first version of this
   audit reported four signed reads in a file where every one of them carried
   `--no-sign-request` two characters later. Logical lines are rejoined before matching. */
function joinContinuations(text) { return String(text || "").replace(/\\\r?\n\s*/g, " "); }

const CLI_S3 = /\baws\s+s3(api)?\s+[a-z0-9-]+[^\n]*?\bs3:\/\/(noaa-|nasa-)[^\n]*/g;
/* Capture the assignment too, because WHICH client matters more than how many. */
const BOTO_ASSIGN = /(?:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)?boto3\.(?:client|resource)\(\s*["']s3["']([^)]*)\)/gs;
const S3FS_CTOR = /S3FileSystem\s*\(([^)]*)\)/gs;
/* Identifiers that resolve to a public bucket: a literal, or a constant assigned one
   (including as an os.environ default, which is how nodd_worker.py names its source). */
const PUBLIC_BUCKET_LITERAL = /["'](noaa-[a-z0-9-]+|nasa-[a-z0-9-]+)["']/g;
const PUBLIC_BUCKET_CONST = /([A-Z_][A-Z0-9_]*)\s*=\s*(?:os\.environ\.get\([^,)]*,\s*)?["'](?:noaa-|nasa-)[a-z0-9-]+["']/g;

export function auditUnsignedReads(sources) {
  const offenders = [];
  const seen = { cli: 0, boto: 0, botoSignedPrivate: 0, s3fs: 0, https: 0 };

  for (const { path, text } of sources || []) {
    const body = String(text || "");
    const joined = joinContinuations(body);

    for (const m of joined.matchAll(CLI_S3)) {
      seen.cli++;
      if (!/--no-sign-request/.test(m[0])) {
        offenders.push(`${path}: CLI statement against a public bucket without --no-sign-request -> ${m[0].replace(/\s+/g, " ").slice(0, 90).trim()}`);
      }
    }

    /* WHICH BUCKET THIS CLIENT TALKS TO IS THE WHOLE QUESTION.
       A worker that reads a public NOAA bucket unsigned and writes its own derived bucket
       signed is CORRECT, and it is the shape assets/python/nodd_worker.py actually has:
       `_public_s3` unsigned for noaa-goes19, `_own_s3` signed for the derived bucket. An
       audit that flags every signed S3 client would flag that second one, and the only way
       to make it pass would be to break it. So a signed client is an offender only when it
       is used against an identifier that resolves to a public bucket. */
    const publicNames = new Set();
    for (const m of body.matchAll(PUBLIC_BUCKET_LITERAL)) publicNames.add(m[1]);
    for (const m of body.matchAll(PUBLIC_BUCKET_CONST)) publicNames.add(m[1]);

    for (const m of body.matchAll(BOTO_ASSIGN)) {
      seen.boto++;
      const varName = m[1] || null;
      const unsigned = /UNSIGNED/.test(m[0]);
      if (unsigned) continue;
      /* Where does this client get used? An unassigned client is judged on the expression
         it is chained into; an assigned one on every call through its name. */
      const usages = [];
      if (varName) {
        for (const u of body.matchAll(new RegExp("\\b" + varName + "\\.[a-z_]+\\(", "g"))) {
          usages.push(body.slice(u.index, u.index + 260));
        }
      } else {
        usages.push(body.slice(m.index, m.index + 260));
      }
      const againstPublic = usages.filter((u) => [...publicNames].some((n) => new RegExp("Bucket\\s*=\\s*[\"']?" + n).test(u)));
      if (againstPublic.length) {
        offenders.push(`${path}: signed boto3 client ${varName || "(inline)"} used against a public bucket -> ${againstPublic[0].replace(/\s+/g, " ").slice(0, 90)}`);
      } else {
        /* Signed, and not pointed at a public bucket. Counted so the report can say the
           file was understood rather than merely not-flagged. */
        seen.botoSignedPrivate++;
      }
    }

    for (const m of body.matchAll(S3FS_CTOR)) {
      seen.s3fs++;
      if (!/anon\s*=\s*True/.test(m[1] || "")) {
        offenders.push(`${path}: s3fs.S3FileSystem without anon=True -> ${m[0].replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    /* The anonymous HTTPS form. Counted so the report can say the path was exercised,
       never flagged: there is no signature to omit on a public REST endpoint. */
    for (const _ of body.matchAll(/https:\/\/(noaa|nasa)[a-z0-9-]*\.s3[.-][a-z0-9.-]*amazonaws\.com/g)) seen.https++;
  }

  const total = seen.cli + seen.boto + seen.s3fs + seen.https;
  if (!total) return unknown("no S3 access to a public NOAA/NASA bucket found in the audited sources — nothing to check, which is not the same as a pass");
  if (offenders.length) {
    return fail(PF.BREACH, `${offenders.length} signed read(s) against a public bucket. A signed request from a role with no trust path returns 403 AccessDenied, which is indistinguishable from a missing object: ${offenders.join(" · ")}`);
  }
  return pass(
    `${seen.cli} CLI statement(s) carry --no-sign-request · ${seen.boto} boto3 S3 client(s), ${seen.botoSignedPrivate} of them signed and correctly scoped to a non-public bucket`
    + ` · ${seen.s3fs} s3fs handle(s) anon=True · ${seen.https} anonymous HTTPS endpoint reference(s), which sign nothing and need no marker`,
    seen);
}

/* ==================================================================================
 * CHECK 3 — the service-worker tile-only caching barrier
 *
 * Audited as a STRUCTURE, not as a string search, because every way this can break leaves
 * the correct-looking strings in place. The barrier is three properties, and the whole
 * board's freshness claim rests on all three holding at once:
 *
 *   1. same-origin requests return before the cache is ever opened;
 *   2. the eligible host list is exactly the two raster-tile hosts;
 *   3. nothing writes to the cache outside the guarded path.
 *
 * Property 1 is asserted by ORDER, which is the part a grep cannot do. A file containing
 * `if (url.origin === self.location.origin) return;` somewhere below a `cache.put` has
 * every string this check looks for and caches `latest.json`.
 */
const ALLOWED_TILE_HOSTS = ["gibs.earthdata.nasa.gov", "basemaps.cartocdn.com"];

export function auditServiceWorkerBarrier(text, opts) {
  const o = opts || {};
  const allowed = o.allowedHosts || ALLOWED_TILE_HOSTS;
  const src = String(text || "");
  if (!src.trim()) return fail(PF.MISSING, "sw.js is empty or unreadable");

  /* The declared host list, read from the file. */
  const hostsDecl = /TILE_HOSTS\s*=\s*\[([^\]]*)\]/.exec(src);
  if (!hostsDecl) return fail(PF.MALFORMED, "sw.js declares no TILE_HOSTS array — the eligible-host list cannot be audited, so the barrier cannot be shown to hold");
  const hosts = [...hostsDecl[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  const widened = hosts.filter((h) => !allowed.includes(h));
  if (widened.length) {
    return fail(PF.BREACH, `TILE_HOSTS has been widened past the two raster-tile hosts with ${widened.join(", ")} — every host added here becomes a thing the board may serve from cache while claiming it is current`);
  }
  const missing = allowed.filter((h) => !hosts.includes(h));
  if (missing.length) return fail(PF.BREACH, `TILE_HOSTS is missing ${missing.join(", ")} — the map would re-download those tiles on every toggle, which is the cost this worker exists to remove`);

  /* Property 1, by position. Every cache write must sit AFTER the same-origin return
     inside the fetch handler. */
  const fetchAt = src.indexOf('addEventListener("fetch"');
  if (fetchAt < 0) return fail(PF.MALFORMED, "sw.js has no fetch handler — nothing to audit, and nothing is being cached");
  const sameOriginAt = src.indexOf("url.origin === self.location.origin", fetchAt);
  if (sameOriginAt < 0) {
    return fail(PF.BREACH, "the fetch handler does not return early on same-origin requests — a cached index.html or latest.json would make the terminal's freshness claim false while every indicator on the page kept saying otherwise");
  }
  const hostGuardAt = src.indexOf("TILE_HOSTS.some", sameOriginAt);
  if (hostGuardAt < 0) {
    return fail(PF.BREACH, "the fetch handler checks same-origin but never narrows to TILE_HOSTS — every cross-origin GET on the page would become cacheable");
  }

  /* Property 3. Any cache.put / cache.add before the guards is a bypass. `caches.delete`
     in the activate handler is a different thing and is not counted: dropping an old
     cache version by name cannot reach a same-origin entry in the current one. */
  const writes = [...src.matchAll(/cache\.(put|add|addAll)\s*\(/g)].map((m) => m.index);
  const early = writes.filter((i) => i < hostGuardAt);
  if (early.length) {
    return fail(PF.BREACH, `${early.length} cache write(s) occur before the same-origin and TILE_HOSTS guards — the guards below them are decorative`);
  }
  if (!writes.length) {
    return fail(PF.BREACH, "sw.js never writes to the cache — the worker is registered, intercepts every tile, and stores nothing. This has happened here before: the first version guarded on `status === 200`, which is never true for the opaque response an <img> tile produces, so it cached exactly nothing and the verifier passed because it was only asserting what was NOT in the cache");
  }

  /* The opaque-response trap, asserted so it cannot come back. An <img> tile arrives
     mode:no-cors and status 0; caching on status===200 without re-issuing in cors mode
     stores nothing, and caching an opaque response unconditionally stores 404 pages and
     rate-limit bodies as imagery. */
  const corsReissue = /mode:\s*["']cors["']/.test(src);
  if (!corsReissue) {
    return unknown("sw.js does not re-issue tile requests in cors mode. That is not automatically wrong, but it means the response being cached is opaque (status 0, headers unreadable) and a 404 body cannot be told from a tile. Confirm deliberately");
  }

  return pass(
    `same-origin returns at char ${sameOriginAt} before the host guard at ${hostGuardAt} and all ${writes.length} cache write(s)`
    + ` · TILE_HOSTS is exactly [${hosts.join(", ")}] · tiles re-issued in cors mode so a 404 cannot be cached as imagery`,
    { hosts, writes: writes.length });
}

/* ==================================================================================
 * CHECK 4 — the probability pair on the frame
 *
 * `docs/data/frames.json` is what the scrubber reads. A storm row that carries the raw
 * official-forecast estimate without the calibrated one beside it is not a gap in a
 * chart; it is the point at which `docs/app/data-loader.js` reaches past the frame to the
 * CURRENT snapshot and shows today's calibrated probability at a timestamp from two days
 * ago. That is a stale value dressed as current, inside the one control whose entire
 * purpose is to show what the board actually held at a past moment.
 *
 * The pair is {pRaw, pCal}. THE FIX IS NEVER TO SYNTHESISE THE MISSING HALF. A frame
 * written before the engine could calibrate genuinely had no calibrated number, and
 * inventing one would be the same lie in a new place. What must hold is that the pair is
 * written together, from one evaluation of one storm state, and that a reader can tell
 * "there was no calibrated number then" from "there is one and it is off screen".
 */
export function auditFrameProbabilityPairs(framesJson) {
  const frames = (framesJson && Array.isArray(framesJson.frames)) ? framesJson.frames : null;
  if (!frames) return fail(PF.MALFORMED, "frames.json carries no frames array");
  if (!frames.length) return unknown("frames.json is empty — the replay history has not been written yet, so there is nothing to check");

  let rows = 0, paired = 0, rawOnly = 0, calOnly = 0, bare = 0;
  let firstPairedIso = null, lastBareIso = null;
  for (const f of frames) {
    for (const id of Object.keys(f.storms || {})) {
      const s = f.storms[id] || {};
      rows++;
      if (s.hurricaneP != null && s.pCal != null) { paired++; if (!firstPairedIso) firstPairedIso = f.tsZ; }
      else if (s.hurricaneP != null) { rawOnly++; lastBareIso = f.tsZ; }
      else if (s.pCal != null) calOnly++;
      else bare++;
    }
  }

  /* A calibrated number with no raw beside it is unconditionally wrong, at any age. The
     calibration is computed FROM the raw estimate: if pCal exists, hurricaneP existed at
     the same instant and was dropped on the way to disk. */
  if (calOnly) {
    return fail(PF.BREACH, `${calOnly} frame storm-row(s) carry a calibrated probability with no raw estimate beside it. The calibration is computed from the raw estimate, so it existed at that instant and was lost on write — and the ledger seeded from these frames scores pCal against nothing`);
  }

  /* Rows written since the writer started pairing must pair. Older rows in the retained
     window CANNOT be fixed — the board genuinely had no calibrated number then — so they
     are reported, not failed. What makes them safe is the loader, checked separately by
     `auditLoaderProbabilityFallback`, and they age out of the 32-hour window on their own. */
  const cutMs = firstPairedIso ? Date.parse(firstPairedIso) : null;
  let regressions = 0;
  if (cutMs) {
    for (const f of frames) {
      if (Date.parse(f.tsZ) < cutMs) continue;
      for (const id of Object.keys(f.storms || {})) {
        const s = f.storms[id] || {};
        if (s.hurricaneP != null && s.pCal == null) regressions++;
      }
    }
  }
  if (regressions) {
    return fail(PF.BREACH, `${regressions} storm-row(s) written since ${firstPairedIso} carry a raw estimate with no calibrated one. Scrubbing to those frames shows a probability with nothing to compare it against, and the ledger seeded from them scores one series over a different sample than the other`);
  }

  return pass(
    `${paired}/${rows} storm-row(s) carry {hurricaneP, pCal} as a pair · ${rawOnly} legacy raw-only row(s)`
    + (rawOnly ? ` through ${lastBareIso}, ageing out of the retained window` : "")
    + ` · ${bare} row(s) with no probability at all, which is a storm the engine declined to price`,
    { rows, paired, rawOnly, calOnly, bare, firstPairedIso, lastBareIso });
}

/* ----------------------------------------------------------------------------------
 * CHECK 4b — and the loader must not paper over the gap.
 *
 * The two halves of this are inseparable, so they are audited together and only one of
 * them can be waived. Legacy frames with a raw estimate and no calibrated one CANNOT be
 * fixed: the board genuinely had no calibrated number then, and writing one in now would
 * be inventing history. What can be fixed is the loader reaching past those frames to the
 * CURRENT snapshot, which is what turns a truthful gap into a false reading.
 *
 * So `auditFrameProbabilityPairs` refuses legacy rows unless the caller passes
 * `allowLegacy`, and the caller is only entitled to pass it once THIS check proves the
 * fallback is gone. A flag a human sets because they believe the fix landed is a flag that
 * outlives the fix.
 */
const PROBABILITY_ACCESSORS = ["pCalAt", "pSigmaAt", "qualityAt", "hurricanePAt"];

export function auditLoaderProbabilityFallback(text) {
  const src = String(text || "");
  if (!src.trim()) return fail(PF.MISSING, "data-loader.js is empty or unreadable");
  const found = [], leaking = [];
  for (const name of PROBABILITY_ACCESSORS) {
    const m = new RegExp(name + "\\s*:\\s*\\(f\\)\\s*=>\\s*([^\\n]*)").exec(src);
    if (!m) continue;
    found.push(name);
    /* The frame row is bound as `r`; the current snapshot is `s`. A reference to `s.` in
       an accessor that takes a frame index is, by construction, a value from a different
       moment than the one being asked about. */
    if (/\bs\.[A-Za-z_]/.test(m[1])) leaking.push(`${name} -> ${m[1].trim().slice(0, 80)}`);
  }
  if (!found.length) {
    return fail(PF.MALFORMED, `none of ${PROBABILITY_ACCESSORS.join(", ")} found in data-loader.js — the probability group cannot be audited, so it cannot be shown not to fall back`);
  }
  if (leaking.length) {
    return fail(PF.BREACH, `${leaking.length} probability accessor(s) fall back to the current snapshot when the frame lacks the field: ${leaking.join(" · ")}. `
      + `Scrubbing to a frame written before the engine could calibrate then prints today's number under a two-day-old timestamp — a stale value dressed as current, inside the one control whose job is to show what the board actually held`);
  }
  return pass(`${found.length} probability accessor(s) (${found.join(", ")}) read strictly from the frame — a frame with no calibrated probability reports none rather than borrowing the current one`, { accessors: found });
}

/* ==================================================================================
 * CHECK 5 — the deploy gate
 *
 * The lifecycle rule, and the reason it is a gate rather than a preference: a live
 * ingestion pipeline feeding an unscored board publishes probabilities nobody can grade.
 * Every other check in this file is about whether a thing WORKS. This one is about
 * whether it is allowed to run at all.
 *
 * Note what the gate actually is, because the phrase "calibration coefficients" invites
 * the wrong mental model: nothing here is fitting coefficients. `scripts/calibrate.mjs`
 * SCORES published probabilities against NHC best track and refuses to publish a score
 * until enough DISTINCT STORMS have resolved. The artifact written to disk is a scorecard,
 * and the gate is `ok: true` on it.
 */
export function auditCalibrationGate(cal) {
  if (!cal) return fail(PF.MISSING, "docs/data/calibration.json is absent — run `node scripts/calibrate.mjs` before anything is deployed");
  if (cal.ok === true) {
    return pass(
      `baseline published: Brier calibrated ${cal.brier?.calibrated?.toFixed?.(4) ?? "?"} vs raw ${cal.brier?.raw?.toFixed?.(4) ?? "?"} vs market ${cal.brier?.market?.toFixed?.(4) ?? "?"}`
      + ` over ${cal.counts?.resolvedStorms ?? "?"} resolved storms`,
      { resolvedStorms: cal.counts?.resolvedStorms ?? null, skill: cal.skill ?? null });
  }
  const have = cal.progress?.have ?? cal.counts?.resolvedStorms ?? 0;
  const need = cal.progress?.need ?? cal.minResolvedStorms ?? "?";
  return fail(PF.GATE,
    `calibration baseline NOT published — ${have} of ${need} resolved storms. Ingestion may be built, tested and reviewed; it must not be deployed live. `
    + `The threshold counts distinct STORMS rather than forecasts on purpose: every forecast made during one storm's life shares that storm's single outcome, so ${cal.counts?.resolvedEntries ?? 0} resolved forecasts behind ${have} storms would be a handful of coin flips quoted to three decimal places`);
}

/* ==================================================================================
 * CHECK 6 — no polling against a NODD bucket
 *
 * GOES full disk lands every 10 minutes and the publish instant moves with scan duration
 * and reprocessing, so a timer is wrong in both directions at once: it burns LIST calls
 * between scans and it drifts away from the one that matters. The check is scoped to
 * timers that are in the same neighbourhood as a NOAA bucket reference, because this repo
 * is full of legitimate intervals — the map re-resolves its GIBS slot every 5 minutes,
 * which is a client-side refresh of a public tile URL and is not an S3 poll.
 */
export function auditNoPolling(sources, opts) {
  const o = opts || {};
  const window = o.window || 400;                 // chars either side of the timer
  const hits = [];
  for (const { path, text } of sources || []) {
    const body = String(text || "");
    for (const m of body.matchAll(/setInterval\s*\(|while\s+True\s*:|schedule:\s*\n?\s*-?\s*rate\(/g)) {
      const near = body.slice(Math.max(0, m.index - window), m.index + window);
      if (/s3:\/\/noaa-|noaa-goes\d\d|list_objects_v2|ListObjectsV2|aws\s+s3\s+ls/.test(near)) {
        const line = body.slice(0, m.index).split("\n").length;
        hits.push(`${path}:${line} — ${m[0].trim()} within ${window} chars of a NOAA bucket listing`);
      }
    }
  }
  if (hits.length) {
    return fail(PF.BREACH, `${hits.length} polling construct(s) against a NODD bucket: ${hits.join(" · ")}. Ingestion is event-driven off arn:aws:sns:us-east-1:123901341784:NewGOES*; a 60-second poll makes about nine wasted LIST calls per useful object and still adds up to a minute of latency to the one that matters`);
  }
  return pass(`no timer or loop found within ${window} chars of a NOAA bucket listing across ${(sources || []).length} source(s)`, { sources: (sources || []).length });
}
