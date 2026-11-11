# Convoy app — Setup

Things only the owner can do (accounts, keys). Do them once.

## 1. Supabase (backend) — free

1. Create an account at supabase.com and a new project (region: Frankfurt or closest to Greece).
2. **Authentication → Providers → Email**: keep Email on. For the test phase turn **"Confirm email" off**
   so friends can sign up instantly.
3. **SQL Editor** → run each file in `supabase/migrations/` **in order** (0001, then 0002, …): paste → Run.
4. **Project Settings → API**: copy the *Project URL* and the *anon public* key into `.env`
   (see `.env.example`). The anon key is safe to ship in the app; never put the *service_role* key in the app.
5. Restart `npx expo start` after editing `.env` — the values are read at start-up.

## 2. OpenRouteService (routing) — free

1. Sign up at openrouteservice.org → Dashboard → create a token.
2. Put it in `.env` as `EXPO_PUBLIC_ORS_KEY`.

## 3. Maps — nothing to do

The map is MapLibre with OpenFreeMap tiles: free, no key, no card. (Google Maps would need a billing account.)
Web test page: MapLibre's browser files are copied into `public/maplibre/` automatically after `npm install`.

## 4. Expo account (cloud builds) — free

1. Create an account at expo.dev.
2. In the project folder: `npx eas-cli login`, then `npx eas-cli build:configure`.

## 5. Push notifications (needed before the first dev build)

The database sends pushes through Expo's free push service (see `0004_trips_and_push.sql`). The app needs:

1. An EAS project ID: run `npx eas-cli init` in the project folder — it adds `extra.eas.projectId` to `app.json`.
2. Android: a Firebase project (free) → add an Android app with package `app.convoy.dev` → download
   `google-services.json` into the project folder → in `app.json` set `"android": { "googleServicesFile": "./google-services.json" }`.
   Then upload the FCM key to Expo: `npx eas-cli credentials` → Android → Push Notifications (FCM V1).
3. iPhone (later): EAS sets up the Apple push key automatically during the first iOS build.

Push does **not** work in Expo Go on Android, or on web — the app just skips it there.

## 6. Testing on phones

- **Screens only (now):** `npx expo start`, scan the QR code with the **Expo Go** app. Sign-up and friends work here.
- **Android dev build:** `npx eas-cli build --profile development --platform android` → install the APK link on each phone.
- **iPhone dev build:** needs the Apple Developer Program ($99/year). Then
  `npx eas-cli build --profile development --platform ios` and invite testers.
- The map, background location and push do **not** work in Expo Go — use the development build
  (`eas.json` has a `development` profile that makes an installable APK).
