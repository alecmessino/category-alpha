/* Storm Command Map — Leaflet, dark tactical. Real satellite imagery probed live,
   plus the NHC forecast track and a cone reconstructed from NHC's published
   track-error radii. Every layer carries a provenance tag and the eye position is
   bound to the bitemporal engine (MTX.at(T)), so scrubbing rewinds geometry too.

   The catalogue used to carry four permanently-dead toggles for feeds that were
   never wired. Four switches that can never move do not make an operator faster,
   so they are gone; what is deliberately not ingested is stated once, as an owned
   claim, in the observability panel. */
const MT_LAYERS = [
  { id: "satellite", label: "Satellite", prov: "live" },
  /* GeoColor is a daylight product — it goes to a muted night rendering after dark, which
     is exactly when a storm approaching Hawaii is worth watching. Clean-window IR band 13
     sees convection at any hour, so it is the layer that keeps the map informative
     overnight rather than pretty. */
  { id: "infrared", label: "Enhanced IR", prov: "live" },
  /* GFS 10 m wind. A MODEL ANALYSIS, not an observation — a different class of thing from
     an advisory, and the provenance tag says so rather than sitting alongside satellite
     imagery as if they were the same kind of fact. */
  { id: "wind", label: "Surface wind (GFS)", prov: "dynamic" },
  { id: "track", label: "Observed Track", prov: "live" },
  { id: "forecast", label: "NHC Forecast Track", prov: "dynamic" },
  { id: "cone", label: "NHC Cone", prov: "dynamic" },
];
// Layers whose provenance depends on what the current advisory actually delivered.
function layerProv(layer, S) {
  if (layer.prov !== "dynamic") return layer.prov;
  if (layer.id === "forecast") return S && S.track ? "live" : "nofeed";
  if (layer.id === "cone") return S && S.cone ? "live" : "nofeed";
  return "nofeed";
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/";

/* Satellite imagery, freshest-first.
   1) GOES ABI GeoColor — geostationary, published every 10 minutes. We step BACK in
      10-minute increments from the last slot so a not-yet-published frame is skipped
      instead of leaving the map blank (this is what made imagery look stale).
   2) VIIRS/NOAA-20 daily true-color — the reliable global fallback, walked back by day.
   Every candidate is probed on a tile over the actual storm before being attached, so
   an unavailable product degrades silently to the next option, never to a 404 flood. */
const GOES_TMS = "GoogleMapsCompatible_Level7";
const VIIRS_LAYER = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
const VIIRS_TMS = "GoogleMapsCompatible_Level9";

function goesLayerFor(lon) { return lon != null && lon < -100 ? "GOES-West_ABI_GeoColor" : "GOES-East_ABI_GeoColor"; }
function goesIrFor(lon) {
  return (lon != null && lon < -100 ? "GOES-West" : "GOES-East") + "_ABI_Band13_Clean_Infrared";
}
function goesSlot(backSteps) {
  // GOES full-disk publishes on 10-minute boundaries; allow a lag before "now".
  const t = new Date(Date.now() - (backSteps * 10 + 15) * 60000);
  t.setUTCMinutes(Math.floor(t.getUTCMinutes() / 10) * 10, 0, 0);
  return t.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function goesUrl(layer, iso) {
  return GIBS + layer + "/default/" + iso + "/" + GOES_TMS + "/{z}/{y}/{x}.png";
}
function viirsDay(back) {
  const d = new Date(Date.now() - back * 86400000);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function viirsUrl(date) {
  return GIBS + VIIRS_LAYER + "/default/" + date + "/" + VIIRS_TMS + "/{z}/{y}/{x}.jpg";
}
// Web-mercator tile covering the storm, so we probe imagery where it actually matters.
function tileFor(lat, lon, z) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}
function probe(urlTemplate, lat, lon, z) {
  const { x, y } = tileFor(lat, lon, z);
  const url = urlTemplate.replace("{z}", z).replace("{x}", x).replace("{y}", y);
  return new Promise((res) => {
    const img = new Image();
    const to = setTimeout(() => res(false), 6000);
    img.onload = () => { clearTimeout(to); res(true); };
    img.onerror = () => { clearTimeout(to); res(false); };
    img.src = url;
  });
}
function cssVar(v) {
  const m = /var\((--[\w-]+)\)/.exec(v); if (!m) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#38bdf8";
}

function MT_Map({ stormId, frame, layers, onSelect, onImagery, height = "100%", resizeKey }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const refs = React.useRef({});
  /* The map now renders with no storm selected — a basin with areas under watch and
     nothing classified is exactly when you want to see the water. Everything below has to
     survive S being null, starting with the initial view: fall back to the centroid of the
     watched areas, then to the Atlantic hurricane belt. */
  const S = MT.storms[stormId] || null;
  const watch = (window.MT && MT._outlook) || [];
  const home = S && S.center ? S.center
    : watch.length ? [15, watch.some((a) => a.basin === "pacific") ? -130 : -50]
    : [18, -55];

  // init once
  React.useEffect(() => {
    if (mapRef.current || !elRef.current || typeof L === "undefined") return;
    const map = L.map(elRef.current, { preferCanvas: true, zoomControl: false, attributionControl: true, minZoom: 2, maxZoom: 8, zoomSnap: 0.25 })
      .setView(home, S ? 5 : 3);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 9, opacity: 0.62, attribution: "© OpenStreetMap · CARTO" }).addTo(map);
    map.attributionControl.addAttribution("NASA GIBS · NHC");
    refs.current.ovl = L.layerGroup().addTo(map);
    mapRef.current = map;
    window.__MT_MAP = map;   // handle for layout/interaction verification
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* Leaflet caches the container size and does not observe it. Anything that changes the
     box without a window resize — a tab switch, a panel collapsing, the shell rescaling —
     leaves it rendering into stale dimensions: grey bands where tiles should be, and a
     click landing several degrees from where it looked. invalidateSize is the fix and it
     has to be called on every one of those, not only on window resize. */
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const id = setTimeout(() => map.invalidateSize({ animate: false }), 60);
    return () => clearTimeout(id);
  }, [resizeKey]);

  React.useEffect(() => {
    const map = mapRef.current, el = elRef.current;
    if (!map || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // recenter on storm change
  React.useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo(home, S ? 5 : 3, { duration: 0.7 });
  }, [stormId]);

  // Satellite raster: try 10-minute GOES GeoColor slots first (stepping back so an
  // unpublished frame never blanks the map), then fall back to daily VIIRS.
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (refs.current.sat) { map.removeLayer(refs.current.sat); refs.current.sat = null; }
    if (refs.current.satTimer) { clearInterval(refs.current.satTimer); refs.current.satTimer = null; }
    if (!layers.satellite) return;   // imagery does not need a classified storm
    let cancelled = false;
    const [la, lo] = home;
    const blank = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

    const attach = (url, attribution, maxNative, fresh) => {
      if (cancelled || !mapRef.current) return;
      if (refs.current.sat) mapRef.current.removeLayer(refs.current.sat);
      const sat = L.tileLayer(url, { opacity: 0.9, maxNativeZoom: maxNative, maxZoom: 8, minZoom: 2,
        tileSize: 256, updateWhenIdle: true, attribution, errorTileUrl: blank });
      sat.addTo(mapRef.current);
      refs.current.sat = sat;
      refs.current.satFresh = fresh;
      if (typeof onImagery === "function") onImagery({ attribution, fresh });
    };

    const resolve = async () => {
      const goes = goesLayerFor(lo);
      for (let back = 0; back < 12 && !cancelled; back++) {   // up to ~2h back, 10-min steps
        const iso = goesSlot(back);
        const url = goesUrl(goes, iso);
        if (await probe(url, la, lo, 4)) {
          attach(url, goes.replace(/_/g, " ").replace(" ABI GeoColor", "") + " " + iso.slice(11, 16) + "Z", 7,
            { product: "GOES GeoColor", at: iso });
          return;
        }
      }
      for (let back = 0; back < 7 && !cancelled; back++) {     // daily VIIRS fallback
        const date = viirsDay(back);
        const url = viirsUrl(date);
        if (await probe(url, la, lo, 5)) {
          attach(url, "VIIRS " + date, 8,
            { product: "VIIRS daily", at: date });
          return;
        }
      }
      if (typeof onImagery === "function" && !cancelled) onImagery({ attribution: null, fresh: null });
    };

    resolve();
    // Re-resolve every 5 min so a fresh GOES slot replaces the current one automatically.
    refs.current.satTimer = setInterval(resolve, 300000);
    return () => { cancelled = true; if (refs.current.satTimer) clearInterval(refs.current.satTimer); };
  }, [layers.satellite, stormId]);

  /* Clean-window infrared, over the top. Same 10-minute cadence and the same
     probe-before-attach discipline as GeoColor, so an unpublished slot degrades to the
     previous one instead of tiling the ocean with 404s. Drawn above the visible product
     because the convective structure is the point; opacity keeps the coastlines readable. */
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (refs.current.ir) { map.removeLayer(refs.current.ir); refs.current.ir = null; }
    if (refs.current.irTimer) { clearInterval(refs.current.irTimer); refs.current.irTimer = null; }
    if (!layers.infrared) return;
    let cancelled = false;
    const [la, lo] = home;
    const blank = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    const resolveIr = async () => {
      const lyr = goesIrFor(lo);
      for (let back = 0; back < 12 && !cancelled; back++) {
        const iso = goesSlot(back);
        const url = goesUrl(lyr, iso);
        if (await probe(url, la, lo, 4)) {
          if (cancelled || !mapRef.current) return;
          if (refs.current.ir) mapRef.current.removeLayer(refs.current.ir);
          const ir = L.tileLayer(url, { opacity: 0.55, maxNativeZoom: 7, maxZoom: 8, minZoom: 2,
            tileSize: 256, updateWhenIdle: true, errorTileUrl: blank, pane: "overlayPane" });
          ir.addTo(mapRef.current);
          refs.current.ir = ir;
          return;
        }
      }
    };
    resolveIr();
    refs.current.irTimer = setInterval(resolveIr, 300000);
    return () => { cancelled = true; if (refs.current.irTimer) clearInterval(refs.current.irTimer); };
  }, [layers.infrared, stormId]);

  /* ---- Wind particles ----
     A canvas layer over the map, advecting particles through the GFS grid. Written here
     rather than pulled in, for the same reason nothing else in this project has a CDN
     dependency: the field is 7,400 vectors and the renderer is bilinear interpolation
     plus a fading trail. Roughly eighty lines against a vendored library and its own
     coordinate conventions to get wrong.

     Every particle position comes from the ingested u/v grid. There is no noise term and
     no synthetic motion anywhere in it — if the field is absent, nothing draws. */
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const W = window.MT && MT._wind;
    const kill = () => {
      if (refs.current.windRaf) cancelAnimationFrame(refs.current.windRaf);
      if (refs.current.windCanvas && refs.current.windCanvas.parentNode) refs.current.windCanvas.parentNode.removeChild(refs.current.windCanvas);
      if (refs.current.windMove) { map.off("move zoom resize", refs.current.windMove); refs.current.windMove = null; }
      refs.current.windRaf = null; refs.current.windCanvas = null;
    };
    kill();
    if (!layers.wind || !W || !W.fields || W.fields.length < 2) return;

    const g = W.grid, u = W.fields[0].data, v = W.fields[1].data;
    const pane = map.getPanes().overlayPane;
    const cv = L.DomUtil.create("canvas", "mt-wind");
    cv.style.position = "absolute"; cv.style.pointerEvents = "none"; cv.style.zIndex = 401;
    pane.appendChild(cv);
    refs.current.windCanvas = cv;
    const ctx = cv.getContext("2d");

    /* Bilinear sample of the grid at a lat/lon. Rows run north-first — the fetcher
       normalises scan mode before writing — so row 0 is la1 and j grows southward. */
    const sample = (lat, lon) => {
      let x = (((lon - g.lo1) % 360) + 360) % 360 / g.dx;
      const y = (g.la1 - lat) / g.dy;
      if (y < 0 || y > g.ny - 1 || x < 0 || x > g.nx - 1) return null;
      const i0 = Math.floor(x), j0 = Math.floor(y);
      const i1 = Math.min(i0 + 1, g.nx - 1), j1 = Math.min(j0 + 1, g.ny - 1);
      const fx = x - i0, fy = y - j0;
      const at = (arr, i, j) => arr[j * g.nx + i];
      const bil = (arr) =>
        at(arr, i0, j0) * (1 - fx) * (1 - fy) + at(arr, i1, j0) * fx * (1 - fy) +
        at(arr, i0, j1) * (1 - fx) * fy + at(arr, i1, j1) * fx * fy;
      return [bil(u), bil(v)];
    };

    const N = 2200;
    let parts = [];
    const reset = (p) => {
      const b = map.getBounds();
      p.lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth());
      p.lon = b.getWest() + Math.random() * (b.getEast() - b.getWest());
      p.age = Math.random() * 60;
      return p;
    };
    const resize = () => {
      const size = map.getSize();
      cv.width = size.x; cv.height = size.y;
      const tl = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(cv, tl);
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts = new Array(N).fill(0).map(() => reset({}));
    };
    resize();
    refs.current.windMove = resize;
    map.on("move zoom resize", resize);

    const step = () => {
      // Fade rather than clear: the trail IS the streamline.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 1;
      const zScale = 0.06 / Math.pow(2, map.getZoom() - 4);
      for (const p of parts) {
        const s = sample(p.lat, p.lon);
        if (!s || p.age > 60) { reset(p); continue; }
        const [uu, vv] = s;
        const nlat = p.lat + vv * zScale, nlon = p.lon + uu * zScale / Math.max(0.2, Math.cos(p.lat * Math.PI / 180));
        const a = map.latLngToContainerPoint([p.lat, p.lon]);
        const b = map.latLngToContainerPoint([nlat, nlon]);
        const spd = Math.hypot(uu, vv);
        ctx.strokeStyle = spd > 17 ? "rgba(248,113,113,.85)" : spd > 10 ? "rgba(251,191,36,.75)" : "rgba(125,211,252,.55)";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        p.lat = nlat; p.lon = nlon; p.age++;
      }
      refs.current.windRaf = requestAnimationFrame(step);
    };
    step();
    return kill;
  }, [layers.wind, stormId]);

  // vector overlays, rebuilt on storm/layers change
  React.useEffect(() => {
    const map = mapRef.current, g = refs.current.ovl; if (!map || !g) return;
    g.clearLayers();
    if (!S) {
      // No classified system: still plot every area NHC is watching, so the map is never blank.
      watch.forEach((a) => {
        if (a.lat == null || a.lon == null) return;
        L.circleMarker([a.lat, a.lon], { radius: 6, color: "var(--warn)", weight: 2, fillOpacity: .25 })
          .bindTooltip((a.id ? a.id + " · " : "") + a.title + " — " + (a.pct7d ?? "?") + "% / 7d", { className: "mt-tt" })
          .addTo(g);
      });
      return;
    }
    const pc = cssVar(S.color);
    // all storms as selectable dots
    Object.values(MT.storms).forEach((st) => {
      const on = st.id === stormId;
      const dot = L.circleMarker(st.center, { radius: on ? 7 : 5, color: cssVar(st.color), weight: 2, fillColor: "#0b1830", fillOpacity: 1 });
      dot.on("click", () => onSelect && onSelect(st.id));
      dot.bindTooltip(st.name + " " + st.cls, { direction: "top", className: "mt-tt" });
      dot.addTo(g);
    });
    if (layers.cone && S.cone) {
      L.polygon(S.cone, { stroke: false, fillColor: pc, fillOpacity: 0.10 })
        .bindTooltip("NHC cone — reconstructed from forecast positions + published track-error radii", { className: "mt-tt", sticky: true }).addTo(g);
      L.polygon(S.cone, { color: pc, weight: 1.1, opacity: 0.85, dashArray: "3,5", fill: false }).addTo(g);
    }
    if (layers.forecast && S.track && S.track.length > 1) {
      L.polyline(S.track, { color: "#38bdf8", weight: 1.9, opacity: 0.95, dashArray: "5,5" }).addTo(g);
      (S.trackPoints || []).forEach((tp, i) => {
        if (i === 0) return; // current fix is the eye reticle
        L.circleMarker(tp.at, { radius: 3.2, color: "#38bdf8", fillColor: "#0b1830", fillOpacity: 1, weight: 1.5 })
          .bindTooltip("+" + tp.hr + "h · " + String(tp.validZ || "").replace("T", " ").replace(/\..*/, "Z"),
            { direction: "top", className: "mt-tt" }).addTo(g);
      });
    }
    if (layers.track) {
      // REAL observed track: the storm's committed positions across replay history.
      const obs = (MT._frames || []).map((fr) => fr.storms && fr.storms[stormId] && fr.storms[stormId].center).filter(Boolean);
      if (obs.length >= 2) {
        L.polyline(obs, { color: "#e2e8f0", weight: 2, opacity: 0.9 }).addTo(g);
        obs.forEach((p) => L.circleMarker(p, { radius: 2.4, color: "#e2e8f0", fillColor: "#0b1830", fillOpacity: 1, weight: 1.3 }).addTo(g));
      }
    }
    if (layers.recon && S.reconTracks) {
      S.reconTracks.forEach((rt) => {
        L.polyline(rt.points, { color: rt.color, weight: 1.6, opacity: 0.9 }).addTo(g);
        const head = rt.points[rt.points.length - 1];
        L.circleMarker(head, { radius: 3.4, color: rt.color, fillColor: "#0b1830", fillOpacity: 1, weight: 1.8 })
          .bindTooltip(rt.label, { direction: "top", className: "mt-tt" }).addTo(g);
        (rt.sondes || []).forEach((p) => L.circleMarker(p, { radius: 2.2, color: rt.color, fillColor: rt.color, fillOpacity: 0.85, weight: 0 })
          .bindTooltip(rt.id + " dropsonde", { direction: "top", className: "mt-tt" }).addTo(g));
      });
    }
    if (layers.ascat) {
      // seeded surface wind vectors near the core (schematic ASCAT swath)
      const [la, lo] = S.center;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2, r = 1.4 + (i % 3) * 0.5;
        const p0 = [la + Math.sin(ang) * r, lo + Math.cos(ang) * r];
        const p1 = [p0[0] + Math.cos(ang + 1.4) * 0.5, p0[1] + Math.sin(ang + 1.4) * 0.5];
        L.polyline([p0, p1], { color: "#34d399", weight: 1.2, opacity: 0.7 }).addTo(g);
      }
    }
    if (layers.models && S.track) {
      const c = S.track[S.pastIdx], end = S.track[S.track.length - 1];
      MT.models.forEach((m, i) => {
        const spread = (i - 1.5) * 0.9;
        L.polyline([c, [end[0] + spread, end[1] - spread * 0.6]], { color: cssVar(m.color), weight: 1.3, opacity: 0.65, dashArray: "3,4" }).addTo(g);
      });
    }
    // eye reticle — position bound to the bitemporal engine (updated per-frame below)
    const eyeAt = (typeof MTX !== "undefined" && MTX.at) ? MTX.at(stormId, frame).center : S.center;
    const icon = L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15],
      html: '<div style="position:relative;width:30px;height:30px;color:' + pc + '">' +
        '<div style="position:absolute;inset:0;border-radius:50%;border:1.5px solid currentColor;opacity:.85;animation:ca-reticle 2.4s ease-out infinite"></div>' +
        '<div style="position:absolute;inset:8px;border-radius:50%;border:1.5px solid currentColor;opacity:.5"></div>' +
        '<div style="position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;background:currentColor;transform:translate(-50%,-50%);box-shadow:0 0 7px 1px currentColor"></div></div>' });
    refs.current.eye = L.marker(eyeAt, { icon, interactive: false, zIndexOffset: 1000 }).addTo(g);
  }, [stormId, layers.cone, layers.track, layers.forecast, layers.recon, layers.ascat, layers.models]);

  // bitemporal binding — move ONLY the eye marker as the as-of cursor scrubs, so
  // geometry rewinds with the tables and there is no overlay rebuild / tile flash.
  React.useEffect(() => {
    if (!refs.current.eye || typeof MTX === "undefined" || !MTX.at) return;
    refs.current.eye.setLatLng(MTX.at(stormId, frame).center);
  }, [frame, stormId]);

  return <div ref={elRef} style={{ position: "absolute", inset: 0, height, background: "var(--slate-950)" }} />;
}
window.MT_Map = MT_Map;
window.MT_LAYERS = MT_LAYERS;
window.MT_layerProv = layerProv;
