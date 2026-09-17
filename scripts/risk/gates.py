"""Gate a published Trigger Evidence Record.

    python3 gates.py                 # every record
    python3 gates.py lowell-2026     # one record
    python3 gates.py --offline       # skip the one gate that needs the network

Each record is gated in a PROCESS OF ITS OWN. The gates read module-level state -- the
rendered PDF text, the page, the manifest -- and a record whose gates could see another
record's page is a record whose gates can pass on the wrong document.
"""
import json, re, subprocess, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
from datetime import datetime, timezone
from pypdf import PdfReader, PdfWriter

sys.path.insert(0, str(Path(__file__).parent))
from tec import EVENTS, ROOT, COASTLINES, declared_inputs, sha256, load_all, reconcile_lead_labels

FLAGS = [a for a in sys.argv[1:] if a.startswith("--")]
SLUGS = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(SLUGS) != 1:
    codes = [subprocess.run([sys.executable, __file__, slug, *FLAGS]).returncode
             for slug in (SLUGS or sorted(EVENTS))]
    sys.exit(1 if any(codes) else 0)

SLUG = SLUGS[0]
if SLUG not in EVENTS:
    raise SystemExit(f"unknown record {SLUG!r}; known: {', '.join(sorted(EVENTS))}")
EV = EVENTS[SLUG]
PDF_NAME = f"Millibar-{EV.name}-2026-Event-Brief.pdf"

D = ROOT / "docs" / "risk" / SLUG
BUILD = Path(__file__).parent / ".build"
M = json.loads((D / f"{SLUG}.manifest.json").read_text())
PDF = D / PDF_NAME
BRIEF = BUILD / f"brief-{SLUG}.html"
print(f"\n=== {SLUG} ===")

# The live check is the one gate that needs the network, and it is the one gate that is
# expected to fail before the first deploy. --offline skips it so the suite can run inside
# CI's offline job and in a sandbox, and says so rather than reporting a pass.
OFFLINE = "--offline" in sys.argv
results = []


def latest_source_stamp() -> datetime:
    """The transmission time of the most recent archived product, from the filenames.

    Used as the PDF's creation date so the document is a deterministic function of its
    inputs. It is also the honest answer to "as of when": the record is as of the last
    product it contains, not as of whenever someone last ran the build.
    """
    stamps = [datetime.strptime(m.group(1), "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
              for m in (re.search(r"\.(\d{12})\.", f.name) for f in declared_inputs(EV)) if m]
    if stamps:
        return max(stamps)
    # An archive whose filenames carry no transmission stamp still dates itself: the latest
    # issuance the products PRINT for themselves. Same meaning, coarser resolution, and the
    # manifest says which of the two this record is built on.
    issued = [datetime.strptime(r["issued"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
              for r in M["event_manifest"]["records"] if r.get("issued")]
    if not issued:
        raise SystemExit("no dated source products: cannot date the PDF deterministically")
    return max(issued)


def normalise_pdf_dates(path: Path) -> str:
    """Make the rendered PDF a byte-deterministic function of its inputs.

    Chromium stamps /CreationDate and /ModDate with the wall clock, which is the ONLY thing
    that differed between two renders of this document -- four bytes, the seconds digits.
    That is enough to make "rebuild and diff" useless as a reproducibility check and to put
    a spurious binary change in every deployment diff, so the dates are rewritten to the
    latest archived source transmission time.
    """
    stamp = latest_source_stamp()
    d = f"D:{stamp:%Y%m%d%H%M%S}+00'00'"
    r = PdfReader(str(path))
    w = PdfWriter()
    for pg_ in r.pages:
        w.add_page(pg_)
    w.add_metadata({**{k: v for k, v in (r.metadata or {}).items()},
                    "/CreationDate": d, "/ModDate": d})
    with open(path, "wb") as fh:
        w.write(fh)
    return d


def gate(name, ok, detail=""):
    """ok is True, False, or None for a gate that was deliberately not run.

    A skipped gate is reported as SKIP and excluded from the pass count rather than being
    coerced to a pass, so an offline run cannot read as an external release.
    """
    results.append((name, None if ok is None else bool(ok), detail))


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(BRIEF.as_uri()); pg.wait_for_timeout(600)
    h = pg.evaluate("document.querySelector('.page').scrollHeight")
    min_body = pg.evaluate("""Math.min(...[...document.querySelectorAll('p,td,li')].filter(e=>e.innerText.trim()&&!e.closest('.foot')&&!e.closest('.cap')).map(e=>parseFloat(getComputedStyle(e).fontSize)))""")
    min_cap = pg.evaluate("""Math.min(...[...document.querySelectorAll('.cap,.foot p')].map(e=>parseFloat(getComputedStyle(e).fontSize)))""")
    # The canonical URL must survive the page as ONE clickable token. The earlier brief
    # printed it as plain text with word-break:break-all, so it arrived in the PDF split
    # across three lines and could be neither clicked nor retyped without error.
    url_box = pg.evaluate("""() => {
      const a = document.querySelector('a.url');
      if (!a) return null;
      const r = a.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(a).lineHeight) || r.height;
      return {href: a.getAttribute('href'), text: a.textContent.trim(),
              lines: Math.round(r.height / lh), right: r.right,
              pageRight: document.querySelector('.page').getBoundingClientRect().right,
              size: parseFloat(getComputedStyle(a).fontSize)};
    }""")
    pg.pdf(path=str(PDF), format="Letter", print_background=True, prefer_css_page_size=True)
    normalise_pdf_dates(PDF)
    for w in (1440, 900, 390):
        v = b.new_page(viewport={"width": w, "height": 900})
        v.goto((D / "index.html").as_uri()); v.wait_for_timeout(800)
        ov = v.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        gate(f"web {w}px: no horizontal page overflow", not ov)
        # Review frames are BUILD OUTPUT, not pages of the site. They go to the gitignored
        # build directory; writing them beside index.html published four PNGs to every reader
        # of /risk/lowell-2026/ and put them in the deployment diff on every run.
        # NAMED PER RECORD. These were shot-<width>.png, which is one set of filenames for
        # however many records exist -- so gating the second record silently overwrote the
        # first one's review frames, and whichever ran last was the one you looked at. The
        # print source is already per-record for the same reason.
        v.screenshot(path=str(BUILD / f"shot-{SLUG}-{w}.png"), full_page=(w != 1440))
        if w == 1440:
            v.screenshot(path=str(BUILD / f"shot-{SLUG}-1440-full.png"), full_page=True)
    b.close()

pdf_text = "".join(pg_.extract_text() for pg_ in PdfReader(str(PDF)).pages)
web = (D / "index.html").read_text()
brief_html = BRIEF.read_text()

# PDF text extraction preserves the LINE BREAKS the renderer chose, so a phrase can arrive
# split mid-token ("time-\nbase audit"). Phrase gates read the whitespace-stripped form so
# they test the words on the page rather than the line breaks around them.
pdf_flat = re.sub(r"\s+", " ", pdf_text)
pdf_tight = re.sub(r"\s+", "", pdf_text)


def tight(x):
    return re.sub(r"\s+", "", x)
op = M["decision_manifest"]["operational"]

gate("PDF is one page", len(PdfReader(str(PDF)).pages) == 1)
# REPRODUCIBILITY, AS A GATE RATHER THAN A CLAIM. Two renders of this document differed only
# in the seconds digits of the render clock. With the dates pinned to the archive, a rebuild
# is byte-identical and `git status` after a rebuild is the check.
_meta = PdfReader(str(PDF)).metadata or {}
_want = f"D:{latest_source_stamp():%Y%m%d%H%M%S}+00'00'"
gate("PDF creation date is derived from the sources, not the clock",
     _meta.get("/CreationDate") == _want and _meta.get("/ModDate") == _want,
     str(_meta.get("/CreationDate")))
gate("PDF content height fits Letter (<=1056px)", h <= 1056, f"{h}px")
gate("PDF body and table text >= 9pt", min_body * 0.75 >= 8.99, f"{min_body*0.75:.2f}pt")
gate("PDF captions/footer >= 7.5pt", min_cap * 0.75 >= 7.49, f"{min_cap*0.75:.2f}pt")
for label, v in (("along", op["residual_vs_revised_fix"]["along_nm"]), ("cross", op["residual_vs_revised_fix"]["cross_nm"])):
    s = f"{v:+.1f}".replace("-", "−")
    gate(f"PDF/web parity: residual {label} {s}", s in web and s in pdf_text.replace("-", "−"))
if SLUG == "lowell-2026":
    for k, v in (("NIIHAU 50kt", 71), ("NIIHAU 64kt", 28)):
        gate(f"parity: WSP {k}={v}%", op["wsp_adv46_cumulative_120h"][k] == v and f"{v}%" in pdf_text and f"{v}%" in web)
    for c in op["closest_approach_by_advisory"]:
        if c["advisory"] in ("38", "42", "46", "49"):
            gate(f"parity: Adv {c['advisory']} Niʻihau {c['niihau_nm']} nm", f"{c['niihau_nm']} nm" in pdf_text)
    # THE RETIRED RESULT MAY BE NAMED ONLY AS WITHDRAWN.
    # Not "must not appear": the record is supposed to say what it retired and why. The rule is
    # that every occurrence sits inside the withdrawal sentence, so it can never be read as a
    # current figure.
    WITHDRAWAL = "Earlier Millibar 0.0 nm along-track calculation withdrawn after time-base audit."
    gate("retired 0.0 along-track appears only inside the withdrawal sentence",
         pdf_tight.count("0.0nmalong-track") == pdf_tight.count(tight(WITHDRAWAL))
         and tight(WITHDRAWAL) in pdf_tight
         and "timing was verifying" not in web.lower())
    gate("no seven-bids claim in primary metadata", "seven" not in pdf_text.lower() and "seven" not in web.split('<section class="register">')[0].lower())
    gate("distances labelled as coastline, derived", "Natural Earth Niʻihau coastline" in web)

if SLUG == "lala-2026":
    for k, v in (("SOUTH POINT 50kt", 95), ("SOUTH POINT 64kt", 2)):
        gate(f"parity: WSP {k}={v}%", op["wsp_adv14_cumulative_120h"][k] == v and f"{v}%" in pdf_text and f"{v}%" in web)
    for c in op["closest_approach_by_advisory"]:
        if c["advisory"] in ("5", "9", "13", "15") and c["hawaii_nm"]:
            gate(f"parity: Adv {c['advisory']} Hawaiʻi I. {c['hawaii_nm']} nm", f"{c['hawaii_nm']} nm" in pdf_text)
    gate("distances labelled as coastline, derived", "Natural Earth Hawaiʻi Island coastline" in web)
    # A FORECAST TRACK THAT CROSSES A COASTLINE HAS NO CLOSEST APPROACH TO REPORT.
    # Four advisories put the track over the island; printing "0 nm" for those would read as a
    # measured tangent rather than a forecast landfall, and the tie window (4.5 h on Advisory 1)
    # is what gives it away.
    crossed = op["forecast_track_crossed_island_on_advisories"]
    gate("forecast landfalls are shown as over land, not as a zero distance",
         crossed and "over land" in web and web.count("over land") >= len(crossed),
         f"advisories {', '.join(crossed)}")
    # THE SOURCE VINTAGE IS DECLARED, NOT SMOOTHED OVER.
    ip = M["event_manifest"]["issuance_provenance"]
    gate("issuance basis is declared as the printed hour, not a transmission minute",
         ip["basis"] == "product-body-hour" and "not reconstructed" in ip["means"]
         and "TTAA00 PHFO DDHHMM" in web)
    gate("no aviation advisory is claimed for this event",
         op["aviation_advisories_archived"] is False
         and "none is reconstructed" in op["aviation_advisories_note"]
         and "No ICAO aviation advisory" in web)
    gate("ambiguous cycles are taken from the discussion's own lead labels",
         M["event_manifest"]["time_model"]["cycle_from_discussion_labels"] == ["62", "63", "64"])
gate("2026 terms not rendered as 2024 limits", "2026 terms" in web and "Published 2024–25 limits" in web and "Published 2024–25 limits" in pdf_text.replace("\n", " "))
gate("WSP labelled as not contract probabilities", "not contract payout probabilities" in web and "not contract payout probabilities" in pdf_text.replace("\n", " "))
gate("no trading surface links", not re.search(r"kalshi|edge ?book|polymarket|\bbet(s|ting)?\b|\bEV-ranked", web, re.I) and not re.search(r"kalshi|edge ?book|\bbet(s|ting)?\b", pdf_text, re.I))
gate("canonical URL identical in PDF, web and manifest",
     M["canonical_url"] in pdf_text.replace("\n", "") and f'href="{M["canonical_url"]}"' in web)
# ---------------------------------------------------------------------------- new gates
# A. THE CANONICAL URL IS ONE CLICKABLE LINE.
gate("PDF canonical URL is a link, not plain text",
     bool(url_box) and url_box["href"] == M["canonical_url"] and url_box["text"] == M["canonical_url"])
gate("PDF canonical URL renders on a single line",
     bool(url_box) and url_box["lines"] == 1, f"{url_box and url_box['lines']} line(s)")
gate("PDF canonical URL does not overrun the page",
     bool(url_box) and url_box["right"] <= url_box["pageRight"] + 0.5)
gate("PDF canonical URL >= 7.5pt",
     bool(url_box) and url_box["size"] * 0.75 >= 7.49, f"{url_box and round(url_box['size']*0.75,2)}pt")

# B. BOTH EVIDENCE VINTAGES ARE PRESENTED AS PEERS.
# The earlier brief printed the revised figures at display size and demoted the 18Z ones
# to a sentence, which reads as the observation having been corrected rather than as one
# forecast verified against two source vintages.
for label, r in (("earlier vintage", op["residual_vs_first_reported_fix"]),
                 ("revised vintage", op["residual_vs_revised_fix"])):
    for k in ("along_nm", "cross_nm"):
        sgn = f"{r[k]:+.1f}".replace("-", "\u2212")
        gate(f"PDF section D carries {label} {k} {sgn}", sgn in pdf_tight.replace("-", "\u2212"))
gate("PDF section D gives both vintages equal display weight",
     brief_html.count('class="vint"') == 2 and brief_html.count('class="big"') == 4)
VINTAGE_SENTENCE = {
    "lowell-2026": "Same forecast. Same valid time. The verifying observation changed with the source vintage.",
    "lala-2026": "Same forecast. Same valid time. Here the two source vintages report the same fix, and the residual does not move.",
}[SLUG]
gate("PDF section D states the vintage sentence", tight(VINTAGE_SENTENCE) in pdf_tight)
if SLUG == "lowell-2026":
    gate("PDF section D retains the withdrawal note", tight(WITHDRAWAL) in pdf_tight)

# C. TRACK-RELATIVE LANGUAGE, NOT CARDINAL.
# +cross is defined by the forecast's own track direction. Calling it "east" is a separate
# claim that nothing here computes.
for name, doc in (("PDF", pdf_flat), ("web", web)):
    gate(f"{name}: no cardinal-direction residual claim",
         not re.search(r"(behind and east|east of the forecast)", doc, re.I))
gate("PDF uses right-of-track wording", "right-of-track" in pdf_tight)

# D. THE TIME MODEL IS PROVEN, AND THE RETIRED ONE CANNOT COME BACK.
tm = M["event_manifest"]["time_model"]
gate("time model is nominal_cycle / issued / valid, lead from the cycle",
     "lead = valid - nominal_cycle" in tm["statement"])
gate("cycle origin confirmed on every archived discussion",
     tm["discussions_checked"] >= 20
     and tm["discussions_confirming_cycle_origin"] == tm["discussions_checked"],
     f"{tm['discussions_confirming_cycle_origin']}/{tm['discussions_checked']}")
gate("the three times are separately represented on every record",
     all({"nominal_cycle", "issued", "valid"} <= set(r) for r in M["event_manifest"]["records"]))
_recs = {r["record_id"]: r for r in M["event_manifest"]["records"]}
if SLUG == "lowell-2026":
    gate("both 18Z observation vintages preserved",
         _recs["TCP46A-071744"]["lon"] == -162.1 and _recs["TCM47-072047-prior"]["lon"] == -162.2
         and _recs["TCP46A-071744"]["valid"] == _recs["TCM47-072047-prior"]["valid"] == "2026-09-07T18:00Z")
    gate("special advisory inherits its cycle rather than opening one",
         all(r["nominal_cycle"] == "2026-09-04T12:00Z"
             for r in M["event_manifest"]["records"] if r["record_id"].startswith("TCM34S")))
if SLUG == "lala-2026":
    # BOTH VINTAGES ARE STILL CARRIED WHERE THEY AGREE. An agreement that is only asserted
    # when it is convenient is not a check, so the two records are compared here exactly as
    # they are for Lowell -- and the manifest has to say they matched.
    gate("both 00Z observation vintages preserved and agreeing",
         _recs["TCP14A-160000"]["lon"] == _recs["TCM15-160300-prior"]["lon"] == -155.7
         and _recs["TCP14A-160000"]["valid"] == _recs["TCM15-160300-prior"]["valid"] == "2026-08-16T00:00Z"
         and op["observation_vintages_agree"] is True)
    gate("the verifying hour is synoptic and no off-cycle row is invented",
         op["verifying_valid_time"] == "2026-08-16T00:00Z"
         and "none is interpolated" in op["verifying_time_basis"]
         and all(r["lead_h"] is None or float(r["lead_h"]).is_integer()
                 for r in M["event_manifest"]["records"] if r.get("lead_h") is not None))

# E. PROVENANCE: EVERY DECLARED INPUT EXISTS, IS HASHED, AND IS THE ONE THAT WAS READ.
# This is the gate the hand-off needed and did not have: it declared a Natural Earth file
# it never shipped and never read, while leaving the geometry it did read unhashed.
reg = {s_["file"]: s_ for s_ in M["event_manifest"]["sources"]}
missing = [f.name for f in declared_inputs(EV) if not f.is_file()]
gate("every declared build input exists in the checkout", not missing, ", ".join(missing[:4]))
unhashed = [f.name for f in declared_inputs(EV) if f.name not in reg]
gate("every declared build input is in the source register", not unhashed, ", ".join(unhashed[:4]))
bad = [f.name for f in declared_inputs(EV) if f.name in reg and reg[f.name]["sha256"] != sha256(f)]
gate("every registered hash matches the file on disk", not bad, ", ".join(bad[:4]))
gate("no source is registered that the build does not read",
     not [k for k in reg if k not in {f.name for f in declared_inputs(EV)}])
gate("coastline is the shared repository primitive, not a pipeline-local copy",
     M["event_manifest"]["geometry"]["file"] == "data/genesis-archive/coastlines/hawaii.geojson"
     and not (Path(__file__).parent / "hawaii_land.geojson").exists()
     and bool(M["event_manifest"]["geometry"]["provenance"]))

# F. NO PATHWAY FROM /risk/ TO A TRADING SURFACE.
gate("no trading/betting pathway anywhere in the web note",
     not re.search(r"kalshi|polymarket|edge ?book|\bbet(s|ting|tor)?\b|\bEV-ranked\b|\bmark-to-bid\b", web, re.I))
gate("no trading/betting pathway in the PDF",
     not re.search(r"kalshi|polymarket|edge ?book|\bbet(s|ting|tor)?\b", pdf_text, re.I))

# G. THE LIVE ROUTE.
if OFFLINE:
    gate("canonical URL returns 200 (external-release gate)", None, "SKIPPED (--offline)")
else:
    try:
        code = urllib.request.urlopen(M["canonical_url"], timeout=20).status
    except Exception as e:
        code = getattr(e, "code", str(e))
    gate("canonical URL returns 200 (external-release gate)", code == 200, f"HTTP {code}")

t = subprocess.run([sys.executable, "-m", "pytest", "-q", "tests/"],
                   capture_output=True, text=True, cwd=Path(__file__).parent)
gate("time-model regression tests", t.returncode == 0,
     (t.stdout.strip().splitlines() or ["no output"])[-1])

w = max(len(n) for n, _, _ in results)
for n, ok, d in results:
    print(f"{'SKIP' if ok is None else ('PASS' if ok else 'FAIL')}  {n:<{w}}  {d}")
ran = [r for r in results if r[1] is not None]
skipped = len(results) - len(ran)
failed = [n for n, ok, _ in ran if not ok]
print(f"\n{sum(1 for _, ok, _ in ran if ok)}/{len(ran)} gates pass"
      + (f", {skipped} skipped" if skipped else ""))
sys.exit(1 if failed else 0)
