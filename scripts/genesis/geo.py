"""Coastline geometry, and a landfall test that refuses to believe a straight line.

WHAT THIS MODULE IS FOR. HURDAT2 publishes an 'L' record at the moment NHC's post-storm
analysts judged the centre crossed a coast. That is the primary landfall record and this
module does not replace it. It exists for everything HURDAT2's 'L' does not cover:
IBTrACS-only storms, foreign best tracks, forecast track members from the a-deck, and the
Central Pacific, where the archive's immediate question is "which ISLAND" and no source
publishes a per-island landfall flag at all.

THE TRAP THIS MODULE EXISTS TO AVOID, from docs/PLAN-TRACK-MODEL.md, from a real incident
on this project: a 6-hourly track cannot tell a physical traverse from a CENTRE
RELOCATION. Seven of nine "landfall" members in one live cycle crossed an island only
because the straight line between two 6-hourly points cut it, implying 15-19 kt against a
storm that was actually moving 7-8 kt. A centre that dissipates east of an island and
reforms west of it did not make landfall; the analyst moved the dot. Nothing in the
geometry can distinguish the two cases, so the geometry must not pretend to. Every
crossing this module returns carries:

    implied_speed_kt      how fast the leg says the centre moved
    suspect_relocation    True when that speed is out of character for THIS storm
    closest_approach_km   how close a PUBLISHED fix actually got to the landmass

and the caller decides. Flagged, never silently dropped: a dropped row is a claim that
the crossing did not happen, which is exactly as strong an assertion as counting it.

WHY closest_approach_km IS MEASURED FROM THE BRACKETING FIXES ONLY. It is the distance
from the two published fixes on either side of the crossing to the landmass -- not from
the interpolated path, which is zero by construction, and not from the whole track, which
would let a genuine hit six hours later hide the artefact. A `segment_crossing` whose
nearest published centre was 45 km offshore is a straight line's opinion, not a landfall.

DETECTION KINDS, and the honesty rule behind each:
  bracketing_fix    a PUBLISHED fix is itself inside the polygon. Position, time, wind
                    and pressure are that fix's own published values, unmodified. The
                    reported position is therefore slightly INLAND of the true coastline
                    intercept. That is deliberate: a real published position a few km
                    inland is worth more than a plausible-looking coordinate this code
                    invented, and `quality` downstream stays 'observed'.
  segment_crossing  both bracketing fixes are over water and the great-circle segment
                    between them cut the polygon. Position is the coastline intercept and
                    wind/pressure are linearly interpolated between the fixes. This row is
                    DERIVED. If either bracketing fix has no wind value the interpolated
                    wind is None -- it is never back-filled from the other end.

VENDORED GEOMETRY, AND WHY IT IS NOT ne_10m_land.
The obvious source is Natural Earth 10m land (ne_10m_land.json). It was fetched and
inspected: 10 features, 3 properties each -- featurecla, min_zoom, scalerank. **It carries
no names at all.** It cannot answer "which island", which is the only question the Hawaii
use case asks. So the geometry here comes from the Natural Earth 10m ADMIN layers, which
carry the same coastline with names attached. That claim was verified rather than assumed:
the eight main-Hawaiian-island rings in `ne_10m_admin_1_states_provinces` are identical to
the eight rings inside the Hawaii bounding box in `ne_10m_land` -- same vertex counts
(149/121/105/102/56/31/24/17), same bounding boxes, and a maximum per-coordinate
difference of 1.1e-13 degrees, i.e. float round-trip noise. No coastline fidelity was
traded for the names.

REGIONS, and the exact published attribute that defines each. No region boundary in this
file was drawn by hand:
  hawaii           admin_1: admin='United States of America', name='Hawaii'
  conus            admin_1: admin='United States of America', name not in {Alaska, Hawaii}
  mexico           admin_1: admin='Mexico'
  central_america  admin_0 map units: SUBREGION='Central America', GEOUNIT != 'Mexico'
  caribbean        admin_0 map units: SUBREGION='Caribbean'
Natural Earth files Mexico under SUBREGION='Central America'; the archive needs them apart,
so Mexico is lifted out by name and given the finer admin_1 (state) geometry. Central
America and the Caribbean keep country resolution because for those countries the country
IS the useful landfall unit.

ISLAND NAMES COME FROM USGS GNIS, NOT FROM THIS CODE. Natural Earth's Hawaii feature is a
MultiPolygon of 14 unnamed polygons. Each of the eight main islands is labelled by taking
the USGS GNIS Domestic Names record of feature_class 'Island' whose own published primary
coordinate falls inside that polygon. All eight resolve to exactly one polygon each, and to
eight distinct polygons -- checked, not assumed. The remaining six polygons are the
Northwestern Hawaiian Islands; one (Lisianski Island) resolves uniquely, five do not and
are published with name=None. They are a recorded GAP, not a guess: see
`data/genesis-archive/coastlines/*.geojson` -> provenance.gaps.

Names are stored twice: `name_official` verbatim as the source publishes it (Oʻahu,
Kahoʻolawe, Michoacán) and `name` ASCII-folded (Oahu, Kahoolawe, Michoacan) because that
is what a human types into a DuckDB WHERE clause. The fold is mechanical -- NFKD, drop
combining marks, drop the ʻokina -- and the official form is preserved beside it, so
nothing is lost.

PURE GEOMETRY AT QUERY TIME. numpy only, no network, no clock. `build_coastlines()` is the
only function that touches the network and it is never called at import.
"""

from __future__ import annotations

import json
import math
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from genesis.provenance import ARCHIVE_DIR, PROCESSING_VERSION, Gap, SourceRecord, fetch

COASTLINE_DIR = ARCHIVE_DIR / "coastlines"

# IUGG mean Earth radius. Every distance here is a spherical one. The ellipsoidal error is
# under 0.5%, i.e. ~1 km in 200 km, which is an order of magnitude below the positional
# uncertainty of a best-track fix (NHC quotes tens of km for pre-satellite seasons). Using
# a datum-correct geodesic would add a dependency and change no answer this archive gives.
EARTH_RADIUS_KM = 6371.0088
KM_PER_DEG = EARTH_RADIUS_KM * math.pi / 180.0  # 111.1949... km per degree of latitude
KM_PER_NM = 1.852  # exact, by SI definition of the international nautical mile

# The great-circle path between two fixes is sampled at this spacing and each sample pair
# is then treated as a straight segment for edge intersection. At 5 km the chord-versus-arc
# departure is under ~5 m, which is three orders of magnitude finer than the coastline
# itself (Natural Earth 10m resolves a few hundred metres). Making this smaller costs time
# and buys nothing.
GC_STEP_KM = 5.0

# Bounding-box margin when selecting which polygons a leg could possibly touch. A
# great-circle leg bows outside the lat/lon box of its endpoints; for the longest leg this
# archive will ever see (6 h at 60 kt = 667 km) that bow is ~3.5 km. 0.1 deg (~11 km)
# covers it with room to spare, and the check is also what makes the antimeridian handling
# safe (see _poly_xy).
BBOX_MARGIN_DEG = 0.1

# --- the relocation guard -------------------------------------------------------------
# A leg is suspect when its implied translation speed is out of character for the storm
# that flew it. Two independent tests, because each catches a case the other misses:
#
#   the absolute cap (`max_implied_speed_kt`, caller-tunable, default 40 kt) catches a
#   relocation in a track so short or so noisy that there is no reliable "own speed";
#
#   the ratio test catches the case from the real incident, which the absolute cap does
#   NOT see: 15-19 kt is a perfectly ordinary tropical-cyclone translation speed and sails
#   under any fixed threshold. It is only suspect relative to the 7-8 kt the same storm was
#   doing on every neighbouring leg. 15/8 = 1.9, so the ratio has to sit below that to fire.
RELOCATION_SPEED_RATIO = 1.75
# ...but not on legs slow enough that fix-position rounding dominates. A storm crawling at
# 3 kt whose next fix is rounded to the nearest 0.1 deg can "double" its speed on noise.
RELOCATION_FLOOR_KT = 10.0
# Legs used either side of the crossing to establish the storm's own speed. Median, not
# mean: if two of nine legs are relocations, the median ignores them and the mean does not.
RELOCATION_WINDOW_LEGS = 3

# --- build-time sources ---------------------------------------------------------------

NE_BASE = "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m"

# licence, verbatim in spirit and cited by URL, for each vendored source.
_NE_LICENCE = (
    "Public domain. Natural Earth: 'All versions of Natural Earth raster + vector map data "
    "found on this website are in the public domain. You may use the maps in any manner, "
    "including modifying the content and design, electronic dissemination, and offset "
    "printing.'"
)
_NE_LICENCE_URL = "https://www.naturalearthdata.com/about/terms-of-use/"
_GNIS_LICENCE = (
    "Public domain. A work of the United States Geological Survey / U.S. Board on "
    "Geographic Names; U.S. Government works are not subject to copyright."
)
_GNIS_LICENCE_URL = "https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map"

SOURCES = {
    "ne_10m_admin_1_states_provinces.json": {
        "url": NE_BASE + "/cultural/ne_10m_admin_1_states_provinces.json",
        "licence": _NE_LICENCE,
        "licence_url": _NE_LICENCE_URL,
        "note": "Natural Earth 10m admin-1 states/provinces, via the martynafford GeoJSON "
                "conversion of the official shapefiles. Supplies US state and Mexican state "
                "coastlines with names.",
    },
    "ne_10m_admin_0_map_units.json": {
        "url": NE_BASE + "/cultural/ne_10m_admin_0_map_units.json",
        "licence": _NE_LICENCE,
        "licence_url": _NE_LICENCE_URL,
        "note": "Natural Earth 10m admin-0 MAP UNITS, not admin_0_countries. The countries "
                "layer folds Guadeloupe and Martinique into a single 'France' feature with "
                "SUBREGION='Western Europe', which would have silently dropped two real "
                "Caribbean hurricane targets. Map units split them out.",
    },
    "gnis.DomesticNames_HI_Text.zip": {
        "url": "https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/"
               "DomesticNames/DomesticNames_HI_Text.zip",
        "licence": _GNIS_LICENCE,
        "licence_url": _GNIS_LICENCE_URL,
        "note": "USGS GNIS Domestic Names, Hawaii. The only source in this build that "
                "publishes the individual island names.",
    },
    # Fetched, inspected, and NOT used for geometry -- recorded so the decision is auditable.
    "ne_10m_land.json": {
        "url": NE_BASE + "/physical/ne_10m_land.json",
        "licence": _NE_LICENCE,
        "licence_url": _NE_LICENCE_URL,
        "note": "Natural Earth 10m land. Inspected and rejected as the geometry source: it "
                "carries no name fields (featurecla/min_zoom/scalerank only). Retained as "
                "the fidelity control -- its Hawaii rings match the admin_1 rings used here "
                "to 1.1e-13 deg.",
    },
}

# The eight main Hawaiian islands, spelled EXACTLY as USGS GNIS publishes feature_name.
# This is an allow-list, not a naming: the strings are the source's, and the build asserts
# each one is present in the file and lands inside exactly one distinct polygon. An
# allow-list is unavoidable because GNIS also publishes an Island-class feature literally
# named "Hawaiian Islands" whose primary point sits on Molokaʻi -- no automatic rule picks
# "Molokaʻi" over it, so the choice is made explicitly and in the open.
GNIS_MAIN_HAWAIIAN_ISLANDS = (
    "Island of Hawaiʻi",
    "Maui",
    "Oʻahu",
    "Kauaʻi",
    "Molokaʻi",
    "Lānaʻi",
    "Niʻihau",
    "Kahoʻolawe",
)

# 4 decimal places = 11 m at the equator. Natural Earth 10m resolves a few hundred metres,
# so this discards nothing real and roughly halves the committed bytes.
COORD_DP = 4

REGIONS = ("hawaii", "conus", "mexico", "central_america", "caribbean")


# =====================================================================================
# pure geometry
# =====================================================================================

def _wrap180(x):
    """Fold a longitude difference into [-180, 180). Vectorised over numpy arrays."""
    return (x + 180.0) % 360.0 - 180.0


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres (haversine, spherical Earth).

    Haversine rather than the law of cosines because the law of cosines loses precision
    for short separations -- and short separations are the whole point here: a 6-hourly
    fix pair 30 km apart is exactly the case that decides whether a crossing is a traverse
    or a relocation.
    """
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = p2 - p1
    dlam = math.radians(_wrap180(lon2 - lon1))
    a = math.sin(dphi / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def _unit(lat, lon):
    p = math.radians(lat)
    l = math.radians(lon)
    cp = math.cos(p)
    return np.array([cp * math.cos(l), cp * math.sin(l), math.sin(p)])


def _gc_interp(lat1, lon1, lat2, lon2, fracs):
    """Points along the great circle from 1 to 2 at the given fractions.

    Spherical linear interpolation of the two position vectors. NOT linear interpolation
    of lat/lon, which drifts off the great circle by kilometres on a 600 km leg and would
    put a coastline intercept on the wrong side of an island.
    """
    fracs = np.asarray(fracs, dtype=float)
    v1 = _unit(lat1, lon1)
    v2 = _unit(lat2, lon2)
    dot = float(np.clip(np.dot(v1, v2), -1.0, 1.0))
    theta = math.acos(dot)
    if theta < 1e-12:  # coincident fixes: every fraction is the same point
        v = np.repeat(v1[None, :], fracs.size, axis=0)
    else:
        s = math.sin(theta)
        a = np.sin((1.0 - fracs) * theta) / s
        b = np.sin(fracs * theta) / s
        v = a[:, None] * v1[None, :] + b[:, None] * v2[None, :]
    lat = np.degrees(np.arcsin(np.clip(v[:, 2], -1.0, 1.0)))
    lon = np.degrees(np.arctan2(v[:, 1], v[:, 0]))
    return lat, lon


def _poly_xy(poly, lons, lats):
    """Project query longitudes into the polygon's own wrapped frame.

    ANTIMERIDIAN. Every polygon stores a reference longitude (its first vertex) and all of
    its own vertices as `wrap180(lon - ref)`. A polygon straddling +/-180 therefore has
    ordinary small offsets rather than a 360-degree jump across the middle of its ring, and
    ray casting works on it unmodified. The only way this can misfire is a query point more
    than 180 degrees from the reference, which wraps to the far side -- and such a point is
    always outside the polygon's bounding box, so the bbox test in `_candidates` /
    `_contains` rejects it before the ray cast is ever reached. The bbox test is a
    correctness component here, not an optimisation.
    """
    return _wrap180(np.asarray(lons, dtype=float) - poly["ref_lon"]), np.asarray(lats, dtype=float)


def _inside(poly, px, py):
    """Even-odd ray casting, vectorised over query points. px/py in the polygon's frame.

    HOLES ARE FREE. Casting the ray across every ring of the polygon -- outer boundary and
    interior holes alike -- and taking the parity of the total crossing count is already
    correct for holes: a point inside a lake crosses the outer ring once and the lake ring
    once, an even number, so it reports outside. There is no separate hole branch to get
    wrong. (Natural Earth's admin polygons do carry holes -- enclaves and inland water.)

    The `(y > py) != (y1 > py)` half-open comparison is what stops a vertex that lies
    exactly on the ray from being counted twice, which is the classic way this algorithm
    reports a point on a coastline as being on both sides of it.
    """
    px = np.atleast_1d(px)
    py = np.atleast_1d(py)
    inside = np.zeros(px.shape, dtype=bool)
    for x, y, x1, y1 in poly["rings"]:
        cond = (y[None, :] > py[:, None]) != (y1[None, :] > py[:, None])
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = x[None, :] + (py[:, None] - y[None, :]) * ((x1 - x)[None, :]) / ((y1 - y)[None, :])
        hit = cond & (xint > px[:, None])
        inside ^= (hit.sum(axis=1) % 2).astype(bool)
    return inside


def _contains(poly, lat, lon):
    x0, y0, x1, y1 = poly["bbox"]
    px, py = _poly_xy(poly, [lon], [lat])
    if not (x0 <= px[0] <= x1 and y0 <= py[0] <= y1):
        return False
    return bool(_inside(poly, px, py)[0])


def _segment_hits(poly, path_lat, path_lon):
    """Fractions along a densified path at which it crosses any edge of the polygon.

    The path arrives already sampled on the great circle, so each consecutive sample pair
    is a straight segment to within ~5 m and the intersection is solved exactly in the
    plane: for segment P0->P1 and edge Q0->Q1, with r = P1-P0 and s = Q1-Q0,

        t = ((Q0-P0) x s) / (r x s)      u = ((Q0-P0) x r) / (r x s)

    and the two cross iff the denominator is non-zero and both parameters lie in [0,1].
    Parallel and collinear pairs (denominator zero) are skipped: they are measure-zero
    against real coastline data and treating them as crossings would double-count a leg
    that runs along an edge.

    Returns fractions of the WHOLE leg, i.e. (sub-segment index + t) / n_sub.
    """
    px, py = _poly_xy(poly, path_lon, path_lat)
    p0x, p0y = px[:-1], py[:-1]
    rx, ry = px[1:] - px[:-1], py[1:] - py[:-1]
    n_sub = rx.size
    if n_sub == 0:
        return []

    # Only edges whose bbox meets the leg's bbox can be hit. On a CONUS-sized polygon this
    # is the difference between 2,300 edges and a dozen.
    lx0, lx1 = px.min() - 1e-6, px.max() + 1e-6
    ly0, ly1 = py.min() - 1e-6, py.max() + 1e-6

    out = []
    for x, y, x1, y1 in poly["rings"]:
        ex0 = np.minimum(x, x1)
        ex1 = np.maximum(x, x1)
        ey0 = np.minimum(y, y1)
        ey1 = np.maximum(y, y1)
        keep = (ex1 >= lx0) & (ex0 <= lx1) & (ey1 >= ly0) & (ey0 <= ly1)
        if not keep.any():
            continue
        qx, qy = x[keep], y[keep]
        sx, sy = (x1 - x)[keep], (y1 - y)[keep]
        denom = rx[:, None] * sy[None, :] - ry[:, None] * sx[None, :]
        wx = qx[None, :] - p0x[:, None]
        wy = qy[None, :] - p0y[:, None]
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (wx * sy[None, :] - wy * sx[None, :]) / denom
            u = (wx * ry[:, None] - wy * rx[:, None]) / denom
        ok = (denom != 0.0) & (t >= 0.0) & (t <= 1.0) & (u >= 0.0) & (u <= 1.0)
        if not ok.any():
            continue
        idx = np.nonzero(ok)
        out.extend(((idx[0] + t[ok]) / n_sub).tolist())
    return out


def _distance_to_poly_km(poly, lat, lon):
    """Great-circle distance from a point to the nearest point of a polygon; 0.0 inside.

    The nearest edge point is located in a local equirectangular plane centred on the query
    latitude, then the FINAL number is a haversine to that located point. So the
    approximation only ever picks which point is nearest -- it never reports an
    approximate distance. Picking a very slightly wrong nearest point on a 200 km
    near-miss changes the answer by centimetres.
    """
    if _contains(poly, lat, lon):
        return 0.0
    kx = KM_PER_DEG * math.cos(math.radians(lat))
    px, py = _poly_xy(poly, [lon], [lat])
    px = float(px[0])
    py = float(py[0])
    best = float("inf")
    best_pt = None
    for x, y, x1, y1 in poly["rings"]:
        ax = (x - px) * kx
        ay = (y - py) * KM_PER_DEG
        bx = (x1 - px) * kx
        by = (y1 - py) * KM_PER_DEG
        vx, vy = bx - ax, by - ay
        vv = vx * vx + vy * vy
        with np.errstate(divide="ignore", invalid="ignore"):
            u = np.where(vv > 0, -(ax * vx + ay * vy) / np.where(vv > 0, vv, 1.0), 0.0)
        u = np.clip(u, 0.0, 1.0)
        cx = ax + u * vx
        cy = ay + u * vy
        d2 = cx * cx + cy * cy
        j = int(np.argmin(d2))
        if d2[j] < best:
            best = float(d2[j])
            # back to lon/lat by interpolating the edge in the polygon's frame
            best_pt = (float(x[j] + u[j] * (x1[j] - x[j])), float(y[j] + u[j] * (y1[j] - y[j])))
    if best_pt is None:
        return float("nan")
    return distance_km(lat, lon, best_pt[1], _wrap180(poly["ref_lon"] + best_pt[0]))


# =====================================================================================
# loading
# =====================================================================================

def load_regions(paths=None) -> dict:
    """Load the vendored coastline GeoJSON into `{region: [(name, rings), ...]}`.

    `rings` is a list of numpy arrays of shape (n, 2), columns [lon, lat]; element 0 is the
    outer boundary and any further elements are holes. One entry per POLYGON, not per
    feature: a state or country that is a MultiPolygon arrives as several entries sharing
    a name, which is what makes per-island Hawaii work and what lets the crossing test
    reject whole landmasses on a bounding box.

    `name` is None where the source published no name for that polygon -- five
    Northwestern Hawaiian Islands and one unnamed Mexican reef. That is a recorded gap, not
    a defect, and `point_region` will return (region, None) there rather than guessing.

    `paths` accepts None (the committed directory), a directory, a single file, a list of
    files, or a {region: path} mapping.

    Raises FileNotFoundError if nothing is there. It does NOT fall back to a built-in
    outline: an archive that silently answers landfall questions from a hard-coded box is
    worse than one that refuses to answer.
    """
    files: dict[str, Path] = {}
    if paths is None:
        paths = COASTLINE_DIR
    if isinstance(paths, dict):
        files = {str(k): Path(v) for k, v in paths.items()}
    else:
        if isinstance(paths, (str, Path)):
            p = Path(paths)
            cand = sorted(p.glob("*.geojson")) if p.is_dir() else [p]
        else:
            cand = [Path(x) for x in paths]
        for f in cand:
            files[f.stem] = f

    if not files:
        raise FileNotFoundError(
            "no coastline GeoJSON found under %s -- run `python3 -m genesis.geo --build` "
            "(needs network) to vendor it" % COASTLINE_DIR
        )

    regions: dict[str, list] = {}
    for key, path in sorted(files.items()):
        if not path.exists():
            raise FileNotFoundError("coastline file missing: %s" % path)
        doc = json.loads(path.read_text())
        for feat in doc.get("features", []):
            props = feat.get("properties") or {}
            region = props.get("region") or key
            name = props.get("name")
            geom = feat["geometry"]
            polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
            for poly in polys:
                rings = [np.asarray(r, dtype=float) for r in poly if len(r) >= 4]
                if rings:
                    regions.setdefault(region, []).append((name, rings))
    if not regions:
        raise FileNotFoundError("coastline files under %s contain no polygons" % COASTLINE_DIR)
    return regions


# The index (wrapped-frame vertex arrays + bounding boxes) is derived, not authored, so
# rebuilding it is always safe -- it is cached only to keep a per-track-point call from
# re-walking 70,000 vertices. Keyed on object identity, and the regions object itself is
# held so an id can never be recycled underneath the cache. Mutate a regions dict in place
# after loading it and the cache goes stale; don't do that (load_regions returns a fresh
# structure every call, so there is no reason to).
_INDEX_CACHE: dict[int, tuple] = {}
_INDEX_CACHE_MAX = 8


def _index(regions):
    ident = id(regions)
    hit = _INDEX_CACHE.get(ident)
    if hit is not None and hit[0] is regions:
        return hit[1]

    polys = []
    for region in sorted(regions):
        for name, rings in regions[region]:
            outer = rings[0]
            ref_lon = float(outer[0, 0])
            prepared = []
            for r in rings:
                x = _wrap180(r[:, 0] - ref_lon)
                y = r[:, 1].astype(float)
                # Rings from GeoJSON repeat the first vertex last; np.roll on the closed
                # ring would create a zero-length edge, harmless but wasteful. Drop the
                # duplicate so roll gives exactly the n real edges.
                if x.size > 1 and x[0] == x[-1] and y[0] == y[-1]:
                    x = x[:-1]
                    y = y[:-1]
                if x.size < 3:
                    continue
                prepared.append((x, y, np.roll(x, -1), np.roll(y, -1)))
            if not prepared:
                continue
            ox, oy = prepared[0][0], prepared[0][1]
            polys.append({
                "region": region,
                "name": name,
                "ref_lon": ref_lon,
                "rings": prepared,
                "bbox": (float(ox.min()), float(oy.min()), float(ox.max()), float(oy.max())),
            })

    if len(_INDEX_CACHE) >= _INDEX_CACHE_MAX:
        _INDEX_CACHE.clear()
    _INDEX_CACHE[ident] = (regions, polys)
    return polys


def point_region(lat: float, lon: float, regions) -> tuple | None:
    """`(region, sub_region)` for a point over land, else None.

    sub_region is the island / state / country name, or None where the source published
    none. Regions are disjoint by construction -- they are selected from the same admin
    layers by mutually exclusive attribute filters -- so the first hit is the only hit;
    ties, if a future region set ever creates one, resolve in sorted region order.
    """
    for poly in _index(regions):
        if _contains(poly, lat, lon):
            return (poly["region"], poly["name"])
    return None


# =====================================================================================
# crossings
# =====================================================================================

def _as_utc(value):
    """Accept a datetime (naive treated as UTC) or an ISO-8601 string, return aware UTC."""
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _num(value):
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def _lerp(a, b, f):
    """Linear interpolation that propagates absence instead of filling it.

    If either end is missing the answer is missing. Substituting the other end's value
    would publish an observed intensity at a time it was not observed, which is the exact
    class of error this archive forbids.
    """
    if a is None or b is None:
        return None
    return a + (b - a) * f


def crossings(track_points, regions, *, max_implied_speed_kt: float = 40.0) -> list[dict]:
    """Every coastline crossing along an ordered track.

    `track_points` is an ordered list of dicts with keys iso_time, lat, lon, vmax_kt,
    mslp_mb, stage. iso_time may be a datetime or an ISO-8601 string; `stage` is read but
    not returned (the caller already holds the track and can look it up).

    Returns one dict per crossing:
        region, sub_region, iso_time (aware UTC datetime), lat, lon, vmax_kt, mslp_mb,
        detection, implied_speed_kt, suspect_relocation, closest_approach_km

    A CROSSING IS A TRANSITION OF THE LAND UNION, NOT OF ONE POLYGON. The test is whether
    the path went from being inside NO loaded polygon to being inside SOME loaded polygon.
    That distinction is load-bearing: the region files are administrative, so Texas and
    Oklahoma share a border, and a per-polygon test would report a second "landfall" the
    moment an inland storm crossed a state line. Because the union stays true across an
    internal border, only the seaward edge of the union can produce an event.

    Consequences of that rule, stated rather than hidden:
      - the union covers the lower 48, Mexico, the eight Central American states and the
        Caribbean. A track entering the loaded set overland from somewhere NOT loaded
        (Canada into Montana; Colombia into Panama) reads as a crossing. No tropical
        cyclone in the archive's basins does this without having made landfall already.
      - Natural Earth's state polygons end at the Great Lakes shore, so the lakes are
        "water" and a remnant low re-entering Michigan from Lake Michigan reads as a
        crossing. It is a lakeshore, not a coast. Irrelevant to EP/CP, real for NA.
      - a bay or sound (Chesapeake, Pamlico, the Gulf of California) is also water, and a
        second crossing on its far shore is a genuine second landfall -- HURDAT2 records
        those too. That one is correct, not a limitation.
      - a track whose FIRST point is already over land produces no event for it. There is
        no preceding leg, so there is no crossing to observe.
    """
    pts = []
    for p in track_points:
        lat = _num(p.get("lat"))
        lon = _num(p.get("lon"))
        if lat is None or lon is None:
            continue  # a fix with no position cannot bound a crossing
        pts.append({
            "t": _as_utc(p["iso_time"]),
            "lat": lat,
            "lon": lon,
            "vmax_kt": _num(p.get("vmax_kt")),
            "mslp_mb": _num(p.get("mslp_mb")),
        })
    if len(pts) < 2:
        return []

    polys = _index(regions)

    # leg speeds first: the relocation guard needs the storm's own behaviour, which means
    # every leg's speed has to exist before any one leg is judged.
    leg_km = []
    leg_hr = []
    leg_kt = []
    for i in range(len(pts) - 1):
        d = distance_km(pts[i]["lat"], pts[i]["lon"], pts[i + 1]["lat"], pts[i + 1]["lon"])
        h = (pts[i + 1]["t"] - pts[i]["t"]).total_seconds() / 3600.0
        leg_km.append(d)
        leg_hr.append(h)
        leg_kt.append((d / KM_PER_NM) / h if h > 0 else None)

    events: list[dict] = []
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        d_km = leg_km[i]

        lo = min(a["lon"], b["lon"]) - BBOX_MARGIN_DEG
        hi = max(a["lon"], b["lon"]) + BBOX_MARGIN_DEG
        la = min(a["lat"], b["lat"]) - BBOX_MARGIN_DEG
        lb = max(a["lat"], b["lat"]) + BBOX_MARGIN_DEG
        # A leg spanning the antimeridian has a nonsense lon box in the -180..180 frame.
        # It never happens in this archive's regions (all are 160W..60W) but a caller could
        # pass a WP track, and a silently wrong bbox would silently miss every landfall.
        wide = (hi - lo) > 180.0
        cands = []
        for poly in polys:
            x0, y0, x1, y1 = poly["bbox"]
            if y1 < la or y0 > lb:
                continue
            plo = _wrap180(lo - poly["ref_lon"])
            phi = _wrap180(hi - poly["ref_lon"])
            if not wide and plo <= phi and (x1 < plo or x0 > phi):
                continue
            cands.append(poly)
        if not cands:
            continue

        n_sub = max(1, int(math.ceil(d_km / GC_STEP_KM)))
        sample_f = np.arange(n_sub + 1, dtype=float) / n_sub
        path_lat, path_lon = _gc_interp(a["lat"], a["lon"], b["lat"], b["lon"], sample_f)

        fr = set()
        for poly in cands:
            for f in _segment_hits(poly, path_lat, path_lon):
                if 0.0 < f < 1.0:
                    fr.add(round(f, 12))
        bounds = [0.0] + sorted(fr) + [1.0]

        def _poly_at(lat, lon):
            for poly in cands:
                if _contains(poly, lat, lon):
                    return poly
            return None

        poly_a = _poly_at(a["lat"], a["lon"])
        poly_b = _poly_at(b["lat"], b["lon"])

        # State on each open interval between consecutive boundary hits. Sampling the
        # MIDPOINT rather than nudging past the boundary by an epsilon is what makes this
        # robust: there is no tolerance to tune and no risk of the nudge landing back on
        # the wrong side of a 200 m-wide spit.
        mid_states = []
        for k in range(len(bounds) - 1):
            fm = 0.5 * (bounds[k] + bounds[k + 1])
            mlat, mlon = _gc_interp(a["lat"], a["lon"], b["lat"], b["lon"], [fm])
            mid_states.append(_poly_at(float(mlat[0]), float(mlon[0])))

        entries = []
        prev = poly_a
        for k, cur in enumerate(mid_states):
            if prev is None and cur is not None:
                entries.append((bounds[k], cur))
            prev = cur
        # Safety net: B is ashore but no boundary hit was recorded (a leg that ends within
        # a hair of the coastline can do this). Report it at the published fix rather than
        # losing a landfall to a rounding decision.
        if prev is None and poly_b is not None and not any(e[1] is poly_b for e in entries):
            entries.append((1.0, poly_b))

        if not entries:
            continue

        implied = leg_kt[i]
        suspect = _suspect(i, leg_kt, max_implied_speed_kt)

        for f_entry, poly in entries:
            near = min(
                _distance_to_poly_km(poly, a["lat"], a["lon"]),
                _distance_to_poly_km(poly, b["lat"], b["lon"]),
            )
            if poly_b is poly:
                # A published fix is itself over land: use it verbatim. No interpolation.
                ev_t, ev_lat, ev_lon = b["t"], b["lat"], b["lon"]
                ev_v, ev_p = b["vmax_kt"], b["mslp_mb"]
                detection = "bracketing_fix"
            else:
                clat, clon = _gc_interp(a["lat"], a["lon"], b["lat"], b["lon"], [f_entry])
                ev_lat, ev_lon = float(clat[0]), float(clon[0])
                ev_t = a["t"] + (b["t"] - a["t"]) * f_entry
                ev_v = _lerp(a["vmax_kt"], b["vmax_kt"], f_entry)
                ev_p = _lerp(a["mslp_mb"], b["mslp_mb"], f_entry)
                detection = "segment_crossing"
            events.append({
                "region": poly["region"],
                "sub_region": poly["name"],
                "iso_time": ev_t,
                "lat": ev_lat,
                "lon": ev_lon,
                "vmax_kt": ev_v,
                "mslp_mb": ev_p,
                "detection": detection,
                "implied_speed_kt": implied,
                "suspect_relocation": suspect,
                "closest_approach_km": near,
            })
    return events


def _suspect(i, leg_kt, max_implied_speed_kt) -> bool:
    """Is leg i's implied translation speed out of character for this storm?

    A zero- or negative-duration leg is suspect by definition: two positions at the same
    timestamp is a relocation with the arithmetic removed. It cannot be scored, so it is
    flagged rather than passed.
    """
    implied = leg_kt[i]
    if implied is None:
        return True
    if implied > max_implied_speed_kt:
        return True
    if implied < RELOCATION_FLOOR_KT:
        return False
    lo = max(0, i - RELOCATION_WINDOW_LEGS)
    hi = min(len(leg_kt), i + RELOCATION_WINDOW_LEGS + 1)
    near = [v for j, v in enumerate(leg_kt) if lo <= j < hi and j != i and v is not None]
    if not near:
        near = [v for j, v in enumerate(leg_kt) if j != i and v is not None]
    if not near:
        return False  # a two-point track has no "own speed"; the absolute cap is all there is
    own = float(np.median(near))
    if own <= 0:
        return True
    return implied > RELOCATION_SPEED_RATIO * own


# =====================================================================================
# build (network; never called at import)
# =====================================================================================

def _ascii_fold(s):
    """NFKD, drop combining marks, drop the ʻokina and friends. Michoacán -> Michoacan."""
    if s is None:
        return None
    s = s.replace("ʻ", "").replace("ʼ", "").replace("‘", "").replace("’", "")
    d = unicodedata.normalize("NFKD", s)
    d = "".join(c for c in d if not unicodedata.combining(c))
    return d.encode("ascii", "ignore").decode("ascii").strip()


def _fetch_json(key, force=False):
    """fetch() + parse, with one forced re-fetch on a parse failure.

    THE TRAP, HIT FOR REAL DURING THIS BUILD. `provenance.fetch` does not compare the
    bytes it wrote against the Content-Length the server advertised, and the admin-1 file
    arrived truncated at 48,505,344 of 63,251,601 bytes through the proxy. The cache then
    reported a perfectly good sha256 of the wrong file. A truncated JSON cannot parse, so
    parsing IS the integrity check -- but only if the failure re-downloads instead of
    raising, otherwise the cache stays permanently poisoned.
    """
    src = SOURCES[key]
    path, rec = fetch(key, src["url"], note=src["note"], force=force)
    try:
        return json.loads(path.read_text()), rec
    except json.JSONDecodeError:
        if force:
            raise
        return _fetch_json(key, force=True)


def _round_ring(ring):
    out = []
    last = None
    for x, y in ring:
        v = (round(float(x), COORD_DP), round(float(y), COORD_DP))
        if v != last:
            out.append([v[0], v[1]])
            last = v
    if out and out[0] != out[-1]:
        out.append(list(out[0]))
    return out


def _polygons_of(geom):
    return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]


def build_coastlines(out_dir=None, force: bool = False) -> tuple[list, list]:
    """Fetch, cut down and write the vendored coastline GeoJSON. NETWORK.

    Returns (SourceRecords, Gaps) so the caller can fold them into the build manifest. This
    function deliberately does not touch MANIFEST.json itself -- another stage owns it.
    """
    import csv
    import io
    import zipfile

    out_dir = Path(out_dir) if out_dir else COASTLINE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    sources: list[SourceRecord] = []
    gaps: list[Gap] = []

    admin1, rec1 = _fetch_json("ne_10m_admin_1_states_provinces.json", force=force)
    units, rec2 = _fetch_json("ne_10m_admin_0_map_units.json", force=force)
    sources += [rec1, rec2]

    gnis_src = SOURCES["gnis.DomesticNames_HI_Text.zip"]
    gnis_path, rec3 = fetch("gnis.DomesticNames_HI_Text.zip", gnis_src["url"],
                            note=gnis_src["note"], force=force)
    sources.append(rec3)
    with zipfile.ZipFile(gnis_path) as z:
        member = next(n for n in z.namelist() if n.lower().endswith(".txt"))
        gnis_rows = list(csv.DictReader(
            io.StringIO(z.read(member).decode("utf-8-sig")), delimiter="|"))

    def _srcinfo(key, rec):
        s = SOURCES[key]
        return {"key": key, "url": s["url"], "sha256": rec.sha256, "bytes": rec.bytes,
                "downloaded_utc": rec.downloaded_utc, "licence": s["licence"],
                "licence_url": s["licence_url"], "note": s["note"]}

    ne_src = [_srcinfo("ne_10m_admin_1_states_provinces.json", rec1)]
    unit_src = [_srcinfo("ne_10m_admin_0_map_units.json", rec2)]

    # ---- feature selection, straight off published attributes -------------------------
    us = [f for f in admin1["features"]
          if (f["properties"].get("admin") == "United States of America")]
    mx = [f for f in admin1["features"] if f["properties"].get("admin") == "Mexico"]
    hawaii = [f for f in us if f["properties"].get("name") == "Hawaii"]
    conus = [f for f in us if f["properties"].get("name") not in ("Hawaii", "Alaska")]
    car = [f for f in units["features"]
           if (f["properties"].get("SUBREGION") or "") == "Caribbean"]
    cam = [f for f in units["features"]
           if (f["properties"].get("SUBREGION") or "") == "Central America"
           and f["properties"].get("GEOUNIT") != "Mexico"]

    if len(hawaii) != 1:
        raise RuntimeError("expected exactly one admin_1 'Hawaii' feature, got %d" % len(hawaii))

    written = {}

    def _emit(region, entries, provenance):
        """entries: list of (name_official, rings_as_lists). One Feature per polygon."""
        feats = []
        nverts = 0
        for name_official, rings in entries:
            rounded = [_round_ring(r) for r in rings]
            rounded = [r for r in rounded if len(r) >= 4]
            if not rounded:
                continue
            nverts += sum(len(r) for r in rounded)
            feats.append({
                "type": "Feature",
                "properties": {
                    "region": region,
                    "name": _ascii_fold(name_official),
                    "name_official": name_official,
                },
                "geometry": {"type": "Polygon", "coordinates": rounded},
            })
        provenance = dict(provenance)
        provenance.update({
            "region": region, "built_utc": now, "processing_version": PROCESSING_VERSION,
            "coordinate_precision_dp": COORD_DP, "polygons": len(feats), "vertices": nverts,
        })
        doc = {"type": "FeatureCollection", "provenance": provenance, "features": feats}
        path = out_dir / ("%s.geojson" % region)
        path.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False) + "\n")
        written[region] = {"path": str(path), "bytes": path.stat().st_size,
                           "polygons": len(feats), "vertices": nverts}

    # ---- hawaii: polygons from Natural Earth, names from USGS GNIS --------------------
    hi_polys = [[np.asarray(r, dtype=float) for r in poly]
                for poly in _polygons_of(hawaii[0]["geometry"])]
    hi_index = [{"ref_lon": float(p[0][0, 0]),
                 "bbox": None, "rings": None, "raw": p} for p in hi_polys]
    for entry in hi_index:
        prepared = []
        for r in entry["raw"]:
            x = _wrap180(r[:, 0] - entry["ref_lon"])
            y = r[:, 1]
            if x.size > 1 and x[0] == x[-1] and y[0] == y[-1]:
                x, y = x[:-1], y[:-1]
            prepared.append((x, y, np.roll(x, -1), np.roll(y, -1)))
        entry["rings"] = prepared
        entry["bbox"] = (float(prepared[0][0].min()), float(prepared[0][1].min()),
                         float(prepared[0][0].max()), float(prepared[0][1].max()))

    islands = [r for r in gnis_rows if r.get("feature_class") == "Island"
               and r.get("prim_lat_dec") and r.get("prim_long_dec")]
    names: dict[int, str] = {}
    missing_main = []
    for want in GNIS_MAIN_HAWAIIAN_ISLANDS:
        rows = [r for r in islands if r["feature_name"] == want]
        if not rows:
            missing_main.append(want)
            continue
        hits = []
        for r in rows:
            la, lo = float(r["prim_lat_dec"]), float(r["prim_long_dec"])
            hits += [k for k, e in enumerate(hi_index) if _contains(e, la, lo)]
        hits = sorted(set(hits))
        if len(hits) == 1 and hits[0] not in names:
            names[hits[0]] = want
        else:
            missing_main.append(want)
    if missing_main:
        raise RuntimeError(
            "GNIS did not resolve these main Hawaiian islands to exactly one distinct "
            "polygon each: %s -- refusing to publish a Hawaii region that cannot answer "
            "the per-island question" % missing_main)

    # Second tier for the Northwestern Hawaiian Islands: take a name only where exactly one
    # GNIS island point falls inside the polygon. Zero hits or two hits -> no name.
    unnamed = 0
    for k, entry in enumerate(hi_index):
        if k in names:
            continue
        hits = {r["feature_name"] for r in islands
                if _contains(entry, float(r["prim_lat_dec"]), float(r["prim_long_dec"]))}
        if len(hits) == 1:
            names[k] = hits.pop()
        else:
            unnamed += 1
    if unnamed:
        gaps.append(Gap(
            key="coastlines.hawaii.island_names",
            what="%d of %d Hawaii polygons carry no island name" % (unnamed, len(hi_index)),
            why="Natural Earth's Hawaii feature is unnamed per polygon, and the USGS GNIS "
                "join leaves these Northwestern Hawaiian Islands either with no Island-class "
                "point inside the polygon or with more than one (Kure Atoll / Green Island "
                "share a polygon). No name was invented for them.",
            impact="A landfall on one of these uninhabited NWHI polygons is published with "
                   "region='hawaii' and sub_region=NULL. All eight MAIN Hawaiian islands -- "
                   "the ones the use case asks about -- are named.",
            url=SOURCES["gnis.DomesticNames_HI_Text.zip"]["url"]))

    _emit("hawaii",
          [(names.get(k), [r.tolist() for r in p]) for k, p in enumerate(hi_polys)],
          {"geometry_source": ne_src,
           "geometry_selection": "admin='United States of America' AND name='Hawaii'; each "
                                 "polygon of the MultiPolygon emitted separately",
           "name_source": [_srcinfo("gnis.DomesticNames_HI_Text.zip", rec3)],
           "name_rule": "USGS GNIS feature_class='Island' whose published primary coordinate "
                        "(prim_lat_dec/prim_long_dec) falls inside the polygon. Tier 1: the "
                        "eight official main-island names, each asserted to hit exactly one "
                        "distinct polygon. Tier 2: any polygon containing exactly one GNIS "
                        "island point takes that name. Otherwise name=null.",
           "gaps": [g.as_dict() for g in gaps if g.key.startswith("coastlines.hawaii")]})

    # ---- conus / mexico / central america / caribbean --------------------------------
    def _entries(feats, name_key):
        out = []
        for f in feats:
            nm = f["properties"].get(name_key)
            for poly in _polygons_of(f["geometry"]):
                out.append((nm, poly))
        return out

    _emit("conus", _entries(conus, "name"),
          {"geometry_source": ne_src,
           "geometry_selection": "admin='United States of America' AND name NOT IN "
                                 "('Alaska','Hawaii') -- 49 admin-1 units incl. DC",
           "name_source": ne_src, "name_rule": "Natural Earth admin_1 'name' (state)",
           "gaps": []})

    nameless_mx = sum(1 for nm, _ in _entries(mx, "name") if not nm)
    if nameless_mx:
        gaps.append(Gap(
            key="coastlines.mexico.unnamed_unit",
            what="%d Mexican polygon(s) carry no state name" % nameless_mx,
            why="Natural Earth admin_1 publishes one Mexican unit with name=null "
                "(adm1_code 'MEX+99?', iso_3166_2 'MX-X01~', area_sqkm 0) covering Arrecife "
                "Alacranes off Yucatan. The source assigns it to no state and this build "
                "does not assign one either.",
            impact="A landfall on that reef is published with region='mexico' and "
                   "sub_region=NULL rather than a guessed state.",
            url=SOURCES["ne_10m_admin_1_states_provinces.json"]["url"]))
    _emit("mexico", _entries(mx, "name"),
          {"geometry_source": ne_src,
           "geometry_selection": "admin='Mexico' (admin-1 states, not the admin-0 country "
                                 "outline: an EP landfall in Sinaloa and one in Oaxaca are "
                                 "not the same event)",
           "name_source": ne_src, "name_rule": "Natural Earth admin_1 'name' (estado)",
           "gaps": [g.as_dict() for g in gaps if g.key.startswith("coastlines.mexico")]})

    _emit("central_america", _entries(cam, "GEOUNIT"),
          {"geometry_source": unit_src,
           "geometry_selection": "SUBREGION='Central America' AND GEOUNIT<>'Mexico' -- "
                                 "Natural Earth files Mexico under Central America; the "
                                 "archive needs them apart",
           "name_source": unit_src, "name_rule": "Natural Earth admin_0 'GEOUNIT'",
           "gaps": []})

    _emit("caribbean", _entries(car, "GEOUNIT"),
          {"geometry_source": unit_src,
           "geometry_selection": "SUBREGION='Caribbean' from the MAP UNITS layer",
           "name_source": unit_src, "name_rule": "Natural Earth admin_0 'GEOUNIT'",
           "gaps": []})

    gaps.append(Gap(
        key="coastlines.land_union_edge",
        what="the land union stops at the edge of the five loaded regions",
        why="Crossings are transitions of the union of all loaded polygons, so an overland "
            "entry from a landmass that is NOT loaded (Canada -> Montana, Colombia -> "
            "Panama) has no preceding land state and reads as a coastline crossing. Great "
            "Lakes shorelines have the same shape of problem: Natural Earth state polygons "
            "end at the lake shore, so the lakes are water.",
        impact="Possible false landfall rows for a track that reaches the US from Canada "
               "overland or re-enters from a Great Lake. Neither is reachable in the EP/CP "
               "basins this archive was built for. HURDAT2's 'L' records remain primary.",
        url=""))

    manifest = {
        "built_utc": now,
        "processing_version": PROCESSING_VERSION,
        "regions": written,
        "sources": [_srcinfo(k, r) for k, r in
                    (("ne_10m_admin_1_states_provinces.json", rec1),
                     ("ne_10m_admin_0_map_units.json", rec2),
                     ("gnis.DomesticNames_HI_Text.zip", rec3))],
        "rejected_sources": [
            {"key": "ne_10m_land.json", "url": SOURCES["ne_10m_land.json"]["url"],
             "why": SOURCES["ne_10m_land.json"]["note"]}],
        "gaps": [g.as_dict() for g in gaps],
    }
    (out_dir / "SOURCES.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return sources, gaps


# =====================================================================================
# self-check
# =====================================================================================

def _selfcheck() -> int:
    regions = load_regions()
    fails = 0

    def check(label, got, want):
        nonlocal fails
        ok = got == want
        if not ok:
            fails += 1
        print("  [%s] %-52s got=%r want=%r" % ("ok" if ok else "FAIL", label, got, want))

    print("regions loaded: " + ", ".join(
        "%s=%d polys" % (k, len(v)) for k, v in sorted(regions.items())))
    hi_names = sorted(n for n, _ in regions["hawaii"] if n)
    print("hawaii sub_regions: %s" % (hi_names,))
    print("hawaii polygons with no name: %d" % sum(1 for n, _ in regions["hawaii"] if not n))

    print("\n1. point tests against real coordinates")
    # Honolulu city hall, 21.3069 N 157.8583 W.
    check("Honolulu (21.3069,-157.8583)", point_region(21.3069, -157.8583, regions),
          ("hawaii", "Oahu"))
    # Ka Lae (South Point), the southern tip of the Big Island, is 18.9106 N 155.6811 W.
    # 200 km due south of it is open ocean.
    south = 18.9106 - 200.0 / KM_PER_DEG
    check("200 km S of Ka Lae (%.4f,-155.6811)" % south,
          point_region(south, -155.6811, regions), None)
    d = distance_km(18.9106, -155.6811, south, -155.6811)
    check("...and that point is 200 km away", round(d, 1), 200.0)
    check("Hilo (19.7297,-155.0900)", point_region(19.7297, -155.0900, regions),
          ("hawaii", "Island of Hawaii"))
    check("Lihue, Kauai (21.9811,-159.3711)", point_region(21.9811, -159.3711, regions),
          ("hawaii", "Kauai"))
    check("Miami (25.7617,-80.1918)", point_region(25.7617, -80.1918, regions),
          ("conus", "Florida"))
    check("Cabo San Lucas (22.8909,-109.9124)", point_region(22.8909, -109.9124, regions),
          ("mexico", "Baja California Sur"))
    check("San Juan PR (18.4655,-66.1057)", point_region(18.4655, -66.1057, regions),
          ("caribbean", "Puerto Rico"))
    check("mid-Pacific (20.0,-150.0)", point_region(20.0, -150.0, regions), None)

    # --- synthetic tracks across Kauai (bbox -159.787..-159.293, 21.869..22.235) --------
    def track(start_lon, step_deg, hours, n, lat=22.05, v=75.0, p=975.0):
        base = datetime(2026, 8, 20, 0, 0, tzinfo=timezone.utc)
        from datetime import timedelta
        return [{"iso_time": base + timedelta(hours=hours * i),
                 "lat": lat, "lon": start_lon - step_deg * i,
                 "vmax_kt": v, "mslp_mb": p, "stage": "HU"} for i in range(n)]

    # 1 deg of longitude at 22.05 N is 103.2 km; 10 kt for 2 h is 37.0 km = 0.3589 deg.
    print("\n2. Kauai traverse at a realistic 10 kt, 2-hourly (a fix lands on the island)")
    t_slow = track(-158.90, 0.3589, 2, 9)
    ev = crossings(t_slow, regions)
    for e in ev:
        print("   %s %s %s  implied=%.1f kt suspect=%s closest=%.1f km" % (
            e["region"], e["sub_region"], e["detection"], e["implied_speed_kt"],
            e["suspect_relocation"], e["closest_approach_km"]))
    check("one crossing", len(ev), 1)
    if ev:
        check("sub_region", ev[0]["sub_region"], "Kauai")
        check("detection", ev[0]["detection"], "bracketing_fix")
        check("implied speed ~10 kt", round(ev[0]["implied_speed_kt"]), 10)
        check("suspect_relocation", ev[0]["suspect_relocation"], False)
        check("closest published fix is on the island", ev[0]["closest_approach_km"], 0.0)

    print("\n3. the same 10 kt storm on a 6-hourly track (leg spans the whole island)")
    t_6h = track(-158.60, 1.0766, 6, 5)
    ev6 = crossings(t_6h, regions)
    for e in ev6:
        print("   %s %s %s  implied=%.1f kt suspect=%s closest=%.1f km" % (
            e["region"], e["sub_region"], e["detection"], e["implied_speed_kt"],
            e["suspect_relocation"], e["closest_approach_km"]))
    check("one crossing", len(ev6), 1)
    if ev6:
        check("detection", ev6[0]["detection"], "segment_crossing")
        check("suspect_relocation", ev6[0]["suspect_relocation"], False)
        check("closest published fix is NOT on the island",
              ev6[0]["closest_approach_km"] > 5.0, True)

    print("\n4. the same crossing compressed into one 6-hour leg at 60 kt")
    # 60 kt for 6 h = 667 km = 6.46 deg of longitude at 22.05 N.
    t_fast = track(-156.30, 6.4600, 6, 3)
    evf = crossings(t_fast, regions)
    for e in evf:
        print("   %s %s %s  implied=%.1f kt suspect=%s closest=%.1f km" % (
            e["region"], e["sub_region"], e["detection"], e["implied_speed_kt"],
            e["suspect_relocation"], e["closest_approach_km"]))
    check("one crossing", len(evf), 1)
    if evf:
        check("sub_region", evf[0]["sub_region"], "Kauai")
        check("detection", evf[0]["detection"], "segment_crossing")
        check("implied speed ~60 kt", round(evf[0]["implied_speed_kt"]), 60)
        check("suspect_relocation", evf[0]["suspect_relocation"], True)

    print("\n5. the incident from PLAN-TRACK-MODEL.md: 8 kt storm, one 18 kt leg")
    # Every leg 8 kt (0.8613 deg / 6 h) except the one that cuts Kauai, at 18 kt.
    from datetime import timedelta
    base = datetime(2026, 8, 20, 0, 0, tzinfo=timezone.utc)
    lons = [-158.10, -158.96]
    for step in (1.9379, 0.8613, 0.8613):  # 18 kt leg, then back to 8 kt
        lons.append(lons[-1] - step)
    t_relo = [{"iso_time": base + timedelta(hours=6 * i), "lat": 22.05, "lon": lon,
               "vmax_kt": 70.0, "mslp_mb": 980.0, "stage": "HU"} for i, lon in enumerate(lons)]
    evr = crossings(t_relo, regions)
    for e in evr:
        print("   %s %s %s  implied=%.1f kt suspect=%s closest=%.1f km" % (
            e["region"], e["sub_region"], e["detection"], e["implied_speed_kt"],
            e["suspect_relocation"], e["closest_approach_km"]))
    check("one crossing", len(evr), 1)
    if evr:
        check("implied speed ~18 kt (under the 40 kt cap)",
              round(evr[0]["implied_speed_kt"]), 18)
        check("suspect_relocation via the ratio test", evr[0]["suspect_relocation"], True)

    print("\n6. a near-miss 60 km south of Kauai produces nothing")
    t_miss = [{"iso_time": base + timedelta(hours=6 * i), "lat": 21.30,
               "lon": -158.60 - 1.0766 * i, "vmax_kt": 70.0, "mslp_mb": 980.0,
               "stage": "HU"} for i in range(5)]
    check("no crossings", len(crossings(t_miss, regions)), 0)

    print("\n7. an inland state border is not a landfall")
    # Houston -> Dallas -> Oklahoma City: entirely overland, crossing TX/OK.
    t_land = [{"iso_time": base + timedelta(hours=12 * i), "lat": la, "lon": lo,
               "vmax_kt": 40.0, "mslp_mb": 1000.0, "stage": "TS"}
              for i, (la, lo) in enumerate([(29.76, -95.37), (32.78, -96.80), (35.47, -97.52)])]
    check("no crossings once ashore", len(crossings(t_land, regions)), 0)

    print("\n8. a real Gulf landfall: offshore -> ashore in Louisiana")
    t_gulf = [{"iso_time": base + timedelta(hours=6 * i), "lat": la, "lon": lo,
               "vmax_kt": v, "mslp_mb": p, "stage": "HU"}
              for i, (la, lo, v, p) in enumerate([
                  (27.50, -91.50, 100.0, 950.0), (28.60, -91.80, 105.0, 945.0),
                  (29.70, -92.10, 110.0, 940.0), (30.60, -92.30, 70.0, 970.0)])]
    evg = crossings(t_gulf, regions)
    for e in evg:
        print("   %s %s %s  vmax=%s implied=%.1f kt suspect=%s closest=%.1f km" % (
            e["region"], e["sub_region"], e["detection"], e["vmax_kt"],
            e["implied_speed_kt"], e["suspect_relocation"], e["closest_approach_km"]))
    check("one crossing", len(evg), 1)
    if evg:
        check("region", evg[0]["region"], "conus")
        check("sub_region", evg[0]["sub_region"], "Louisiana")
        check("detection", evg[0]["detection"], "bracketing_fix")

    print("\n%s  (%d failure%s)" % ("ALL CHECKS PASSED" if not fails else "CHECKS FAILED",
                                    fails, "" if fails == 1 else "s"))
    return 1 if fails else 0


if __name__ == "__main__":
    import sys

    if "--build" in sys.argv:
        srcs, gs = build_coastlines(force="--force" in sys.argv)
        for s in srcs:
            print("source %-44s %10d bytes  %s" % (s.key, s.bytes, s.sha256[:16]))
        for g in gs:
            print("GAP    %-44s %s" % (g.key, g.what))
        total = sum(p.stat().st_size for p in COASTLINE_DIR.glob("*.geojson"))
        for p in sorted(COASTLINE_DIR.glob("*.geojson")):
            print("wrote  %-44s %10d bytes" % (p.name, p.stat().st_size))
        print("committed coastline total: %d bytes (%.2f MB)" % (total, total / 1e6))
        sys.exit(0)
    sys.exit(_selfcheck())
