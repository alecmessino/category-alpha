"""Millibar Trigger Evidence Record — core (event manifest + evaluator).

Time model invariant: nominal_cycle, issued and valid are stored separately and
never derived from one another unless the source product states the relation.
Forecast lead is always valid - nominal_cycle, never valid - issued.
"""
from __future__ import annotations
import hashlib, json, math, re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "risk" / "lowell-ep122026" / "raw"

# The Hawaii coastline is a SHARED REPOSITORY PRIMITIVE, not a pipeline-local file.
#
# The Rev 3 hand-off carried its own pipeline/hawaii_land.geojson: eight unnamed rings,
# no hash in its own manifest, islands picked out by guessing at a centroid longitude
# (`min(polys, key=lambda p: abs(p.centroid.x + 160.154))`), and a build that additionally
# stat'd a raw/ne_10m_land.geojson that was never shipped. That file is not imported here.
#
# data/genesis-archive/coastlines/hawaii.geojson already holds the same Natural Earth
# geometry with the island NAMES attached and a full provenance chain in its SOURCES.json
# (URL, SHA-256, byte count, licence, retrieval time). Its own register records that
# ne_10m_land was inspected, rejected as the geometry source because it carries no name
# fields, and retained as a fidelity control whose Hawaii rings match to 1.1e-13 deg.
#
# That equivalence was re-verified against the hand-off rather than taken on trust: every
# published coastline distance in this record is identical under both files, and the two
# geometries agree to 5.0e-05 deg -- exactly the half-step of this file's 4-decimal
# quantisation, about 0.003 nm. See scripts/risk/tests/test_tec.py.
COASTLINES = ROOT / "data" / "genesis-archive" / "coastlines" / "hawaii.geojson"
COASTLINE_REGISTER = ROOT / "data" / "genesis-archive" / "coastlines" / "SOURCES.json"

NM_PER_DEG = 60.0

MON = {m: i for i, m in enumerate(
    "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(), 1)}


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def stamp_from_name(name: str) -> datetime:
    """Archive file stamp (WMO transmission time), e.g. TCMCP4.202609071451.txt."""
    s = re.search(r"\.(\d{12})\.", name).group(1)
    return datetime.strptime(s, "%Y%m%d%H%M").replace(tzinfo=UTC)


def dd_hhmm(token: str, ref: datetime) -> datetime:
    """'07/1500Z' relative to a reference time in the same or adjacent month."""
    d, hm = token.rstrip("Z").split("/")
    t = ref.replace(day=int(d), hour=int(hm[:2]), minute=int(hm[2:]), second=0, microsecond=0)
    if (t - ref).days > 20:
        t = (t.replace(day=1) - timedelta(days=1)).replace(day=int(d))
    return t


def nominal_cycle_for_release(issued: datetime) -> datetime:
    """The synoptic slot at or before a release. TRUE FOR A SCHEDULED ADVISORY ONLY.

    A 15Z forecast/advisory belongs to the 12Z cycle. A SPECIAL DOES NOT FOLLOW THIS
    RULE and this function must not be used for one -- see nominal_cycle_from_rows.
    Lowell's special advisory 34 was issued 04/1830Z and its companion discussion labels
    the 05/0000Z row 12H, which is +12 h from the 12Z cycle and +6 h from the 18Z slot
    this function would return. A special REISSUES the running cycle with an updated
    initial position; it does not open a new one. Using this function on a special puts
    every lead it emits six hours out, which is the same defect, in the same direction,
    as reading the release hour as forecast hour zero.

    This is NHC convention, and it is NOT a guess about the product:
    the product proves it. Every FORECAST VALID row a TCM prints is filed under a lead
    label (12H, 24H, 36H ...) measured from the nominal cycle, so the labels and the
    explicit UTC valid times reconcile exactly once the origin is the cycle -- and only
    then. `reconcile_lead_labels` below is the check, and it is run over every advisory
    in the archive by the test suite rather than asserted here.

    THIS IS THE DEFECT THE RECORD RETIRES. Treating the 15Z issuance as forecast hour
    zero makes the product's own 12H row look like a nine-hour row, which then reads as
    the label being untrustworthy. Both numbers are correct; they are measured from
    different origins. 08/0000Z is +12 h from the 12Z cycle and +9 h from the 15Z
    initial position, and the forecast lead is the former.
    """
    return issued.replace(hour=issued.hour - issued.hour % 6, minute=0, second=0, microsecond=0)


# Canonical NHC/CPHC forecast lead set, in hours from the nominal cycle.
NHC_LEAD_SET = (12, 24, 36, 48, 60, 72, 96, 120)


def nominal_cycle_from_rows(init_valid: datetime, forecast_valids: list[datetime]) -> datetime:
    """Derive a forecast/advisory's nominal cycle from its own forecast rows.

    A TCM prints no lead labels, but its rows land on the canonical lead set measured
    from the cycle -- and on nothing else. So the cycle is recoverable from the product
    alone: take the 6-hourly slots at or before the initial position, keep those under
    which every row is a canonical lead, and require the answer to be unique.

    This is what makes a special advisory come out right without special-casing it. It
    is also what refuses instead of guessing when a product does not constrain its own
    cycle, which is the behaviour the retired model lacked.
    """
    if not forecast_valids:
        raise Refusal("no forecast rows: nominal cycle is not constrained by this product")
    base = init_valid.replace(minute=0, second=0, microsecond=0)
    base -= timedelta(hours=base.hour % 6)
    fits = []
    for back in range(0, 5):
        c = base - timedelta(hours=6 * back)
        leads = [(v - c).total_seconds() / 3600 for v in forecast_valids]
        if all(abs(l - round(l)) < 1e-9 and round(l) in NHC_LEAD_SET for l in leads) \
                and leads == sorted(leads):
            fits.append(c)
    if len(fits) != 1:
        raise Refusal(
            f"nominal cycle not uniquely determined by the forecast rows "
            f"({len(fits)} candidates); no cycle is assumed.")
    return fits[0]

# The discussion (TCD) prints the forecast table with its LEAD LABELS attached:
#     INIT  07/1500Z 17.5N 162.6W
#      12H  08/0000Z 19.5N 161.7W
# That single pair is the documentary proof of the time model. NHC labels the row 12H
# while printing INIT at 1500Z, which is consistent only if the lead origin is the 12Z
# nominal cycle. Reading the label against the INIT time instead makes it look like a
# nine-hour row filed under a twelve-hour label, and that misreading is the retired
# defect. The forecast/advisory (TCM) itself prints no labels, so a module that reads
# only the TCM never sees the contradiction it is creating.
TCD_ROW_RE = re.compile(r"^\s*(INIT|(\d{1,3})H)\s+(\d{2}/\d{4}Z)", re.M)


def reconcile_lead_labels(tcd_path: Path):
    """Prove a cycle's nominal time from the discussion's own lead labels.

    Returns {issued, cycle, init_valid, rows, ok, from_cycle_ok, from_init_ok}.

    `from_cycle_ok` is True when every labelled row satisfies
    label_h == valid - nominal_cycle. `from_init_ok` is the same test against the
    initial position's valid time, and is reported so the two hypotheses are compared
    rather than one being assumed. `ok` requires the first to hold and the second to
    fail: a product where both held would not discriminate, and would be refused here
    rather than counted as evidence.
    """
    txt = tcd_path.read_text()
    # The discussion stamps itself in LOCAL time ("500 AM HST Mon Sep 07 2026"), so the
    # transmission time comes from the archive filename, which carries it to the minute.
    issued = stamp_from_name(tcd_path.name)
    rows, init_valid = [], None
    for m in TCD_ROW_RE.finditer(txt):
        valid = dd_hhmm(m.group(3), issued)
        if m.group(1) == "INIT":
            init_valid = valid
            continue
        rows.append({"label_h": int(m.group(2)), "valid": _iso(valid),
                     "from_cycle_h": None, "from_init_h": None})
    if not rows or init_valid is None:
        return {"ok": None, "reason": "no labelled forecast table in discussion"}
    # The cycle is derived from the STRUCTURE of the rows (their valid times against the
    # canonical lead set), never from the transmission hour -- transmission runs minutes
    # either side of the slot and must never move the lead origin, and a special advisory
    # is not on the slot at all. The printed labels then CONFIRM the derived cycle, which
    # is what makes this a check rather than a restatement: structure proposes, labels
    # dispose, and the competing initial-position origin is scored alongside it.
    valids = [datetime.strptime(r["valid"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=UTC) for r in rows]
    try:
        cycle = nominal_cycle_from_rows(init_valid, valids)
    except Refusal as e:
        return {"ok": None, "reason": str(e)}
    for r in rows:
        v = datetime.strptime(r["valid"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=UTC)
        r["from_cycle_h"] = (v - cycle).total_seconds() / 3600
    for r in rows:
        v = datetime.strptime(r["valid"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=UTC)
        r["from_init_h"] = (v - init_valid).total_seconds() / 3600
    from_cycle_ok = all(abs(r["from_cycle_h"] - r["label_h"]) < 1e-9 for r in rows)
    from_init_ok = all(abs(r["from_init_h"] - r["label_h"]) < 1e-9 for r in rows)
    return {"transmitted": _iso(issued), "cycle": _iso(cycle), "init_valid": _iso(init_valid),
            "rows": rows, "from_cycle_ok": from_cycle_ok, "from_init_ok": from_init_ok,
            "labels_are_nhc_lead_set": all(r["label_h"] in NHC_LEAD_SET for r in rows),
            "ok": bool(from_cycle_ok and not from_init_ok)}


@dataclass
class Position:
    record_id: str
    product: str          # TCM / TCP / TCA / ATCF-CARQ
    source_file: str
    source_sha256: str
    advisory: str | None
    variant: str          # regular / special / intermediate / aviation / working-best-track
    kind: str             # observation / official_forecast / official_interpolated_forecast
    nominal_cycle: str | None
    issued: str | None
    valid: str
    lat: float
    lon: float            # degrees east (negative = west)
    position_original: str
    vmax_kt: float | None = None
    vmax_original: str | None = None
    pressure_mb: float | None = None
    radii_nm: dict | None = None      # {'64': [NE,SE,SW,NW], ...} original unit nm
    lead_h: float | None = None        # valid - nominal_cycle (hours), forecasts only
    note: str = ""


def _iso(t):
    return t.strftime("%Y-%m-%dT%H:%MZ") if t else None


def _latlon(lat, ns, lon, ew):
    la = float(lat) * (1 if ns == "N" else -1)
    lo = float(lon) * (-1 if ew == "W" else 1)
    return la, lo


RADII_RE = re.compile(r"(64|50|34) KT\.+\s*(\d+)NE\s+(\d+)SE\s+(\d+)SW\s+(\d+)NW")


def parse_tcm(path: Path) -> list[Position]:
    txt = path.read_text()
    h = sha256(path)
    num = re.search(r"(SPECIAL )?FORECAST/ADVISORY NUMBER\s+(\d+)", txt)
    variant = "special" if num.group(1) else "regular"
    adv = num.group(2)
    stamp = stamp_from_name(path.name)
    it = re.search(r"\n(\d{2})(\d{2}) UTC \w{3} (\w{3}) (\d{2}) (\d{4})", txt)
    issued = datetime(int(it.group(5)), MON[it.group(3)], int(it.group(4)),
                      int(it.group(1)), int(it.group(2)), tzinfo=UTC)
    out = []
    c = re.search(r"CENTER LOCATED NEAR\s+([\d.]+)([NS])\s+([\d.]+)([EW]) AT (\d{2}/\d{4}Z)", txt)
    init_valid = dd_hhmm(c.group(5), issued)
    row_valids = [dd_hhmm(m.group(1), issued) for m in re.finditer(
        r"(?:FORECAST|OUTLOOK) VALID (\d{2}/\d{4}Z)", txt)]
    # The cycle comes from the product's own rows. nominal_cycle_for_release is the
    # scheduled-advisory convention and is kept only as a cross-check: where the two
    # disagree the product wins, and a special advisory is exactly where they disagree.
    nominal = nominal_cycle_from_rows(init_valid, row_valids)
    la, lo = _latlon(*c.groups()[:4])
    body = txt[c.end():]
    vm = re.search(r"MAX SUSTAINED WINDS\s+(\d+) KT", body)
    pr = re.search(r"CENTRAL PRESSURE\s+(\d+) MB", body)
    first_fc = body.find("FORECAST VALID")
    radii = {m.group(1): [int(m.group(i)) for i in range(2, 6)]
             for m in RADII_RE.finditer(body[:first_fc if first_fc > 0 else None])}
    out.append(Position(f"TCM{adv}{'S' if variant=='special' else ''}-{stamp:%d%H%M}-cur", "TCM", path.name, h, adv, variant,
                        "observation", _iso(nominal), _iso(issued), _iso(dd_hhmm(c.group(5), issued)),
                        la, lo, f"{c.group(1)}{c.group(2)} {c.group(3)}{c.group(4)}",
                        float(vm.group(1)), f"{vm.group(1)} KT", float(pr.group(1)) if pr else None, radii))
    p = re.search(r"AT (\d{2}/\d{4}Z) CENTER WAS LOCATED NEAR\s+([\d.]+)([NS])\s+([\d.]+)([EW])", txt)
    if p:
        la, lo = _latlon(*p.groups()[1:])
        out.append(Position(f"TCM{adv}{'S' if variant=='special' else ''}-{stamp:%d%H%M}-prior", "TCM", path.name, h, adv, variant,
                            "observation", _iso(nominal), _iso(issued), _iso(dd_hhmm(p.group(1), issued)),
                            la, lo, f"{p.group(2)}{p.group(3)} {p.group(4)}{p.group(5)}",
                            note="prior-position line; may revise an earlier-reported fix"))
    for m in re.finditer(r"(?:FORECAST|OUTLOOK) VALID (\d{2}/\d{4}Z)\s+([\d.]+)([NS])\s+([\d.]+)([EW])(.*?)(?=(?:FORECAST|OUTLOOK) VALID|REQUEST|\$\$|$)", txt, re.S):
        valid = dd_hhmm(m.group(1), issued)
        la, lo = _latlon(*m.groups()[1:5])
        seg = m.group(6)
        v = re.search(r"MAX WIND\s+(\d+) KT", seg)
        rr = {x.group(1): [int(x.group(i)) for i in range(2, 6)] for x in re.finditer(
            r"(64|50|34) KT\.+\s*(\d+)NE\s+(\d+)SE\s+(\d+)SW\s+(\d+)NW", seg)}
        out.append(Position(f"TCM{adv}{'S' if variant=='special' else ''}-{stamp:%d%H%M}-f{valid:%d%H}", "TCM", path.name, h, adv, variant,
                            "official_forecast", _iso(nominal), _iso(issued), _iso(valid), la, lo,
                            f"{m.group(2)}{m.group(3)} {m.group(4)}{m.group(5)}",
                            float(v.group(1)) if v else None, f"{v.group(1)} KT" if v else None,
                            radii_nm=rr or None, lead_h=(valid - nominal).total_seconds() / 3600))
    return out


def parse_tcp(path: Path) -> list[Position]:
    txt = path.read_text()
    m = re.search(r"(Intermediate |Special )?Advisory Number\s+(\w+)", txt)
    if not m:
        return []
    variant = {"Intermediate ": "intermediate", "Special ": "special"}.get(m.group(1) or "", "regular")
    stamp = stamp_from_name(path.name)
    s = re.search(r"SUMMARY OF .*?\.\.\.(\d{2})(\d{2}) UTC", txt)
    valid = stamp.replace(hour=int(s.group(1)), minute=int(s.group(2)))
    if valid > stamp + timedelta(hours=1):
        valid -= timedelta(days=1)
    loc = re.search(r"LOCATION\.\.\.([\d.]+)([NS])\s+([\d.]+)([EW])", txt)
    w = re.search(r"MAXIMUM SUSTAINED WINDS\.\.\.(\d+) MPH", txt)
    pr = re.search(r"CENTRAL PRESSURE\.\.\.(\d+) MB", txt)
    la, lo = _latlon(*loc.groups())
    mph = float(w.group(1))
    cca = re.search(r"PHFO \d{6} (CC[A-Z])", txt)
    why = re.search(r"\n(Corrected [^\n]+)", txt)
    note = "public-product wind is rounded mph; kt conversion is derived"
    if cca:
        note = f"correction {cca.group(1)}: {why.group(1).strip() if why else 'reason not stated'}; supersedes earlier transmission of the same advisory"
    return [Position(f"TCP{m.group(2)}{'-'+cca.group(1) if cca else ''}-{stamp:%d%H%M}", "TCP", path.name, sha256(path), m.group(2), variant,
                     "observation", None, _iso(stamp), _iso(valid), la, lo,
                     f"{loc.group(1)}{loc.group(2)} {loc.group(3)}{loc.group(4)}",
                     mph / 1.15078, f"{int(mph)} MPH", float(pr.group(1)) if pr else None,
                     note=note)]


def _dm(tok: str) -> float:
    # N1810 -> 18 + 10/60 ; W16217 -> -(162 + 17/60)
    hemi, digits = tok[0], tok[1:]
    deg, mins = int(digits[:-2]), int(digits[-2:])
    v = deg + mins / 60
    return -v if hemi in "SW" else v


def parse_tca(path: Path) -> list[Position]:
    txt = path.read_text()
    h = sha256(path)
    adv = re.search(r"ADVISORY NR:\s+\d{4}/0*(\d+)", txt).group(1)
    dtg = re.search(r"DTG:\s+(\d{8})/(\d{4})Z", txt)
    issued = datetime.strptime(dtg.group(1) + dtg.group(2), "%Y%m%d%H%M").replace(tzinfo=UTC)
    nominal = nominal_cycle_for_release(issued)
    out = []
    o = re.search(r"OBS PSN:\s+(\d{2}/\d{4}Z) (N\d+) (W\d+)", txt)
    out.append(Position(f"TCA{adv}-obs", "TCA", path.name, h, adv, "aviation", "observation",
                        _iso(nominal), _iso(issued), _iso(dd_hhmm(o.group(1), issued)),
                        _dm(o.group(2)), _dm(o.group(3)), f"{o.group(2)} {o.group(3)}"))
    for m in re.finditer(r"FCST PSN \+(\d+) HR:\s+(\d{2}/\d{4}Z) (N\d+) (W\d+)\s+FCST MAX WIND \+\d+ HR:\s+(\d+)KT", txt):
        valid = dd_hhmm(m.group(2), issued)
        out.append(Position(f"TCA{adv}-p{m.group(1)}", "TCA", path.name, h, adv, "aviation",
                            "official_interpolated_forecast", _iso(nominal), _iso(issued), _iso(valid),
                            _dm(m.group(3)), _dm(m.group(4)), f"{m.group(3)} {m.group(4)}",
                            float(m.group(5)), f"{m.group(5)}KT", lead_h=(valid - nominal).total_seconds() / 3600,
                            note=f"'+{m.group(1)} HR' label is relative to issuance; lead_h is relative to nominal cycle"))
    return out


def parse_carq(path: Path) -> list[Position]:
    h = sha256(path)
    out, seen = [], set()
    for line in path.read_text().splitlines():
        f = [x.strip() for x in line.split(",")]
        if len(f) < 12 or f[4] != "CARQ" or f[5] != "0" or f[11] != "34":
            continue
        cyc = datetime.strptime(f[2], "%Y%m%d%H").replace(tzinfo=UTC)
        if cyc in seen:
            continue
        seen.add(cyc)
        la = int(f[6][:-1]) / 10 * (1 if f[6][-1] == "N" else -1)
        lo = int(f[7][:-1]) / 10 * (-1 if f[7][-1] == "W" else 1)
        out.append(Position(f"CARQ-{f[2]}", "ATCF-CARQ", path.name, h, None, "working-best-track",
                            "observation", _iso(cyc), None, _iso(cyc), la, lo, f"{f[6]} {f[7]}",
                            float(f[8]), f"{f[8]} KT",
                            note="operational working best track; not the post-season best track"))
    return out


# ---------------- geometry ----------------
def to_xy_nm(lat, lon, lat0, lon0):
    k = math.cos(math.radians((lat + lat0) / 2))
    return ((lon - lon0) * NM_PER_DEG * k, (lat - lat0) * NM_PER_DEG)


def gc_nm(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = 2 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 +
                                math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))
    return math.degrees(d) * NM_PER_DEG


def bearing(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    y = math.sin(lo2 - lo1) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


class Refusal(Exception):
    pass


def residual(forecast: Position, observed: Position, heading_deg: float, heading_basis: str):
    """Along/cross-track decomposition of observed minus forecast.
    Refuses unless the forecast is an official (interpolated) forecast valid at
    exactly the observation's valid time."""
    if forecast.kind not in ("official_forecast", "official_interpolated_forecast"):
        raise Refusal(f"{forecast.record_id} is not an official forecast position")
    if forecast.valid != observed.valid:
        raise Refusal(f"valid times differ: {forecast.valid} vs {observed.valid}")
    if observed.kind != "observation":
        raise Refusal(f"{observed.record_id} is not an observation")
    dx, dy = to_xy_nm(observed.lat, observed.lon, forecast.lat, forecast.lon)
    h = math.radians(heading_deg)
    along = dx * math.sin(h) + dy * math.cos(h)
    cross = dx * math.cos(h) - dy * math.sin(h)   # + = right of track
    return {"forecast": forecast.record_id, "observed": observed.record_id,
            "valid": observed.valid, "heading_deg": round(heading_deg, 1),
            "heading_basis": heading_basis, "along_nm": round(along, 1),
            "cross_nm": round(cross, 1), "total_nm": round(math.hypot(dx, dy), 1)}


def rounding_envelope(forecast: Position, observed: Position, heading_deg: float, step_deg=0.05):
    """Residual range when the observed fix is shifted by +/- its reporting precision."""
    vals = []
    for dla in (-step_deg, 0, step_deg):
        for dlo in (-step_deg, 0, step_deg):
            o = Position(**{**asdict(observed), "lat": observed.lat + dla, "lon": observed.lon + dlo})
            r = residual(forecast, o, heading_deg, "envelope")
            vals.append((r["along_nm"], r["cross_nm"]))
    a = [v[0] for v in vals]; c = [v[1] for v in vals]
    return {"along_nm": [min(a), max(a)], "cross_nm": [min(c), max(c)]}


def load_coastline():
    """The named Hawaii rings, from the shared repository primitive.

    Returns (by_name, all_polys, provenance). Islands are selected BY NAME. The
    hand-off picked them by guessing at a centroid longitude, which is a silent
    failure the moment the geometry is refreshed or a ring is added.
    """
    from shapely.geometry import shape
    land = json.loads(COASTLINES.read_text())
    by_name, polys = {}, []
    for f in land["features"]:
        g = shape(f["geometry"])
        polys.append(g)
        nm = (f.get("properties") or {}).get("name")
        if nm:
            by_name[nm] = g
    for required in ("Niihau", "Kauai"):
        if required not in by_name:
            raise Refusal(f"coastline primitive has no ring named {required!r}: "
                          f"{COASTLINES}. Island selection is by name and is not guessed.")
    return by_name, polys, land.get("provenance", {})


def declared_inputs() -> list[Path]:
    """Every file this build reads. The provenance gate walks exactly this list.

    The hand-off's manifest hashed raw/ne_10m_land.geojson -- a file the build never
    read for geometry and which was not shipped -- while leaving the geometry it DID
    read unhashed. Both failures are structural: a build cannot declare an input it
    does not open, and cannot open an input it does not declare.
    """
    out = sorted(RAW.glob("TCMCP4.*.txt")) + sorted(RAW.glob("TCPCP4.*.txt")) \
        + sorted(RAW.glob("TCAPA4.*.txt")) + sorted(RAW.glob("TCDCP4.*.txt")) \
        + sorted(RAW.glob("PWSCP4.*.txt")) + [RAW / "aep122026.dat"] \
        + [COASTLINES, COASTLINE_REGISTER]
    return out


def load_all() -> list[Position]:
    recs = []
    for p in sorted(RAW.glob("TCMCP4.*.txt")):
        recs += parse_tcm(p)
    for p in sorted(RAW.glob("TCPCP4.*.txt")):
        recs += parse_tcp(p)
    tca = []
    for p in sorted(RAW.glob("TCAPA4.*.txt")):
        if "LOWELL" in p.read_text():
            tca += parse_tca(p)
    # AN AVIATION ADVISORY CARRIES NO CYCLE OF ITS OWN. Its rows are labelled "+3 HR",
    # "+6 HR" relative to issuance, so they place no constraint on the nominal cycle the
    # way a TCM's do. It accompanies a numbered forecast/advisory, so it takes THAT
    # product's derived cycle rather than having one guessed from its release hour --
    # which would be wrong for the special in exactly the same way.
    cycle_by_adv = {}
    for r in recs:
        if r.product == "TCM" and r.advisory and r.nominal_cycle:
            cycle_by_adv.setdefault(r.advisory, r.nominal_cycle)
    for r in tca:
        c = cycle_by_adv.get(r.advisory)
        if c is None:
            r.nominal_cycle, r.lead_h = None, None
            r.note = ((r.note + " ") if r.note else "") + (
                "CYCLE UNRESOLVED: no forecast/advisory with this number is archived, so "
                "no nominal cycle is assumed and no forecast lead is reported.")
            continue
        r.nominal_cycle = c
        if r.kind != "observation":
            v = datetime.strptime(r.valid, "%Y-%m-%dT%H:%MZ").replace(tzinfo=UTC)
            cy = datetime.strptime(c, "%Y-%m-%dT%H:%MZ").replace(tzinfo=UTC)
            r.lead_h = (v - cy).total_seconds() / 3600
    recs += tca
    recs += parse_carq(RAW / "aep122026.dat")
    return recs
