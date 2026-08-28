/* THE COLOPHON — identity, provenance and the citation, on one line at the foot.
 *
 * WHAT THIS REPLACES. The surface used to open with two rows above the question: an identity
 * strip carrying the wordmark, three archive counts and the method stamp, and a question line
 * carrying the sentence, the cohort figure and CITE. Sixty-two pixels of chrome, read once a
 * session, sitting between a reader and the thing they came for.
 *
 * `5c` moves all of it to the foot. That is not decoration and it is not a demotion: a plate's
 * authority comes from its provenance being REACHABLE and its numbers being honest, not from a
 * wordmark at top-left, and a colophon under a printed plate is the convention this instrument
 * is already borrowing everything else from. The surface does not scroll, so the foot is on
 * screen at every width the instrument is side-by-side at -- one glance away rather than one
 * scroll -- and the top of the screen is the question and nothing else.
 *
 * IT IS A BET, AND THE RISK IS NAMED. Moving identity to the foot could read as art-directed
 * rather than institutional. The mitigation is that nothing became harder to reach: every item
 * here was in the strip, in the same words, and the two controls that open provenance and the
 * calibration ledger keep their hooks, their titles and their keyboard route.
 */

import React from "react";
import { TextButton } from "./kit.jsx";

/* THE ARCHIVE'S SCALE, AT THREE FIGURES RATHER THAN FIVE.
 *
 * WHICH THREE, AND WHY THE OTHER TWO LEFT. The line's job is to say how big the thing being
 * consulted is, in one glance, once a session. Storms, track points and landfalls do that:
 * they are the three denominators the surface actually publishes rates over, and a reader who
 * has them can tell whether "390 cohort" is a slice or a rounding error.
 *
 * GENESIS EVENTS is 3,959 -- the same number as STORMS on every pack this archive has ever
 * built, because the archive keys one genesis per storm. Printing it beside STORMS spent a
 * whole item of a degrading line restating the item next to it. ENVIRONMENT OBS is 32,940 and
 * counts rows of a table under half the cohort can be evaluated against; as a headline it reads
 * as scale and it is a COVERAGE fact, which is the env lens's to state and does.
 *
 * Both are in the provenance drawer, in section 02, where every count in the manifest is listed
 * from the pack that was actually loaded -- so nothing was dropped, it was filed.
 */
function ScaleLine({ manifest }) {
  if (!manifest) return null;
  const c = manifest.counts;
  const items = [
    [c.storms, "STORMS"], [c.track_points, "TRACK POINTS"], [c.landfalls, "LANDFALLS"],
  ];
  return (
    <span className="at-ledger">
      {items.map(([n, label]) => (
        <span className="at-fig" key={label}>
          <b>{n.toLocaleString()}</b><span>{label}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * The foot line: who this is, which archive, under which definitions, and the three ways out.
 *
 * THE STAMPS ARE THE POINT OF THE RIGHT-HAND HALF. METHOD, PACK and BUILT are the three facts
 * that change what every number above MEANS, and they are printed rather than hidden behind the
 * drawer for exactly that reason -- a reader comparing two screenshots taken a week apart needs
 * to be able to see, without opening anything, whether they are looking at the same archive.
 */
export function Colophon({ archive, citation, citationUrl, onProvenance, onLedger }) {
  const m = archive.manifest;
  const p = m.provenance || {};
  const method = String(m.methodology_version || "");
  const built = String(p.archive_built_utc || "").slice(0, 10);
  const stamp = String(p.archive_stamp || "");
  return (
    <footer className="at-colophon" data-colophon data-identity-strip>
      <span className="at-colophon-brand">Storm Atlas</span>
      <a className="at-colophon-back" href="../" title="back to Millibar Terminal">
        MILLIBAR · INSTITUTIONAL RESEARCH
      </a>

      {/* THE ARCHIVE'S OWN SCALE, from the pack that was actually loaded rather than from
          anything written here -- which is what makes it a check on the load rather than a
          decoration. It is the first whole item the line gives up as the width narrows, on the
          rule that a line drops whole items rather than half a word. */}
      <ScaleLine manifest={m} />

      <span className="at-colophon-stamps"
        title={`METHODOLOGY ${method} · PACK ${stamp} · BUILT ${p.archive_built_utc || ""}`}>
        METHOD {method}
        {stamp ? <> · PACK {stamp.slice(0, 8)}</> : null}
        {built ? <> · BUILT {built}</> : null}
      </span>

      <span className="at-colophon-acts">
        {onLedger ? (
          <TextButton onClick={onLedger} hook="data-open-ledger"
            title="how well calibrated is this? the archive's own backtest">Calibration</TextButton>
        ) : null}
        <TextButton onClick={onProvenance}
          title="provenance — sources, hashes, the pack stamp and the build time (P)">
          Provenance
        </TextButton>
        {/* CITE, AT THE FOOT, BESIDE THE STAMPS IT CITES.
            What is copied is what the ledger's own citation block copies -- the question in
            words, stamped with the definitions it was answered under, and the URL that
            reproduces it exactly, in that order. Two citation affordances that put different
            things on the clipboard would be worse than one. */}
        {citation ? <Cite text={citation} url={citationUrl} /> : null}
      </span>
    </footer>
  );
}

function Cite({ text, url }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    const payload = url ? `${text}\n${url}` : text;
    const done = () => setCopied(true);
    if (navigator.clipboard) navigator.clipboard.writeText(payload).then(done, done);
    else done();
  };
  return (
    <button type="button" className="at-colophon-cite" data-cite-cohort onClick={copy}
      title="copy this cohort — the question, its stamps and the URL that reopens it">
      {copied ? "COPIED" : "CITE"}
    </button>
  );
}
