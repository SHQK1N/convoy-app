/**
 * Place search for the trip destination, using OpenRouteService's geocoder (free tier,
 * same key as routing: EXPO_PUBLIC_ORS_KEY). Data comes from OpenStreetMap and others.
 *
 * Docs: https://openrouteservice.org/dev/#/api-docs/geocode
 */
const ORS_KEY = process.env.EXPO_PUBLIC_ORS_KEY ?? '';

export type Place = {
  label: string; // e.g. "Lamia, Central Greece, Greece"
  lat: number;
  lng: number;
};

/**
 * Search places as the user types (autocomplete). Returns up to 8 results.
 * @param near optional position to rank nearby results first (the leader's location, later)
 */
export async function searchPlaces(text: string, near?: { lat: number; lng: number }): Promise<Place[]> {
  const q = text.trim();
  if (q.length < 3) return [];
  if (!ORS_KEY) throw new Error('Place search is not configured (EXPO_PUBLIC_ORS_KEY missing in .env).');

  const params = new URLSearchParams({ api_key: ORS_KEY, text: q, size: '8' });
  if (near) {
    params.set('focus.point.lat', String(near.lat));
    params.set('focus.point.lon', String(near.lng));
  }
  const res = await fetch(`https://api.openrouteservice.org/geocode/autocomplete?${params}`);
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many searches — wait a moment.' : `Place search failed (${res.status}).`);
  const json = await res.json();

  return (json.features ?? []).map((f: any): Place => ({
    label: f.properties?.label ?? f.properties?.name ?? 'Unknown place',
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}
