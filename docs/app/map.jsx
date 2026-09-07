/* Storm map — Leaflet. NHC forecast track, observed track, and a cone reconstructed from NHC's
   published track-error radii. Layers carry a provenance tag; the eye position is bound to
   MTX.at(T) so scrubbing rewinds geometry too. */
const MT_LAYERS = [
  { id: "satellite", label: "Satellite", prov: "live" },
  { id: "infrared", label: "Enhanced IR", prov: "live" },
  { id: "track", label: "Observed Track", prov: "live" },
  { id: "forecast", label: "NHC Forecast Track", prov: "dynamic" },
  { id: "cone", label: "NHC Cone", prov: "dynamic" },
  /* One line per model run from the ATCF a-deck. Drawn UNDER the official track and the cone,
     in a different weight and a different vocabulary, so a reader cannot take the envelope for
     the cone or the cone for the envelope. What it is and is not: claims.js `guidance.semantics`. */
  { id: "guidance", label: "Model Guidance", prov: "dynamic" },
];
// Layers whose provenance depends on what the current advisory actually delivered.
function layerProv(layer, S, frame) {
  if (layer.prov !== "dynamic") return layer.prov;
  if (layer.id === "forecast") return S && S.track ? "live" : "nofeed";
  if (layer.id === "cone") return S && S.cone ? "live" : "nofeed";
  /* The guidance layer is the one whose availability depends on the CURSOR as well as the feed:
     rewound onto a frame that recorded a different deck, there is nothing this layer may draw,
     and the chip has to say so rather than offering lines that will not appear. */
  if (layer.id === "guidance") {
    if (!(S && S.guidance && S.guidance.aids && S.guidance.aids.length)) return "nofeed";
    if (frame == null || !window.MT_guidanceGeometryAt) return "live";
    return window.MT_guidanceGeometryAt(S, frame) ? "live" : "nofeed";
  }
  return "nofeed";
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/";

/* GOES GeoColor 10-min slots, VIIRS daily as fallback. Each candidate is probed over the
   storm before attaching, so an unpublished slot degrades instead of 404-flooding. */
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

/* NHC's own legend for the graphical outlook: yellow under 40, orange 40-60, red above.
   Matching it is the point — an operator already reads these colours on hurricanes.gov. */
function probColor(p) { return p == null ? "#8ea3bd" : p > 60 ? "#e5443b" : p >= 40 ? "#ff9e1b" : "#ffd23f"; }

/* Marker size by class, so strength is legible on the basin view without opening anything. */
function clsRadius(cls) { return /C[45]/.test(cls) ? 9 : /C[123]/.test(cls) ? 7.5 : cls === "TS" ? 6 : 5; }

/* How each class of aid is drawn. Muted and thin for the members, because there are a dozen of
   them and the point is their disagreement, not any one of them; the consensus aids heavier and
   pale, because they are what the members average to; the previous cycle's official track as a
   dotted ghost, because "what moved" is a comparison and a comparison needs both ends. */
const GUIDANCE_STYLE = {
  global:          { color: "#8ea3bd", weight: 1.1, opacity: 0.55, dashArray: null,  label: "global model" },
  hurricane:       { color: "#f0a860", weight: 1.2, opacity: 0.65, dashArray: null,  label: "hurricane model" },
  "ensemble-mean": { color: "#9fd3c7", weight: 1.1, opacity: 0.6,  dashArray: "2,4", label: "ensemble average" },
  ai:              { color: "#c4a6ff", weight: 1.2, opacity: 0.7,  dashArray: null,  label: "DeepMind" },
  consensus:       { color: "#eaf2ff", weight: 2.0, opacity: 0.85, dashArray: null,  label: "consensus" },
  official:        { color: "#38bdf8", weight: 0,   opacity: 0,    dashArray: null,  label: "official (drawn by the NHC Forecast Track layer)" },
  prevOfcl:        { color: "#7fb2e6", weight: 1.3, opacity: 0.55, dashArray: "1,5", label: "previous cycle official" },
};
window.MT_GUIDANCE_STYLE = GUIDANCE_STYLE;

function MT_Map({ stormId, frame, layers, onSelect, onImagery, height = "100%", resizeKey }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const refs = React.useRef({});
  const [imgState, setImgState] = React.useState('loading');
  /* The map now renders with no storm selected — a basin with areas under watch and nothing
     classified is exactly when you want to see the water. Everything below has to survive S
     being null, starting with the initial view: fall back to the centroid of the watched areas,
     then to the Atlantic hurricane belt. */
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
    map.attributionControl.addAttribution("NHC");
    refs.current.ovl = L.layerGroup().addTo(map);
    mapRef.current = map;
    window.__MT_MAP = map;   // handle for layout/interaction verification
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* Leaflet caches the container size and does not observe it. Anything that changes the box
     without a window resize — a tab switch, a panel collapsing, the shell rescaling — leaves it
     rendering into stale dimensions: grey bands where tiles should be, and a click landing
     several degrees from where it looked. */
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


  // GOES GeoColor, falling back to VIIRS daily.
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (refs.current.sat) { map.removeLayer(refs.current.sat); refs.current.sat = null; }
    if (refs.current.satTimer) { clearInterval(refs.current.satTimer); refs.current.satTimer = null; }
    if (!layers.satellite) { setImgState('off'); return; }
    setImgState('loading');
    let cancelled = false;
    const [la, lo] = home;
    const blank = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

    const attach = (url, attribution, maxNative, fresh) => {
      if (cancelled || !mapRef.current) return;
      if (refs.current.sat) mapRef.current.removeLayer(refs.current.sat);
      const sat = L.tileLayer(url, { opacity: 0.9, maxNativeZoom: maxNative, maxZoom: 8, minZoom: 2,
        tileSize: 256, updateWhenIdle: false, keepBuffer: 4, attribution, errorTileUrl: blank });
      sat.on('load', () => setImgState('ready'));
      sat.addTo(mapRef.current);
      refs.current.sat = sat;
      refs.current.satFresh = fresh;
      /* The slot that actually attached, for the feed-health row: a GOES slot is a real
         10-minute valid time; the VIIRS fallback is a daily composite and is labelled as one. */
      window.__MT_IMAGERY = { attribution, fresh, at: Date.now() };
      window.dispatchEvent(new CustomEvent("mt-imagery", { detail: window.__MT_IMAGERY }));
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
      if (!cancelled) setImgState("none");
      if (!cancelled) { window.__MT_IMAGERY = { attribution: null, fresh: null, at: Date.now() }; window.dispatchEvent(new CustomEvent("mt-imagery", { detail: window.__MT_IMAGERY })); }
      if (typeof onImagery === "function" && !cancelled) onImagery({ attribution: null, fresh: null });
    };

    resolve();
    // Re-resolve every 5 min so a fresh GOES slot replaces the current one automatically.
    refs.current.satTimer = setInterval(resolve, 300000);
    return () => { cancelled = true; if (refs.current.satTimer) clearInterval(refs.current.satTimer); };
  }, [layers.satellite, stormId]);

  /* Band 13 clean-window IR, over the visible product. GeoColor goes dark at night; this
     sees convection at any hour. */
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
            tileSize: 256, updateWhenIdle: false, keepBuffer: 4, errorTileUrl: blank, pane: "overlayPane" });
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

  // vector overlays, rebuilt on storm/layers change
  React.useEffect(() => {
    const map = mapRef.current, g = refs.current.ovl; if (!map || !g) return;
    g.clearLayers();
    /* OVERVIEW — every system and every formation area at once, which is the view you
       actually scan from. The previous version of this branch read a.lat/a.lon; the outlook
       feed has never carried either, so it drew nothing. The polygons are now the real ones
       NHC publishes, joined to the text areas in the pipeline. */
    if (!S) {
      const bounds = [];
      watch.forEach((a) => {
        if (!a.rings || !a.rings.length) return;             // text-only area: listed, not drawn
        const col = probColor(a.pct7d);
        const label = "#" + a.n + " " + a.title + " — " + (a.pct7d ?? "?") + "% / 7d" +
                      (a.pct48 != null ? " · " + a.pct48 + "% / 48h" : "");
        a.rings.forEach((ring) => {
          L.polygon(ring, { color: col, weight: 1.4, opacity: .95, fillColor: col, fillOpacity: .16 })
            .bindTooltip(label, { className: "mt-tt", sticky: true }).addTo(g);
          ring.forEach((pt) => bounds.push(pt));
        });
      });
      Object.values(MT.storms).forEach((st) => {
        const col = cssVar(st.color);
        const dot = L.circleMarker(st.center, { radius: clsRadius(st.cls), color: col, weight: 2.2,
          fillColor: "#0b1830", fillOpacity: 1 });
        dot.on("click", () => onSelect && onSelect(st.id));
        dot.bindTooltip(st.name + " " + st.full_cls + " · " + st.wind + " kt — click to open",
          { direction: "top", className: "mt-tt" });
        dot.addTo(g);
        bounds.push(st.center);
      });
      if (bounds.length > 1) {
        try { map.fitBounds(L.latLngBounds(bounds).pad(0.18), { animate: false, maxZoom: 5 }); } catch { /* degenerate bounds */ }
      }
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
    /* TWO FABRICATING BRANCHES REMOVED HERE, and this note is the reason they are not coming
       back as "harmless placeholders". One drew twelve wind vectors in a ring around the eye
       from a loop counter and called it a scatterometer swath. */
    // eye reticle — position bound to the bitemporal engine (updated per-frame below)
    const eyeAt = (typeof MTX !== "undefined" && MTX.at) ? MTX.at(stormId, frame).center : S.center;
    const icon = L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15],
      html: '<div style="position:relative;width:30px;height:30px;color:' + pc + '">' +
        '<div style="position:absolute;inset:0;border-radius:50%;border:1.5px solid currentColor;opacity:.85;animation:ca-reticle 2.4s ease-out infinite"></div>' +
        '<div style="position:absolute;inset:8px;border-radius:50%;border:1.5px solid currentColor;opacity:.5"></div>' +
        '<div style="position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;background:currentColor;transform:translate(-50%,-50%);box-shadow:0 0 7px 1px currentColor"></div></div>' });
    refs.current.eye = L.marker(eyeAt, { icon, interactive: false, zIndexOffset: 1000 }).addTo(g);
  }, [stormId, layers.cone, layers.track, layers.forecast, layers.recon, layers.ascat, layers.models]);


  /* MODEL GUIDANCE — ITS OWN GROUP, ITS OWN EFFECT, KEYED ON THE CURSOR.
   *
   * The members are one line each; the consensus aids are heavier; the official forecast is NOT
   * redrawn from the deck (the NHC Forecast Track layer already carries the advisory's positions,
   * which are the same forecast). Lead centroids are small crosses with the spread in the tooltip
   * — no ring, because a ring around a centroid reads as a cone.
   *
   * IT LIVES APART FROM THE OTHER OVERLAYS FOR ONE REASON: it is the only layer whose presence
   * depends on WHERE THE CURSOR IS STANDING. The frame stores the envelope's scalars and no
   * geometry, so a rewound cursor may not be shown these lines — they are the deck in hand, and
   * the board did not hold that deck then. `MT_guidanceGeometryAt` is the same predicate the
   * panel uses, so the lines and the panel can never disagree about it. Its own group means
   * scrubbing toggles the lines without rebuilding the cone, the track and the eye every step.
   */
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (!refs.current.guid) refs.current.guid = L.layerGroup().addTo(map);
    const g = refs.current.guid;
    g.clearLayers();
    const S2 = MT.storms[stormId] || null;
    const draw = !!(layers.guidance && S2 && S2.guidance && S2.guidance.aids
      && (!window.MT_guidanceGeometryAt || window.MT_guidanceGeometryAt(S2, frame)));
    /* A verification handle, like window.__MT_MAP above it. The polylines are canvas-drawn
       (preferCanvas), so there is no DOM node a gate could count; this is how
       scripts/check-terminal-responsive.mjs proves the lines are absent under a historical
       cursor rather than merely invisible. Written on every pass, including the zero. */
    const publish = () => { window.__MT_GUIDANCE_DRAWN = g.getLayers().length; };
    if (draw) {
    const G = S2.guidance;
    const latlngs = (tr) => (tr || []).map((p) => [p.lat, p.lon]);
    if (G.prevOfclTrack && G.prevOfclTrack.length > 1) {
      const st = GUIDANCE_STYLE.prevOfcl;
      L.polyline(latlngs(G.prevOfclTrack), { color: st.color, weight: st.weight, opacity: st.opacity, dashArray: st.dashArray, interactive: true })
      .bindTooltip("NHC official forecast, PREVIOUS cycle " + String(G.previousCycle).slice(-2) + "Z — the ghost the current one moved from",
        { className: "mt-tt", sticky: true }).addTo(g);
    }
    const order = ["global", "ensemble-mean", "hurricane", "ai", "consensus"];
    G.aids.filter((a) => a.track && a.track.length > 1 && a.cls !== "official" && a.cls !== "statistical")
      .sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls))
      .forEach((a) => {
      const st = GUIDANCE_STYLE[a.cls] || GUIDANCE_STYLE.global;
      L.polyline(latlngs(a.track), { color: st.color, weight: st.weight, opacity: st.opacity, dashArray: st.dashArray })
        .bindTooltip(a.label + " (" + a.tech + ") · " + st.label + " · cycle " + String(G.cycle).slice(-2) + "Z"
          + (a.peakKt != null ? " · peak " + a.peakKt + " kt at +" + a.peakHr + "h" : " · track aid, no intensity")
          + (a.inSpread ? "" : " · shown, not counted in the spread"),
          { className: "mt-tt", sticky: true }).addTo(g);
      });
    (G.leads || []).forEach((l) => {
      if (!l.centroid || l.n < 2) return;
      const [la, lo] = l.centroid;
      const icon = L.divIcon({ className: "", iconSize: [14, 14], iconAnchor: [7, 7],
      html: '<div style="position:relative;width:14px;height:14px;color:#eaf2ff;opacity:.85">'
          + '<div style="position:absolute;left:6px;top:0;width:2px;height:14px;background:currentColor"></div>'
          + '<div style="position:absolute;top:6px;left:0;height:2px;width:14px;background:currentColor"></div>'
          + '<div style="position:absolute;left:16px;top:-3px;font:700 9px var(--font-mono);letter-spacing:.3px;white-space:nowrap;text-shadow:0 0 3px #000">+' + l.hr + 'h</div></div>' });
      L.marker([la, lo], { icon, interactive: true, zIndexOffset: 500 })
      .bindTooltip("+" + l.hr + "h centroid of " + l.n + " model runs · mean spread " + (l.meanKm ?? "—") + " km, max " + (l.maxKm ?? "—") + " km"
        + " · " + l.scenarios + " scenario" + (l.scenarios === 1 ? "" : "s") + " at " + l.thresholdKm + " km"
        + (l.ofcl && l.ofcl.offsetKm != null ? " · official " + l.ofcl.offsetKm + " km from centroid" : "")
        + " — model disagreement, not a probability and not the cone",
        { className: "mt-tt", direction: "top" }).addTo(g);
    });
    }
    publish();
  }, [stormId, layers.guidance, frame]);

  // bitemporal binding — move ONLY the eye marker as the as-of cursor scrubs, so
  // geometry rewinds with the tables and there is no overlay rebuild / tile flash.
  React.useEffect(() => {
    if (!refs.current.eye || typeof MTX === "undefined" || !MTX.at) return;
    refs.current.eye.setLatLng(MTX.at(stormId, frame).center);
  }, [frame, stormId]);

  /* Skeleton while the imagery resolves, so the map reads as loading rather than as empty
     ocean. Cleared on the tile layer's first load event. */
  return (
    <div style={{ position: "absolute", inset: 0, height }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0, height, background: "var(--slate-950)" }} />
      {layers.satellite && (imgState === "loading" || imgState === "none") && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 400,
          display: "flex", alignItems: "flex-end", justifyContent: "flex-start", padding: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".5px",
            color: "var(--text-2)", background: "color-mix(in srgb, var(--surface-card) 82%, transparent)",
            border: "1px solid var(--border-dim)", borderRadius: 6, padding: "4px 9px" }}>
            {imgState === "loading"
              ? "◌ RESOLVING SATELLITE IMAGERY…"
              : MTC.claim("map.imagery").text}
          </div>
        </div>
      )}
    </div>
  );
}
window.MT_Map = MT_Map;
window.MT_LAYERS = MT_LAYERS;
window.MT_layerProv = layerProv;
