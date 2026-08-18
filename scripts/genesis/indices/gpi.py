"""Genesis Potential Index -- the archive's headline "could something form here" number.

WHY THIS FILE EXISTS. The analog query conditions on four environmental columns (shear,
mid-level humidity, 850 hPa vorticity, potential intensity) and a reader comparing two
candidate environments has to weigh them against each other by eye. The GPI is the one
published, citable way of collapsing those four into a single scalar whose historical
distribution is meaningful. It is a diagnostic of the environment, NOT a forecast and not a
probability: a high GPI says the environment resembles environments in which storms have
formed, and nothing more.

THE FORMULATION, NAMED, WITH ITS CONSTANTS

    GPI = |1e5 * eta|^(3/2) * (H/50)^3 * (V_pot/70)^3 * (1 + 0.1 * V_shear)^(-2)

    eta      850 hPa ABSOLUTE vorticity, s^-1
    H        700 hPa relative humidity, percent
    V_pot    potential intensity, m s^-1
    V_shear  magnitude of the 850-200 hPa vertical wind shear, m s^-1

This is the index of Emanuel, K. A., and D. S. Nolan, 2004: "Tropical cyclone activity and
the global climate system", 26th Conference on Hurricanes and Tropical Meteorology, Miami,
FL, Amer. Meteor. Soc., 240-241; it is written in the algebraic form above by Camargo,
S. J., K. A. Emanuel and A. H. Sobel, 2007: "Use of a genesis potential index to diagnose
ENSO effects on tropical cyclone genesis", J. Climate, 20, 4819-4834 (their Eq. 1).

WHAT IS AND IS NOT VERIFIED ABOUT THOSE CONSTANTS. Neither paper is in .genesis-cache and
this module runs with no network, so the six constants -- the 1e5 scaling, the 3/2, 50, 3,
70, 3, 0.1 and -2 -- are TRANSCRIBED here, not checked against the primary source in this
environment. That is a real gap and it is stated rather than papered over: if you have the
papers, check `EN04_*` below against them before trusting a published number. What IS
verified, byte by byte against .genesis-cache/ships_predictor_file.pdf (text extracted from
the PDF's own ToUnicode CMaps, not remembered), is the definition and unit of every input:

    "Z850: 850 hPa vorticity (sec-1 * 10**7) vs time (r=0-1000 km)"
    "RHLO: 850-700 hPa relative humidity (%) vs time (200-800 km)"
    "RHMD: Same as RHLO for 700-500 hPa"
    "SHRD: 850-200 hPa shear magnitude (kt *10) vs time (200-800 km)"
    "SHDC: Same as SHRD but with vortex removed and averaged from 0-500 km relative to
     850 hPa vortex center"
    "VMPI:  Maximum potential intensity from Kerry Emanuel equation (kt)"

THE HUMIDITY IS NOT THE PAPER'S HUMIDITY -- AND THE NAME SAYS SO. The archive's mid-level
humidity column is SHIPS RHMD, a 700-500 hPa LAYER MEAN area-averaged over r = 200-800 km.
Emanuel and Nolan's H is the relative humidity at 700 hPa. A layer mean through 500 hPa is
systematically drier than the 700 hPa value in the tropics, and H enters cubed, so the
substitution moves the number by tens of percent -- not a rounding difference. A GPI
computed on RHMD is therefore a DIFFERENT INDEX, and this module refuses to call it plain
"GPI": every row it computes from RHMD carries a `gpi_method` string that names the layer
and the word SUBSTITUTED. Pass rh_layer='700' only when the caller really is handing over a
700 hPa value. Two archives whose gpi columns were built with different rh_layer are not
comparable, and the method string is what lets a reader notice that.

THE VORTICITY IS NOT THE PAPER'S VORTICITY EITHER, IN A WAY THAT MATTERS MORE. Z850 is an
area average over r = 0-1000 km CENTRED ON THE STORM, so it contains the cyclone's own
circulation; the paper's eta is a gridded reanalysis field at a point. Along a track, then,
this index measures "environment plus the vortex that is already there", which is exactly
the quantity that is NOT available before genesis. At the genesis fix the vortex is weak
and the two are close; twelve hours into a hurricane they are not. Never read an
along-track GPI as "how favourable was the environment" for the storm's own intensification.

ETA = RELATIVE + PLANETARY, DONE EXPLICITLY. SHIPS Z850 is relative vorticity; f = 2*Omega*
sin(lat) is added here, in `absolute_vorticity()`, with the addition visible in one line.
This is not a formality: measured over the 996 CP analysis rows in ships.CP.txt, 201 (20%)
have NEGATIVE relative vorticity (a 0-1000 km area average can easily be anticyclonic), and
the most negative is -6.6e-6 s^-1. Feed those to |1e5*zeta|^1.5 without f and you get a
number that is small where f would have made it large, i.e. a plausible-looking wrong
answer with no missing value anywhere to warn you.

None IS NOT 0. GPI = 0 is a physical statement -- the environment forbids genesis, e.g.
V_pot = 0 over cold water, which is a value SHIPS really publishes. Measured over the tau=0
analysis rows of the cached files, GPI comes out exactly 0.0 for 2/996 CP, 559/17,518 EP and
232/14,328 AL rows, and in every one of those the driver is a published VMPI of 0 kt, not a
zero humidity: 549 of the 559 EP zeros sit below 24 deg C SST and only 2 above 25 deg C, both
of those on rows whose SST is climatological (env_source 'ships_dev+csst'). That is the
signature of the PI equation's own cold-water cutoff, though note the predictor document does
not state a cutoff, so "VMPI = 0 means the ocean cannot support a storm" is inference from the
values, not a quoted definition -- and the inference is not a clean threshold either: measured
over ships.AL.txt, 71 tau=0 rows have SST below 20 deg C and a NON-zero VMPI (down to SST
13.9 deg C with VMPI 13 kt), so do not read "VMPI = 0" as "SST < 20" or the reverse. None
means something different and stronger: the archive does not know. Returning 0.0 for an
unknown would put a "genesis impossible" claim into the archive that no source ever made, so
every path here returns None with a reason instead, and the reason travels in the method
string.

WHAT THE OUTPUT LOOKS LIKE ON REAL BYTES, so a scaling regression is obvious. Running
gpi_for_environment_row over every tau=0 row of the cached SHIPS files (all inputs present, 0
refusals): CP 996 rows, median 3.72, max 33.8; EP 17,518 rows, median 4.94, max 92.9; AL
14,328 rows, median 4.86, max 107.1. An order-of-magnitude departure from those medians means
a unit conversion moved, not that the weather changed.

AN INPUT WHOSE UNITS ARE UNKNOWN PRODUCES NO NUMBER. If the vorticity scaling is not
confirmed (`vort_scaling_confirmed=False`, or an env_source this module has not verified),
gpi() returns None. A wrong decade in Z850 is a 1000x error in the first factor that still
looks like a GPI, and there is no way to detect it downstream. This is the single rule in
this file that must never be relaxed for convenience.

SOUTHERN HEMISPHERE IS REFUSED FOR SHIPS ROWS. The predictor document quoted above defines
Z850 as "850 hPa vorticity" with no hemisphere convention. Operational SHIPS-family products
for southern basins are frequently sign-flipped so that positive means cyclonic; if that is
so and we add a negative f to a positive-cyclonic value, |eta| comes out ~200x too small at
15S. The cached files are AL/EP/CP only -- verified over the LAT row of every raw record in
ALL THREE cached files (32,842 records, 0 negative values): ships.EP.txt spans 7.1N-43.1N,
ships.AL.txt 7.2N-51.9N and ships.CP.txt 2.6N-39.1N, so no southern row exists -- nothing is
lost today, and REFUSE_SOUTHERN_HEMISPHERE_SHIPS below is the one place to flip once
somebody verifies the convention against a published document.

PURE: no network, no clock, no file I/O, no import-time state. Every function is a function
of its arguments.
"""

from __future__ import annotations

import math

# --- physical constants ------------------------------------------------------------------

#: Earth's rotation rate, rad s^-1 (IAU/IERS sidereal value 7.292115e-5, carried to the
#: precision usually quoted). f = 2*OMEGA_EARTH*sin(lat) is ~1e-4 s^-1 at 45 deg, which is
#: the textbook check in the self-check below.
OMEGA_EARTH = 7.2921159e-5

#: knots -> m s^-1. Exactly 1852/3600 = 0.5144444...; the value used across this project is
#: the 6-decimal 0.514444, which is low by 8.6e-7 relative -- 1e-4 kt at 100 kt, four orders
#: below the 1 kt precision SHIPS publishes. Stated so nobody has to wonder later.
KT_TO_MS = 0.514444

# --- Emanuel-Nolan (2004) normalisation constants and exponents ---------------------------
# Named rather than inlined so a reader can check them against the paper one line at a time,
# and so a change to any of them is a visible diff and not a buried literal.

EN04_VORT_SCALE = 1.0e5    # eta is scaled by 1e5 before the 3/2 power
EN04_VORT_EXP = 1.5        # |1e5 * eta| ^ (3/2)
EN04_RH_REF = 50.0         # H normalised by 50 %
EN04_RH_EXP = 3.0          # (H/50) ^ 3
EN04_PI_REF = 70.0         # V_pot normalised by 70 m/s
EN04_PI_EXP = 3.0          # (V_pot/70) ^ 3
EN04_SHEAR_COEF = 0.1      # (1 + 0.1 * V_shear) ...
EN04_SHEAR_EXP = -2.0      # ... ^ (-2)

#: Stable token that names the formulation in every method string. Query with
#: `gpi_method LIKE 'gpi_emanuel_nolan_2004%'`.
INDEX_ID = "gpi_emanuel_nolan_2004"

#: The layer Emanuel and Nolan's H is defined on. Anything else is a substitution.
CANONICAL_RH_LAYER = "700"

#: The layer the ENVIRONMENT table actually carries (schema: rh_mid_pct = SHIPS RHMD).
ARCHIVE_RH_LAYER = "700-500"

#: Every method string for a value we did NOT compute starts with this, so a build can count
#: refusals with `gpi_method LIKE 'none;%'` and read the reason from the same column.
REFUSED = "none"

#: env_source prefixes whose 850 hPa vorticity scaling this module has verified against the
#: publisher's own documentation. 'ships_dev' is verified via the Z850 quote at the top of
#: this file. Anything else -- a reanalysis, a regridded field, a hand-built row -- has an
#: unknown scaling as far as this module is concerned, and gets None, not a guess.
VORT_SCALING_CONFIRMED_SOURCES = frozenset({"ships_dev"})

#: env_source prefixes whose vorticity DECADE is supported by measurement rather than by the
#: publisher's documentation. This is a weaker warrant than the set above and is kept separate
#: so it can never be mistaken for it.
#:
#: 'ships_rt' is NHC's operational SHIPS. That product publishes units in the row label for
#: shear, SST, potential intensity, 200 mb T, RH and heat content -- but NOT for '850 MB ENV
#: VOR'. The developmental decade was adopted after comparing 37 live tau=0 rows against the
#: archive's 32,842 developmental rows: the labelled control fields agree (SST 28.2 vs 27.9
#: median, RH 59 vs 60), and the two unlabelled fields share the developmental decade and
#: range, with 200 MB DIV showing an identical upper bound of 233. That establishes the
#: DECADE. It does not establish identical calibration, and every value computed from such a
#: row says so in its method string.
VORT_SCALING_INFERRED_SOURCES = frozenset({"ships_rt"})
INFERRED_NOTE = ("vorticity decade INFERRED from distribution against ships_dev, not read from "
                 "a published unit; decade evidenced, calibration not")

#: See "SOUTHERN HEMISPHERE" in the module docstring. Flip only with a citation in hand.
REFUSE_SOUTHERN_HEMISPHERE_SHIPS = True

# Physical admissibility bounds. These reject impossible inputs, they do NOT clamp plausible
# ones -- a value outside them means the caller's units or missing-value handling are wrong,
# and the honest response is None with a reason, not a silently repaired number. Measured
# against every raw record in the cached files: RHMD spans 16-90 % (EP) and 19-87 % (AL),
# VMPI 0-193 kt (EP) and 0-183 kt (AL), so nothing real is excluded here.
RH_MIN_PCT, RH_MAX_PCT = 0.0, 100.0

# EVERY input needs a ceiling, not just the humidity, and the reason is arithmetic. A SHIPS
# missing-value token that escapes a parser arrives here as 9999 (or -999) in the source's own
# units, and only the humidity one is self-evidently absurd. Measured, with the value a leaked
# 9999 would have produced through gpi_for_environment_row():
#
#   vort850_1e5 = 9999   -> eta 0.09999 s^-1     -> GPI    610,621   (looks like a super-index)
#   vort850_1e5 = -999   -> eta -0.00999 s^-1    -> GPI     19,195
#   pot_intensity_kt=9999-> V_pot 5144 m/s       -> GPI  1,440,210
#   shear_kt = 9999      -> V_shear 5144 m/s     -> GPI    4.5e-05   (looks like "no genesis")
#
# The near-zero one is the dangerous one: it is indistinguishable from the real, published
# GPI = 0 of a cold-water row. So the bounds below are ceilings with large but finite headroom
# over anything the physical world produces, sized from the cached files (tau=0, 32,842 rows):
# max |Z850| 3.67e-5 s^-1, max VMPI 193 kt = 99.3 m/s, max SHDC 84.4 kt = 43.4 m/s. Every real
# row clears them by two orders of magnitude in the vorticity and by a factor of 1.5-3 in the
# other two, and every sentinel form seen in this family of files is caught.
VORT_ABS_MAX_S1 = 5.0e-3   # 136x the largest cached |Z850|; a 0-1000 km average is never this
PI_MAX_MS = 150.0          # 292 kt; well above the ~100 m/s ceiling of Emanuel's own PI
SHEAR_MAX_MS = 150.0       # 292 kt of 850-200 hPa shear does not occur in the atmosphere


# --- small helpers -------------------------------------------------------------------------

#: Type names that mean "this is a flag, not a measurement". See _finite().
_BOOL_TYPE_NAMES = frozenset({"bool", "bool_", "bool8"})


def _finite(value) -> float | None:
    """float(value) when it is a real finite number; None for None, NaN, inf or garbage.

    NaN is treated as missing rather than propagated. A NaN that reaches the arithmetic
    produces a NaN GPI, and a NaN written to a Parquet double is indistinguishable from a
    computed value in most query engines -- it would read as "we computed something" when we
    did not. bool is rejected explicitly because `True` would otherwise become 1.0 and a
    stray flag would be published as a humidity.

    THE BOOLEAN TEST IS ON THE TYPE NAME, NOT ONLY isinstance. numpy's boolean is NOT a
    subclass of bool (and in numpy 2.x it is not a numbers.Real either), so
    `isinstance(x, bool)` lets numpy.bool_(True) straight through to float() -> 1.0.
    Measured with numpy 2.4.6 installed in this environment: a numpy True arriving as
    rh_mid_pct produced a humidity of 1 % and a GPI of 1.26e-05 -- a fabricated near-zero
    that reads exactly like a real cold-water GPI. Any type whose name is bool is refused,
    which covers Python bool, numpy.bool_ (type name 'bool' in numpy 2, 'bool_' in numpy 1)
    and the same pattern in the other array libraries, without importing any of them.
    """
    if value is None or isinstance(value, bool) or type(value).__name__ in _BOOL_TYPE_NAMES:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return v


def _method_for(rh_layer: str) -> str:
    """The method string for a value we DID compute: formulation + the humidity actually used."""
    layer = str(rh_layer)
    if layer == CANONICAL_RH_LAYER:
        return (f"{INDEX_ID}; H=700hPa RH (canonical); eta=relative vorticity + f=2*Omega*sin(lat); "
                f"kt->m/s={KT_TO_MS}")
    return (f"{INDEX_ID}_rh{layer}; H={layer}hPa LAYER-MEAN RH SUBSTITUTED for the canonical 700hPa "
            f"RH (a different index, not EN04 GPI as published); eta=relative vorticity + "
            f"f=2*Omega*sin(lat); kt->m/s={KT_TO_MS}")


# --- exported pieces -----------------------------------------------------------------------


def potential_intensity_ms(vmpi_kt) -> float | None:
    """SHIPS VMPI (knots) -> potential intensity in m s^-1, or None when there is no value.

    VMPI is documented as "Maximum potential intensity from Kerry Emanuel equation (kt)", so
    this is a pure unit conversion and nothing else -- no floor, no clamp, no substitution of
    a climatological PI where the file is blank.

    0 kt is a REAL published value over cold water (measured: 2 rows in ships.CP.txt, both
    CP022014 on 2014-10-26, SST 19.4 and 17.8 deg C; 559 rows in ships.EP.txt, 549 of them
    below 24 deg C) and converts to 0.0 m/s, which drives GPI to exactly 0.0. That zero is a
    finding, not a gap; only a missing value gives None.
    """
    v = _finite(vmpi_kt)
    if v is None:
        return None
    return v * KT_TO_MS


def coriolis(lat_deg) -> float:
    """Planetary vorticity f = 2 * Omega * sin(lat), s^-1, from latitude in degrees.

    Signed: positive in the northern hemisphere, exactly 0 at the equator, negative in the
    southern. That sign is the whole reason `absolute_vorticity` cannot be written as a
    magnitude sum, and the reason GPI takes |eta| rather than eta.

    Sanity anchors used by the self-check: f(30 deg) == OMEGA_EARTH exactly (sin 30 = 1/2),
    and f(45 deg) = 1.0313e-4 s^-1, the value quoted in every dynamics text.

    Raises ValueError for a missing or out-of-range latitude rather than returning None: a
    latitude that is absent or off the globe is a bug in the caller, not a data gap, and the
    functions above are the ones responsible for turning a genuine gap into None.
    """
    lat = _finite(lat_deg)
    if lat is None:
        raise ValueError("coriolis(): latitude is missing or not a finite number: %r" % (lat_deg,))
    if abs(lat) > 90.0:
        raise ValueError("coriolis(): latitude %r is off the globe (|lat| > 90)" % (lat_deg,))
    return 2.0 * OMEGA_EARTH * math.sin(math.radians(lat))


def absolute_vorticity(rel_vort_s1, lat_deg) -> float | None:
    """eta = relative vorticity + f, in s^-1. None if either input is missing.

    THE ADDITION OF f IS THE POINT. SHIPS Z850 is RELATIVE vorticity -- the publisher's own
    definition is "850 hPa vorticity (sec-1 * 10**7) ... (r=0-1000 km)", an area average of
    the relative field, with no planetary term in it. Emanuel and Nolan's eta is ABSOLUTE.
    In the deep tropics f is the larger of the two terms (f = 2.9e-5 s^-1 at 12N against a
    typical 0-1000 km relative average of a few times 1e-6), so omitting it does not merely
    bias the index, it changes which environments look favourable.

    No absolute value is taken here. |eta| belongs to the index, not to the vorticity: a
    caller that wants to know the sign of the absolute vorticity (an anticyclonic-absolute
    environment is a real and interesting thing) must still be able to see it.
    """
    zeta = _finite(rel_vort_s1)
    lat = _finite(lat_deg)
    if zeta is None or lat is None or abs(lat) > 90.0:
        return None
    return zeta + coriolis(lat)


def gpi(*, vort850_s1, rh_pct, pot_intensity_ms, shear_ms, lat_deg,
        rh_layer: str = ARCHIVE_RH_LAYER,
        vort_scaling_confirmed: bool = True) -> tuple[float | None, str]:
    """Emanuel-Nolan (2004) GPI from inputs already in SI, as (value_or_None, method).

    Arguments, all keyword-only so no call site can transpose two same-typed floats:
        vort850_s1        850 hPa RELATIVE vorticity, s^-1 (NOT 1e-5 s^-1 -- convert first)
        rh_pct            mid-level relative humidity, percent
        pot_intensity_ms  potential intensity, m s^-1 (see potential_intensity_ms)
        shear_ms          850-200 hPa shear MAGNITUDE, m s^-1
        lat_deg           latitude, degrees, signed
        rh_layer          the layer rh_pct really came from; '700' is canonical, anything
                          else is recorded as a substitution in the method string
        vort_scaling_confirmed
                          False when the caller cannot vouch for the vorticity's unit
                          scaling. Then this returns (None, reason) WITHOUT computing.

    The method string is not decoration. It is written to environment.gpi_method for every
    row, and it is the only thing that lets a reader tell an EN04 GPI from the RHMD variant
    this archive actually publishes, or tell a refusal apart from a missing column.

    Returns None -- never 0.0, never NaN -- whenever an input is missing, non-finite,
    physically impossible, or of unconfirmed units. GPI = 0.0 is returned only when the
    inputs are all known and the arithmetic really is zero (V_pot = 0 or H = 0).
    """
    # 1. Units first. An unconfirmed scaling is refused BEFORE anything is read, because a
    #    number computed from an input of unknown decade is worse than no number: it is
    #    indistinguishable from a real one downstream. This ordering is deliberate -- the
    #    refusal must not depend on whether some other field also happened to be missing.
    if not vort_scaling_confirmed:
        return None, (f"{REFUSED}; 850 hPa vorticity unit scaling UNCONFIRMED -- refusing to compute "
                      f"{INDEX_ID} from an input whose decade is unknown (a 1e2 scaling error is a "
                      f"1e3 error in |1e5*eta|^1.5 and is undetectable downstream)")

    # 2. Presence. Collect every missing input rather than reporting the first, so one pass
    #    over a build's refusals tells you which column to go and fix.
    raw = {
        "vort850_s1": _finite(vort850_s1),
        "rh_pct": _finite(rh_pct),
        "pot_intensity_ms": _finite(pot_intensity_ms),
        "shear_ms": _finite(shear_ms),
        "lat_deg": _finite(lat_deg),
    }
    missing = sorted(k for k, v in raw.items() if v is None)
    if missing:
        return None, f"{REFUSED}; missing or non-finite input(s): {', '.join(missing)}"

    zeta = raw["vort850_s1"]
    rh = raw["rh_pct"]
    vpot = raw["pot_intensity_ms"]
    shear = raw["shear_ms"]
    lat = raw["lat_deg"]

    # 3. Admissibility. Each of these means the caller's units or sentinel handling are
    #    wrong (a SHIPS 9999 that escaped its missing-value map arrives here as 9999.0), and
    #    a "repaired" value would be a fabricated one.
    if abs(lat) > 90.0:
        return None, f"{REFUSED}; latitude {lat} is off the globe (|lat| > 90)"
    if not (RH_MIN_PCT <= rh <= RH_MAX_PCT):
        return None, (f"{REFUSED}; relative humidity {rh} outside {RH_MIN_PCT}-{RH_MAX_PCT} % -- "
                      f"not a relative humidity, or a missing-value sentinel that survived parsing")
    if shear < 0.0:
        return None, (f"{REFUSED}; shear magnitude {shear} m/s is negative -- a magnitude cannot be, "
                      f"so this is a shear component or a sentinel, not |V_shear|")
    if shear > SHEAR_MAX_MS:
        return None, (f"{REFUSED}; shear magnitude {shear} m/s exceeds {SHEAR_MAX_MS} m/s -- not a "
                      f"deep-layer shear (largest cached SHDC is 43.4 m/s), so this is a unit error "
                      f"or a missing-value sentinel that survived parsing; a value this large would "
                      f"drive GPI to ~0, which is indistinguishable from a real cold-water zero")
    if vpot < 0.0:
        return None, f"{REFUSED}; potential intensity {vpot} m/s is negative, which is non-physical"
    if vpot > PI_MAX_MS:
        return None, (f"{REFUSED}; potential intensity {vpot} m/s exceeds {PI_MAX_MS} m/s -- above "
                      f"anything the Emanuel PI produces (largest cached VMPI is 99.3 m/s), so this "
                      f"is a unit error or a missing-value sentinel that survived parsing")
    if abs(zeta) > VORT_ABS_MAX_S1:
        return None, (f"{REFUSED}; 850 hPa relative vorticity {zeta} s^-1 exceeds "
                      f"{VORT_ABS_MAX_S1} s^-1 in magnitude -- not a 0-1000 km area average "
                      f"(largest cached |Z850| is 3.67e-05 s^-1), so this is a unit error or a "
                      f"missing-value sentinel that survived parsing")

    # 4. The index itself, one factor per line, in the order the paper writes them.
    eta = absolute_vorticity(zeta, lat)          # relative + f, s^-1; f added explicitly there
    if eta is None:                              # unreachable given the checks above; belt and braces
        return None, f"{REFUSED}; absolute vorticity could not be formed from vort850_s1 and lat_deg"

    vort_term = abs(EN04_VORT_SCALE * eta) ** EN04_VORT_EXP   # |1e5 * eta|^(3/2), non-negative
    rh_term = (rh / EN04_RH_REF) ** EN04_RH_EXP               # (H/50)^3
    pi_term = (vpot / EN04_PI_REF) ** EN04_PI_EXP             # (V_pot/70)^3
    shear_term = (1.0 + EN04_SHEAR_COEF * shear) ** EN04_SHEAR_EXP   # (1 + 0.1*V_shear)^-2

    return vort_term * rh_term * pi_term * shear_term, _method_for(rh_layer)


def gpi_for_environment_row(row) -> tuple[float | None, str]:
    """GPI for one schema.ENVIRONMENT-shaped row (or any mapping with those keys).

    Reads shear_kt, rh_mid_pct, vort850_1e5, pot_intensity_kt, lat and env_source, and does
    the three conversions the schema's own column names imply, each one visible:

        vort850_1e5  * 1e-5     -> s^-1      (the column is in units of 1e-5 s^-1)
        shear_kt     * 0.514444 -> m s^-1
        pot_intensity_kt        -> m s^-1    via potential_intensity_ms()

    rh_mid_pct is SHIPS RHMD, a 700-500 hPa layer mean, so rh_layer is ARCHIVE_RH_LAYER and
    every value this function produces is labelled as the substituted index. That label is
    the difference between an honest column and a mislabelled one.

    Two refusals are specific to this entry point, because they are properties of the SOURCE
    rather than of the arithmetic:

      * env_source outside VORT_SCALING_CONFIRMED_SOURCES -> None. The archive's vorticity
        scaling is verified for SHIPS only. The comparison is on the prefix before '+',
        because ships_dev records a documented fallback as 'ships_dev+csst'/'+shrd' and those
        suffixes describe SST and shear substitutions, not the vorticity.
      * a southern-hemisphere SHIPS row -> None, while the Z850 sign convention there is
        undocumented (see the module docstring). No cached file contains one.

    Never raises for bad data: an unusable row comes back as (None, reason). It can still
    raise for a row that is not a mapping and has no such attributes, which is a programming
    error, not a data gap.
    """
    def field(name):
        try:
            return row.get(name)
        except AttributeError:
            return getattr(row, name, None)

    env_source = field("env_source")
    # 'ships_dev+csst' -> 'ships_dev'; a None env_source stays unconfirmed.
    src = (env_source or "").split("+", 1)[0]
    inferred = src in VORT_SCALING_INFERRED_SOURCES
    confirmed = src in VORT_SCALING_CONFIRMED_SOURCES or inferred

    lat = _finite(field("lat"))
    if confirmed and REFUSE_SOUTHERN_HEMISPHERE_SHIPS and lat is not None and lat < 0.0:
        return None, (f"{REFUSED}; southern-hemisphere row (lat={lat}): the SHIPS predictor document "
                      f"defines Z850 without a hemisphere sign convention, so adding f<0 to it may be "
                      f"wrong by ~2 orders of magnitude in |eta|; refusing until it is verified")

    vort_1e5 = _finite(field("vort850_1e5"))
    shear_kt = _finite(field("shear_kt"))

    value, method = gpi(
        # 1e-5 s^-1 -> s^-1. The column name carries the decade; this is where it is spent.
        vort850_s1=None if vort_1e5 is None else vort_1e5 * 1e-5,
        rh_pct=field("rh_mid_pct"),
        pot_intensity_ms=potential_intensity_ms(field("pot_intensity_kt")),
        # kt -> m/s. SHIPS shear is SHDC (or SHRD; which one is recorded in env_source, not
        # here -- it is the same 850-200 hPa layer either way, over a different radius).
        shear_ms=None if shear_kt is None else shear_kt * KT_TO_MS,
        lat_deg=lat,
        rh_layer=ARCHIVE_RH_LAYER,
        vort_scaling_confirmed=confirmed,
    )
    if confirmed and inferred and value is not None:
        # A value computed on the weaker warrant must SAY so in the same column that carries
        # the method, so a query can separate documented from inferred without a join.
        method += f"; {INFERRED_NOTE} (env_source={env_source!r})"
    if not confirmed:
        # gpi() owns the refusal; this only names the source that could not be vouched for.
        method += f" (env_source={env_source!r}; verified sources: "
        method += ", ".join(sorted(VORT_SCALING_CONFIRMED_SOURCES)) + ")"
    return value, method


# --- self-check -----------------------------------------------------------------------------
# Reference values were computed factor by factor, independently of the code above, and are
# written here as literals with their factor chain shown. If someone changes an exponent or a
# normalisation constant, these fail; a test that re-derived them through the same code path
# would not. Tolerance is 1e-9 relative, i.e. float noise only.

if __name__ == "__main__":
    import sys

    failures: list[str] = []

    def check(label: str, got, expected, tol: float = 1e-9) -> str:
        """Compare and record. Returns a short status token for the table."""
        if expected is None:
            ok = got is None
        elif got is None:
            ok = False
        else:
            ok = abs(got - expected) <= tol * max(1.0, abs(expected))
        if not ok:
            failures.append(f"{label}: got {got!r}, expected {expected!r}")
        return "ok" if ok else "FAIL"

    rows: list[tuple[str, str, str, str]] = []   # label, gpi, status, method

    def show(label: str, value, method: str, expected) -> None:
        status = check(label, value, expected)
        shown = "None" if value is None else f"{value:.6f}"
        rows.append((label, shown, status, method))

    # --- direct gpi() cases ---------------------------------------------------------------

    # A. Favourable tropical environment. lat 12N, rel vort 3.0e-5 s^-1, H 70 %, V_pot 150 kt,
    #    shear 5 kt. Hand chain:
    #      f     = 2*7.2921159e-5*sin(12 deg) = 3.032232e-05
    #      eta   = 3.0e-5 + 3.032232e-05      = 6.032232e-05
    #      |1e5*eta|^1.5 = 6.032232^1.5       = 14.815526
    #      (70/50)^3                          =  2.744000
    #      (150*0.514444/70)^3                =  1.339658
    #      (1 + 0.1*5*0.514444)^-2            =  0.632668
    #      product                            = 34.456505
    v, m = gpi(vort850_s1=3.0e-5, rh_pct=70.0, pot_intensity_ms=150.0 * KT_TO_MS,
               shear_ms=5.0 * KT_TO_MS, lat_deg=12.0, rh_layer="700")
    show("A favourable tropics (canonical H=700)", v, m, 34.456505088)

    # B. The same environment under 40 kt of shear: only the last factor changes,
    #    (1 + 0.1*40*0.514444)^-2 = 0.106952, so 34.456505 * 0.106952/0.632668 = 5.824838.
    v, m = gpi(vort850_s1=3.0e-5, rh_pct=70.0, pot_intensity_ms=150.0 * KT_TO_MS,
               shear_ms=40.0 * KT_TO_MS, lat_deg=12.0, rh_layer="700")
    show("B same, sheared 40 kt", v, m, 5.824837767)

    # C. Missing input. Humidity absent -> None, and the reason names the field.
    v, m = gpi(vort850_s1=3.0e-5, rh_pct=None, pot_intensity_ms=150.0 * KT_TO_MS,
               shear_ms=5.0 * KT_TO_MS, lat_deg=12.0)
    show("C missing humidity", v, m, None)
    if "rh_pct" not in m:
        failures.append("C: refusal does not name the missing field")

    # D. Unconfirmed vorticity scaling, every other input present and perfectly good.
    #    THE FILE'S MOST IMPORTANT BEHAVIOUR: still None.
    v, m = gpi(vort850_s1=3.0e-5, rh_pct=70.0, pot_intensity_ms=150.0 * KT_TO_MS,
               shear_ms=5.0 * KT_TO_MS, lat_deg=12.0, vort_scaling_confirmed=False)
    show("D unconfirmed vort scaling", v, m, None)
    if "UNCONFIRMED" not in m:
        failures.append("D: refusal does not say the scaling was unconfirmed")

    # E. Sentinel that escaped a parser: RH = 9999 is not a humidity.
    v, m = gpi(vort850_s1=3.0e-5, rh_pct=9999.0, pot_intensity_ms=150.0 * KT_TO_MS,
               shear_ms=5.0 * KT_TO_MS, lat_deg=12.0)
    show("E humidity sentinel 9999", v, m, None)

    # --- gpi_for_environment_row() cases, on REAL rows from ships.CP.txt -------------------
    # Values below are exactly what genesis.sources.ships_dev.environment_rows() returns for
    # these records (verified by running it against .genesis-cache/ships.CP.txt).

    # F. CP011982, 1982-08-30 06Z, the first analysis row in the file.
    #      f(11.0) = 2.782803e-05, eta = 0.4e-5 + f = 3.182803e-05
    #      |1e5*eta|^1.5 = 5.678251 ; (65/50)^3 = 2.197000
    #      (134*0.514444/70)^3 = 0.955069 ; (1 + 0.1*16.6*0.514444)^-2 = 0.290932
    #      product = 3.466335
    real_cp01 = {"env_source": "ships_dev", "lat": 11.0, "lon": -169.0, "shear_kt": 16.6,
                 "rh_mid_pct": 65.0, "vort850_1e5": 0.4, "pot_intensity_kt": 134.0}
    v, m = gpi_for_environment_row(real_cp01)
    show("F real CP011982 1982-08-30 06Z", v, m, 3.466334807)
    if "SUBSTITUTED" not in m:
        failures.append("F: RHMD row not labelled as a humidity substitution")

    # G. CP022014, 2014-10-26 00Z: VMPI = 0 kt over 19.4 deg C water. Every input known, so
    #    the answer is a real, published 0.0 -- "genesis forbidden" -- and NOT None.
    real_cp0 = {"env_source": "ships_dev", "lat": 37.0, "shear_kt": 13.3, "rh_mid_pct": 46.0,
                "vort850_1e5": 0.52, "pot_intensity_kt": 0.0}
    v, m = gpi_for_environment_row(real_cp0)
    show("G real VMPI=0 over 19.4C (0, not None)", v, m, 0.0)

    # H. CP022014, 2014-10-24 12Z: the most anticyclonic relative vorticity in the CP file,
    #    -0.66e-5 s^-1. f(28.2) = 6.891790e-05 dominates, eta = 6.231790e-05 > 0.
    #      |1e5*eta|^1.5 = 15.556762 ; (52/50)^3 = 1.124864
    #      (123*0.514444/70)^3 = 0.738645 ; (1 + 0.1*6.5*0.514444)^-2 = 0.561611
    #      product = 7.259223
    real_neg = {"env_source": "ships_dev", "lat": 28.2, "shear_kt": 6.5, "rh_mid_pct": 52.0,
                "vort850_1e5": -0.66, "pot_intensity_kt": 123.0}
    v, m = gpi_for_environment_row(real_neg)
    show("H real negative rel. vorticity", v, m, 7.259222515)

    # I. Same numbers, an env_source this module has not verified. None.
    unverified = dict(real_cp01, env_source="ncep_r1")
    v, m = gpi_for_environment_row(unverified)
    show("I unverified env_source ncep_r1", v, m, None)

    # J. A documented SHIPS fallback suffix must NOT disqualify the row: '+csst' is an SST
    #    substitution and says nothing about Z850.
    v, m = gpi_for_environment_row(dict(real_cp01, env_source="ships_dev+csst"))
    show("J env_source ships_dev+csst", v, m, 3.466334807)

    # K. Southern hemisphere SHIPS row: refused while the sign convention is undocumented.
    v, m = gpi_for_environment_row(dict(real_cp01, lat=-11.0))
    show("K southern hemisphere SHIPS row", v, m, None)

    # L-N. A missing-value token that escaped the parser reaches the row entry point in the
    #      SOURCE's units. Before the ceilings existed these produced, respectively, 1,440,210,
    #      610,621 and 4.5e-05 -- two of them look like a record-breaking environment and the
    #      third is indistinguishable from a real published cold-water GPI of 0. All three must
    #      be None, and the reason must name the field.
    v, m = gpi_for_environment_row(dict(real_cp01, pot_intensity_kt=9999.0))
    show("L VMPI sentinel 9999 kt", v, m, None)
    if "potential intensity" not in m:
        failures.append("L: refusal does not name the potential intensity")

    v, m = gpi_for_environment_row(dict(real_cp01, vort850_1e5=9999.0))
    show("M Z850 sentinel 9999", v, m, None)
    if "vorticity" not in m:
        failures.append("M: refusal does not name the vorticity")

    v, m = gpi_for_environment_row(dict(real_cp01, shear_kt=9999.0))
    show("N shear sentinel 9999 kt", v, m, None)
    if "shear" not in m:
        failures.append("N: refusal does not name the shear")

    # O. The other sentinel form in this family of files, -999, in the one column whose sign
    #    is legitimately negative -- so only the MAGNITUDE ceiling can catch it.
    v, m = gpi_for_environment_row(dict(real_cp01, vort850_1e5=-999.0))
    show("O Z850 sentinel -999", v, m, None)

    # Q. A numpy-style boolean must not become a humidity of 1 %. numpy is not imported here
    #    (this module has no dependencies), so the stand-ins below reproduce exactly what
    #    _finite() sees: a type named 'bool' (numpy 2) or 'bool_' (numpy 1) that is not a
    #    subclass of Python bool but does convert through float() to 1.0.
    class bool_:                      # numpy 1.x spelling
        def __float__(self): return 1.0

    np2_bool = type("bool", (), {"__float__": lambda self: 1.0})   # numpy 2.x spelling
    v, m = gpi_for_environment_row(dict(real_cp01, rh_mid_pct=bool_()))
    show("Q numpy-1 style bool as humidity", v, m, None)
    v, m = gpi_for_environment_row(dict(real_cp01, rh_mid_pct=np2_bool()))
    show("Q2 numpy-2 style bool as humidity", v, m, None)

    # P. The ceilings must not touch the largest values the cached files really contain:
    #    |Z850| 3.67e-5 s^-1 (AL), VMPI 193 kt (EP), SHDC 84.4 kt (EP), all in one row.
    v, m = gpi_for_environment_row(dict(real_cp01, vort850_1e5=3.67, pot_intensity_kt=193.0,
                                        shear_kt=84.4))
    show("P cached extremes still compute", v, m, 3.601239873)

    # --- component checks -----------------------------------------------------------------

    comp: list[tuple[str, str, str]] = []

    def check_scalar(label: str, got, expected, tol: float = 1e-12) -> None:
        status = check(label, got, expected, tol)
        comp.append((label, "None" if got is None else f"{got:.10g}", status))

    # sin(30 deg) = 1/2 exactly in the formula, so f(30) must be OMEGA_EARTH itself.
    check_scalar("coriolis(30) == OMEGA_EARTH", coriolis(30.0), OMEGA_EARTH, 1e-15)
    check_scalar("coriolis(0) == 0", coriolis(0.0), 0.0, 1e-20)
    check_scalar("coriolis(45) = 1.0313e-4 s^-1", coriolis(45.0), 1.0312609204176488e-4, 1e-12)
    check_scalar("coriolis(-20) = -coriolis(20)", coriolis(-20.0), -coriolis(20.0), 1e-15)
    check_scalar("potential_intensity_ms(100 kt)", potential_intensity_ms(100.0), 51.4444, 1e-12)
    check_scalar("potential_intensity_ms(None)", potential_intensity_ms(None), None)
    check_scalar("potential_intensity_ms(0 kt) = 0.0", potential_intensity_ms(0.0), 0.0, 1e-20)
    check_scalar("absolute_vorticity(4e-6, 11N)", absolute_vorticity(4.0e-6, 11.0),
                 4.0e-6 + coriolis(11.0), 1e-15)
    check_scalar("absolute_vorticity(None, 11N)", absolute_vorticity(None, 11.0), None)
    check_scalar("absolute_vorticity(4e-6, None)", absolute_vorticity(4.0e-6, None), None)

    try:
        coriolis(None)
    except ValueError:
        comp.append(("coriolis(None) raises ValueError", "raised", "ok"))
    else:
        comp.append(("coriolis(None) raises ValueError", "returned", "FAIL"))
        failures.append("coriolis(None) did not raise")

    # --- table ------------------------------------------------------------------------------

    w = max(len(r[0]) for r in rows)
    print(f"{INDEX_ID}  self-check")
    print("-" * (w + 26))
    print(f"{'case'.ljust(w)}  {'GPI':>12}  status")
    print("-" * (w + 26))
    for label, shown, status, _ in rows:
        print(f"{label.ljust(w)}  {shown:>12}  {status}")
    print("-" * (w + 26))
    wc = max(len(c[0]) for c in comp)
    for label, shown, status in comp:
        print(f"{label.ljust(wc)}  {shown:>22}  {status}")
    print("-" * (w + 26))
    print("methods returned:")
    for label, _, _, method in rows:
        print(f"  {label}\n      {method}")
    print("-" * (w + 26))
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print("  " + f)
        sys.exit(1)
    print(f"all {len(rows) + len(comp)} checks passed")
