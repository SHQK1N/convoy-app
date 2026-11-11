/**
 * "Heading up": which way the map should point while following my car.
 *
 *   const bearing = useFollowBearing(myCar, headingUp);   // degrees, or null = north up
 *
 * Small direction changes (GPS noise, gentle bends) are ignored (HEADING_DEADBAND), and the
 * direction is held while standing still (GPS heading is meaningless at walking speed).
 */
import { useRef } from 'react';
import { HEADING_DEADBAND, MapCar } from '../components/map/types';

/** Below this speed (m/s ≈ 11 km/h) keep the last direction. */
const MIN_SPEED = 3;

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export function useFollowBearing(myCar: MapCar | undefined, headingUp: boolean): number | null {
  const last = useRef<number | null>(null);
  if (!headingUp) return null;
  const h = myCar?.heading;
  if (h != null && (myCar?.speed ?? 0) >= MIN_SPEED) {
    if (last.current == null || angleDiff(h, last.current) > HEADING_DEADBAND) last.current = h;
  }
  return last.current;
}
