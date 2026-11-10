/**
 * The single Supabase client used by the whole app.
 *
 * Keys come from .env (EXPO_PUBLIC_* vars are baked into the app at build time — see docs/SETUP.md).
 * If they are missing, `supabaseConfigured` is false and the app shows a "not configured" screen
 * instead of crashing (see app/_layout.tsx).
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = url.startsWith('http') && anonKey.length > 20;

export const supabase = createClient(
  // Placeholder values keep createClient from throwing when unconfigured; nothing is called in that case.
  supabaseConfigured ? url : 'http://localhost:54321',
  supabaseConfigured ? anonKey : 'not-configured-not-configured',
  {
    auth: {
      // Keep users signed in between app launches.
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresh the login token only while the app is in the foreground (Supabase's recommended setup for RN).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
