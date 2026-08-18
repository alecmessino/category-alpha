"""get_analogs -- rank historical genesis events against a live disturbance.

THE QUESTION THIS ANSWERS. NHC is watching an area at 12N 140W in August. Of the disturbances
that formed near there, in that season, in comparable environments, what fraction became named
storms? Reached hurricane strength? Made landfall in Hawaii while still a hurricane? How long
did it take them? That is an empirical base rate conditioned on where and when, and it is a
different and more defensible object than either raw climatology or a market price.

WHAT IT DOES NOT DO. It does not forecast. Every number returned is a weighted historical
frequency with its sample size attached. The weighting is declared below and is not fitted to
anything -- there is no tuned parameter in this file, because a tuned analog weight is a model
wearing a base rate's clothes.

FOUR RULES, EACH THERE BECAUSE THE ALTERNATIVE IS A PLAUSIBLE WRONG NUMBER
---------------------------------------------------------------------------
1. RATES ARE REFUSED BELOW `min_sample`. Counts are always returned; a RATE is returned only
   when enough distinct storms support it. Three analogs of which two became hurricanes is not
   "67%", it is three storms. The repo already refuses this way when scoring itself
   (calibrate.mjs: 10 storms before any score), and the same discipline applies here.

2. THE SAMPLE IS STORMS, NOT TRACK POINTS. Every rate below counts distinct storm_ids. A storm
   contributing 60 six-hourly fixes must not count as 60 observations of anything.

3. EFFECTIVE SAMPLE SIZE IS PUBLISHED BESIDE EVERY RATE. Distance weighting means 40 analogs
   can carry the information of 12. Kish's ESS = (sum w)^2 / sum(w^2) makes that visible, and
   the gate in rule 1 is applied to the RAW distinct-storm count, never to the flattering ESS.

4. AN ABSENT OUTCOME IS NOT A ZERO. A storm whose intensity was never recorded is not a storm
   that failed to reach hurricane strength. Unknowns are excluded from a rate's denominator and
   counted separately, so `rate` never quietly means "including the ones we cannot see".

THE WEIGHTING
-------------
    w = w_distance * w_season * w_environment

  w_distance    Gaussian, exp(-0.5 * (d/s)^2), s = radius_km/2, hard-truncated at radius_km.
                A half-radius scale puts the 1-sigma point at the middle of the search circle,
                so the edge of the circle contributes ~14% of a bullseye rather than falling
                off a cliff at the boundary.
  w_season      1.0 when the genesis month is in `season_months`, else the case is excluded
                outright. Months are a filter, not a taper, because the seasonal cycle in
                genesis is not smooth enough near the season edges for a taper to mean anything.
  w_environment 1.0 when no env_vector is supplied. Otherwise exp(-0.5 * dz^2) where dz is the
                Euclidean distance in units of each field's own standard deviation ACROSS THE
                MATCHED POOL -- standardising against the pool rather than the globe keeps a
                field from dominating merely because it has large units.

Environment matching is on whatever fields the caller supplies AND the archive actually has for
that case. A case missing a requested field is not penalised and not excluded; the count of
fields that were actually compared is returned per case, so a "match" on one field out of four
is visibly weaker than a match on four.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

from ..provenance import ARCHIVE_DIR
from ..schema import THRESHOLDS_KT
from ..store import read_table

# to_pylist() on 100k track points is itself expensive enough to dominate a back-test, so the
# row-dict view is cached beside the Arrow table, invalidated by the same identity.
_ROWS_CACHE: dict = {}
_ENTERED_CACHE: dict = {}


def _rows(name: str, base):
    tbl = read_table(name, base)
    key = (name, str(base), id(tbl))
    hit = _ROWS_CACHE.get(name)
    if hit and hit[0] == key:
        return hit[1]
    rows = tbl.to_pylist()
    _ROWS_CACHE[name] = (key, rows)
    return rows

EARTH_R_KM = 6371.0088

# The environment fields an env_vector may key on, mapped to the archive column.
ENV_FIELDS = {
    "shear_kt": "shear_kt",
    "rh_mid_pct": "rh_mid_pct",
    "vort850_1e5": "vort850_1e5",
    "pot_intensity_kt": "pot_intensity_kt",
    "sst_c": "sst_c",
    "gpi": "gpi",
    "ohc_kj_cm2": "ohc_kj_cm2",
}

CATEGORIES = ["td", "ts", "cat1", "cat2", "cat3", "cat4", "cat5"]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance. Handles the antimeridian correctly, which matters here: the
    Central Pacific search box straddles 180 and a naive planar dlon would put a storm at
    179E ten thousand km from one at 179W."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlam = math.radians(_wrap180(lon2 - lon1))
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(min(1.0, math.sqrt(a)))


def _wrap180(lon: float) -> float:
    return ((float(lon) + 180.0) % 360.0) - 180.0


def _storms_entering(subbasins: list[str], base) -> set:
    """Storms that ENTERED any of these subbasins at any point in their life.

    THE TRAP THIS EXISTS TO CLOSE. `storms.subbasin` is the subbasin the storm was in AT
    GENESIS. Filtering Hawaii work on it is wrong in the worst possible way -- quietly, and in
    the direction of a smaller answer. Measured on this archive: 116 storms have a CP genesis,
    but 664 have at least one CP track point. Among the 548 it would discard is INIKI (1992),
    which formed at 134W in the East Pacific and went on to be the most destructive hurricane
    ever to strike Hawaii. A Hawaii base rate computed from CP-genesis storms alone would omit
    the storm every Hawaii question is really about.

    So `subbasins=` means "was ever here", which is what a landfall question actually asks.
    `genesis_subbasins=` is available for the strict genesis-basin question, and is named so it
    cannot be reached for by accident.
    """
    key = (tuple(sorted(subbasins)), str(base))
    hit = _ENTERED_CACHE.get(key)
    if hit is not None:
        return hit
    want = set(subbasins)
    out = {tp["storm_id"] for tp in _rows("track_points", base) if tp.get("subbasin") in want}
    _ENTERED_CACHE[key] = out
    return out


def format_position(lat: float, lon: float) -> str:
    """Human-readable position with hemisphere letters.

    Signed degrees are correct for arithmetic and wrong for reading: a Central Pacific
    disturbance printed as "-140.0E" invites exactly the sign confusion this archive spends
    so much effort avoiding, so every human-facing surface prints hemispheres.
    """
    ns = "N" if lat >= 0 else "S"
    ew = "E" if _wrap180(lon) >= 0 else "W"
    return f"{abs(lat):.1f}{ns} {abs(_wrap180(lon)):.1f}{ew}"


def _pct(values: list[float], q: float) -> float | None:
    """Linear-interpolated quantile. No numpy dependency in the hot path so this module can be
    imported by the daily job without pulling the scientific stack."""
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return float(s[0])
    pos = q * (len(s) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(s) - 1)
    frac = pos - lo
    return float(s[lo] * (1 - frac) + s[hi] * frac)


def wilson_interval(k: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    """Wilson score interval -- published beside every rate.

    Chosen over the textbook normal interval because analog samples are small and outcomes are
    often near 0 or 1, exactly where the normal interval produces bounds outside [0,1] and
    quietly implies a precision the sample cannot support.
    """
    if n <= 0:
        return None
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, centre - half), min(1.0, centre + half))


@dataclass
class AnalogCase:
    storm_id: str
    atcf_id: str | None
    name: str | None
    season: int | None
    basin: str | None
    subbasin: str | None
    genesis_utc: str | None
    genesis_lat: float | None
    genesis_lon: float | None
    genesis_month: int | None
    distance_km: float
    weight: float
    weight_distance: float
    weight_env: float
    env_fields_compared: int
    peak_vmax_kt: float | None
    max_category: str | None
    hours_to_ts: float | None
    hours_to_cat1: float | None
    hours_to_cat3: float | None
    landfalls: list = field(default_factory=list)
    environment: dict = field(default_factory=dict)


@dataclass
class RateResult:
    """A count, and a rate only when the sample earns one."""
    n_storms: int            # denominator: storms whose outcome is KNOWN
    n_unknown: int           # storms excluded because the outcome could not be determined
    count: int               # numerator
    rate: float | None       # None when below min_sample -- see rule 1
    weighted_rate: float | None
    ci95: tuple | None
    refused_reason: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class AnalogResult:
    query: dict
    n_cases: int
    env_unmatched_excluded: int
    effective_sample_size: float
    sufficient: bool
    min_sample: int
    intensity: dict
    landfall: dict
    time_to_event: dict
    track_density: dict
    cases: list
    gaps: list
    provenance: dict

    def as_dict(self) -> dict:
        d = asdict(self)
        d["cases"] = [asdict(c) if not isinstance(c, dict) else c for c in self.cases]
        return d

    def describe(self) -> str:
        """One-screen human summary -- what the CLI and the README print."""
        q = self.query
        out = [
            f"ANALOGS  {format_position(q['lat'], q['lon'])}  r={q['radius_km']:.0f} km"
            f"  months={q.get('season_months') or 'all'}",
            f"  matched {self.n_cases} storms   effective sample {self.effective_sample_size:.1f}"
            f"   {'SUFFICIENT' if self.sufficient else 'BELOW MIN SAMPLE -- rates refused'}",
        ]
        out.append("  intensity outcomes:")
        for cat in CATEGORIES:
            r = self.intensity.get(cat)
            if not r:
                continue
            rate = "n/a" if r["rate"] is None else f"{100*r['rate']:5.1f}%"
            ci = ""
            if r["ci95"]:
                ci = f"  [{100*r['ci95'][0]:.0f}-{100*r['ci95'][1]:.0f}%]"
            out.append(f"    reached {cat:<5s} {r['count']:4d}/{r['n_storms']:<4d} {rate}{ci}")
        if self.landfall:
            out.append("  landfalls:")
            for region, r in sorted(self.landfall.items()):
                rate = "n/a" if r["any"]["rate"] is None else f"{100*r['any']['rate']:.1f}%"
                hrate = ("n/a" if r["hurricane"]["rate"] is None
                         else f"{100*r['hurricane']['rate']:.1f}%")
                out.append(f"    {region:<16s} any {r['any']['count']:3d} ({rate})"
                           f"   >=64kt {r['hurricane']['count']:3d} ({hrate})")
        for k, v in self.time_to_event.items():
            if v and v.get("n"):
                out.append(f"  time to {k}: n={v['n']}  median {v['median']:.0f} h"
                           f"  p25 {v['p25']:.0f}  p75 {v['p75']:.0f}")
        for g in self.gaps:
            out.append(f"  GAP: {g}")
        return "\n".join(out)


def _as_dt(v) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


def _rate(count: int, n_known: int, n_unknown: int, min_sample: int,
          weighted_num: float, weighted_den: float) -> RateResult:
    if n_known < min_sample:
        return RateResult(
            n_storms=n_known, n_unknown=n_unknown, count=count, rate=None,
            weighted_rate=None, ci95=None,
            refused_reason=f"{n_known} storms with a known outcome < min_sample={min_sample}",
        )
    return RateResult(
        n_storms=n_known, n_unknown=n_unknown, count=count,
        rate=count / n_known,
        weighted_rate=(weighted_num / weighted_den) if weighted_den > 0 else None,
        ci95=wilson_interval(count, n_known),
    )


def get_analogs(
    lat: float,
    lon: float,
    radius_km: float = 500.0,
    season_months: list[int] | None = None,
    env_vector: dict | None = None,
    min_sample: int = 10,
    *,
    # keyword-only extensions; the four positional parameters above are the published contract
    archive_dir: Path | None = None,
    as_of: datetime | str | None = None,
    basins: list[str] | None = None,
    subbasins: list[str] | None = None,
    genesis_subbasins: list[str] | None = None,
    exclude_storm_ids: set | None = None,
    include_provisional: bool = False,
    env_require_match: bool = True,
    max_cases: int | None = None,
    track_density_deg: float = 2.0,
) -> AnalogResult:
    """Rank historical genesis events near (lat, lon) and summarise what became of them.

    `as_of` is the zero-peek gate the back-test harness depends on: when set, only storms whose
    GENESIS was strictly before that instant are eligible. Without it a back-test would score a
    2015 disturbance against analogs drawn from 2016-2025, which is not a base rate, it is the
    answer written down in advance.
    """
    base = archive_dir or ARCHIVE_DIR
    gaps: list[str] = []

    genesis = _rows("genesis_events", base)
    storms = {s["storm_id"]: s for s in _rows("storms", base)}
    if not genesis:
        gaps.append("genesis_events table is empty -- the archive has not been built")

    as_of_dt = _as_dt(as_of)
    months = set(season_months) if season_months else None
    excluded = exclude_storm_ids or set()

    # ---- 1. spatial / seasonal / temporal filter -------------------------------------
    matched = []
    for g in genesis:
        sid = g.get("storm_id")
        if sid in excluded:
            continue
        glat, glon = g.get("genesis_lat"), g.get("genesis_lon")
        gt = _as_dt(g.get("genesis_utc"))
        if glat is None or glon is None or gt is None:
            continue                     # no genesis point -> cannot be an analog for one
        if as_of_dt is not None and gt >= as_of_dt:
            continue                     # THE ZERO-PEEK GATE
        if months and gt.month not in months:
            continue
        st = storms.get(sid, {})
        if basins and st.get("basin") not in basins:
            continue
        if genesis_subbasins and st.get("subbasin") not in genesis_subbasins:
            continue
        if subbasins and sid not in _storms_entering(subbasins, base):
            continue
        if st.get("provisional") and not include_provisional:
            continue
        d = haversine_km(lat, lon, glat, glon)
        if d > radius_km:
            continue
        matched.append((g, st, d, gt))

    # ---- 2. environment similarity ---------------------------------------------------
    env_by_storm: dict = {}
    if env_vector:
        wanted = {k: v for k, v in env_vector.items() if k in ENV_FIELDS and v is not None}
        unknown = sorted(set(env_vector) - set(ENV_FIELDS))
        if unknown:
            gaps.append(f"env_vector keys ignored (not in archive): {unknown}")
        env_rows = _rows("environment", base)
        if not env_rows:
            gaps.append("environment table is empty -- env_vector could not be applied")
        # The environment AT GENESIS: the row nearest the genesis time for that storm.
        best: dict = {}
        want_t = {g["storm_id"]: gt for g, _s, _d, gt in matched}
        for r in env_rows:
            sid = r.get("storm_id")
            if sid not in want_t:
                continue
            rt = _as_dt(r.get("iso_time"))
            if rt is None:
                continue
            dt = abs((rt - want_t[sid]).total_seconds())
            if sid not in best or dt < best[sid][0]:
                best[sid] = (dt, r)
        # Genesis-time environment is only meaningful within a synoptic window of genesis.
        env_by_storm = {sid: r for sid, (dt, r) in best.items() if dt <= 12 * 3600}

        # Standardise against the MATCHED POOL, not the globe.
        stats = {}
        for f in wanted:
            col = ENV_FIELDS[f]
            vals = [e[col] for e in env_by_storm.values()
                    if e.get(col) is not None and e[col] == e[col]]
            if len(vals) >= 3:
                mu = sum(vals) / len(vals)
                var = sum((v - mu) ** 2 for v in vals) / (len(vals) - 1)
                sd = math.sqrt(var)
                if sd > 0:
                    stats[f] = sd
        missing_sd = sorted(set(wanted) - set(stats))
        if missing_sd:
            gaps.append(
                f"env fields with too few archived values to standardise, ignored: {missing_sd}")

    # ---- 3. weights ------------------------------------------------------------------
    scale = max(radius_km / 2.0, 1e-6)
    cases: list[AnalogCase] = []
    for g, st, d, gt in matched:
        sid = g["storm_id"]
        w_dist = math.exp(-0.5 * (d / scale) ** 2)
        w_env, compared = 1.0, 0
        if env_vector:
            e = env_by_storm.get(sid)
            if e:
                acc = 0.0
                for f, target in env_vector.items():
                    if f not in ENV_FIELDS or target is None:
                        continue
                    sd = (stats or {}).get(f)
                    val = e.get(ENV_FIELDS[f])
                    if sd is None or val is None or val != val:
                        continue
                    acc += ((val - float(target)) / sd) ** 2
                    compared += 1
                if compared:
                    w_env = math.exp(-0.5 * acc / compared)  # per-field mean keeps the
                                                             # weight comparable across cases
                                                             # that matched different counts
        cases.append(AnalogCase(
            storm_id=sid, atcf_id=g.get("atcf_id") or st.get("atcf_id"),
            name=st.get("name"), season=g.get("season") or st.get("season"),
            basin=st.get("basin"), subbasin=st.get("subbasin"),
            genesis_utc=gt.isoformat(), genesis_lat=g.get("genesis_lat"),
            genesis_lon=g.get("genesis_lon"), genesis_month=gt.month,
            distance_km=d, weight=w_dist * w_env, weight_distance=w_dist, weight_env=w_env,
            env_fields_compared=compared,
            peak_vmax_kt=g.get("peak_vmax_kt") if g.get("peak_vmax_kt") is not None
            else st.get("max_vmax_kt"),
            max_category=st.get("max_category"),
            hours_to_ts=g.get("hours_to_ts"), hours_to_cat1=g.get("hours_to_cat1"),
            hours_to_cat3=g.get("hours_to_cat3"),
            environment=({k: env_by_storm.get(sid, {}).get(v)
                          for k, v in ENV_FIELDS.items()} if env_by_storm.get(sid) else {}),
        ))

    # AN UNKNOWN ENVIRONMENT IS NOT A PERFECT MATCH.
    #
    # A case with no archived environment near its genesis has env_fields_compared == 0. Left
    # at weight 1.0 it does not merely survive an environment-conditioned query -- it WINS it,
    # ranking above every case whose environment was actually measured and found similar, and
    # then dominating the weighted rate. Measured here before the fix: a deliberately hostile
    # env_vector returned the four highest-weighted analogs all with fields=0, i.e. the answer
    # to "which storms formed in an environment like this one" was four storms whose
    # environment is unknown. That is the exact failure this archive exists to refuse.
    #
    # So when an env_vector is supplied, cases that cannot be compared are EXCLUDED and
    # counted, and the count is reported as a gap. Pass env_require_match=False to keep the
    # older behaviour deliberately, in which case they are kept at a neutral weight and the
    # gap says so.
    env_unmatched = 0
    if env_vector:
        unmatched = [c for c in cases if c.env_fields_compared == 0]
        env_unmatched = len(unmatched)
        if env_unmatched:
            if env_require_match:
                cases = [c for c in cases if c.env_fields_compared > 0]
                gaps.append(
                    f"{env_unmatched} of {env_unmatched + len(cases)} positional analogs have "
                    "no archived environment within 12h of genesis and were EXCLUDED from this "
                    "environment-conditioned query (SHIPS begins 1982 and ends 2023). Pass "
                    "env_require_match=False to keep them at a neutral weight instead.")
            else:
                gaps.append(
                    f"{env_unmatched} analogs have no archived environment and are kept at a "
                    "neutral weight (env_require_match=False): their similarity to the supplied "
                    "env_vector is UNKNOWN, not established.")

    cases.sort(key=lambda c: -c.weight)
    if max_cases:
        cases = cases[:max_cases]

    ids = {c.storm_id for c in cases}
    wsum = sum(c.weight for c in cases)
    wsq = sum(c.weight ** 2 for c in cases)
    ess = (wsum * wsum / wsq) if wsq > 0 else 0.0

    # ---- 4. landfalls for the matched storms -----------------------------------------
    lf_rows = [r for r in _rows("landfalls", base) if r.get("storm_id") in ids]
    if not lf_rows and ids:
        gaps.append("no landfall rows for the matched storms -- check the landfalls table")
    by_storm: dict = {}
    for r in lf_rows:
        by_storm.setdefault(r["storm_id"], []).append(r)
    for c in cases:
        c.landfalls = [
            {"region": r.get("region"), "sub_region": r.get("sub_region"),
             "landfall_utc": str(r.get("landfall_utc")), "vmax_kt": r.get("vmax_kt"),
             "category": r.get("category"),
             "hurricane": bool(r.get("hurricane_at_landfall")),
             "detection": r.get("detection"),
             "suspect_relocation": bool(r.get("suspect_relocation"))}
            for r in by_storm.get(c.storm_id, [])
        ]

    # ---- 5. intensity outcomes -------------------------------------------------------
    intensity = {}
    for cat in CATEGORIES:
        thr = THRESHOLDS_KT[cat]
        num = den = unknown = 0
        wnum = wden = 0.0
        for c in cases:
            v = c.peak_vmax_kt
            if v is None or v != v:
                unknown += 1          # RULE 4: unknown is not a failure
                continue
            den += 1
            wden += c.weight
            if v >= thr:
                num += 1
                wnum += c.weight
        intensity[cat] = _rate(num, den, unknown, min_sample, wnum, wden).as_dict()

    # ---- 6. landfall rates by region -------------------------------------------------
    regions = sorted({r.get("region") for r in lf_rows if r.get("region")})
    landfall = {}
    for region in regions:
        any_n = hur_n = 0
        w_any = w_hur = 0.0
        for c in cases:
            hits = [l for l in c.landfalls
                    if l["region"] == region and not l["suspect_relocation"]]
            if hits:
                any_n += 1
                w_any += c.weight
            if any(h["hurricane"] for h in hits):
                hur_n += 1
                w_hur += c.weight
        landfall[region] = {
            "any": _rate(any_n, len(cases), 0, min_sample, w_any, wsum).as_dict(),
            "hurricane": _rate(hur_n, len(cases), 0, min_sample, w_hur, wsum).as_dict(),
        }

    # ---- 7. time-to-event distributions ----------------------------------------------
    def dist(vals: list[float]) -> dict:
        vals = [v for v in vals if v is not None and v == v]
        return {"n": len(vals), "p10": _pct(vals, .10), "p25": _pct(vals, .25),
                "median": _pct(vals, .50), "p75": _pct(vals, .75), "p90": _pct(vals, .90)}

    time_to_event = {
        "ts": dist([c.hours_to_ts for c in cases]),
        "cat1": dist([c.hours_to_cat1 for c in cases]),
        "cat3": dist([c.hours_to_cat3 for c in cases]),
    }
    for region in regions:
        hrs = []
        for c in cases:
            gt = _as_dt(c.genesis_utc)
            for l in c.landfalls:
                if l["region"] != region or l["suspect_relocation"]:
                    continue
                lt = _as_dt(l["landfall_utc"])
                if gt and lt:
                    hrs.append((lt - gt).total_seconds() / 3600.0)
        time_to_event[f"landfall_{region}"] = dist(hrs)

    # ---- 8. track density ------------------------------------------------------------
    density: dict = {}
    if ids:
        step = track_density_deg
        seen_cell_storm = set()
        for tp in _rows("track_points", base):
            sid = tp.get("storm_id")
            if sid not in ids:
                continue
            la, lo = tp.get("lat"), tp.get("lon")
            if la is None or lo is None:
                continue
            cell = (math.floor(la / step) * step, math.floor(_wrap180(lo) / step) * step)
            key = f"{cell[0]:.1f},{cell[1]:.1f}"
            # count each storm ONCE per cell: otherwise a slow-moving storm outvotes a fast one
            if (key, sid) in seen_cell_storm:
                continue
            seen_cell_storm.add((key, sid))
            density[key] = density.get(key, 0) + 1

    n_cases = len(cases)
    return AnalogResult(
        query={"lat": lat, "lon": lon, "radius_km": radius_km,
               "season_months": season_months, "env_vector": env_vector,
               "as_of": as_of_dt.isoformat() if as_of_dt else None,
               "basins": basins, "subbasins": subbasins,
               "genesis_subbasins": genesis_subbasins,
               "include_provisional": include_provisional},
        n_cases=n_cases,
        env_unmatched_excluded=env_unmatched,
        effective_sample_size=ess,
        sufficient=n_cases >= min_sample,
        min_sample=min_sample,
        intensity=intensity,
        landfall=landfall,
        time_to_event=time_to_event,
        track_density=density,
        cases=cases,
        gaps=gaps,
        provenance={"archive_dir": str(base), "track_density_deg": track_density_deg},
    )
