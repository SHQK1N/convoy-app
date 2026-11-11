# Convoy (working name)

Live map for group trips with several cars: everyone sees everyone, left-behind cars trigger an
alert for all, and a one-tap **Halt** tells the whole group to pull over at the next stop.

| Doc | What's in it |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | What the app does — product rules (source of truth) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it's built, data flow, database, costs |
| [docs/SETUP.md](docs/SETUP.md) | Accounts and keys to create once |
| [supabase/migrations/](supabase/migrations/) | Database tables, security rules and trip functions (run in order) |

## Where things live

- `src/config.ts` — every tunable number (car cap, thresholds, intervals). Start here to tweak behaviour.
- `src/lib/` — pure logic (geo maths, offline prediction, left-behind rules, friendship helpers), unit-tested.
- `src/services/` — talks to the outside world: `supabase.ts` client, `auth.ts`, `friends.ts`, `trips.ts`,
  `geocode.ts` (place search), `push.ts` (push notification registration), `route.ts` (driving route),
  `live.ts` (live positions channel), `location.ts` (GPS, incl. background).
- `src/components/map/` — the map: `TripMap.tsx` (phones, react-native-maps) and `TripMap.web.tsx` (browser, Leaflet).
- `src/lib/simulate.ts` — fake convoy for testing (used by the map demo and the "Test convoy" button).
- `src/lib/alerts.ts` + `src/state/useAlerts.ts` + `src/components/AlertBanners.tsx` — when to alert, what to say,
  how it looks. Thresholds live in `src/config.ts` (`behind`, `alerts`).
- `src/lib/halt.ts` + `src/state/useHalt.ts` + `src/services/stops.ts` + `src/components/DriveControls.tsx` —
  group breaks: choosing the stop, countdown/reminders, finding fuel stations/toilets, the buttons and banner.
- `src/state/voice.ts` — everything the app says out loud, with one mute switch.
- `src/lib/nav.ts` + `src/state/useNavigation.ts` + `src/components/NavBanner.tsx` — turn-by-turn: next maneuver,
  voice prompts (earlier when driving fast), "join the group route" leg.
- `src/lib/cooldown.ts` + `src/state/useButtonLimits.ts` — anti-spam for the driver buttons (lengths in `src/config.ts` → `cooldowns`).
- `src/components/goBack.ts` — Back buttons that also work after a page refresh.
- `src/state/` — who is signed in (`AuthProvider`), live friends list (`useFriends`), my trip + invites (`useTrip`).
- `src/components/` — theme colours (`theme.ts`), shared UI pieces (`ui.tsx`), `TripCard`, `confirm`.
- `app/` — screens (Expo Router: one file = one screen).
  - `_layout.tsx` — decides signed-in vs signed-out, shows "not configured" if keys are missing.
  - `(auth)/` — sign-in, sign-up.
  - `(app)/index.tsx` — home: trip invites, my trip / Start a trip, friends.
  - `(app)/trip.tsx` — trip lobby: destination, cars, invite friends, leave.
  - `(app)/set-destination.tsx` — leader searches and picks the destination.
  - `(app)/add-friend.tsx` — search users and send friend requests.
  - `(app)/drive.tsx` — the live map for the current trip.
  - `(auth)/demo.tsx` — map demo with a simulated convoy (development only, no account needed).
- `app.config.ts` — adds the Google Maps key (from .env) and location permissions to app.json.
- `public/` — web-only files (page template, favicon). `scripts/make_icons.py` — regenerates all icons.

## Commands

```bash
npm install          # once
npm test             # run logic tests
npx expo start       # dev server; press w for a web preview of the screens
```

Background GPS (later milestones) needs a development build, not Expo Go — see SETUP.md.

## Milestones

1. ✅ Spec, architecture, database schema, core logic + tests
2. ✅ Accounts + friends list (needs Supabase keys to use — see SETUP.md)
3. ✅ Create trip, invite friends, set destination, leave lobby / leader hand-over, push notifications (run `0004_trips_and_push.sql`; push needs the dev build)
4. ✅ Live map: dots with names, shared route, background GPS, offline cars predicted + faded, test convoy (run `0005_live_positions.sql`; phones need the dev build + Google Maps key). Try it on the PC: sign-in screen → **Map demo (testing)**
5. ✅ Left-behind / off-route / lost-signal alerts for everyone: red banner + spoken message, "caught up" when resolved, voice on/off (alerts run while the map is open; background alerts later)
6. ✅ ☕ Break (pick reason → real stop ahead of the front car → everyone counts down + parks → Continue trip), 🐢 Slow down, 👍 I'm OK; test cars wait for whoever falls behind (run `0006_breaks.sql`)
6b. ✅ Turn-by-turn navigation (replaces Google Maps): next turn + distance + "then…", spoken prompts, km/time left; cars starting elsewhere get a dashed "join the group route" leg. Anti-spam cooldowns on the buttons (run `0007_button_limits.sql`)
7. ⏳ Dev builds on Android + iPhone, test drive with the group
