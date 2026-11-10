/**
 * Account actions: sign up, sign in, sign out, read own profile.
 *
 * Accounts are email + password (no Google/Apple sign-in — SPEC §3).
 * The username is what friends search for; the profile row is created by a database trigger
 * from the sign-up metadata (supabase/migrations/0002_signup_and_friends.sql).
 */
import { supabase } from './supabase';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  colour: string;
};

/** Usernames: 3–20 chars, lowercase letters, digits, underscore. Must match the DB check in 0001_init.sql. */
export const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;

export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns an error message to show the user, or null if the username is fine and free. */
export async function checkUsername(raw: string): Promise<string | null> {
  const name = normaliseUsername(raw);
  if (!USERNAME_RULE.test(name)) return 'Username: 3–20 characters, letters, numbers or _ only.';
  const { data, error } = await supabase.rpc('username_available', { name });
  if (error) return friendlyError(error.message);
  return data ? null : 'That username is taken.';
}

export async function signUp(input: { email: string; password: string; username: string; displayName: string }) {
  const usernameProblem = await checkUsername(input.username);
  if (usernameProblem) throw new Error(usernameProblem);

  const { error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { username: normaliseUsername(input.username), display_name: input.displayName.trim() },
    },
  });
  if (error) throw new Error(friendlyError(error.message));
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyError(error.message));
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, colour')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error.message));
  return data;
}

/** Turn Supabase/network error text into something a person can act on. */
export function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'An account with that email already exists.';
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'That email address looks wrong.';
  if (m.includes('email not confirmed')) return 'Confirm your email first (check your inbox).';
  if (m.includes('network') || m.includes('fetch')) return 'No connection. Check your internet and try again.';
  return message;
}
