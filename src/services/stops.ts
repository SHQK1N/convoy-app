/**
 * Find places to stop along the route ahead (fuel stations, toilets, motorway services, rest areas).
 * The choice itself is made by pickStop() in src/lib/halt.ts.
 *
 * Sources, tried in order (all free, all OpenStreetMap data):
 *   1. OpenRouteService "POIs" — same key as routing (EXPO_PUBLIC_ORS_KEY), reliable.
 *      Docs: https://openrouteservice.org/dev/#/api-docs/pois
 *   2. Overpass API (public servers, no key) — often overloaded, so only a backup.
 * If everything fails, pickStop() falls back to "the next safe place to pull over".
 */
import { CONFIG } from '../config';
import type { LatLng } from '../lib/geo';
import { cumulativeDistances, pointAlongRoute } from '../lib/geo';
import { Candidate, STOP_MAX_OFFSET_M } from '../lib/halt';

const ORS_KEY = process.env.EXPO_PUBLIC_ORS_KEY ?? '';
/** OpenRouteService POI category ids: fuel station, public toilets. */
const ORS_CATEGORIES = [596, 179];
/** ORS limits the search area; 300 m either side of ~40 km of road stays well inside it. */
const ORS_BUFFER_M = 300;
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const SAMPLE_EVERY_M = 1000;
const TIMEOUT_MS = 12000;

/** Candidates near the route between (front car + minimum) and the search limit ahead. */
export async function findStopsAhead(route: LatLng[], frontAlongM: number): Promise<Candidate[]> {
  const cum = cumulativeDistances(route);
  const total = cum[cum.length - 1] ?? 0;
  const from = frontAlongM + CONFIG.nextStopMinAheadMeters;
  const to = Math.min(total, frontAlongM + CONFIG.nextStopSearchAheadMeters);
  if (to <= from) return [];

  // The stretch of road ahead as points ~1 km apart.
  const line: LatLng[] = [];
  for (let a = from; a <= to; a += SAMPLE_EVERY_M) line.push(pointAlongRoute(route, a, cum));
  if (line.length < 2) line.push(pointAlongRoute(route, to, cum));

  const ors = await fromOrs(line);
  if (ors.length) return ors;
  for (const url of OVERPASS_URLS) {
    const found = await fromOverpass(url, line);
    if (found.length) return found;
  }
  return [];
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, fallback: T): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fn(ctrl.signal);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

function fromOrs(line: LatLng[]): Promise<Candidate[]> {
  if (!ORS_KEY) return Promise.resolve([]);
  return withTimeout(async (signal) => {
    const res = await fetch('https://api.openrouteservice.org/pois', {
      method: 'POST',
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: 'pois',
        geometry: { geojson: { type: 'LineString', coordinates: line.map((p) => [p.lng, p.lat]) }, buffer: ORS_BUFFER_M },
        filters: { category_ids: ORS_CATEGORIES },
        limit: 100,
      }),
      signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? []).map((f: any): Candidate => {
      const tags = f.properties?.osm_tags ?? {};
      const isFuel = Object.keys(f.properties?.category_ids ?? {}).includes('596');
      const kind = isFuel ? 'fuel station' : 'toilets';
      const name = tags.name ?? tags.brand;
      return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: name ? `${name} (${kind})` : kind[0].toUpperCase() + kind.slice(1) };
    });
  }, []);
}

function fromOverpass(url: string, line: LatLng[]): Promise<Candidate[]> {
  const around = `around:${STOP_MAX_OFFSET_M},${line.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(',')}`;
  const query = `[out:json][timeout:10];
(
  nwr(${around})["amenity"="fuel"];
  nwr(${around})["highway"~"^(services|rest_area)$"];
);
out center 60;`;
  return withTimeout(async (signal) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.elements ?? [])
      .map((e: any): Candidate | null => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        if (lat == null || lng == null) return null;
        const t = e.tags ?? {};
        const kind = t.amenity === 'fuel' ? 'fuel station' : t.highway === 'rest_area' ? 'rest area' : 'services';
        const name = t.name ?? t.brand;
        return { lat, lng, label: name ? `${name} (${kind})` : kind[0].toUpperCase() + kind.slice(1) };
      })
      .filter(Boolean) as Candidate[];
  }, []);
}
