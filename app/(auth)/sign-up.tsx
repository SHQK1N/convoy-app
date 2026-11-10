/**
 * Sign-up screen.
 * - Username: what friends search for (lowercase, checked for availability as you type).
 * - Display name: what appears above your dot on the map.
 */
import { Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Field } from '../../src/components/ui';
import { space, useColours } from '../../src/components/theme';
import { checkUsername, normaliseUsername, signUp } from '../../src/services/auth';

export default function SignUp() {
  const colours = useColours();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usernameHint, setUsernameHint] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Check the username 500 ms after typing stops.
  useEffect(() => {
    if (username.length < 3) return setUsernameHint('');
    const t = setTimeout(async () => setUsernameHint((await checkUsername(username)) ?? '✓ Available'), 500);
    return () => clearTimeout(t);
  }, [username]);

  async function submit() {
    setError('');
    if (!username || !displayName || !email || !password) return setError('Fill in every field.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      await signUp({ email, password, username, displayName });
      // With "Confirm email" off in Supabase, the user is signed in straight away.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hintOk = usernameHint.startsWith('✓');

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 28, fontWeight: '800', color: colours.text, marginBottom: space.lg }}>Create account</Text>

          <Field label="Username (friends find you by this)" value={username} onChangeText={(t) => setUsername(normaliseUsername(t))} maxLength={20} />
          {!!usernameHint && (
            <Text style={{ marginTop: -space.sm, marginBottom: space.md, color: hintOk ? colours.success : colours.danger }}>{usernameHint}</Text>
          )}
          <Field label="Name on the map" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" maxLength={24} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Field label="Password (6+ characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          <ErrorText>{error}</ErrorText>
          <Button title="Create account" onPress={submit} busy={busy} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: space.lg }}>
            <Text style={{ color: colours.textMuted, fontSize: 16 }}>Have an account? </Text>
            <Link href="/sign-in" style={{ color: colours.brand, fontWeight: '700', fontSize: 16 }}>
              Sign in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
