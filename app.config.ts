/**
 * Dynamic app config. Everything static lives in app.json; this file only adds values
 * that come from .env (secrets) and the native permissions for location.
 * Expo reads app.json first and passes it in as `config`.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    // Google Maps SDK key for the Android map (docs/SETUP.md §3). Not needed on iPhone (Apple Maps).
    config: { ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' } },
  },
  ios: {
    ...config.ios,
    // Keep receiving GPS while the phone is locked / in another app during a trip.
    infoPlist: { ...config.ios?.infoPlist, UIBackgroundModes: ['location'] },
  },
  plugins: [
    ...(config.plugins ?? []),
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
