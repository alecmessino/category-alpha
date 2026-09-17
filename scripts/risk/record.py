"""Shared machinery for a published Trigger Evidence Record.

ONE PIPELINE, TWO RECORDS. The first record was a single script: it loaded one storm's
archive from a module constant, measured to two named islands, and wrote one page. A second
event under that arrangement is a second copy of the evaluator, and a copy is a place for
the two records to quietly disagree about what a forecast lead is.

So everything that is the same for every record lives here -- distance to coastline, the
closest-approach profile and its tie window, the source register, the time-model proof, the
track chart, and the contract the records are evaluated against. What differs is the storm,
which is declared in tec.EVENTS, and the prose, which belongs to each record's own module.

Nothing here knows which storm it is working on.
"""
from __future__ import annotations
import json, math
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path

from shapely.geometry import Point
from shapely.ops import nearest_points

from tec import (EVENTS, ROOT, COASTLINES, Event, Refusal, bearing, declared_inputs, gc_nm,
                 load_all, load_coastline, reconcile_lead_labels, sha256)

# brief.html is the PDF's PRINT SOURCE, not a page of the site. It renders at Letter with a
# fixed 8.5x11in body and would be a broken surface if served, so it is built outside docs/
# and only Chromium ever opens it.
BUILD = Path(__file__).parent / ".build"
ASSETS = Path(__file__).parent / "assets"

# A closest-approach MINIMUM CAN BE FLAT. On a near-tangent track the profile sits within a
# few metres of its minimum across several samples, so the reported TIME is a tie-break on a
# 15-minute grid, not a measurement to the minute. TIE_NM is the band inside which samples
# are treated as tied, and the width of that band in minutes is carried into the manifest so
# a geometry refresh cannot silently move a printed timestamp without the tie showing.
TIE_NM = 0.05
SAMPLE_SECONDS = 900

PRODUCT_OF = {"TCM": "TCM", "TCP": "TCP", "TCA": "TCA (ICAO aviation)", "TCD": "TCD (discussion)",
              "PWS": "PWS (wind speed probabilities)", "TCU": "TCU (tropical cyclone update)"}


def t_(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fnum(v):
    return f"{v:+.1f}".replace("-", "−")


def contract_manifest() -> dict:
    """The TNC-HI-REEF contract, as the PUBLIC record describes it -- and no further.

    THE SAME CONTRACT COVERS EVERY RECORD IN THIS SERIES, so it is written once. What is
    public is the 2024 fact sheet, the 2025 renewal and the policyholder's own event releases.
    What is NOT public is the thing a settlement would have to be reconstructed from: the 2026
    zone polygons, the payout schedule, the designated observation source, and how the wind is
    defined. That list does not shrink because a second event would be easier to write up with
    a shorter one.
    """
    return {
        "contract_id": "TNC-HI-REEF (public view)",
        "policyholder": "The Nature Conservancy",
        "broker": "WTW", "insurer": "Munich Re Group company (after a competitive placement)",
        "known_public": {
            "trigger_variable": "officially reported wind speed of active and former hurricanes in the insured area (2024 fact sheet)",
            "threshold": ">=50 kt in the core zone (policyholder releases 2024-2026)",
            "structure_2024": "1 core zone, 3 buffer zones; 555,137 sq km",
            "limits_2024_25": {"minimum": 200000, "per_event": 1000000, "annual": 2000000},
            "minimum_2026": 200000,
            "payout_ladder_2024": "HISTORICAL — NOT ASSUMED FOR 2026",
        },
        "unknown": ["2026 zone polygons", "2026 payout schedule and limits", "designated observation source",
                    "wind definition applied", "treatment of intermediates, corrections and post-season revisions"],
    }


class Record:
    """One event's evaluated archive: records, geometry, register and time-model proof."""

    def __init__(self, slug: str):
        self.ev: Event = EVENTS[slug]
        self.recs = load_all(self.ev)
        self.R = {r.record_id: r for r in self.recs}
        self.islands, self.polys, self.coast_prov = load_coastline(self.ev)
        self.out = ROOT / "docs" / "risk" / self.ev.slug
        self.live_url = self.ev.canonical_url

    # ---------- geometry ----------
    def coast_nm(self, lat, lon, poly):
        q = nearest_points(poly, Point(lon, lat))[0]
        return gc_nm((lat, lon), (q.y, q.x))

    def track(self, adv):
        pts = [r for r in self.recs if r.product == "TCM" and r.advisory == adv
               and r.variant == "regular"
               and (r.kind == "official_forecast" or r.record_id.endswith("-cur"))]
        return sorted(pts, key=lambda r: r.valid)

    def closest(self, adv, poly):
        """Closest approach of one advisory's own forecast track, with its tie window."""
        pts = self.track(adv)
        prof = []
        for a, b in zip(pts, pts[1:]):
            ta, tb = t_(a.valid), t_(b.valid)
            n = int((tb - ta).total_seconds() / SAMPLE_SECONDS)
            for i in range(n + 1):
                u = i / n
                la, lo = a.lat + (b.lat - a.lat) * u, a.lon + (b.lon - a.lon) * u
                prof.append((self.coast_nm(la, lo, poly), ta + timedelta(seconds=SAMPLE_SECONDS * i),
                             a.vmax_kt + (b.vmax_kt - a.vmax_kt) * u))
        d0 = min(p[0] for p in prof)
        tied = [p[1] for p in prof if p[0] - d0 <= TIE_NM]
        best = min(prof, key=lambda p: p[0])
        return best + ((max(tied) - min(tied)).total_seconds() / 60,)

    def operational_closest(self, poly, second=None):
        """Closest approach of the operational working best track (ATCF CARQ)."""
        carq = sorted([r for r in self.recs if r.product == "ATCF-CARQ"], key=lambda r: r.valid)
        best, prof = None, []
        for a, b in zip(carq, carq[1:]):
            ta, tb = t_(a.valid), t_(b.valid)
            for i in range(25):
                u = i / 24
                la, lo = a.lat + (b.lat - a.lat) * u, a.lon + (b.lon - a.lon) * u
                d = self.coast_nm(la, lo, poly)
                prof.append((d, ta + (tb - ta) * u))
                if best is None or d < best[0]:
                    best = (d, ta + (tb - ta) * u,
                            a.vmax_kt + (b.vmax_kt - a.vmax_kt) * u,
                            self.coast_nm(la, lo, second) if second is not None else None)
        tied = [t for d, t in prof if d - best[0] <= TIE_NM]
        return best, (max(tied) - min(tied)).total_seconds() / 60

    # ---------- provenance ----------
    def source_register(self) -> list:
        """EVERY DECLARED INPUT IS HASHED, AND EVERY HASHED INPUT IS READ.

        The Rev 3 hand-off hashed raw/ne_10m_land.geojson -- absent from the package, never
        read for geometry -- and left the geometry it DID read out of its own register
        entirely. Both directions are gated now: declared_inputs() is the single list the
        build opens, the register is built from it, and scripts/check-risk-provenance.mjs
        fails the build if any entry is missing, unreadable, or unreferenced.
        """
        sources = {}
        for r in self.recs:
            sources.setdefault(r.source_file, {"file": r.source_file, "sha256": r.source_sha256,
                                               "product": r.product})
        for f in declared_inputs(self.ev):
            if f.name in sources:
                continue
            if f.name.startswith("TCD"):
                prod = PRODUCT_OF["TCD"]
            elif f.name.startswith("PWS"):
                prod = PRODUCT_OF["PWS"]
            elif f.name == self.ev.deck:
                prod = "ATCF a-deck (CARQ records used)"
            elif f.name == "hawaii.geojson":
                prod = "Natural Earth 10m coastline, shared repository primitive"
            elif f.name == "SOURCES.json":
                prod = "Coastline provenance register"
            else:
                prod = "raw product"
            sources[f.name] = {"file": f.name, "sha256": sha256(f), "product": prod,
                               "path": str(f.relative_to(ROOT))}
        return list(sources.values())

    def geometry_manifest(self) -> dict:
        return {"file": "data/genesis-archive/coastlines/hawaii.geojson",
                "selection": "islands selected by properties.name, not by centroid position",
                "provenance": self.coast_prov,
                "closest_approach_sample_seconds": SAMPLE_SECONDS,
                "closest_approach_tie_band_nm": TIE_NM}

    # ---------- the time model, proven from the archive rather than asserted ----------
    def time_model(self, worked_example: str | None = None) -> dict:
        """The discussion companion to each forecast/advisory prints the forecast table with
        its lead labels attached (INIT 07/1500Z ... 12H 08/0000Z). Those labels reconcile with
        the explicit UTC valid times if and only if the lead origin is the nominal synoptic
        cycle. Both hypotheses are checked on every discussion in the archive, and the model is
        discriminated by the bytes instead of being adopted by convention.
        """
        proof = []
        for tcd in self.ev.glob("TCD"):
            r = reconcile_lead_labels(tcd, self.ev)
            if r.get("ok") is not None:
                proof.append({"source_file": tcd.name, **{k: r[k] for k in
                             ("transmitted", "cycle", "init_valid", "from_cycle_ok",
                              "from_init_ok", "labels_are_nhc_lead_set", "ok")}})
        assert proof and all(r["ok"] for r in proof), \
            "time-model proof failed on an archived discussion"
        return {
            "statement": "nominal_cycle, issued and valid are stored separately and never derived "
                         "from one another; forecast lead = valid - nominal_cycle.",
            "retired_model": "valid - issued, i.e. the 15Z release treated as forecast hour zero.",
            "proof": "Discussion lead labels reconcile with explicit UTC valid times only against "
                     "the nominal cycle. Checked on every discussion in the archive.",
            "discussions_checked": len(proof),
            "discussions_confirming_cycle_origin": sum(1 for r in proof if r["ok"]),
            "worked_example": next((r for r in proof if r["source_file"] == worked_example), None),
        }

    def issuance_provenance(self) -> dict:
        """How precisely this archive establishes an issuance time, and why it differs."""
        from tec import ISSUED_BASIS
        return {"basis": self.ev.issued_basis, "means": ISSUED_BASIS[self.ev.issued_basis]}

    # ---------- chart ----------
    def chart(self, w, h, lon0, lon1, lat0, lat1, advs, fs, aria, ring_record=None,
              labels_every=1, faint=(), carq_from=None, carq_to=None, label_hour="00"):
        sx, sy = w / (lon1 - lon0), h / (lat1 - lat0)
        X = lambda lo: (lo - lon0) * sx          # noqa: E731
        Y = lambda la: (lat1 - la) * sy          # noqa: E731
        g = [f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
             f'font-family="IBM Plex Mono, Menlo, monospace" font-size="{fs}" role="img" '
             f'aria-label="{aria}">']
        g.append('<g stroke="var(--rule,#C6D2D4)" stroke-width="1">')
        for lo in range(math.ceil(lon0), math.floor(lon1) + 1):
            if lo % 2 == 0:
                g.append(f'<line x1="{X(lo):.1f}" y1="0" x2="{X(lo):.1f}" y2="{h}"/>')
        for la in range(math.ceil(lat0), math.floor(lat1) + 1):
            if la % 2 == 0:
                g.append(f'<line x1="0" y1="{Y(la):.1f}" x2="{w}" y2="{Y(la):.1f}"/>')
        g.append('</g><g fill="var(--mute,#6F8590)">')
        for lo in range(math.ceil(lon0), math.floor(lon1) + 1):
            if lo % 2 == 0:
                g.append(f'<text x="{X(lo)+4:.1f}" y="{h-6}">{-lo}°W</text>')
        for la in range(math.ceil(lat0), math.floor(lat1) + 1):
            if la % 2 == 0 and 16 < Y(la) < h - 24:
                g.append(f'<text x="4" y="{Y(la)-4:.1f}">{la}°N</text>')
        g.append('</g>')
        for p in self.polys:
            pts = " ".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in p.exterior.coords)
            g.append(f'<polygon points="{pts}" fill="var(--ink,#10202B)" opacity=".82"/>')
        for name, la, lo in (("Niʻihau", 21.35, -161.55), ("Kauaʻi", 22.35, -159.8),
                             ("Oʻahu", 21.85, -158.3), ("Maui", 21.2, -156.6),
                             ("Hawaiʻi", 19.6, -154.9)):
            if lon0 < lo < lon1:
                g.append(f'<text x="{X(lo):.1f}" y="{Y(la):.1f}" fill="var(--ink-2,#3B5260)">{name}</text>')
        if ring_record is not None:
            cur = ring_record
            cx, cy = X(cur.lon), Y(cur.lat)
            kx = sx / (60 * math.cos(math.radians(cur.lat)))
            ky = sy / 60
            for thr, dash in (("34", "2 4"), ("50", "4 3"), ("64", "")):
                if not cur.radii_nm or thr not in cur.radii_nm:
                    continue
                ne, se, sw, nw = cur.radii_nm[thr]

                def arc(r, a0, a1):
                    ptsx = []
                    for i in range(0, 31):
                        a = math.radians(a0 + (a1 - a0) * i / 30)
                        ptsx.append((cx + r * math.sin(a) * kx, cy - r * math.cos(a) * ky))
                    return ptsx
                path = arc(ne, 0, 90) + arc(se, 90, 180) + arc(sw, 180, 270) + arc(nw, 270, 360)
                d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in path) + " Z"
                g.append(f'<path d="{d}" fill="none" stroke="var(--chart,#2E6E8E)" stroke-width="1.1" stroke-dasharray="{dash}"/>')
                g.append(f'<text x="{cx + ne*kx*0.72 + 3:.1f}" y="{cy - ne*ky*0.72:.1f}" fill="var(--chart,#2E6E8E)">{thr} kt</text>')
        for adv in faint:
            pts = self.track(adv)
            g.append('<polyline points="' + " ".join(f"{X(r.lon):.1f},{Y(r.lat):.1f}" for r in pts) +
                     '" fill="none" stroke="var(--chart-soft,#B9D3DF)" stroke-width="1"/>')
        n = len(advs)
        for i, adv in enumerate(advs):
            pts = self.track(adv)
            op = 0.35 + 0.65 * i / max(1, n - 1)
            g.append(f'<polyline points="' + " ".join(f"{X(r.lon):.1f},{Y(r.lat):.1f}" for r in pts) +
                     f'" fill="none" stroke="var(--chart,#2E6E8E)" stroke-opacity="{op:.2f}" stroke-width="1.8" stroke-dasharray="6 4"/>')
            inside = [r for r in pts if lat0 + 0.6 < r.lat < lat1 - 0.4 and lon0 < r.lon < lon1]
            anchor = min(inside, key=lambda r: abs(r.lat - (lat0 + (lat1 - lat0) * 0.55)))
            g.append(f'<text x="{X(anchor.lon)-6:.1f}" y="{Y(anchor.lat)+4:.1f}" text-anchor="end" fill="var(--chart,#2E6E8E)" fill-opacity="{max(op,0.6):.2f}">Adv {adv}</text>')
        carq = sorted([r for r in self.recs if r.product == "ATCF-CARQ"
                       and (carq_from is None or carq_from <= r.valid)
                       and (carq_to is None or r.valid <= carq_to)], key=lambda r: r.valid)
        carq = [r for r in carq if lat0 < r.lat < lat1 and lon0 < r.lon < lon1]
        g.append('<polyline points="' + " ".join(f"{X(r.lon):.1f},{Y(r.lat):.1f}" for r in carq) +
                 '" fill="none" stroke="var(--ink,#10202B)" stroke-width="2.2"/>')
        for r in carq:
            g.append(f'<circle cx="{X(r.lon):.1f}" cy="{Y(r.lat):.1f}" r="2.6" fill="var(--ink,#10202B)"/>')
            if r.valid[11:13] == label_hour:
                g.append(f'<text x="{X(r.lon)+6:.1f}" y="{Y(r.lat)+4:.1f}" fill="var(--ink,#10202B)">{r.valid[8:10]}/{label_hour}Z {int(r.vmax_kt)} kt</text>')
        g.append("</svg>")
        return "\n".join(g)

    # ---------- emit ----------
    def write(self, manifest: dict, page: str, brief: str):
        self.out.mkdir(parents=True, exist_ok=True)
        BUILD.mkdir(exist_ok=True)
        (self.out / f"{self.ev.slug}.manifest.json").write_text(json.dumps(manifest, indent=1))
        (self.out / "index.html").write_text(page)
        (BUILD / f"brief-{self.ev.slug}.html").write_text(brief)
