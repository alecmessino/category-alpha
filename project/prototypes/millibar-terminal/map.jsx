/* Storm Command Map — Leaflet, dark tactical. A CARTO dark raster field under
   vector-first cartography: real NASA GIBS VIIRS imagery (probed live), NHC cone +
   track, recon flight track, ASCAT vectors, and multi-model consensus spread. Each
   layer carries an honest provenance tag (live / seeded / no-feed). The eye position
   is bound to the bitemporal engine (MTX.at(T)) so scrubbing rewinds geometry too. */
const MT_LAYERS = [
  { id: "satellite", label: "VIIRS Satellite", prov: "live" },
  { id: "cone", label: "NHC Cone", prov: "seeded" },
  { id: "track", label: "Forecast Track", prov: "seeded" },
  { id: "recon", label: "Recon Track", prov: "seeded" },
  { id: "ascat", label: "ASCAT Winds", prov: "seeded" },
  { id: "models", label: "Model Consensus", prov: "seeded" },
  { id: "particles", label: "Particle Wind (SFMR)", prov: "nofeed" },
];

function pad2(n) { return (n < 10 ? "0" : "") + n; }
// NASA GIBS sub-hourly GOES layers aren't retained in this environment; VIIRS/NOAA-20
// daily true-color IS, globally and reliably. Key the basemap to a recent UTC day and
// probe before attaching so an unreachable feed degrades to vector-only with no 404s.
const GIBS_SAT_LAYER = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
const GIBS_SAT_TMS = "GoogleMapsCompatible_Level9";
function gibsDay(back) {
  const d = new Date(Date.now() - back * 86400000);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function gibsUrl(date) {
  return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + GIBS_SAT_LAYER +
    "/default/" + date + "/" + GIBS_SAT_TMS + "/{z}/{y}/{x}.jpg";
}
function gibsProbe(date) {
  // Probe the actual storm-region tile (z5, Gulf) rather than a global low-zoom tile,
  // so a day whose regional pass hasn't published yet is skipped cleanly (no 404 flood).
  return new Promise((res) => {
    const img = new Image();
    const to = setTimeout(() => res(false), 6000);
    img.onload = () => { clearTimeout(to); res(true); };
    img.onerror = () => { clearTimeout(to); res(false); };
    img.src = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + GIBS_SAT_LAYER +
      "/default/" + date + "/" + GIBS_SAT_TMS + "/5/13/7.jpg";
  });
}
function cssVar(v) {
  const m = /var\((--[\w-]+)\)/.exec(v); if (!m) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#38bdf8";
}

function MT_Map({ stormId, frame, layers, onSelect, height = "100%" }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const refs = React.useRef({});
  const S = MT.storms[stormId];

  // init once
  React.useEffect(() => {
    if (mapRef.current || !elRef.current || typeof L === "undefined") return;
    const map = L.map(elRef.current, { preferCanvas: true, zoomControl: false, attributionControl: true, minZoom: 2, maxZoom: 8, zoomSnap: 0.25 })
      .setView(S.center, 5);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 9, opacity: 0.62, attribution: "© OpenStreetMap · © CARTO" }).addTo(map);
    map.attributionControl.addAttribution("Imagery NASA GIBS / VIIRS · tracks NHC · SEEDED");
    refs.current.ovl = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // recenter on storm change
  React.useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo(S.center, S.basin === "east" ? 5 : 5, { duration: 0.7 });
  }, [stormId]);

  // Satellite raster (VIIRS/NOAA-20 daily true-color via GIBS). Probe recent UTC days
  // and attach the freshest that resolves; if none do, stay vector-only silently.
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (refs.current.sat) { map.removeLayer(refs.current.sat); refs.current.sat = null; }
    if (!layers.satellite) return;
    let cancelled = false;
    (async () => {
      for (let back = 0; back < 7 && !cancelled; back++) {
        const date = gibsDay(back);
        const ok = await gibsProbe(date);
        if (cancelled || !mapRef.current) return;
        if (ok) {
          const sat = L.tileLayer(gibsUrl(date), {
            opacity: 0.9, maxNativeZoom: 8, maxZoom: 8, minZoom: 2, tileSize: 256, updateWhenIdle: true,
            attribution: "VIIRS/NOAA-20 true-color · " + date + " · NASA GIBS",
            errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" });
          sat.addTo(mapRef.current); refs.current.sat = sat;
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [layers.satellite]);

  // vector overlays, rebuilt on storm/layers change
  React.useEffect(() => {
    const map = mapRef.current, g = refs.current.ovl; if (!map || !g) return;
    g.clearLayers();
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
      L.polygon(S.cone, { stroke: false, fillColor: pc, fillOpacity: 0.09 }).addTo(g);
      L.polygon(S.cone, { color: pc, weight: 1.1, opacity: 0.8, dashArray: "2,6", fill: false }).addTo(g);
    }
    if (layers.track && S.track) {
      const past = S.track.slice(0, S.pastIdx + 1), fut = S.track.slice(S.pastIdx);
      L.polyline(past, { color: "#e2e8f0", weight: 2, opacity: 0.9 }).addTo(g);
      L.polyline(fut, { color: "#38bdf8", weight: 1.8, opacity: 0.9, dashArray: "5,5" }).addTo(g);
      S.track.forEach((p, i) => L.circleMarker(p, { radius: 2.6, color: i <= S.pastIdx ? "#e2e8f0" : "#38bdf8", fillColor: "#0b1830", fillOpacity: 1, weight: 1.4 }).addTo(g));
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
  }, [stormId, layers.cone, layers.track, layers.recon, layers.ascat, layers.models]);

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
