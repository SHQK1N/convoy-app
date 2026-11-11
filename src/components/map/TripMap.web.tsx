/**
 * Trip map for the BROWSER (Leaflet + OpenStreetMap tiles). Phone version: TripMap.tsx.
 * Used to test on the PC (with the convoy simulator). Same props, same look.
 *
 * Leaflet is a plain JS library, so we create the map once and update its layers when props change.
 * OpenStreetMap's free tiles are fine for development; a public release should use a tile provider.
 */
import L from 'leaflet';
// Leaflet's CSS is NOT imported here: it references image files Metro can't bundle.
// It's served from public/leaflet/ (a copy of node_modules/leaflet/dist) and linked in public/index.html.
import React, { useEffect, useRef } from 'react';
import { useColours, useIsDark } from '../theme';
import { ageLabel, boundsOf, FOLLOW_ZOOM, MapCar, TripMapProps } from './types';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function carIcon(car: MapCar, card: string, text: string) {
  const name = escapeHtml(car.isMe ? 'You' : car.name) + (car.predicted ? ` · ${ageLabel(car.ageMs)}` : '');
  return L.divIcon({
    className: '', // no default Leaflet box
    iconSize: [0, 0],
    html: `
      <div style="position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;opacity:${car.predicted ? 0.5 : 1};pointer-events:none">
        <div style="background:${card};color:${text};border:2px solid ${car.colour};border-radius:10px;padding:2px 8px;margin-bottom:3px;font:700 13px system-ui,sans-serif;white-space:nowrap">${name}</div>
        <div style="width:22px;height:22px;border-radius:11px;background:${car.colour};border:3px ${car.predicted ? 'dashed' : 'solid'} #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
      </div>`,
  });
}

/**
 * Cars get a new position about once a second; glide between them instead of jumping.
 * (Turned off while zooming, when Leaflet moves markers itself.)
 */
const GLIDE_CSS = '.leaflet-marker-icon{transition:transform 1s linear}.leaflet-zoom-anim .leaflet-marker-icon{transition:none}';

export default function TripMap(props: TripMapProps) {
  const c = useColours();
  const dark = useIsDark();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ route?: L.Polyline; join?: L.Polyline; dest?: L.CircleMarker; stop?: L.Marker; cars: Map<string, L.Marker> }>({ cars: new Map() });

  // My "join the group route" leg (dashed)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.join?.remove();
    layers.current.join = undefined;
    if (props.joinLine && props.joinLine.length > 1) {
      layers.current.join = L.polyline(props.joinLine.map((p) => [p.lat, p.lng] as [number, number]), {
        color: '#1E88E5', weight: 5, opacity: 0.9, dashArray: '8 10',
      }).addTo(m);
    }
  }, [props.joinLine]);

  // Break stop marker
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.stop?.remove();
    layers.current.stop = undefined;
    if (props.stop) {
      const icon = L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="position:absolute;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:17px;background:#fff;border:4px solid ${c.brand};display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 1px 6px rgba(0,0,0,.5)">🛑</div>`,
      });
      layers.current.stop = L.marker([props.stop.lat, props.stop.lng], { icon, zIndexOffset: 2000 })
        .bindTooltip(escapeHtml(props.stop.label))
        .addTo(m);
    }
  }, [props.stop?.lat, props.stop?.lng, props.stop?.label, c.brand]);

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([38.0, 23.7], 7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      className: 'convoy-tiles',
    }).addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
      layers.current = { cars: new Map() };
    };
  }, []);

  // Route + destination
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.route?.remove();
    layers.current.dest?.remove();
    if (props.route.length > 1) {
      layers.current.route = L.polyline(props.route.map((p) => [p.lat, p.lng] as [number, number]), { color: c.brand, weight: 6, opacity: 0.9 }).addTo(m);
    }
    if (props.destination) {
      layers.current.dest = L.circleMarker([props.destination.lat, props.destination.lng], {
        radius: 9, color: '#fff', weight: 3, fillColor: c.brand, fillOpacity: 1,
      }).bindTooltip(props.destination.label ?? 'Destination').addTo(m);
    }
  }, [props.route, props.destination, c.brand]);

  // Cars: move existing markers, add new ones, remove gone ones.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const car of props.cars) {
      seen.add(car.id);
      const icon = carIcon(car, c.card, c.text);
      const existing = layers.current.cars.get(car.id);
      if (existing) {
        existing.setLatLng([car.position.lat, car.position.lng]);
        existing.setIcon(icon);
      } else {
        layers.current.cars.set(car.id, L.marker([car.position.lat, car.position.lng], { icon, zIndexOffset: car.isMe ? 1000 : 0 }).addTo(m));
      }
    }
    for (const [id, marker] of layers.current.cars) {
      if (!seen.has(id)) {
        marker.remove();
        layers.current.cars.delete(id);
      }
    }
  }, [props.cars, c.card, c.text]);

  // Report map drags by the user (not our own panning) so the screen can switch Follow off.
  const onUserMove = useRef(props.onUserMove);
  onUserMove.current = props.onUserMove;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const handler = () => onUserMove.current?.();
    m.on('dragstart', handler);
    return () => {
      m.off('dragstart', handler);
    };
  }, []);

  // Follow me: keep my car centred. First time, zoom in to street level.
  const zoomedIn = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || !props.follow) {
      zoomedIn.current = false;
      return;
    }
    if (!zoomedIn.current) {
      m.setView([props.follow.lat, props.follow.lng], Math.max(m.getZoom(), FOLLOW_ZOOM), { animate: true });
      zoomedIn.current = true;
    } else {
      m.panTo([props.follow.lat, props.follow.lng], { animate: true, duration: 0.8 });
    }
  }, [props.follow?.lat, props.follow?.lng]);

  // Fit to everything when asked, or when the route first arrives (not while following).
  useEffect(() => {
    const b = boundsOf(props);
    if (!b || !map.current || (props.follow && props.fitKey === 0)) return;
    map.current.fitBounds(
      [
        [b.minLat, b.minLng],
        [b.maxLat, b.maxLng],
      ],
      { paddingTopLeft: [40, 120], paddingBottomRight: [40, 220], maxZoom: 15 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey, props.route.length > 0]);

  return (
    <>
      {/* Dark mode: invert the map tiles (cheap night look without a second tile provider). */}
      <style>{(dark ? '.convoy-tiles{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9)}' : '') + GLIDE_CSS}</style>
      {/* zIndex 0 = own stacking context, so Leaflet's internal z-indexes (400+) stay BELOW the
          screen's overlay panels instead of covering them. */}
      <div ref={el} style={{ position: 'absolute', inset: 0, zIndex: 0, background: c.background }} />
    </>
  );
}
