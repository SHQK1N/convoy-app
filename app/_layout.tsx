/**
 * Root of the app. Decides which part of the app you see:
 *   - keys missing        → "not configured" screen (see docs/SETUP.md)
 *   - still loading       → spinner
 *   - signed out          → (auth) screens: sign-in / sign-up
 *   - signed in           → (app) screens: friends, and later trips
 *
 * Expo Router: folders in parentheses are "groups" — they organise screens without adding to the URL.
 */
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { space, useColours } from '../src/components/theme';
// Registers the background location task at start-up (must happen before any screen renders).
import '../src/services/location';
import { supabaseConfigured } from '../src/services/supabase';
import { AuthProvider, useAuth } from '../src/state/AuthProvider';

function Gate() {
  const colours = useColours();
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/sign-in');
    else if (session && inAuth) router.replace('/');
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colours.background }}>
        <ActivityIndicator color={colours.brand} size="large" />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colours.background } }} />;
}

function NotConfigured() {
  const colours = useColours();
  return (
    <View style={{ flex: 1, padding: space.lg, justifyContent: 'center', backgroundColor: colours.background }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: space.sm, color: colours.text }}>Not configured yet</Text>
      <Text style={{ fontSize: 16, color: colours.textMuted }}>
        Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env, then restart. See docs/SETUP.md.
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      {supabaseConfigured ? (
        <AuthProvider>
          <Gate />
        </AuthProvider>
      ) : (
        <NotConfigured />
      )}
    </>
  );
}
