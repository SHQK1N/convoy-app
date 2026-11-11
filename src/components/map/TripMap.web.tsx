/**
 * Trip map for the BROWSER (MapLibre GL JS + OpenFreeMap). Phone version: TripMap.tsx.
 * Same props, same look, same map style as the phones.
 *
 * MapLibre is a plain JS library: we create the map once, then update sources/markers when props
 * change.
 * Smoothness:
 *   - Cars glide between positions in MAP coordinates (JS animation), so zooming or switching
 *     Fit all / Follow me never makes them drift.
 *   - Follow me moves the camera continuously at the same pace as the cars (linear 1 s eases
 *     that chain into each other), and can turn the map to the driving direction.
 */
import type * as MapLibre from 'maplibre-gl';

// MapLibre is loaded by a <script type="module"> in public/index.html (bundling it breaks its
// map worker — see scripts/copy-web-libs.js). Types still come from the npm package.
const getMapLibre = () => (globalThis as unknown as { maplibregl?: typeof MapLibre }).maplibregl;
import React, { useEffect, useRef, useState } from 'react';
import { useColours, useIsDark } from '../theme';
import { ageLabel, boundsOf, FOLLOW_ZOOM, MAP_STYLE, MapCar, TripMapProps } from './types';

/** Positions arrive about once a second; animations last the same, so motion never stops. */
const GLIDE_MS = 1000;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function carHtml(car: MapCar, card: string, text: string) {
  const name = escapeHtml(car.isMe ? 'You' : car.name) + (car.predicted ? ` · ${ageLabel(car.ageMs)}` : '');
  return `
    <div style="display:flex;flex-direction:column;align-items:center;opacity:${car.predicted ? 0.5 : 1};pointer-events:none">
      <div style="background:${card};color:${text};border:2px solid ${car.colour};border-radius:10px;padding:2px 8px;margin-bottom:3px;font:700 13px system-ui,sans-serif;white-space:nowrap">${name}</div>
      <div style="width:22px;height:22px;border-radius:11px;background:${car.colour};border:3px ${car.predicted ? 'dashed' : 'solid'} #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
    </div>`;
}

const lineGeo = (pts: { lat: number; lng: number }[]): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) },
});

type Glide = { marker: MapLibre.Marker; from: [number, number]; to: [number, number]; start: number; html: string };

/** Where a glide is right now. */
function glidePos(g: Glide, now: number): [number, number] {
  const t = Math.min(1, (now - g.start) / GLIDE_MS);
  return [g.from[0] + (g.to[0] - g.from[0]) * t, g.from[1] + (g.to[1] - g.from[1]) * t];
}

export default function TripMap(props: TripMapProps) {
  const c = useColours();
  const dark = useIsDark();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre.Map | null>(null);
  const ready = useRef(false);
  const cars = useRef(new Map<string, Glide>());
  const extras = useRef<{ dest?: MapLibre.Marker; stop?: MapLibre.Marker }>({});
  const latest = useRef(props);
  latest.current = props;
  const colours = useRef(c);
  colours.current = c;

  // MapLibre's script may still be loading when this first renders.
  const [libReady, setLibReady] = useState(!!getMapLibre());
  useEffect(() => {
    if (libReady) return;
    const on = () => setLibReady(true);
    window.addEventListener('maplibre-ready', on);
    if (getMapLibre()) on();
    return () => window.removeEventListener('maplibre-ready', on);
  }, [libReady]);

  // ---- create the map (again when light/dark changes: different style) ----
  useEffect(() => {
    if (!el.current || !libReady) return;
    const m = new (getMapLibre()!).Map({
      container: el.current,
      style: dark ? MAP_STYLE.dark : MAP_STYLE.light,
      center: [23.7, 38.0],
      zoom: 7,
      attributionControl: { compact: true },
    });
    map.current = m;
    if (__DEV__) (window as any).__convoyMap = m; // for debugging in the browser console
    m.on('load', () => {
      ready.current = true;
      const p = latest.current;
      m.addSource('route', { type: 'geojson', data: lineGeo(p.route) });
      m.addLayer({
        id: 'route', type: 'line', source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': colours.current.brand, 'line-width': 7, 'line-opacity': 0.9 },
      });
      m.addSource('join', { type: 'geojson', data: lineGeo(p.joinLine ?? []) });
      m.addLayer({ id: 'join', type: 'line', source: 'join', paint: { 'line-color': '#1E88E5', 'line-width': 5, 'line-dasharray': [1.5, 1.5] } });
      if (!p.follow) fitAll();
    });
    // Drags by the user (not our own camera moves) turn Follow off.
    m.on('dragstart', () => latest.current.onUserMove?.());

    // Glide loop: every frame, place each car along its current glide.
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      cars.current.forEach((g) => g.marker.setLngLat(glidePos(g, now)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ready.current = false;
      cars.current.forEach((g) => g.marker.remove());
      cars.current.clear();
      extras.current = {};
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, libReady]);

  function fitAll() {
    const m = map.current;
    const b = boundsOf(latest.current);
    if (!m || !b) return;
    m.fitBounds(
      [
        [b.minLng, b.minLat],
        [b.maxLng, b.maxLat],
      ],
      { padding: { top: 220, bottom: 280, left: 40, right: 40 }, maxZoom: 15, bearing: 0, duration: 800 },
    );
  }

  // ---- route + join line ----
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('route') as MapLibre.GeoJSONSource | undefined)?.setData(lineGeo(props.route));
  }, [props.route]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('join') as MapLibre.GeoJSONSource | undefined)?.setData(lineGeo(props.joinLine ?? []));
  }, [props.joinLine]);

  // ---- destination + break stop markers ----
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    extras.current.dest?.remove();
    extras.current.dest = undefined;
    if (props.destination) {
      const d = document.createElement('div');
      d.style.cssText = `width:18px;height:18px;border-radius:9px;background:${c.brand};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)`;
      d.title = props.destination.label ?? 'Destination';
      extras.current.dest = new (getMapLibre()!).Marker({ element: d }).setLngLat([props.destination.lng, props.destination.lat]).addTo(m);
    }
  }, [props.destination?.lat, props.destination?.lng, c.brand, dark, libReady]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    extras.current.stop?.remove();
    extras.current.stop = undefined;
    if (props.stop) {
      const s = document.createElement('div');
      s.innerHTML = `<div style="width:34px;height:34px;border-radius:17px;background:#fff;border:4px solid ${c.brand};display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 1px 6px rgba(0,0,0,.5)">🛑</div>`;
      s.title = props.stop.label;
      extras.current.stop = new (getMapLibre()!).Marker({ element: s }).setLngLat([props.stop.lng, props.stop.lat]).addTo(m);
    }
  }, [props.stop?.lat, props.stop?.lng, props.stop?.label, c.brand, dark, libReady]);

  // ---- cars: start a new 1 s glide from wherever each car is now ----
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    const now = performance.now();
    for (const car of props.cars) {
      seen.add(car.id);
      const to: [number, number] = [car.position.lng, car.position.lat];
      const html = carHtml(car, c.card, c.text);
      const g = cars.current.get(car.id);
      if (g) {
        g.from = glidePos(g, now);
        g.to = to;
        g.start = now;
        if (g.html !== html) {
          g.marker.getElement().innerHTML = html;
          g.html = html;
        }
        g.marker.getElement().style.zIndex = car.isMe ? '10' : '1';
      } else {
        const e = document.createElement('div');
        e.innerHTML = html;
        e.style.zIndex = car.isMe ? '10' : '1';
        const marker = new (getMapLibre()!).Marker({ element: e, anchor: 'bottom' }).setLngLat(to).addTo(m);
        cars.current.set(car.id, { marker, from: to, to, start: now, html });
      }
    }
    for (const [id, g] of cars.current) {
      if (!seen.has(id)) {
        g.marker.remove();
        cars.current.delete(id);
      }
    }
  }, [props.cars, c.card, c.text, dark]);

  // ---- follow me (+ heading up): one linear 1 s ease per update = continuous motion ----
  const zoomedIn = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || !props.follow) {
      zoomedIn.current = false;
      return;
    }
    const first = !zoomedIn.current;
    zoomedIn.current = true;
    m.easeTo({
      center: [props.follow.lng, props.follow.lat],
      zoom: first ? Math.max(m.getZoom(), FOLLOW_ZOOM) : m.getZoom(),
      bearing: props.followBearing ?? 0,
      // My car sits in the lower part of the screen, so I see more of the road ahead.
      padding: { top: 260, bottom: 120, left: 0, right: 0 },
      duration: first ? 800 : GLIDE_MS,
      // Linear while following, so each 1 s move flows into the next. (Never pass
      // `easing: undefined` — MapLibre would try to call it.)
      easing: first ? (t: number) => 1 - (1 - t) * (1 - t) : (t: number) => t,
    });
  }, [props.follow?.lat, props.follow?.lng, props.followBearing]);

  // ---- fit all on request, or when the route first arrives (not while following) ----
  useEffect(() => {
    if (props.follow) return;
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey, props.route.length > 0]);

  return <div ref={el} style={{ position: 'absolute', inset: 0, zIndex: 0, background: c.background }} />;
}
