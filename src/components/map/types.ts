/**
 * What the map draws. Shared by both map implementations:
 *   TripMap.tsx      — phones (react-native-maps: Apple Maps on iPhone, Google Maps on Android)
 *   TripMap.web.tsx  — browser (Leaflet + OpenStreetMap tiles), used for testing on the PC
 * Expo picks the right file automatically by platform.
 */
import type { LatLng } from '../../lib/geo';

export type MapCar = {
  id: string;
  name: string;
  colour: string;
  position: LatLng;
  /** true = no live signal; position is an estimate → drawn faded */
  predicted: boolean;
  /** how old the last real position is, ms */
  ageMs: number;
  isMe: boolean;
};

export type TripMapProps = {
  route: LatLng[];
  destination: (LatLng & { label?: string }) | null;
  cars: MapCar[];
  /** Change this number to make the map zoom to fit everything again (e.g. a "fit" button). */
  fitKey: number;
};

/** "2 min ago", "45 s ago" */
export function ageLabel(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Bounds containing every point (route, destination, cars), or null if there is nothing. */
export function boundsOf(props: TripMapProps): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  const pts: LatLng[] = [...props.route, ...props.cars.map((c) => c.position)];
  if (props.destination) pts.push(props.destination);
  if (!pts.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}
