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
  /** last known speed, m/s (null if unknown) — used by the left-behind time rule */
  speed: number | null;
  /** driving direction, degrees from north (null if unknown) — used to turn the map ("heading up") */
  heading: number | null;
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
  /** My own "join the group route" leg, drawn dashed (useNavigation), or null. */
  joinLine?: LatLng[] | null;
  /** Break stop everyone is heading to, or null when driving. */
  stop?: (LatLng & { label: string }) | null;
  /** When set, the camera keeps this point (my car) centred — "Follow me" mode. */
  follow: LatLng | null;
  /** Called when the user drags the map themselves (the screen then turns Follow off). */
  onUserMove?: () => void;
  /** While following: turn the map so my driving direction points up (degrees), or null = north up. */
  followBearing?: number | null;
};

/**
 * Map look: OpenFreeMap (free, no key, no sign-up — https://openfreemap.org), OpenStreetMap data.
 * Same styles on phones (MapLibre Native) and web (MapLibre GL JS).
 */
export const MAP_STYLE = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  // "fiord": dark blue-grey with clearly visible roads ("dark" was too low-contrast at night).
  dark: 'https://tiles.openfreemap.org/styles/fiord',
};

/** Smooth the heading so the map doesn't twitch on GPS noise: ignore changes under this, degrees. */
export const HEADING_DEADBAND = 8;

/** Zoom used when following a car: streets readable, a few km visible. */
export const FOLLOW_ZOOM = 14;

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
