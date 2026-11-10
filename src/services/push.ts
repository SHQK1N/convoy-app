/**
 * Push notifications (trip invites, friend requests).
 *
 * How it works:
 *   1. After sign-in, registerForPush() asks permission and gets this phone's Expo push token.
 *   2. The token is saved in the `push_tokens` table (only you can read your own row).
 *   3. The DATABASE sends the push: triggers in 0004_trips_and_push.sql call Expo's free push
 *      service when someone invites you or sends a friend request. The app sends nothing itself.
 *
 * Where it does NOT work (and silently does nothing):
 *   - Expo Go on Android (Expo removed remote push from Expo Go) → needs the development build
 *   - web, emulators/simulators
 *   - before EAS is set up (no projectId) — see docs/SETUP.md §4 and §6
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Show pushes as a banner + sound even while the app is open.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Expo Go can't receive remote pushes on Android (SDK 53+). */
const inExpoGo = Constants.executionEnvironment === 'storeClient';

/**
 * Ask permission, get the push token, save it for `userId`.
 * Returns a short reason when push isn't available, or null on success. Never throws.
 */
export async function registerForPush(userId: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return 'web';
    if (!Device.isDevice) return 'emulator';
    if (inExpoGo && Platform.OS === 'android') return 'expo-go';

    if (Platform.OS === 'android') {
      // Android 8+ needs a channel; "high" importance = heads-up banner + sound.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Trip alerts',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return 'no-eas-project';

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, updated_at: new Date().toISOString() });
    return error ? error.message : null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Remove this phone's token on sign-out, so pushes stop. */
export async function unregisterPush(userId: string) {
  await supabase.from('push_tokens').delete().eq('user_id', userId);
}
