/* Storm map — Leaflet. NHC forecast track, observed track, and a cone reconstructed from NHC's
   published track-error radii. Layers carry a provenance tag; the eye position is bound to
   MTX.at(T) so scrubbing rewinds geometry too. */
const MT_LAYERS = [
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

function cssVar(v) {
  const m = /var\((--[\w-]+)\)/.exec(v); if (!m) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#38bdf8";
}

function MT_Map({ stormId, frame, layers, onSelect, height = "100%", resizeKey }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const refs = React.useRef({});
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
