/**
 * Convoy simulator — fake cars driving along the route, for testing on the PC without phones.
 * Unit-tested in simulate.test.ts. Fake cars exist only on your screen; nothing is sent anywhere.
 *
 * Time runs `speedup`× faster than real life (default SPEEDUP). Cars accelerate and brake
 * gradually (MAX_ACCEL / MAX_BRAKE), so they pull away and stop like real cars. The cars behave like a real group should:
 *   - "Nikos"   fast, out in front
 *   - "Maria"   steady
 *   - "Giorgos" loses signal from 15 s to 75 s (real time) → shown faded at a predicted position
 *   - "Eleni"   slower → falls behind…
 *   - …so the cars AHEAD of a car that falls behind slow down (WAIT_FACTOR) until it has
 *     caught up (gap under CATCH_UP_M) — the whole point of the app.
 *   - During a break (halt) every car drives to the stop and parks there until the break ends.
 *   - After a break everyone leaves TOGETHER and drives as one convoy (slowest car's speed)
 *     for REGROUP_MS, before each car goes back to its own pace.
 */
import { CONFIG } from '../config';
import { bearing, cumulativeDistances, LatLng, pointAlongRoute } from './geo';

/** Default time speed-up. The demo lets you pick 1× / 5× / 30× (ConvoySim.speedup). */
export const SPEEDUP = 30;
/** Car physics, m/s² (real-world): gentle acceleration, firmer braking. */
export const MAX_ACCEL = 2.5;
export const MAX_BRAKE = 4;
/** Cars ahead of a left-behind car drive at this fraction of their speed until it catches up. */
export const WAIT_FACTOR = 0.5;
/** Gap at which a car counts as caught up again, metres. */
export const CATCH_UP_M = 1500;
/** After a break, how long (real time) the cars drive as one convoy, ms. */
export const REGROUP_MS = 60000;

export type SimFix = {
  userId: string;
  lat: number;
  lng: number;
  speed: number; // m/s (already sped up, so predictions stay consistent)
  heading: number;
  at: number; // epoch ms
};

export type SimCar = {
  id: string;
  name: string;
  colour: string;
  kmh: number;
  /** metres ahead (+) / behind (−) of the start at t = 0 */
  startOffsetM: number;
  /** real-time seconds [from, to] with no signal */
  offline?: [number, number];
};

export const SIM_CARS: SimCar[] = [
  { id: 'sim-nikos', name: 'Nikos', colour: '#1E88E5', kmh: 105, startOffsetM: 1500 },
  { id: 'sim-maria', name: 'Maria', colour: '#8E24AA', kmh: 100, startOffsetM: 800 },
  { id: 'sim-giorgos', name: 'Giorgos', colour: '#43A047', kmh: 98, startOffsetM: 300, offline: [15, 75] },
  { id: 'sim-eleni', name: 'Eleni', colour: '#F9A825', kmh: 80, startOffsetM: -200 },
];

type CarState = {
  car: SimCar;
  along: number;
  /** current speed, m/s real-world (changes gradually) */
  vel: number;
  /** reported speed (sped up) */
  speed: number;
  lastFix: SimFix | null;
};

export class ConvoySim {
  private cars: CarState[];
  private cum: number[];
  private total: number;
  private lastNow: number;
  /** true while the group is slowing down for someone behind (with hysteresis). */
  waiting = false;
  /** Convoy mode after a break: until this time (epoch ms) everyone drives at the slowest speed. */
  regroupUntil = 0;
  private wasHalted = false;

  /** Time speed-up; can be changed while running. */
  speedup: number;

  constructor(private route: LatLng[], cars: SimCar[], private startedAt: number, speedup = SPEEDUP) {
    this.speedup = speedup;
    this.cum = cumulativeDistances(route);
    this.total = this.cum[this.cum.length - 1] ?? 0;
    this.cars = cars.map((car) => ({ car, along: Math.max(0, car.startOffsetM), vel: car.kmh / 3.6, speed: 0, lastFix: null }));
    this.lastNow = startedAt;
  }

  /**
   * Advance the simulation to `now` (epoch ms) and return each car's fix.
   * @param haltAlongM  distance along the route of the break stop, or null when driving.
   */
  step(now: number, haltAlongM: number | null): SimFix[] {
    if (this.route.length < 2) return [];
    const dt = Math.max(0, (now - this.lastNow) / 1000) * this.speedup; // simulated seconds
    this.lastNow = now;

    // Break just ended → leave together.
    if (this.wasHalted && haltAlongM == null) this.regroupUntil = now + REGROUP_MS;
    this.wasHalted = haltAlongM != null;
    const convoyKmh = now < this.regroupUntil ? Math.min(...this.cars.map((c) => c.car.kmh)) : null;

    // Who is behind? (same rule as the real alerts: distance to the car ahead)
    const order = [...this.cars].sort((a, b) => b.along - a.along);
    let worstGap = 0;
    let worstIdx = -1;
    for (let i = 1; i < order.length; i++) {
      const gap = order[i - 1].along - order[i].along;
      if (gap > worstGap) [worstGap, worstIdx] = [gap, i];
    }
    if (worstGap > CONFIG.behind.km * 1000) this.waiting = true;
    else if (worstGap < CATCH_UP_M) this.waiting = false;
    const slowIds = new Set(this.waiting && worstIdx > 0 ? order.slice(0, worstIdx).map((c) => c.car.id) : []);

    for (const s of this.cars) {
      let target = (convoyKmh ?? s.car.kmh) / 3.6; // m/s, real-world
      if (slowIds.has(s.car.id)) target *= WAIT_FACTOR;
      const parking = haltAlongM != null && s.along <= haltAlongM;

      // Drive like a car: accelerate / brake gradually, and brake smoothly into the stop.
      // Integrated in ≤1 s slices so a big time step (high speed-up) stays smooth.
      let left = dt;
      while (left > 0) {
        const h = Math.min(1, left);
        left -= h;
        let want = target;
        if (parking) want = Math.min(want, Math.sqrt(2 * MAX_BRAKE * Math.max(0, haltAlongM! - s.along)));
        s.vel = want > s.vel ? Math.min(want, s.vel + MAX_ACCEL * h) : Math.max(want, s.vel - MAX_BRAKE * h);
        s.along += s.vel * h;
        if (parking && s.along >= haltAlongM!) {
          s.along = haltAlongM!; // parked
          s.vel = 0;
        }
        if (s.along >= this.total) {
          s.along = this.total; // arrived at the destination
          s.vel = 0;
        }
      }
      s.speed = s.vel * this.speedup;
    }

    const t = (now - this.startedAt) / 1000;
    return this.cars.map((s) => {
      const inGap = s.car.offline && t >= s.car.offline[0] && t < s.car.offline[1];
      if (inGap && s.lastFix) return s.lastFix; // no signal: others keep seeing the old fix
      const pos = pointAlongRoute(this.route, s.along, this.cum);
      const ahead = pointAlongRoute(this.route, Math.min(this.total, s.along + 50), this.cum);
      s.lastFix = { userId: s.car.id, lat: pos.lat, lng: pos.lng, speed: s.speed, heading: bearing(pos, ahead), at: now };
      return s.lastFix;
    });
  }

  /** Where the front-most car is along the route (to place a break stop ahead of everyone). */
  frontAlong(): number {
    return Math.max(...this.cars.map((c) => c.along));
  }
}
