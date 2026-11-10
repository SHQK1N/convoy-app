# Convoy (working name)

Live map for group trips with several cars: everyone sees everyone, left-behind cars trigger an
alert for all, and a one-tap **Halt** tells the whole group to pull over at the next stop.

| Doc | What's in it |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | What the app does — product rules (source of truth) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it's built, data flow, database, costs |
| [docs/SETUP.md](docs/SETUP.md) | Accounts and keys to create once |
| [supabase/migrations/](supabase/migrations/) | Database tables, security rules and trip functions |

## Where things live

- `src/config.ts` — every tunable number (car cap, thresholds, intervals). Start here to tweak behaviour.
- `src/lib/` — pure logic (geo maths, offline prediction, left-behind rules), fully unit-tested.
- `src/services/` — Supabase, routing, location, speech *(next milestone)*.
- `app/` — screens *(next milestone)*.

## Commands

```bash
npm install      # once
npm test         # run logic tests
npx expo start   # dev server (UI only — background GPS needs a dev build, see SETUP.md)
```

## Milestones

1. ✅ Spec, architecture, database schema, core logic + tests
2. ⏳ Accounts + friends list
3. ⏳ Create trip, invite friends, leave lobby / leader hand-over
4. ⏳ Live map: dots with names, shared route, background GPS
5. ⏳ Left-behind alerts + offline prediction on the map
6. ⏳ Halt / Slow down / I'm OK buttons, next-stop search, spoken reminders
7. ⏳ Dev builds on Android + iPhone, test drive with the group
