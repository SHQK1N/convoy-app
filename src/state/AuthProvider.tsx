/**
 * Holds who is signed in, for the whole app.
 *
 *   const { session, profile, loading } = useAuth();
 *
 * - session: Supabase login session (null = signed out)
 * - profile: the signed-in user's profile row (username, display name, colour)
 * - loading: true until we know whether someone is signed in (show a spinner, not the sign-in screen)
 */
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getProfile, Profile } from '../services/auth';
import { supabase, supabaseConfigured } from '../services/supabase';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Re-read the profile (e.g. after editing it). */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  async function loadProfile(s: Session | null) {
    if (!s) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await getProfile(s.user.id));
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    if (!supabaseConfigured) return;

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    // Fires on sign-in, sign-out and token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Don't await inside this callback (Supabase docs: can deadlock) — schedule instead.
      setTimeout(() => loadProfile(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile: () => loadProfile(session) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
