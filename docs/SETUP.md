# Convoy app — Setup

Things only the owner can do (accounts, keys). Do them once.

## 1. Supabase (backend) — free

1. Create an account at supabase.com and a new project (region: Frankfurt or closest to Greece).
2. **Authentication → Providers → Email**: keep Email on. For the test phase turn **"Confirm email" off**
   so friends can sign up instantly.
3. **SQL Editor** → paste `supabase/migrations/0001_init.sql` → Run.
4. **Project Settings → API**: copy the *Project URL* and the *anon public* key into `.env`
   (see `.env.example`). The anon key is safe to ship in the app; never put the *service_role* key in the app.

## 2. OpenRouteService (routing) — free

1. Sign up at openrouteservice.org → Dashboard → create a token.
2. Put it in `.env` as `EXPO_PUBLIC_ORS_KEY`.

## 3. Google Maps key (Android map) — free for mobile

1. Google Cloud Console → new project → enable **Maps SDK for Android** → create an API key.
2. Restrict it to Android apps (package name from `app.json`).
3. Put it in `.env` as `GOOGLE_MAPS_ANDROID_KEY`.

## 4. Expo account (cloud builds) — free

1. Create an account at expo.dev.
2. In the project folder: `npx eas-cli login`, then `npx eas-cli build:configure`.

## 5. Testing on phones

- **Android**: `npx eas-cli build --profile development --platform android` → install the APK link on each phone.
- **iPhone**: needs the Apple Developer Program ($99/year). Then
  `npx eas-cli build --profile development --platform ios` and invite testers.
- Background location does **not** work in Expo Go — always use the development build.
