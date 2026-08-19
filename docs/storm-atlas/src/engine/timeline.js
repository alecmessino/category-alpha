/* The archive's clock: when each storm was on the map, and where the record is empty.
 *
 * Pure, no DOM, no canvas. Everything the mass replay needs to know about time lives here so
 * that the invariants can be tested without a browser.
 *
 * WHY THE CLOCK SKIPS. Measured on this archive, 1971 onwards: 2,201 storms over 55.3 years,
 * mean concurrency 0.74, and 62% of six-hourly steps have no storm active at all -- the Dec-May
 * off-season, repeated 55 times. Played linearly at a pace where a median 5.8-day storm visibly
 * moves, the record takes ~22 minutes and nearly two thirds of it is an empty map. So the cursor
 * jumps the stretches where NOTHING in the filtered set is active.
 *
 * WHAT SKIPPING IS NOT ALLOWED TO DO. It never reorders, drops, merges or compresses a storm.
 * Every storm in the filtered set is revealed, once, in the order it happened, over its whole
 * observed span; the only thing removed is dead air between storms. The cursor is a real UTC
 * instant at all times, it only ever moves forward, and a jump is reported to the caller so the
 * interface can say so out loud. A clock that silently accelerates through empty years would
 * misrepresent the record's rhythm, which is itself one of the archive's findings.
 *
 * A STORM IS ON THE MAP FROM ITS FIRST FIX, NOT FROM GENESIS. 744 storms in this archive have
 * observed fixes before their genesis -- disturbances and lows, reaching 252 hours back. Those
 * are real observations, and the brief asks for PRE-GENESIS to be legible, so the interval
 * starts at the first fix and the genesis mark appears later, when the cursor reaches it.
 *
 * The span is read from the track points rather than from `storms.end_t`, so the timeline and
 * the renderer can never disagree about when a storm was visible: they read the same array.
 * (They agree today -- `end_t` equals the last fix for all 3,959 storms, checked -- but that is
 * a fact about the current archive, not a guarantee, and this way it does not need to be one.)
 */

const I32_NULL = -2147483648;

/**
 * Build the clock for a filtered population.
 *
 * @param archive  the loaded Archive
 * @param rows     storm rows to include (Uint32Array from filterStorms, or any array)
 * @returns a timeline object; treat it as opaque and read it through the functions below.
 */
export function buildTimeline(archive, rows) {
  const n = rows.length;
  const row = new Uint32Array(n);
  const start = new Int32Array(n);   // minutes, first observed fix
  const end = new Int32Array(n);     // minutes, last observed fix
  const genesis = new Int32Array(n); // minutes, or I32_NULL

  /* Sort by first fix. Everything downstream depends on this order: "revealed so far" becomes a
     prefix of it, which is what makes repainting an accumulated canvas a single forward scan. */
  const tmp = [];
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const s = archive.tpOffset[r];
    const c = archive.tpCount[r];
    if (c === 0) continue;           // no fixes, nothing to reveal; not an error, just absent
    const g = archive.genesisT[r];
    tmp.push([archive.ptT[s], archive.ptT[s + c - 1], r,
      g === I32_NULL || Number.isNaN(g) ? I32_NULL : g]);
  }
  tmp.sort((a, b) => (a[0] - b[0]) || (a[2] - b[2])); // storm row breaks ties, so it is stable
  const m = tmp.length;
  for (let i = 0; i < m; i++) {
    start[i] = tmp[i][0];
    end[i] = tmp[i][1];
    row[i] = tmp[i][2];
    genesis[i] = tmp[i][3];
  }

  /* Running maximum of `end` over the sorted-by-start prefix. This is what makes activeAt exact
     rather than merely usually right: scanning backwards from the last storm that had started,
     we may stop as soon as no storm at or before that position can still be running. Without it
     a single long-lived storm sitting far back in the order would be silently dropped from a
     frame -- the kind of bug that looks like a rendering glitch and is actually a lie. */
  const maxEndUpTo = new Int32Array(m);
  let runMax = -2147483647;
  for (let i = 0; i < m; i++) {
    if (end[i] > runMax) runMax = end[i];
    maxEndUpTo[i] = runMax;
  }

  /* The union of the spans: where the record has content. Everything else is dead air. */
  const ivStart = [];
  const ivEnd = [];
  for (let i = 0; i < m; i++) {
    if (ivEnd.length && start[i] <= ivEnd[ivEnd.length - 1]) {
      if (end[i] > ivEnd[ivEnd.length - 1]) ivEnd[ivEnd.length - 1] = end[i];
    } else {
      ivStart.push(start[i]);
      ivEnd.push(end[i]);
    }
  }
  const iv = ivStart.length;
  const ivS = Int32Array.from(ivStart);
  const ivE = Int32Array.from(ivEnd);

  /* Active minutes elapsed before each interval begins. The transport scrubs in ACTIVE time --
     so the bar is uniformly dense in storms rather than in calendar years -- and this is the
     map between the two. Float64 because the sum runs to millions of minutes. */
  const ivBefore = new Float64Array(iv + 1);
  for (let i = 0; i < iv; i++) ivBefore[i + 1] = ivBefore[i] + (ivE[i] - ivS[i]);

  return {
    n: m,
    row, start, end, genesis, maxEndUpTo,
    ivStart: ivS, ivEnd: ivE, ivBefore,
    intervals: iv,
    firstT: m ? start[0] : null,
    lastT: m ? ivE[iv - 1] : null,
    activeMin: ivBefore[iv],
    spanMin: m ? ivE[iv - 1] - start[0] : 0,
    /* Reusable frame buffer. A replay tick runs 60 times a second; allocating an array per tick
       is how a smooth animation acquires a sawtooth. Max concurrency in this archive is 9. */
    _active: new Uint32Array(Math.max(64, m)),
  };
}

/** The interval containing `cursor`, or the next one after it; `intervals` if past the end. */
export function intervalAt(tl, cursor) {
  let lo = 0;
  let hi = tl.intervals - 1;
  let ans = tl.intervals;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl.ivEnd[mid] >= cursor) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans;
}

/**
 * Move the cursor forward by `deltaMin` of REVEALED time.
 *
 * With skipQuiet, `deltaMin` is spent inside active intervals only: run out of one and the
 * cursor lands on the start of the next, with the jump reported rather than absorbed. Without
 * it the cursor is plain wall-clock and `skippedMin` is always 0.
 *
 * @returns {{cursor:number, skippedMin:number, done:boolean}}
 */
export function advance(tl, cursor, deltaMin, { skipQuiet = true } = {}) {
  if (!tl.n) return { cursor, skippedMin: 0, done: true };
  if (deltaMin <= 0) return { cursor, skippedMin: 0, done: cursor >= tl.lastT };
  if (!skipQuiet) {
    const next = Math.min(cursor + deltaMin, tl.lastT);
    return { cursor: next, skippedMin: 0, done: next >= tl.lastT };
  }

  let c = cursor;
  let left = deltaMin;
  let skipped = 0;
  /* Bounded by the number of intervals, and each pass consumes one; a storm that is shorter
     than a single tick therefore cannot stall the clock, it is stepped over within this loop. */
  for (let guard = 0; guard <= tl.intervals; guard++) {
    const i = intervalAt(tl, c);
    if (i >= tl.intervals) return { cursor: tl.lastT, skippedMin: skipped, done: true };
    if (c < tl.ivStart[i]) { skipped += tl.ivStart[i] - c; c = tl.ivStart[i]; }
    const room = tl.ivEnd[i] - c;
    if (left <= room) return { cursor: c + left, skippedMin: skipped, done: false };
    left -= room;
    c = tl.ivEnd[i];
    if (i === tl.intervals - 1) return { cursor: tl.lastT, skippedMin: skipped, done: true };
    c += 1; // step off the end of this interval so the next pass selects the following one
  }
  return { cursor: c, skippedMin: skipped, done: c >= tl.lastT };
}

/**
 * The storms on the map at `cursor`, as positions into the timeline arrays.
 *
 * Returns a view of a reused buffer -- read it before the next call, do not keep it.
 */
export function activeAt(tl, cursor) {
  const out = tl._active;
  let k = 0;
  if (!tl.n) return out.subarray(0, 0);
  // last storm whose first fix is at or before the cursor
  let lo = 0;
  let hi = tl.n - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl.start[mid] <= cursor) { last = mid; lo = mid + 1; } else hi = mid - 1;
  }
  for (let i = last; i >= 0; i--) {
    if (tl.maxEndUpTo[i] < cursor) break;   // nothing at or before i can still be running
    if (tl.end[i] >= cursor) out[k++] = i;
  }
  return out.subarray(0, k);
}

/** How many storms have been revealed by `cursor` -- i.e. the length of the prefix on screen. */
export function revealedThrough(tl, cursor) {
  let lo = 0;
  let hi = tl.n - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl.start[mid] <= cursor) { last = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return last + 1;
}

/** Clock instant -> active minutes elapsed. Quiet stretches contribute nothing, by definition. */
export function toActive(tl, cursor) {
  if (!tl.n) return 0;
  const i = intervalAt(tl, cursor);
  if (i >= tl.intervals) return tl.activeMin;
  if (cursor <= tl.ivStart[i]) return tl.ivBefore[i];
  return tl.ivBefore[i] + (cursor - tl.ivStart[i]);
}

/** Active minutes elapsed -> clock instant. The inverse of toActive, for the scrub. */
export function fromActive(tl, active) {
  if (!tl.n) return null;
  const a = Math.max(0, Math.min(active, tl.activeMin));
  let lo = 0;
  let hi = tl.intervals - 1;
  let ans = tl.intervals - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl.ivBefore[mid] <= a) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return tl.ivStart[ans] + (a - tl.ivBefore[ans]);
}

/**
 * The fix in force at a cursor, and how far along the following segment it sits.
 *
 * One definition of "this storm's state at time T", shared by the single-storm replay and the
 * archive-wide one so they cannot drift apart. The fraction exists only so a head can MOVE
 * continuously between fixes -- every mark, wind and category the surface shows is read from
 * `index`, which is a real observation, never from the interpolation.
 *
 * @returns {{index:number, next:number|null, frac:number}}
 */
export function fixAt(ptT, start, end, cursorMin) {
  let k = start;
  while (k + 1 < end && ptT[k + 1] <= cursorMin) k++;
  const frac = k + 1 < end && ptT[k + 1] > ptT[k]
    ? Math.min(1, Math.max(0, (cursorMin - ptT[k]) / (ptT[k + 1] - ptT[k])))
    : 0;
  return { index: k, next: k + 1 < end ? k + 1 : null, frac };
}

/** Minutes -> epoch milliseconds. The archive stores minutes; Date wants ms. */
export function minToMs(min) {
  return min * 60000;
}

/**
 * How much of the timeline's calendar span has no storm active at all.
 * Reported, not hidden: it is the number that justifies the skip.
 */
export function quietFraction(tl) {
  if (!tl.spanMin) return 0;
  return (tl.spanMin - tl.activeMin) / tl.spanMin;
}
