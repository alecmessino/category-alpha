# Felt + GIS Cloud — external workbench audit

**Status:** research only. No production code, methodology, refusal threshold, coastline
geometry or Atlas behaviour was changed by this work.
**Date:** 2026-08-21
**Branch:** `claude/felt-gis-cloud-audit-nghrmp`

---

## 0. Headline

1. **The Felt connector is unusable.** It authenticates and then refuses every operation:
   Felt AI/MCP is an Enterprise entitlement the `Alec` workspace does not have. The Felt
   cartographic-laboratory workstream could not be executed at all. Nothing in section 4 was
   validated in Felt, and it is labelled accordingly.
2. **GIS Cloud works and earned its keep.** It exposes real PostGIS (`::geography`, spatial
   predicates, joins, aggregates) over PostgreSQL-backed layers. Used as an independent
   geometry oracle it **confirmed the Atlas's Hawaii landfall attribution to 4.7 cm** and found
   **zero substantive discrepancies**.
3. **The most valuable findings are about the Atlas, not about the tools.** Forcing the
   archive through a second, independent geometry engine surfaced three provenance gaps in the
   Atlas's *cartography* (not its data): 48.7% of drawn track points are interpolated, 30% of
   landfall marks are derived by straight-line inference, and 744 storms carry a pre-genesis
   track portion — all three currently drawn identically to observed, authoritative fixes.
4. **One genuinely new analytic primitive emerged**: the cohort *closest-approach
   distribution*, which is strictly richer than the current binary landfall count while
   remaining a pure historical count.

**Live artefact:** [Category Alpha — Spatial Validation Lab](https://editor.giscloud.com/map/3244729)
(GIS Cloud map `3244729`; layers `ca_coast`, `ca_landfalls`, `ca_genesis_band`, `ca_tracks`;
bookmarks *Two-C corridor* and *Hawaii landfall validation detail*).

---

## 1. Phase 1 — capability audit

Everything below was established by invoking the connectors. Where a capability is asserted by
vendor documentation but was **not** demonstrable through the connector, it is marked
`DOC-ONLY` and must not be treated as available.

### 1.1 Felt — available tools/actions

The connector advertises **44 tools** (`create_map`, `import_layer_from_url`,
`prepare_file_upload`, `upload_contents_to_map`, `create_layer_from_data_source`,
`create_layer_from_felt_layers`, `generate_fsl`, `update_layer_properties`, `inspect_layer`,
`get_tabular_data_from_felt_layers`, `upsert_annotations`, `set_layer_group_interaction`,
`set_visibility`, `organize_layers`, `share_map`, `render_map`, `browse_felt_library`, …).

**Every one of them except `help_center` refuses.** Verified against `who_am_i`, `list_maps`
and `browse_felt_library`:

> `Felt AI isn't enabled for the "Alec" workspace, so creating and analyzing maps through
> Felt's MCP server isn't available. Felt AI is available on Felt's Enterprise plans.`

`who_am_i` returns workspace `Alec`, user `alec.messino@gmail.com` — so OAuth is fine. The gate
is a **plan entitlement, not a credential problem**, and no amount of retrying or rescoping
will move it. Contact route, per the connector: <https://felt.com/sales>.

`help_center` (documentation retrieval) does answer. That makes Felt's *manual* reachable and
Felt's *maps* unreachable.

### 1.2 GIS Cloud — available tools/actions

**55 tools**, all functional on this account. Grouped by what they actually let you do:

| Area | Tools | Verified |
|---|---|---|
| Maps | `create_map`, `get_map`, `update_map`, `list_maps`, `delete_map`, `render_map` | ✅ created map 3244729 |
| Layers | `create_layer`, `get_layer`, `update_layer`, `list_layers`, `delete_layer`, `get_layer_columns` | ✅ 4 layers created |
| Vector data | `create_feature`, `update_feature`, `bulk_update_features`, `delete_feature`, `list_features`, `get_feature` | ✅ 86 features written |
| Tables | `create_table`, `add_table_columns`, `list_tables`, `get_table`, `create_table_row`, `update_table_row`, `delete_table_row`, `list_table_rows`, `delete_table` | ✅ PG tables, SRID 4326, `ogc_fid` PK |
| **Spatial SQL** | `query_read` (SELECT/UNION, AST-encoded), `query_write` (INSERT/UPDATE/DELETE) | ✅ **full PostGIS `st_*`** |
| Stats | `get_attribute_stats` (`distinct`/`min`/`max`/`minmax`/`info`) | ✅ |
| Storage | `upload_file` (text), `upload_binary_file` (base64), `read_file`, `list_files`, `make_directory`, `unzip_file`, `delete_file`, `import_file` | ✅ |
| Basemaps | `list_basemaps` | ✅ **5 only**: `osm`, `bing`, `bing_sat`, `bing_hyb`, `maps_for_free_relief` |
| External DB | `list_dbconnections` | ✅ returns **0** — no external Postgres attached |
| Views | `create_bookmark`, `get_bookmark`, `update_bookmark`, `list_bookmarks`, `delete_bookmark` | ✅ 2 bookmarks |
| Field collection | `create_form`, `update_form`, `bind_form_to_layer`, `list_forms`, `get_form`, `delete_form` | not exercised (irrelevant here) |
| Session | `get_current_user`, `refresh_access_token`, `list_datasources`, `get_datasource` | ✅ |

### 1.3 Data formats each can ingest/export

**Felt** — `DOC-ONLY`, none of it exercisable. Advertised: CSV, TSV, Excel, GeoJSON, Shapefile
ZIP, KML, KMZ, GPX, MBTiles, FlatGeobuf, GeoPackage, DXF, DWG, GeoTIFF and any GDAL raster;
plus ArcGIS services, WMS and arbitrary URLs via `import_layer_from_url`; plus a **presigned
upload slot** (`prepare_file_upload`) that moves bytes directly without passing them through
the model's output.

**GIS Cloud** — verified ingest paths:

- `create_feature` with **WKT** geometry and an explicit `srid` (used throughout; `srid: 4326`
  is reprojected server-side into the map CRS).
- `upload_file` (text: CSV/JSON/GeoJSON/XML) → `import_file` → PG table.
- `upload_binary_file` (base64, ~8 MB cap) → ZIP auto-extracted → `import_file`.
- `import_file` accepts `.csv/.xls/.xlsx` (lat/lon columns or a WKT column) and
  `.shp/.geojson/.kml/.kmz/.gpx/.gml/.gpkg/.tab/.mif/.dxf/.dgn/.sqlite/.vrt/.fgb`.
- Rasters (`.tif`) **cannot** be imported to a table; they attach as `create_layer(type:"file")`.

**Export** — GIS Cloud has no dedicated export tool, but results come back cleanly:
`query_read` returns JSON rows and `ST_AsText(...)` returns WKT; `list_features(geometry:true,
srid:4326)` returns WKT per feature. Round-trip back into the Category Alpha stack is therefore
straightforward and was used for every result in section 3.

> **The binding constraint nobody would guess from the tool list:** GIS Cloud has **no URL
> ingestion**. Every byte must be inlined through the model's own output. That is what limited
> this audit's payloads, not the feature quota. Felt's `import_layer_from_url` and presigned
> upload solve exactly this problem — and Felt is the one that's switched off.

### 1.4 Raster / WMS / WMTS / vector support

| | Felt | GIS Cloud |
|---|---|---|
| Vector | `DOC-ONLY` | ✅ full, PostGIS-backed |
| Raster file | `DOC-ONLY` (GeoTIFF, GDAL) | ✅ as a `file` layer; 100 MB raster quota; base64-only upload |
| **WMS** | `DOC-ONLY` — docs say Upload Anything → From URL, tiles created server-side | ⚠️ **supported by the platform but NOT by the connector** — `create_layer` explicitly refuses and points to the [manual](https://manual.giscloud.com/knowledge-base/how-to-add-wfs-wms-wmts-and-tms-on-your-map/) for manual addition in the Map Editor |
| **WMTS/TMS/WFS** | `DOC-ONLY`; requires a `GoogleMapsCompatible` TileMatrixSet and a public, unauthenticated service | ⚠️ same — manual only |
| XYZ basemap | `DOC-ONLY` — `create_map(basemap:"https://…/{z}/{x}/{y}.png")` accepts an arbitrary tile URL | ❌ only the 5 account basemaps |

**Consequence for the imagery brief (section 5): neither connector can put GOES, NASA GIBS,
NHC GIS, precipitation, SST, shear, OHC or radar onto a map programmatically.** Felt could if
it were enabled; GIS Cloud cannot, connector-side, at all.

### 1.5 Spatial-analysis capabilities

**Felt** — `get_tabular_data_from_felt_layers` and `create_layer_from_felt_layers` run SQL with
"Felt-specific spatial functions" (`get_sql_guidance` is the documented entry point). Dialect
and function set **could not be established** — the tool is gated.

**GIS Cloud** — genuinely strong, and the surprise of the audit. `query_read` takes a
structured SQL AST and permits *"standard SQL / aggregate functions and PostGIS `st_*` spatial
functions"* (an explicit allowlist — `PostGIS_Version()` was rejected, `ST_Distance` was not).
Demonstrated working:

`ST_Distance` (geometry **and** `::geography`), `ST_DWithin`, `ST_Intersects`, `ST_IsValid`,
`ST_SRID`, `ST_AsText`, `ST_GeomFromText`, `ST_GeogFromText`, `ST_MakePoint`, `ST_SetSRID`,
`ST_Length`; plus `MIN/MAX/AVG/COUNT`, `CASE`, `ROUND`, casts, `GROUP BY`, `ORDER BY`, INNER and
LEFT joins, and relation subqueries.

That is enough to answer every question in the brief's section B.

### 1.6 Styling / cartographic capabilities

**Felt** — FSL (Felt Style Language) via `generate_fsl`, documented to cover categorical,
numeric/class-break, heatmap, **H3 hexbin**, hillshade and raster styling, labels, popups and
filters. Explicitly *cannot* encode two visual dimensions at once (colour **or** size, never
both). `DOC-ONLY`.

**GIS Cloud** — verified: per-class style arrays with SQL-like `expression` filters, RGB fill /
border / width, dash patterns, per-class zoom ranges (`fromlevel`/`tolevel`), point markers
(**circle or box only**), custom PNG marker icons, point clustering, polygon hatch fills,
`labelfield` map labels with font/halo control, legend labels, layer `alpha`.

**Assessment: GIS Cloud's cartographic ceiling is far below the Atlas's.** No continuous data-
driven ramps, no per-vertex styling, no alpha-accumulation rendering, no decimation control, no
canvas compositing. It renders server-side tiles. For *cartographic research* it is the wrong
instrument; for *geometry validation* it is the right one.

### 1.7 Interaction / dashboard capabilities

**Felt** — `DOC-ONLY`: `set_layer_group_interaction` offers `default` (checkbox),
`multi_select`, `single_select`, and **`slider`** (steps through an ordered layer series, one
visible at a time — the interesting one for a storm-season or timeline series);
`upsert_annotations` offers Place/Rectangle/Polygon/Circle/Text/Note/Link/Line markup;
`share_map` offers view / view+comment / view+comment+edit.

**GIS Cloud** — verified: feature info windows (`use_info_window`), hover tooltips (`tooltip`
column), bookmarks (saved viewports), layer folders, per-layer visibility/lock/export flags,
`render_map` inline interactive viewer. No slider, no annotation primitives, no comment threads.

### 1.8 Can results be exported back into our stack?

**Yes, for GIS Cloud** — and this matters, because it means the tool can act as a CI-callable
oracle rather than a place data goes to die. `query_read` returns JSON; `ST_AsText` returns WKT;
`list_features(geometry:true, srid:4326)` returns WKT per feature. Every number in section 3 was
extracted this way.

**Felt** — `get_tabular_data_from_felt_layers` is the documented export path. Not testable.

### 1.9 Authentication / write implications

- **Felt** — OAuth to workspace `Alec`. Read *and* write tools exist (`create_map`,
  `delete_map`, `delete_layer`, `update_layer_properties`, `share_map` up to
  `view_comment_and_edit`). All currently inert. If the plan were upgraded, the connector would
  hold **destructive workspace-wide write** with no confirmation handshake.
- **GIS Cloud** — OAuth to user `309107` (`alec.messino@gmail.com`), a fresh personal account:
  21 stock sample/MDC maps, **`feature_count_limit: 10000`**, `storage_raster_limit: 100 MB`,
  no organization, no external DB connections.
  - Writes to *new* paths/tables execute in one step, **no confirmation**. This audit created a
    map, 4 layers, 4 PG tables, 86 features and 2 bookmarks without a single prompt.
  - Genuinely destructive operations (`delete_*`, `query_write`, overwriting an existing file,
    `import_file` with `overwrite`/`replace`) are gated behind a **two-phase preview/confirm
    handshake** with a 5-minute TTL. This is a real safety property and it held.
  - `query_write` can mutate any PG-backed layer. It was **not used** in this audit.
- **Neither connector was given, or needs, any Category Alpha credential.** Both are one-way:
  we push extracts to them; nothing in the repo reads from them.

### 1.10 Vendor lock-in

**Felt — moderate-to-high, currently theoretical.**
- FSL is a proprietary style format. A cartographic design expressed in FSL does not port.
- The docs are explicit that FSL "must be generated, not hand-written" — i.e. the styling is
  produced by Felt's own model, which is precisely the entitlement that's switched off.
- Maps, annotations, layer groups and interaction modes are Felt-native constructs.
- Mitigations: source data stays ours; `get_tabular_data_from_felt_layers` exports rows.
- **The entitlement gate is itself the lock-in risk made concrete.** A workstream built on Felt
  can be revoked by a billing change, and today has been.

**GIS Cloud — low, if used the way this audit used it.**
- The valuable part is *PostGIS*, which is open and portable. Every query in section 3 is
  ordinary SQL that would run against any PostGIS instance, local Docker included.
- The proprietary parts (map/layer/style/form/bookmark records, `usrsch<id>` schema convention,
  the AST wire format) were used only as scaffolding.
- **The 10,000-feature quota is a hard structural ceiling**: the archive alone is 224,153 track
  points, 3,959 storms and 3,379 landfalls. GIS Cloud can never hold the Atlas. This is a
  *feature* for the recommendation — it forecloses the migration temptation entirely.

---

## 2. What was actually loaded

Within the constraints of 1.3 (no URL ingest) and 1.9 (10k features), the extracts were chosen
to make the *validation* decisive rather than the *coverage* broad. All geometry is at **full
source precision** — nothing was simplified, because a simplified coastline is a different
coastline from the one the archive tested.

| Layer | Rows | Content |
|---|---|---|
| `ca_coast` (7841745) | 14 | The complete `hawaii.geojson` — all 14 polygons, 651 vertices, verbatim |
| `ca_landfalls` (7841746) | 19 | Every Hawaii landfall in the archive, with `region`/`sub_region`/`detection`/`closest_approach_km` |
| `ca_genesis_band` (7841747) | 34 | Every genesis point 0–650 km of 12.0°N 143.7°W, Jul–Sep, ≥1971 — i.e. the cohort **plus the near-miss band** |
| `ca_tracks` (7841748) | 27 | All 26 Two-C cohort tracks + Iniki 1992 as reference |

Representative cases from the brief that were **not** loaded, and why: the broad NA+EP archive
(3,959 storms / 224,153 points — 22× the feature quota), the dense hurricane-season cohort and
the small refused cohort (loadable, but they exercise the same primitives already proven by the
Two-C case at no additional analytic yield). The Hawaii-oriented cohort (67 storms, 2,848
points) is loadable and is the obvious next extract if this work continues.

---

## 3. GIS Cloud workstream — results

### 3.A Independent validation of Atlas geography

#### A1. Landfall-region attribution: **confirmed, zero substantive discrepancies**

Every one of the 19 Hawaii landfalls was re-attributed from scratch by PostGIS
(`ST_Intersects` against the same 14 polygons) and compared to `atlas_sub_region`.

- **13 / 19** agree outright.
- **6 / 19** returned `NULL` from `ST_Intersects`.

The six are **not** errors. Measuring `ST_Distance(polygon::geography, point::geography)` for
each against the island the Atlas names:

| Storm | Island | Detection | Atlas `closest_approach_km` | `ST_Intersects` | Distance to that island |
|---|---|---|---|---|---|
| EP171983 | Oahu | segment_crossing | 12.82 | false | **0.047 m** |
| EP052016 | Kauai | segment_crossing | 13.73 | false | **0.044 m** |
| EP122021 | Molokai | segment_crossing | 2.48 | false | **0.030 m** |
| EP181992 (Iniki) | Kauai | segment_crossing | 41.03 | false | **0.017 m** |
| EP172018 | Maui | segment_crossing | 16.38 | false | **0.000 m** |
| EP172018 | Lanai | segment_crossing | 17.38 | false | **0.000 m** |

**Maximum disagreement across the entire Hawaii landfall record: 4.7 centimetres.** All 14
polygons return `ST_IsValid = true`.

The mechanism is exactly what `geo.py` documents: a `segment_crossing` position *is* the
coastline intercept, so it lies **on** the ring. After a float round-trip it sits nanometres
outside, and `ST_Intersects` — a strict containment predicate — says false. Two rows show
`distance = 0` yet `intersects = false`, which is the textbook boundary-coincidence case.

> **Warning worth carrying forward.** Anyone reimplementing the landfall rule on PostGIS with a
> naive `ST_Intersects` would **silently lose 6 of 19 Hawaii landfalls (32%) — including
> Iniki**, the only modern Hawaii hurricane landfall in the record. `ST_DWithin(..., tolerance)`
> or `ST_Buffer` is mandatory, not optional, for boundary-derived positions.

#### A2. Distance metric: sphere vs ellipsoid, and whether it can move a cohort

The Atlas uses a spherical haversine at `R = 6371.0088 km` (`engine/geo.js`, transliterated
from `analogs.py`). PostGIS `::geography` uses the **WGS84 ellipsoid**. Both were computed for
all 34 genesis points in the 0–650 km band around 12.0°N 143.7°W:

- Disagreement ranges **−1.80 km to +0.69 km** (EMA 1982 at −1.80 km; several at ~+0.69 km).
- The sign is **not monotonic** — it tracks bearing, as it must on an ellipsoid. Predominantly
  E–W legs at low latitude run long; more N–S legs run short.
- Relative error up to **≈0.44%**.

**The boundary case:** ALIKA 2002 sits at **500.345 km** by Atlas haversine — 345 metres outside
the 500 km cut, the closest any storm in the archive comes to flipping this cohort. Under WGS84
it is **500.844 km**, i.e. *also* outside. **No cohort membership changes.** The Two-C cohort is
26 storms under either metric.

**Verdict: not a discrepancy — a documented definitional sensitivity.** Any radius cut is
metric-dependent to about ±1.8 km at these ranges. The Atlas states its metric explicitly, which
is the correct handling. No change recommended.

#### A3. Antimeridian: a real incompatibility, and the archive is on the right side of it

The Atlas unwraps longitudes along each storm (`projectWorld`, `atlas-layer.js`) precisely so a
Central Pacific track does not draw a streak across the planet. 341 storms have a WP genesis and
664 carry a CP track point, so this is the archive's home ground.

Tested directly:

| Test | Result |
|---|---|
| `ST_Length(ST_GeogFromText('LINESTRING(179.9 20, -179.9 20)'))` | **20 929 m** ✅ correct — geography takes the short way |
| `ST_Length(ST_GeomFromText(same, 4326))` | **359.8 degrees** ❌ the long way round the planet |
| `ST_Intersects(that planar line, POLYGON 30–40°W 19–21°N)` | **`true`** ❌ a Central Pacific storm reported as crossing the mid-Atlantic |
| `ST_GeogFromText('LINESTRING(179.9 20, 180.1 20)')` — the Atlas's own unwrapped form | **`ERROR: Coordinate values are out of range [-180 -90, 180 90] for GEOGRAPHY type`** |

Three concrete rules follow for any future PostGIS work on this archive:

1. **Use `::geography`, never planar `geometry`,** for any track/region predicate. The planar
   form does not merely mis-measure — it returns `true` for intersections on the wrong side of
   the planet.
2. **Wrap into [−180, 180] before casting.** Geography *rejects* the Atlas's internal unwrapped
   representation outright. (KEONI, ULEKI and KIKA had to be clipped at the antimeridian for
   this audit; the clip is recorded in `ca_tracks.clipped_antimeridian` and does not affect any
   Hawaii-range result.)
3. **The Atlas's unwrapping is not a workaround — it is load-bearing,** and it is doing a job
   PostGIS geography cannot do at all (representing a continuous multi-wrap track).

#### A4. Regions not validated

CONUS (206 polygons / 33,304 vertices), Mexico (87 / 21,428), Caribbean (159 / 7,822) and
Central America (45 / 6,266) were **not** loaded. Not a capability limit — a throughput limit
(§1.3: no URL ingest, so 1.4 MB of GeoJSON would have to be typed through the model's output).
Hawaii was chosen because it is the acceptance case, it is complete at 17 KB, and it carries the
archive's hardest landfall (Iniki). **No claim is made about the other four regions.** The
method is proven and would transfer unchanged given a byte path.

### 3.B Spatial-query primitives — which belong where

Every primitive in the brief was tested. All work.

| Question | Primitive | Verdict |
|---|---|---|
| Storms forming within X km of a coordinate | `ST_DWithin(geog, pt, X)` | **Already inside Atlas** (`get_analogs`). Nothing to gain. |
| Tracks passing within X km of Hawaii | `ST_DWithin(track::geography, island::geography, X)` | **BUILD** — see 3.C. Not currently in Atlas. |
| Storms intersecting a region | `ST_Intersects` + `::geography` | Already in Atlas via the crossing rule, and Atlas's version is *better* (relocation-aware). Keep Atlas's. |
| First entry into a geographic region | `ST_Intersection` / `ST_LineLocatePoint` | **Offline research.** Atlas already publishes landfall time; "first entry" adds little and would need the relocation guard rebuilt. |
| Historical storm-path frequency near a point | `COUNT(*) … ST_DWithin` | Already in Atlas as `pathwayDensity` (2° cells, each storm once). Atlas's cell-count framing is deliberately better than a smooth surface. Keep. |
| Distance from current storm to historical paths | `ST_Distance(track::geography, live_pt)` | **Offline only, with a hazard warning** — see below. |
| Assets/infrastructure within X km of tracks | `ST_DWithin` against an exposure layer | **Future product.** Clean primitive, no data licence yet. |

Worked example — live CP022026 at 13.106°N 145.049°W against its own analog cohort:

```
UNNAMED 1996 (td)     34.2 km      KEONI 1993 (cat4)     78.3 km
UNNAMED 1998 (td)     65.0 km      KELI  2025 (ts)      100.2 km
ULEKI   1988 (cat3)  100.2 km      WILA  1988 (ts)      103.9 km
```

> **This output is a trap and must be labelled as one.** Spatial proximity of a live centre to a
> historical track is **not** statistical similarity and must never become an analog weight, a
> ranking, or a displayed "closest analog". KEONI (Cat 4) and UNNAMED 1996 (TD) sit 44 km apart
> in this list and have nothing in common. The archive's own weighting is on *genesis* position
> plus season plus environment — which is a defensible conditioning — and this is not that.
> Filed under **REJECT**.

### 3.C Two-C / Hawaii acceptance case

Run end to end, exactly as specified.

**1. Locate the current storm.** `daily_disturbances` carries `epac-202608180100-12.0_-143.7`
first seen 2026-08-18 01:00 Z at 11.990°N 143.740°W with a 50% 7-day formation chance, rising
through 90/90, marked `outcome='developed'` at 2026-08-20 11:47 Z as **CP022026**, last observed
13.106°N 145.049°W. (CP022026 is not yet in `storms.parquet`, built 2026-08-18 — correctly, it
is not yet best-track.)

**2. The historical genesis point Atlas uses.** 12.0°N 143.7°W — the outlook centroid at first
mention, not the later position.

**3. Build the cohort.** Genesis ≤ 500 km, months 7–9, season ≥ 1971 → **26 storms**, all EP
basin / CP subbasin, 1,146 track points. Reproduced independently of the Python and matching.

**4–5. Visualise and query relative to Hawaii.** Minimum distance from each cohort track to any
of the eight **named** Hawaiian islands, `::geography`:

```
n = 26        min 67.1 km        mean 766.1 km        max 1395.1 km
within 250 km:  3 / 26           within 500 km:  6 / 26          landfall:  0 / 26
```

Closest members: **LALA 2026 (cat1) 67.1 km**, UNNAMED 1994 (td) 177.7 km, **ULEKI 1988 (cat3)
249.2 km**. For scale, Iniki 1992 — which is *not* in this cohort — returns 0 km, correctly.

**6. Exposure overlays.** None available. GIS Cloud's basemap set is `osm`, `bing`, `bing_sat`,
`bing_hyb`, `maps_for_free_relief`; there is no population, infrastructure or hazard layer on
this account and no connector path to add a WMS one.

**7. What the archive supports saying.**

> Of the 26 disturbances since 1971 that formed within 500 km of 12.0°N 143.7°W in July–September
> and went on to become tropical cyclones, **none made landfall in Hawaii**. Three came within
> 250 km of a named island; the median analog's closest approach was on the order of 700–800 km.
> These are genesis-conditioned historical counts, not probabilities of anything happening now.

**8. What requires external data.** Everything about CP022026 itself: current intensity and
position beyond the outlook centroid (ATCF/NHC), the official forecast track and cone (NHC), the
current environment (SHIPS/OHC/SST/shear), and any statement about what CP022026 *will* do. The
cohort describes 26 storms that are not CP022026. **The historical analog cohort was not, and
must not be, converted into a forecast.**

---

## 4. Cartographic concepts

> **Provenance warning.** Felt was unavailable (§1.1), so **none of these were prototyped,
> rendered, or visually validated in any external cartographic tool.** They are grounded in
> (a) a close reading of the existing Atlas renderer — `atlas-layer.js`, `population-layer.js`,
> `pathway-layer.js`, `coastline-layer.js`, `hit-test.js`, `palette.js` — and (b) provenance
> gaps that the GIS Cloud validation exercise exposed in the archive's own data. Treat them as
> design proposals with evidence, not as tested designs.

**What the Atlas already does, so it is not re-proposed.** The audit's honest finding is that
the existing cartography is unusually strong and most generic "improvements" would be
regressions:

- Tracks are alpha-accumulated in one restrained ink at rest; a query *lifts* a pool by alpha
  and **never removes the rest**, because the comparison against the whole record is the
  analysis. Selection dims rather than filters.
- Density is **cellular by design** (2° squares, one hue, varying alpha) with the reasoning
  stated in `pathway-layer.js`: *"a smoothed envelope around a set of historical tracks is
  visually indistinguishable from a forecast cone… Squares do not lie that way."*
- Each storm is counted **once per cell**, so a pathway map cannot degrade into a speed map.
- Two density surfaces exist (pathway = cyan, genesis = violet), deliberately different hues,
  each with a legend that names what it counts.
- The coastline is two-tier: the five modelled regions at full contrast from the archive's own
  rings, everything else as low-contrast tile context — *"that contrast difference… says where a
  landfall can be detected at all."* Coast and administrative border are separate line weights.
- Coastline is **never** decimated at draw time (tracks are, by zoom) because a decimated coast
  is a different coast from the one the rule tested.
- Hit-testing selects a genesis point only when it is unambiguously nearer than its neighbours,
  and probes otherwise — *"the interface degrades toward the honest answer rather than toward an
  arbitrary one."*
- Colour is rationed to five jobs; the ramp is separable in monochrome and major hurricanes
  carry extra stroke weight.

That is a better-reasoned cartographic system than Felt's defaults would produce. **The gap is
not aesthetics. It is that the map does not currently distinguish evidence from inference.**

### Concept 1 — Provenance-weighted track ink *(the strongest recommendation in this report)*

**48.7% of the track points the Atlas draws are interpolated.**

```
observed 114,316   interpolated 109,171   provisional 666      (224,153 total)
```

Nearly half the ink on the hero map is 3-hourly in-fill between 6-hourly best-track fixes, and
it is drawn **identically** to observed fixes — same hue, same weight, same alpha. A reader
studying the shape of a track near Hawaii cannot tell which vertices NHC published and which the
build interpolated.

This matters most exactly where the archive is most careful elsewhere. `geo.py` spends pages on
the fact that *"a 6-hourly track cannot tell a physical traverse from a centre relocation"* — and
then the map renders the interpolation that creates that ambiguity as though it were data.

**Treatment.** Keep hue for intensity (colour is already rationed). Encode provenance in
**weight and continuity** instead: observed segments solid at current weight, interpolated
segments at ~0.6 weight with a fine dash, provisional at the same weight with the existing
"unknown" desaturation. This is a second visual dimension that does not compete with the first,
and it is genuinely cheap: `archive.ptQuality`, `qObserved`, `qInterpolated`, `qProvisional` are
**already decoded client-side** (`engine/archive.js:54-58`) and unused by the renderer.

The batching stays intact — segments are already batched by colour rather than by storm, so this
becomes 14 stroke calls instead of 7 in intensity mode, not 3,959.

- Analytical clarity **5/5** · Visual quality **4/5** · Geographic honesty **5/5** ·
  Performance **5/5** · Complexity **2/5 (low)** · **Bring to production: yes, first.**

### Concept 2 — Landfall marks that state their detection kind

**30% of landfall marks are a straight line's opinion.**

```
hurdat2_L_record 1,305    bracketing_fix 1,061    segment_crossing 1,013
Hawaii:  1                          8                        10   (53% derived)
```

`hurdat2_L_record` is NHC's post-storm analyst judgement. `bracketing_fix` is a published fix
that fell inside a polygon. `segment_crossing` is **derived** — both bracketing fixes were over
water and the interpolated great-circle cut the coast; position is a computed intercept and
wind/pressure are linearly interpolated. All three render as the same red dot.

The archive already computes the guard rails and then discards them at the map: `implied_speed_kt`,
`suspect_relocation` (30 rows true), and `closest_approach_km`.

**The Iniki case makes the stakes concrete.** Iniki's Kauai landfall is a `segment_crossing`
whose nearest *published* centre was **41.0 km** offshore. `geo.py`'s own text says *"a
`segment_crossing` whose nearest published centre was 45 km offshore is a straight line's
opinion, not a landfall."* The single most important Hawaii hurricane landfall in the record
sits **4 km inside that threshold.** Archive-wide only 10 rows exceed 45 km and 36 more sit in
the 30–45 km band — so this is a small, tractable, high-consequence population.

**Treatment.** Three mark forms, not three colours: filled disc = `hurdat2_L_record`; filled
disc with a ring = `bracketing_fix`; **hollow ring** = `segment_crossing`, with ring radius
scaled to `closest_approach_km` so a 41 km inference is visibly less certain than a 0.4 km one.
`suspect_relocation = true` gets a cross-bar. Shape survives monochrome and colour blindness and
leaves the LANDFALL hue doing its one job.

- Clarity **5/5** · Visual **4/5** · Honesty **5/5** · Performance **5/5** ·
  Complexity **2/5** · **Bring to production: yes.**

### Concept 3 — Closest-approach distribution as a first-class cohort answer

**Currently the Two-C cohort's Hawaii answer is "0 of 26, 0% [0–13%]". That is correct and it
throws away almost everything the archive knows.**

The same 26 storms carry a full distribution of how close they actually got — min 67.1 km, 3
within 250 km, 6 within 500 km, mean 766 km. A cohort where the nearest analog missed by 67 km
and one where the nearest missed by 1,400 km produce the *same* zero, and they are completely
different evidence. This is the same argument the archive already makes for printing a Wilson
interval on a zero count — applied one level deeper.

**Treatment.** A small distribution strip beside the landfall rate in the cohort panel: a
one-dimensional dot plot of the 26 closest-approach distances, log-ish axis, the named-island
coastline at 0, individual dots retained (n is small — never a histogram, never a KDE). On the
map, an optional *closest-approach mark* per cohort track: a single tick at the vertex where the
minimum occurs.

**This is a historical count/distance, not a probability**, and it must be labelled the way the
existing density legends are labelled. It does not decompose into a forecast and must never be
presented near one.

- Clarity **5/5** · Visual **4/5** · Honesty **4/5** (needs careful labelling) ·
  Performance **4/5** · Complexity **3/5** · **Bring to production: yes.**

### Concept 4 — Pre-genesis track portions drawn as pre-genesis

**744 of 3,959 storms (19%) carry track before genesis** — median 30 h, p90 78 h, max 252 h —
drawn identically to the post-genesis track. The archive distinguishes `first_track_utc` from
`genesis_utc` precisely because the difference matters, and the map does not show it.

For an archive whose entire subject is *genesis*, a reader tracing a line back to its origin is
currently being shown, in 19% of cases, a pre-genesis disturbance segment that looks exactly like
the storm.

**Treatment.** Render the pre-genesis portion in `UNKNOWN_INK` (already outside the intensity
ramp) at reduced weight, terminating at the genesis dot. The genesis mark then reads as what it
is: a threshold on a continuous track, not the start of the line.

- Clarity **4/5** · Visual **4/5** · Honesty **5/5** · Performance **5/5** ·
  Complexity **1/5 (very low)** · **Bring to production: yes.**

### Concept 5 — Landfall concentration as a third counted surface

The brief asks for landfall concentration; pathway frequency and genesis density exist, landfall
concentration does not. `PathwayLayer` is already instantiated twice with different hues — a
third instance fed a landfall-per-cell count is nearly free.

**Caution that decides the design.** A landfall surface must count *landfall events per cell*,
and it inherits the detection-kind problem from Concept 2 — 30% of those events are derived. It
should therefore be built **after** Concept 2 and should offer a "authoritative records only"
toggle, so a reader can see how much of the pattern is NHC's judgement and how much is
straight-line inference. Built without that toggle it would launder inference into apparent fact,
and should not ship.

- Clarity **3/5** · Visual **3/5** · Honesty **3/5** (2/5 without the toggle) ·
  Performance **5/5** · Complexity **2/5** · **Bring to production: only after Concept 2.**

### Interaction principles worth extracting (no Felt UI reproduced)

Felt's `slider` layer-group interaction — an ordered series where exactly one member is visible
at a time — is the one idea worth taking, and only as a *principle*: **an ordered comparison
belongs on a stepper, not on a set of checkboxes.** The Atlas already has a replay deck; the
principle generalises to cohort-vs-archive and storm-vs-cohort comparison, where the current
affordance is alpha emphasis. Not urgent, and the existing dimming model is arguably more honest
because it keeps the comparison population on screen.

Everything else about Felt's interaction model is inferior to what `hit-test.js` already does.

---

## 5. Satellite and meteorological imagery

Tested against the connectors, not against vendor claims.

| Source | Felt | GIS Cloud |
|---|---|---|
| GOES | connector dead | ❌ no connector path |
| NASA GIBS | connector dead | ❌ |
| NHC GIS | connector dead | ❌ |
| Generic WMS/WMTS | `DOC-ONLY` (needs public, unauthenticated, `GoogleMapsCompatible`) | ❌ connector explicitly refuses; Map Editor only |
| Precipitation / SST / shear / OHC / radar | connector dead | ❌ |
| Raster file (GeoTIFF) | `DOC-ONLY` | ⚠️ possible but base64-inline only, ~8 MB/call, 100 MB quota |

**Neither connector can put meteorological imagery on a map programmatically today.**

That conclusion is convenient rather than limiting, and the recommendation would be the same if
they could. The Atlas's basemap is a deliberately dimmed CARTO dark raster at `opacity 0.42` with
the modelled coastline drawn at full contrast **on top**. That contrast ratio is load-bearing —
it is the visual statement of where landfall can be detected at all. Satellite or imagery context
underneath would destroy it, and GOES imagery under a historical track mat would invite the
single most dangerous misreading available here: **observation and historical evidence composited
into one picture**, which is exactly what the brief's separation-of-concerns section forbids.

If imagery is ever wanted, it belongs in a *separate observation view*, not as a layer under the
archive plate. Filed under **REJECT** for production and **FUTURE PRODUCT** for a distinct
observation surface.

---

## 6. Prioritized recommendation

Score = **research value × user value × commercial value ÷ implementation/risk cost**, each
axis 1–5, cost 1 = trivial and safe, 5 = large or methodologically risky.

### BUILD INTO ATLAS

| # | Recommendation | R | U | C | Cost | **Score** |
|---|---|---|---|---|---|---|
| **B1** | **Provenance-weighted track ink** — observed vs interpolated vs provisional by weight/dash. 48.7% of drawn points are interpolated; `ptQuality` is already decoded client-side and unused. | 5 | 5 | 3 | 2 | **37.5** |
| **B2** | **Cohort closest-approach distribution** — replace the bare `0/26` landfall answer with the distance distribution. Pure historical counts. New analytic capability. | 5 | 5 | 4 | 3 | **33.3** |
| **B3** | **Landfall marks by detection kind** — disc / ringed disc / hollow ring for `hurdat2_L_record` / `bracketing_fix` / `segment_crossing`, ring scaled by `closest_approach_km`. 30% of marks are derived. | 5 | 4 | 3 | 2 | **30.0** |
| **B4** | **Pre-genesis track portions** rendered in `UNKNOWN_INK` at reduced weight. 744 storms, median 30 h. Near-zero cost. | 4 | 3 | 2 | 1 | **24.0** |
| **B5** | **Landfall concentration surface** — third `PathwayLayer` instance, **with an authoritative-records-only toggle**. Ship only after B3. | 3 | 4 | 3 | 2 | **18.0** |

*B1, B3 and B4 are all the same insight: the Atlas is scrupulous about provenance in its data
model and silent about it in its ink. Together they are perhaps a week of renderer work and they
close the largest honesty gap in the product.*

### USE OFFLINE

| # | Recommendation | R | U | C | Cost | **Score** |
|---|---|---|---|---|---|---|
| **O1** | **PostGIS as an independent geometry oracle in CI.** A local PostGIS container (not GIS Cloud) re-attributes every landfall from the same GeoJSON and asserts agreement with the archive within a stated tolerance. This audit proved the method on Hawaii at 4.7 cm; extend to CONUS/Mexico/Caribbean/Central America, which this audit could not load. | 5 | 2 | 2 | 2 | **10.0** |
| **O2** | **Antimeridian regression suite** from §3.A3: assert that no track predicate is ever evaluated planar, and that wrapping happens before any geodesic call. The planar failure returns a *false positive across the Atlantic* — silent, not loud. | 4 | 2 | 2 | 2 | **8.0** |
| **O3** | **Radius-boundary sensitivity audit.** ALIKA 2002 is 345 m outside the 500 km Two-C cut; the sphere/ellipsoid choice is worth ±1.8 km. Enumerate every cohort in the product surface whose membership sits within ~2 km of its radius and record it. No methodology change — a documented sensitivity. | 4 | 2 | 2 | 2 | **8.0** |
| **O4** | **GIS Cloud as a scratch geometry workbench** for one-off "is this polygon sane" questions. Genuinely useful, hard-capped at 10k features, zero integration. | 3 | 2 | 1 | 1 | **6.0** |

### FUTURE PRODUCT

| # | Recommendation | R | U | C | Cost | **Score** |
|---|---|---|---|---|---|---|
| **F1** | **Exposure layer, conceptually and visually separate from hazard.** Population, ports, airports, refineries, offshore energy, transmission, FEMA zones. The bridge to institutional weather-risk. The discipline that makes it viable is the one this report keeps recommending: hazard evidence and exposure must never share a colour ramp, a legend, or a composited surface. | 4 | 5 | 5 | 4 | **25.0** |
| **F2** | **Portfolio proximity to historical corridors.** `ST_DWithin(assets, historical_tracks, X)` over a client's own assets — a direct commercial primitive that consumes B2's machinery and stays a historical count. | 4 | 4 | 5 | 4 | **20.0** |
| **F3** | **A separate observation/forecast surface** carrying NHC GIS, ATCF and imagery — architecturally distinct from the archive plate, never composited with it. The four layers (observation / historical evidence / forecast / exposure) need four surfaces, not four toggles on one map. | 3 | 4 | 4 | 5 | **9.6** |

### REJECT

| # | Rejected | Why |
|---|---|---|
| **R1** | Rebuilding the Atlas map in Felt or GIS Cloud | GIS Cloud caps at 10,000 features against 224,153 track points, renders server-side tiles, and offers circle-or-box markers. Its cartographic ceiling is far below the existing renderer's. Felt is unreachable. Both would be regressions. |
| **R2** | Either platform as a runtime dependency | Already excluded by the brief; the audit reinforces it. Felt was revoked by a **billing state**, mid-project. That is the whole argument. |
| **R3** | Proximity of a live centre to historical tracks as an analog signal | §3.B produced a seductive ranked list in which a Cat 4 and a TD sit 44 km apart. Spatial proximity is not statistical similarity. No weights, no ranking, no "closest analog" display derived from it. |
| **R4** | Smoothed / kernel-density / hexbin trajectory corridors | `pathway-layer.js` already rejected this with the right reason: a smoothed envelope around historical tracks is visually indistinguishable from a forecast cone. Felt's H3 hexbin styling would produce exactly this. The 2° cellular grid is the better instrument and should not be "upgraded". |
| **R5** | Satellite / GOES / GIBS raster context under the archive plate | Destroys the modelled-vs-context contrast ratio that states where landfall is detectable, and composites observation with historical evidence. See §5. |
| **R6** | GIS Cloud (or PostGIS) as the coastline or landfall authority | The archive's rule is relocation-aware; `ST_Intersects` is not. A naive PostGIS reimplementation drops 32% of Hawaii landfalls including Iniki. PostGIS is a *check*, never the source. |
| **R7** | Loading the production archive into either platform to "see what it looks like" | Quota-infeasible in GIS Cloud, and the throughput path (inlining bytes through model output) makes it expensive and error-prone. Nothing analytic is gained. |

---

## 7. Boundaries of this audit

- **Felt: nothing was tested.** No map, no layer, no style, no interaction, no screenshot. The
  connector refuses. Section 4 is design reasoning against our own renderer, not Felt output.
- **Four of five landfall regions were not validated** — CONUS, Mexico, Caribbean, Central
  America. Throughput limit (§1.3), not capability limit. The method transfers unchanged.
- **Four of six representative cases were not loaded** — broad NA+EP archive, dense season
  cohort, refused cohort, and the wider Hawaii cohort. Same reason; the Two-C case exercises the
  same primitives.
- **No exposure layer was evaluated against real data.** None is available on this account and
  there is no connector path to add one. Section F1 is a recommendation, not a finding.
- **No imagery was displayed**, so no judgement is offered on whether any specific product helps
  research interpretation — only on whether the connectors can carry it (they cannot).
- **`query_write` was never used.** No GIS Cloud data was mutated after creation, and nothing in
  Category Alpha was written to by either platform.
