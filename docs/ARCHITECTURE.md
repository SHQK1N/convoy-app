# Convoy app — Architecture

How the app is built and why. Read this before changing anything structural.
Product rules live in [SPEC.md](SPEC.md).

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| App | **Expo (React Native) + TypeScript**, Expo Router | One codebase for iOS + Android; builds in the cloud (no Mac needed) |
| Map | **MapLibre** (phones: @maplibre/maplibre-react-native, web: maplibre-gl 5) + **OpenFreeMap** tiles | Free, no API key, same look on phone and web, map can turn with the driving direction |
| Backend | **Supabase** (Postgres + Auth + Realtime) | Accounts, friends, trips and live positions in one free-tier service |
| Live positions | Supabase **Realtime Broadcast** on a channel per trip | Positions are sent car-to-car, not written to the database every second (cheap) |
| Online status | Supabase **Realtime Presence** | Knows instantly who dropped out |
| Routing + navigation | **OpenRouteService** directions API (with turn instructions) | Free tier (2,000 routes/day). Turn-by-turn runs in the app itself — everyone must follow the SAME route for the alerts to work, and Google doesn't allow other apps inside Google Maps |
| Break stops | **OpenRouteService POIs** (fuel, toilets), Overpass as backup | Free, same key |
| "Next stop" search | **Overpass API** (OpenStreetMap) | Free; finds fuel / rest areas along the route |
| Background GPS | `expo-location` + `expo-task-manager` | Keeps sharing while the phone is locked or in another app |
| Spoken alerts | `expo-speech` | On-device text-to-speech, free |
| Notifications | `expo-notifications` + Expo push service | Trip invites and friend requests reach closed apps. The **database** sends them (trigger → `pg_net` → Expo push API), so no extra server is needed. Tokens live in `push_tokens`, readable only by their owner |

## Data flow

```
 phone A ──GPS every 3-5 s──► Realtime channel "trip:<id>" ──► phones B, C, D...
    │                                   │
    └── every 30 s ──► trips_members.last_position (DB)  ◄── late joiners / reconnects read this
```

- **Broadcast** messages are fire-and-forget (cheap, fast). The DB only keeps the *last* position
  per member so a reconnecting phone can draw everyone immediately.
- **Left-behind detection runs on every phone** from the same shared data, so all phones reach the
  same conclusion without a server. The car that detects a problem first broadcasts the alert;
  duplicates are ignored by alert id.
- **Alerts** (`src/lib/alerts.ts`): every phone runs the same rules every second, so every phone alerts
  without a server. Before comparing distances, each fresh position is moved forward by its own speed to
  "now", so cars are compared at the same moment. Positions older than 10 s never trigger distance
  alerts (that's the lost-signal alert's job). An alert fires once when a problem starts, repeats every
  5 min while it lasts, and "caught up" fires only after 20 s without the problem (no flip-flopping).
- **Offline prediction** (dead reckoning): take the last known position + speed, project it forward
  along the shared route polyline. Pure function in `src/lib/prediction.ts`, unit-tested.

## Database (Supabase / Postgres)

```
profiles        id (= auth user), username (unique), display_name, colour
friendships     user_a, user_b, status ('pending' | 'accepted'), requested_by
trips           id, leader_id, destination (lat/lng/label), route_geojson, settings (jsonb), created_at
trip_members    trip_id, user_id, joined_at, last_lat, last_lng, last_speed, last_heading, last_seen_at
trip_invites    trip_id, from_user, to_user, status
trip_stops      trip_id, added_by, lat, lng, label, kind ('halt' | 'waypoint'), created_at
```

Row-level security: you can only read trips you are a member of, and only your friends' profiles
(plus username search). Leader hand-over and "lobby dies" are done by a database function
(`leave_trip(trip_id)`) so it is atomic and can't be raced by two phones.

## Folder layout

```
app/                 screens (Expo Router: each file = a screen)
src/
  lib/               pure logic, no React — geo maths, prediction, left-behind rules (unit-tested)
  services/          talks to the outside world — supabase, routing, overpass, location, speech
  state/             app state (trip store)
  components/        reusable UI pieces (CarMarker, ActionButton, ...)
  config.ts          every tunable number in one place (car cap, thresholds, intervals)
supabase/
  migrations/        SQL for tables, policies and functions
docs/                SPEC.md, ARCHITECTURE.md, SETUP.md
```

Rule of thumb: **logic goes in `src/lib`** (easy to test and change), screens stay thin.

## Costs (test phase)

| Item | Cost |
|---|---|
| Supabase free tier (500 MB DB, 200 realtime connections) | €0 |
| OpenRouteService free key | €0 |
| Map tiles (OpenFreeMap) | €0, no key |
| Expo EAS Build free tier (cloud builds) | €0 (limited builds/month) |
| **Apple Developer Program** — needed to install on friends' iPhones (TestFlight) | **$99 / year** |
| Google Play Console — needed only for Play Store release (testing via APK is free) | $25 once |

## Known constraints

- **Background location does not work in Expo Go.** Testing needs a *development build*
  (made with EAS Build in the cloud). Android builds can be installed directly as an APK.
  iPhones need the Apple Developer account above.
- iOS and Android both show a "this app uses your location in the background" notice — required, can't be hidden.
