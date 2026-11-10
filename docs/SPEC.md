# Convoy app — Product spec (v0.1)

> Working name: **Convoy** (placeholder — no final name yet).
> Status: draft written 2026-11-10 from the owner's answers. Change freely; keep this file the source of truth.

## 1. What it is

A phone app for group trips with several cars. Everyone in a trip sees every car live on one map
(dots with names on top). If a car falls behind, everyone is told. Anyone can call a group halt
("pull over at the next stop") with one tap, so nobody needs to phone each other while driving.

## 2. Audience and rollout

| Phase | Who | Limits |
|---|---|---|
| Test | Close circle of friends | Max **5 cars** per trip (one phone per car) |
| Public | App Store + Play Store | Car limit raised (config value, not code) |

Platforms: **iOS and Android**, one codebase.

## 3. Accounts and friends

- Simple account: **username + email + password**. No Google/Apple/Facebook sign-in.
- Friends list: search by username, send request, accept/decline.
- Invite friends **inside the app** to a trip (no links or codes needed in v1).

## 4. Trips ("lobbies")

- Anyone can create a trip. The creator is the **journey leader**.
- The leader's only power: **set the destination** (and change it later).
  Everything else (halts, stops) can be done by anyone.
- Members join by accepting an in-app invite.
- **Leave lobby** button for everyone.
  - If the leader leaves while others remain → leader role passes to another member
    (rule: the member who joined earliest).
  - When the last member leaves → the trip ends and is deleted ("lobby dies").
- Location sharing **stops automatically** when you leave the lobby or the trip ends.

## 5. The map

- Everyone's car = a coloured dot with the driver's name on top. Exact style still open ("game-like").
- Everyone follows **one shared route** to the leader's destination.
- **Stops can be added in real time** by anyone during the trip (they become waypoints on the shared route).
- Offline cars: show a **predicted position** — moved forward along the route at their last known speed —
  drawn faded with "last seen X min ago" until they reconnect.

## 6. Left-behind detection (all three rules, each adjustable per trip)

A car is "left behind" if any of these is true:
1. **Distance**: more than _N_ km (default 5) behind the car in front of it along the route.
2. **Time gap**: more than _N_ minutes (default 10) behind, measured as estimated time along the route.
3. **Off route**: more than _N_ metres (default 300) away from the route for more than 60 s.

When it happens → **everyone** gets an alert (sound + spoken message + banner).

## 7. Action buttons (driver-safe)

Big buttons, few of them, no typing, no chat, no voice chat:

| Button | Effect for everyone |
|---|---|
| **Halt** (toilet / fuel / rest) | "Pull over at the next stop" + the stop is shown on the map with a distance countdown; spoken reminders as it gets close (e.g. 5 km, 2 km, 500 m) |
| **Slow down** | "{name} asks the group to slow down" |
| **I'm OK** | Clears a left-behind alert for that car |

All alerts are **spoken aloud** (text-to-speech) so drivers don't need to look.

"Next stop" = the nearest suitable place ahead on the route (fuel station / rest area / services),
found from OpenStreetMap data.

## 8. Non-goals for v1

- No chat, no voice chat, no photos.
- No social login, no payments.
- No trip history beyond the active trip.

## 9. Cost target

As cheap as possible: free tiers everywhere for the test phase (see ARCHITECTURE.md §Costs).

## 10. Open questions

- Final app name.
- Exact "game-like" map style.
- Question 19 in the first Q&A was left blank — was there something to add?
