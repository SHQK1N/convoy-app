/**
 * Dynamic app config. Everything static lives in app.json; this file adds native setup that
 * needs code or .env values. Expo reads app.json first and passes it in as `config`.
 *
 * Maps: MapLibre + OpenFreeMap — free, no API key (no Google Maps key needed).
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';
import fs from 'fs';

/** Firebase file for Android push notifications (docs/SETUP.md §5). Added only when present. */
const GOOGLE_SERVICES = './google-services.json';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    ...(fs.existsSync(GOOGLE_SERVICES) ? { googleServicesFile: GOOGLE_SERVICES } : {}),
  },
  ios: {
    ...config.ios,
    // Keep receiving GPS while the phone is locked / in another app during a trip.
    infoPlist: { ...config.ios?.infoPlist, UIBackgroundModes: ['location'] },
  },
  plugins: [
    ...(config.plugins ?? []),
    // The map (native code: needs a development build, not Expo Go).
    '@maplibre/maplibre-react-native',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Convoy shows your car on the group map while you are in a trip.',
        locationAlwaysAndWhenInUsePermission:
          'Convoy keeps sharing your car with your group while the screen is off, until you leave the trip.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
});
