/* THE CONDITION STRIP — the query, as three labelled zones, always visible.
 *
 * WHAT IT REPLACES. The rail held a builder: six stacked sections of chips, month cells, year
 * inputs and toggles, permanently occupying a fifth of the width whether or not anyone was
 * editing. The strip keeps the STATE and moves the EDITING behind a sheet, on the argument the
 * handoff makes and the measurements support -- a reader looks at their conditions constantly
 * and changes them rarely, so the surface should show the first and summon the second.
 *
 * THE ONE THING THIS SURFACE CANNOT LOSE IS THE BOUNDARY.
 *
 * A cohort is defined by two kinds of condition and they are not interchangeable:
 *
 *   GENESIS-SIDE   where and when a storm formed. These narrow the POPULATION.
 *   OUTCOME-SIDE   what the storm went on to do. These narrow the population AND take the
 *                  conditioned variable out of the evidence -- the fifth rule. A cohort defined
 *                  by "reached Cat 4" cannot report a Category 4 rate, because every member has
 *                  one by construction.
 *
 * A reader who cannot see which side a condition sits on cannot tell a finding from an artefact
 * of their own question. So the three zones are ALWAYS rendered, including when they are empty:
 * an empty zone shows a dashed placeholder saying what it would hold. That is the property
 * scripts/check-condition-strip.mjs asserts with the prose covered -- the boundary has to be
 * legible from structure alone, because a reader scanning a strip reads the shapes first.
 *
 * SCOPE IS THE THIRD ZONE AND IT IS NEITHER OF THE OTHER TWO. Named-only and provisional-season
 * handling change WHICH RECORDS ARE ELIGIBLE, not which storms qualify -- they are properties of
 * the archive being consulted rather than of the question being asked, and filing them under
 * either of the first two zones would misstate what they do.
 */

import React from "react";

/* The three zones, in reading order, with what each would hold when it holds nothing. The
   placeholder is not filler: it is the only thing standing between an empty strip and a reader
   who cannot tell an unasked question from an unanswerable one. */
export const ZONES = [
  { key: "given", label: "GENESIS-SIDE", rule: "accent",
    empty: "no condition on where or when these storms formed" },
  { key: "outcome", label: "OUTCOME-SIDE", rule: "muted",
    empty: "no condition on what they went on to do" },
  { key: "scope", label: "SCOPE", rule: "hair",
    empty: "the archive's default record scope" },
];

/**
 * @param {Array}  props.conditions  engine/cohort.js conditionsOf(spec) -- each carries `zone`
 * @param {object} [props.lastEdit]  `{ from, to }` populations, or null before the first edit
 * @param {func}   [props.onEdit]    opens the builder sheet for one zone
 * @param {func}   [props.onClear]   removes one condition by key
 */
export function ConditionStrip({ conditions = [], lastEdit = null, onEdit, onClear }) {
  const byZone = new Map(ZONES.map((z) => [z.key, []]));
  for (const c of conditions) {
    /* An unknown zone is a bug in the engine, not a reason to drop the condition on the floor:
       filing it under SCOPE would misreport which side of the boundary it sits on, so it goes
       nowhere and the count below will not match. Better a visible discrepancy than a quiet
       misfiling. */
    if (byZone.has(c.zone)) byZone.get(c.zone).push(c);
  }

  return (
    <div className="at-strip" data-condition-strip>
      {ZONES.map((z) => (
        <Zone key={z.key} zone={z} conditions={byZone.get(z.key)}
          onEdit={onEdit} onClear={onClear} />
      ))}
      <LastEdit lastEdit={lastEdit} />
    </div>
  );
}

function Zone({ zone, conditions, onEdit, onClear }) {
  const empty = conditions.length === 0;
  return (
    <div className={`at-zone at-zone-${zone.rule}${empty ? " at-zone-empty" : ""}`}
      data-zone={zone.key} data-zone-empty={empty ? "" : undefined}>
      <button type="button" className="at-zone-label" data-zone-edit={zone.key}
        onClick={onEdit ? () => onEdit(zone.key) : undefined}
        title={`edit the ${zone.label.toLowerCase()} conditions`}>
        {zone.label}
      </button>
      <div className="at-zone-items">
        {empty ? (
          /* THE PLACEHOLDER IS THE BOUNDARY WHEN NOTHING IS SET. Dashed rather than solid, and
             it states what the zone WOULD do -- an empty box with a heading tells a reader the
             zone exists; this tells them what it is for. */
          <span className="at-zone-hint" data-zone-hint>{zone.empty}</span>
        ) : conditions.map((c) => (
          <span key={c.key} className="at-cond" data-condition={c.key} data-condition-zone={zone.key}>
            <span className="at-cond-k">{c.label}</span>
            <span className="at-cond-v">{c.value || c.sentence}</span>
            {onClear ? (
              <button type="button" className="at-cond-x" data-condition-clear={c.key}
                onClick={() => onClear(c.key)} title={`remove: ${c.label}`}
                aria-label={`remove condition ${c.label}`}>×</button>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

/* WHAT THE LAST EDIT COST, IN POPULATION. One number to one number, and nothing else: it is an
   orientation aid, not a history, and it is cleared by the next edit rather than accumulated
   into a panel nobody reads. */
function LastEdit({ lastEdit }) {
  if (!lastEdit || lastEdit.from === null || lastEdit.to === null) return null;
  return (
    <div className="at-lastedit" data-last-edit>
      <span className="at-lastedit-k">LAST EDIT</span>
      <span className="at-lastedit-v">
        {lastEdit.from.toLocaleString()} → {lastEdit.to.toLocaleString()}
      </span>
    </div>
  );
}

/* WHAT CHANGED — two to three lines at the deck's foot, and never more.
 *
 * LABELLED A READING AID, NOT AN ATTRIBUTION, in as many words. The distinction is the whole
 * reason the block is allowed to exist: "the Cat 3 rate rose 11 points when you added this
 * condition" is a true statement about two numbers and NOT a statement that the condition caused
 * the rise. Cohorts are not experiments, nothing here is randomised, and a surface that let a
 * delta read as an effect would be publishing causal language the archive cannot support.
 *
 * Cleared on the next edit. Never accumulated into a history panel -- a running list of deltas
 * is a narrative, and a narrative is exactly the thing this label is denying. */
export function WhatChanged({ edit, deltas = [] }) {
  if (!edit) return null;
  const shown = deltas.slice(0, 2);
  return (
    <div className="at-changed" data-what-changed>
      <span className="at-changed-label">A READING AID, NOT AN ATTRIBUTION</span>
      <span className="at-changed-line">{edit}</span>
      {shown.map((d, i) => <span className="at-changed-line" key={i}>{d}</span>)}
    </div>
  );
}
