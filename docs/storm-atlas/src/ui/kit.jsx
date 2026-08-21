/* The small pieces every panel is built from.
 *
 * ONE RULE RUNS THROUGH ALL OF THEM: a value the archive does not have renders as an em-dash
 * with a reason attached, never as zero and never as a blank. `Num` takes null and prints "—";
 * it has no code path that turns an absent value into a number. That is not defensive
 * programming, it is the product: this archive's whole claim is that it distinguishes "we
 * measured nothing" from "we measured nothing there".
 *
 * THE SECOND RULE, ADDED WITH THE REFUSAL GRAMMAR: a refusal is set the way a journal sets a
 * caveat -- a marginal rule and a mark -- never as an alert box, a tint or a coloured
 * background. A refusal is part of the argument, not an error in it, and colouring it as a
 * warning is how a reader learns to skip the one thing this surface most wants read. The mark,
 * the status wording and the key gloss are declared together in the claim registry, so a panel
 * cannot print a status the Epistemic Key does not define.
 */

import React from "react";

/* The claim registry, shared with the terminal and loaded by index.html. Capability prose --
   what this surface can and cannot answer -- is authored there and only there; components read
   claims and never write them. A missing registry is loud rather than silent, for the same
   reason an unknown claim id renders as UNREGISTERED rather than as nothing. */
const MTC = globalThis.MTC;

export function claimText(id) {
  if (!MTC) return "claim registry unavailable";
  return MTC.claim(id).text;
}

/** The mark, status and key gloss for one refusal kind, from the registry that owns them. */
export function refusal(kind) {
  if (!MTC || !MTC.refusal) {
    return { mark: kind, status: "REFUSAL REGISTRY UNAVAILABLE", gloss: "" };
  }
  return MTC.refusal(kind);
}

export function refusalKinds() {
  return MTC && MTC.refusals ? MTC.refusals() : [];
}

export const MONO = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

/** A number, or an em-dash carrying the reason it is absent. */
export function Num({ value, unit, digits = 0, absent = "not recorded in the archive", tone }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span title={absent} style={{ ...MONO, color: "var(--t3)", cursor: "help" }}>—</span>
    );
  }
  // -0.0 appears throughout the archive's float columns; it is zero and should read as zero.
  const v = Object.is(value, -0) ? 0 : value;
  return (
    <span style={{ ...MONO, color: tone || "inherit" }}>
      {digits ? v.toFixed(digits) : Math.round(v).toLocaleString()}
      {unit ? <small style={{ color: "var(--t4)", marginLeft: 3 }}>{unit}</small> : null}
    </span>
  );
}

/** A string value, or an em-dash. Same rule. */
export function Txt({ value, absent = "not recorded in the archive", tone, transform }) {
  if (value === null || value === undefined || value === "") {
    return (
      <span title={absent} style={{ ...MONO, color: "var(--t3)", cursor: "help" }}>—</span>
    );
  }
  const s = transform === "upper" ? String(value).toUpperCase() : String(value);
  return <span style={{ ...MONO, color: tone || "inherit" }}>{s}</span>;
}

/** A count with its denominator -- the shape the archive's own panels use. */
export function OverDenom({ n, of, tone }) {
  return (
    <span style={{ ...MONO, color: tone || "inherit" }}>
      {n.toLocaleString()}<span style={{ color: "var(--t4)" }}> / {of.toLocaleString()}</span>
    </span>
  );
}

/* `Unscoreable` lived here and is gone: ui/refusal.jsx generalises it into the six states, so
   every refusal now comes from one definition instead of one component knowing about one of
   them. Left as a note rather than as a re-export, because a shim would let a caller keep
   rendering a refusal that cannot say whether the reader can do anything about it. */
/* The mark for a value the Atlas DERIVED by replaying the archive's own rule, rather than read
   from a column the archive publishes. Set as a superscript so it annotates the number without
   competing with it. The glyph is the archive's own `·d`, not a typographic substitute: it is
   the string this repo already uses for the distinction and the string its DOM gate looks
   for. */
export function Drv({ title = "derived by replaying the archive's own rule — not an archive column" }) {
  return <sup className="at-drv" title={title}>·d</sup>;
}

/* A label, a leader and a right-aligned figure.
 *
 * The label ellipsizes and the value does not, on purpose and in that order: a number that has
 * lost its last digit looks exactly like a smaller number, while a truncated label is still
 * recognisably the label. The leader dots are what let the eye cross a wide rail without the
 * two ends drifting apart. */
export function Row({ k, v, tone, title, dim }) {
  return (
    <div className={dim ? "at-row at-dim" : "at-row"} title={title}>
      <span className="at-k">{k}</span>
      <i className="at-dots" />
      <span className="at-v" style={tone ? { color: tone } : undefined}>{v}</span>
    </div>
  );
}

/** A numbered section head: number, label, and an annotation that gives way before the label. */
export function Head({ n, children, right }) {
  return (
    <div className="at-sechd">
      <span className="at-n">{n || ""}</span>
      <h3>{children}</h3>
      {right ? <span className="at-r">{right}</span> : null}
    </div>
  );
}

/** The double rule that opens a movement rather than a section. */
export function GroupRule() {
  return <div className="at-grouprule" />;
}

/** The headline figure. Its consequence comes from the caption under it, not from its size. */
export function Figure({ value, denom, tone }) {
  return (
    <div className="at-figure">
      <span className="at-big" style={tone ? { color: tone } : undefined}>{value}</span>
      {denom ? <span className="at-den">{denom}</span> : null}
    </div>
  );
}

export function Capt({ children }) {
  return <div className="at-capt">{children}</div>;
}

/** A measure, not a meter: one fill and one tick at the same place, so the eye can read a
 *  proportion without the bar implying a target. */
export function Bar({ pct, tone }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="at-bar">
      <i style={{ width: `${w.toFixed(2)}%`, background: tone || "var(--accent)" }} />
      <u style={{ left: `${w.toFixed(2)}%`, background: tone || "var(--accent)" }} />
    </div>
  );
}

export function Note({ children, style }) {
  return <div className="at-note" style={style}>{children}</div>;
}

export function Prose({ children, style }) {
  return <div className="at-prose" style={style}>{children}</div>;
}

export function Lede({ children, style }) {
  return <div className="at-lede" style={style}>{children}</div>;
}

/* `chipKey` stamps a stable `data-chip` hook. The DOM gate used to select a chip by its
   visible text, which broke the moment 3.3 put live counts inside the labels -- the selector
   was matching the wording of the thing it was checking. The hook is the identity; the label
   is free to change. */
export function Chip({ children, active, tone, onClick, title, disabled, style, chipKey }) {
  return (
    <button
      type="button"
      className="at-chip"
      data-chip={chipKey}
      aria-pressed={!!active}
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={active && tone
        ? { color: tone, borderColor: tone, background: `${tone}14`, ...style }
        : style}
    >{children}</button>
  );
}

/** A square that fills. Not a pill that slides: nothing here is a preference. */
export function Toggle({ label, on, onChange, note, title }) {
  return (
    <div>
      <button type="button" className="at-tg" aria-pressed={!!on} title={title}
        onClick={() => onChange(!on)}>
        <i className="at-box" />
        <span className="at-lb">{label}</span>
      </button>
      {note ? <div className="at-tgnote">{note}</div> : null}
    </div>
  );
}

/** A text button: a rule under a word. RESET, CLEAR, PROVENANCE, COPY. */
/* `hook` stamps a stable `data-*` attribute, for the same reason Chip takes `chipKey`: a gate
   that selects a control by its visible label is a gate that breaks when the label is
   rewritten, and the label is the thing most likely to be rewritten. */
export function TextButton({ children, onClick, title, style, id, hook }) {
  return (
    <button type="button" className="at-hbtn" onClick={onClick} title={title} style={style}
      id={id} {...(hook ? { [hook]: "" } : {})}>{children}</button>
  );
}

/* THE COHORT SPEC. The question the panel is answering, as one citable line.
 *
 * Every segment is a restatement of state already on screen -- the filters in the rail, the
 * probe on the map, the storm selected, and two stamps out of the pack's own manifest. It
 * computes nothing, asserts no threshold the rail has not already applied, and adds no claim.
 * That is the whole discipline: a citation, not a heading, and certainly not a finding.
 */
export function CohortSpec({ text }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    const done = () => setCopied(true);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
    else done();
  };
  return (
    <div className="at-spec">
      <code>{text}</code>
      <TextButton onClick={copy} title="copy the cohort spec">{copied ? "Copied" : "Copy"}</TextButton>
    </div>
  );
}

/** The panel's masthead: kicker, title, optional location line, and the Cohort Spec. */
export function Masthead({ kicker, right, title, titleClass, loc, spec, children }) {
  return (
    <div className="at-masthead">
      <div className="at-kicker">
        <span>{kicker}</span>
        {right ? <span className="at-x">{right}</span> : null}
      </div>
      <h2 className={titleClass ? `at-${titleClass}` : undefined}>{title}</h2>
      {loc ? <div className="at-loc">{loc}</div> : null}
      {children}
      {spec ? <CohortSpec text={spec} /> : null}
    </div>
  );
}

/* ---- the refusal grammar ---------------------------------------------------------------
 *
 * `kind` selects the mark and, by default, the wording. `status` overrides the wording only
 * where the archive itself qualifies it -- the engine's own string for a refusal it computed,
 * or one of the two documented qualifications. There is deliberately no path that invents a
 * status: an unregistered kind throws in the registry rather than rendering something the key
 * cannot explain.
 */

export function Mark({ kind }) {
  return <span className={`at-mk at-${kind}`} aria-hidden="true">{kind === "unk" ? "—" : ""}</span>;
}

export function Refusal({ kind, status, children }) {
  const r = refusal(kind);
  return (
    <div className="at-ref">
      <Mark kind={r.mark} />
      <div>
        <div className="at-st">{status || r.status}</div>
        <div className="at-why">{children}</div>
      </div>
    </div>
  );
}

/* A gap the archive recorded about itself. NOT a refusal, and marked outside the five on
   purpose: a refusal is this surface declining to answer, a gap is the archive telling you
   what it never had. Shown verbatim -- rewording one would change what it says. */
export function Gap({ text, label = "GAP" }) {
  return (
    <div className="at-ref">
      <span className="at-mk at-gapmark" aria-hidden="true" />
      <div>
        <div className="at-st" style={{ color: "var(--t2)" }}>{label}</div>
        <div className="at-why">{text}</div>
      </div>
    </div>
  );
}

/* THE EPISTEMIC KEY. Generated from the registry, rendered ONCE by the panel shell rather than
   by each state, so the five marks are defined in exactly one place on screen and cannot
   disagree with themselves between panels. */
export function EpistemicKey() {
  const rows = refusalKinds();
  return (
    <>
      <GroupRule />
      <Head n="—" right={`${rows.length} marks`}>EPISTEMIC KEY</Head>
      {rows.map((r) => (
        <div className="at-keyrow" key={r.mark}>
          <Mark kind={r.mark} />
          <span className="at-nm">{r.status}</span>
          <span className="at-ds">{r.gloss}</span>
        </div>
      ))}
      <Note style={{ marginTop: 9 }}>
        Values with no mark are archive columns. A superscript <b>d</b> marks a value derived by
        replaying the archive's own rule rather than read from one.
      </Note>
    </>
  );
}

export function fmtUTC(ms, { time = true } = {}) {
  if (ms === null || ms === undefined) return null;
  const d = new Date(ms);
  const date = d.toISOString().slice(0, 10);
  return time ? `${date} ${d.toISOString().slice(11, 16)}Z` : date;
}

/** Hours as a human duration that never implies precision the archive lacks. */
export function fmtHours(h) {
  if (h === null || h === undefined || Number.isNaN(h)) return null;
  if (Math.abs(h) < 48) return `${Math.round(h)} h`;
  const d = h / 24;
  return `${d.toFixed(1)} d`;
}
