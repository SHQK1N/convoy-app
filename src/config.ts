/**
 * Every tunable number in the app lives here.
 * Per-trip values (car cap, left-behind thresholds) are only DEFAULTS:
 * each trip stores its own copy in `trips.settings` (see supabase/migrations/0001_init.sql).
 */
export const CONFIG = {
  /** Max cars per trip during the test phase. Raise for public release. */
  maxCars: 5,

  /** Left-behind rules (SPEC §6). A car is behind if ANY rule fires. */
  behind: {
    /** Distance along the route to the car ahead, in km. */
    km: 5,
    /** Estimated time along the route to the car ahead, in minutes. */
    minutes: 10,
    /** Distance from the route line, in metres... */
    offRouteMeters: 300,
    /** ...for at least this long, in seconds (ignores GPS jitter and short detours). */
    offRouteSeconds: 60,
  },

  /** How often each phone sends its live position over Realtime, in ms. */
  broadcastIntervalMs: 4000,
  /** How often each phone saves its last position to the database, in ms. */
  persistIntervalMs: 30000,
  /** A car with no update for this long is treated as offline (drawn faded, position predicted). */
  offlineAfterMs: 15000,
  /** Stop predicting an offline car's position after this long (it may have stopped). */
  maxPredictionMs: 15 * 60 * 1000,

  /** Spoken "halt" reminders, in metres before the stop. */
  haltReminderMeters: [5000, 2000, 500],
  /** How far ahead along the route to look for a "next stop" (fuel / rest area), in metres. */
  nextStopSearchAheadMeters: 40000,
  /** Ignore candidate stops closer than this (driver can't react in time), in metres. */
  nextStopMinAheadMeters: 1500,
} as const;

export type TripSettings = {
  maxCars: number;
  behindKm: number;
  behindMinutes: number;
  offRouteMeters: number;
};

export const DEFAULT_TRIP_SETTINGS: TripSettings = {
  maxCars: CONFIG.maxCars,
  behindKm: CONFIG.behind.km,
  behindMinutes: CONFIG.behind.minutes,
  offRouteMeters: CONFIG.behind.offRouteMeters,
};
