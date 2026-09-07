/* SETTLEMENT GEOMETRY — A SEPARATE SURFACE, AND DELIBERATELY EMPTY.
 *
 * This module holds what a contract SAYS, so that a geometry question ("did the centre cross
 * this polygon") is never confused with a settlement question ("does that resolve Yes"). They
 * are different questions with different authorities, and every expensive mistake in this space
 * is one being answered with the other.
 *
 * IT IMPORTS NOTHING FROM THE RESIDUAL MATH AND THE RESIDUAL MATH IMPORTS NOTHING FROM IT. That
 * isolation is the point of a separate module: a contract term can never reach an interpolation,
 * and a residual can never reach a resolution.
 *
 * ------------------------------------------------------------------------------------------
 * THREE THINGS THAT ARE NOT CONTRACT TERMS
 *
 * 1. A MARKET TITLE. "Hurricane hits Hawaii" is a headline. It does not say which islands
 *    qualify, whether the centre must cross land, what wind speed counts, from whose data, or
 *    when the window closes. Titles are stored as `title` and are never read by any predicate.
 *
 * 2. A HURRICANE WARNING POLYGON. A warning means hurricane conditions are EXPECTED IN AN AREA.
 *    It is a statement about conditions over a region, issued to protect people. It does not
 *    decide whether the centre stays offshore or crosses land, and a warning covering an island
 *    is not evidence that a contract requiring a centre crossing will resolve Yes. Warning
 *    geometry is rendered on a DIFFERENT LAYER from settlement geometry for exactly this reason.
 *
 * 3. A MAP. Rendering a polygon does not make it the qualifying geography.
 *
 * ------------------------------------------------------------------------------------------
 * WHY THE REGISTRY IS EMPTY
 *
 * A contract record is only admissible here with its authoritative rules text, retrieved from
 * the venue, hashed and dated. No such text has been retrieved in this build, so the registry
 * holds nothing and `resolutionState` returns UNRESOLVED_RULES_NOT_INGESTED for every query.
 * That is the honest state, and it is enforced: `defineContract` REFUSES a record with a
 * missing field rather than filling one in from a title or a map.
 *
 * Only public rules text may be stored. Nothing here paraphrases a venue's rules.
 */

/** Every field a contract record must carry. Missing any one of them is a refusal. */
export const REQUIRED_FIELDS = [
  "contractId",            // the venue's own identifier, exactly as the venue writes it
  "venue",                 // who lists it
  "rulesUrl",              // the authoritative rules document
  "rulesText",             // its full public text, stored verbatim
  "rulesRetrievedZ",       // when it was retrieved
  "rulesVersion",          // the venue's version/revision, or null ONLY if the venue publishes none
  "rulesSha256",           // content hash of rulesText
  "qualifyingGeography",   // what counts, as named regions or rings — not a title, not a map
  "namedExclusions",       // what is explicitly carved out (may be an empty array, never absent)
  "eventWindow",           // { startZ, endZ, timezone } — the timezone is part of the term
  "intensity",             // { definition, units, comparison } e.g. 1-min sustained, kt, ">="
  "requiresCentreCrossing",// boolean — the single term that decides geometry-vs-conditions
  "resolutionAuthority",   // whose determination settles it
];

const isPresent = (v) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");

/**
 * Admit a contract, or refuse it and say which field is missing.
 *
 * `rulesVersion` may be explicitly null when the venue publishes no version — but the key must
 * be present, so "absent" is a recorded decision rather than an oversight.
 */
export function defineContract(rec) {
  const missing = REQUIRED_FIELDS.filter((k) => {
    if (k === "rulesVersion" || k === "namedExclusions") return !(k in (rec || {}));
    if (k === "requiresCentreCrossing") return typeof (rec || {}).requiresCentreCrossing !== "boolean";
    return !isPresent((rec || {})[k]);
  });
  if (missing.length)
    return { ok: false, refusal: "INCOMPLETE_CONTRACT_RECORD", missing,
             note: "A contract term is not inferable from a market title, a warning polygon or a "
                 + "map. Supply the venue's own rules text or leave the contract unsupported." };
  if (!Array.isArray(rec.namedExclusions))
    return { ok: false, refusal: "EXCLUSIONS_MUST_BE_A_LIST" };
  const w = rec.eventWindow || {};
  if (!isPresent(w.startZ) || !isPresent(w.endZ) || !isPresent(w.timezone))
    return { ok: false, refusal: "INCOMPLETE_EVENT_WINDOW",
             note: "A window without its timezone is not a window." };
  const it = rec.intensity || {};
  if (!isPresent(it.definition) || !isPresent(it.units) || !isPresent(it.comparison))
    return { ok: false, refusal: "INCOMPLETE_INTENSITY_DEFINITION",
             note: "Averaging period, units and comparison semantics are three separate terms." };
  return { ok: true, contract: Object.freeze({ ...rec }) };
}

/**
 * THE REGISTRY. Empty in this build, and empty is a state with a name.
 *
 * A caller that wants a supported contract must call `defineContract` with rules text it has
 * actually retrieved. Nothing is seeded here, because a seeded example would be indistinguishable
 * on screen from a real one.
 */
export const CONTRACTS = Object.freeze({});

export function getContract(contractId) {
  const c = CONTRACTS[contractId];
  if (!c) return { ok: false, refusal: "UNSUPPORTED_CONTRACT",
                   state: "UNRESOLVED — RULES NOT INGESTED",
                   note: "No authoritative rules text has been retrieved for this contract." };
  return { ok: true, contract: c };
}

/* -------------------------------------------------------------------------- resolution logic */

/**
 * WHAT A STRIKE ON EXCLUDED GEOGRAPHY DOES, AND DOES NOT, DO.
 *
 * It does not resolve No. A contract that excludes, say, the Northwestern Hawaiian Islands is
 * not settled by a strike there — it is simply not settled BY that strike. If the event window
 * is still open, a qualifying strike can still occur, and the state is OPEN with the excluded
 * strike recorded as a non-qualifying event.
 *
 * Resolving No on an excluded strike is the single most tempting error in this file, because the
 * strike LOOKS decisive on a map. The window, not the map, decides.
 */
export function classifyStrike(contract, strike) {
  if (!contract) return { qualifying: null, state: "UNRESOLVED — RULES NOT INGESTED" };
  const region = strike && strike.region;
  const excluded = (contract.namedExclusions || []).some(
    (x) => String(x).toLowerCase() === String(region).toLowerCase());
  const qualifies = (contract.qualifyingGeography || []).some(
    (x) => String(x).toLowerCase() === String(region).toLowerCase());
  if (excluded)
    return { qualifying: false, reason: "NAMED_EXCLUSION", region,
             state: "NON-QUALIFYING EVENT RECORDED",
             note: "An excluded-geography strike does not by itself resolve No." };
  if (!qualifies)
    return { qualifying: false, reason: "NOT_IN_QUALIFYING_GEOGRAPHY", region,
             state: "NON-QUALIFYING EVENT RECORDED" };
  if (contract.requiresCentreCrossing && strike.centreCrossed !== true)
    return { qualifying: false, reason: "CENTRE_CROSSING_NOT_ESTABLISHED", region,
             state: "UNRESOLVED — CENTRE CROSSING NOT ESTABLISHED",
             note: "Hurricane conditions in an area are not a centre crossing. A warning "
                 + "polygon is not evidence either way." };
  return { qualifying: true, reason: "MEETS_STATED_TERMS", region, state: "QUALIFYING EVENT" };
}

/**
 * The contract's state given what has happened so far and where the clock is.
 *
 * Four states and no fifth: RESOLVED_YES, RESOLVED_NO, OPEN, UNRESOLVED. UNRESOLVED is not a
 * failure mode — it is what an honest module says when the rules are not in hand.
 */
export function resolutionState(contract, strikes, nowMs) {
  if (!contract)
    return { state: "UNRESOLVED", reason: "RULES_NOT_INGESTED",
             text: "UNRESOLVED — RULES NOT INGESTED",
             note: "No authoritative rules text retrieved. No settlement claim is made." };
  const classified = (strikes || []).map((s) => ({ strike: s, ...classifyStrike(contract, s) }));
  const qualifying = classified.filter((c) => c.qualifying === true);
  const endMs = Date.parse(contract.eventWindow.endZ);
  const windowOpen = Number.isFinite(endMs) && nowMs < endMs;
  if (qualifying.length)
    return { state: "RESOLVED_YES", reason: "QUALIFYING_EVENT", text: "RESOLVED YES",
             qualifying, classified, windowOpen };
  if (windowOpen)
    return { state: "OPEN", reason: "WINDOW_STILL_OPEN", text: "OPEN — WINDOW STILL RUNNING",
             classified, windowEndsZ: contract.eventWindow.endZ, timezone: contract.eventWindow.timezone,
             note: classified.some((c) => c.reason === "NAMED_EXCLUSION")
               ? "An excluded-geography strike has occurred and did not resolve this contract."
               : null };
  return { state: "RESOLVED_NO", reason: "WINDOW_CLOSED_WITHOUT_QUALIFYING_EVENT",
           text: "RESOLVED NO", classified, windowOpen: false };
}

/**
 * RENDER LAYERS, kept apart by name so a surface cannot merge them by accident.
 *
 * Settlement exclusions, warning areas and residual markers are three different kinds of claim
 * with three different authorities. A viewer who sees them in one ink will read a warning as a
 * contract term, which is exactly the inference §6 exists to prevent.
 */
export const LAYERS = Object.freeze({
  SETTLEMENT_QUALIFYING: { id: "settlement-qualifying", authority: "contract rules text" },
  SETTLEMENT_EXCLUDED:   { id: "settlement-excluded",   authority: "contract rules text" },
  WARNING_AREA:          { id: "warning-area",          authority: "issuing forecast centre" },
  RESIDUAL_MARKER:       { id: "residual-marker",       authority: "this module" },
});

/** A hurricane warning, described correctly, for any surface that wants to print it. */
export const WARNING_SEMANTICS =
  "A hurricane warning means hurricane conditions are expected somewhere in an area. It does "
  + "not state whether the centre will cross land, and it is not a contract term.";
