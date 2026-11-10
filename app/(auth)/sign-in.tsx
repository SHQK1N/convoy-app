/** Sign-in screen: email + password. */
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Field } from '../../src/components/ui';
import { space, useColours } from '../../src/components/theme';
import { signIn } from '../../src/services/auth';

export default function SignIn() {
  const colours = useColours();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (!email || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      await signIn(email, password);
      // The root layout sees the new session and moves to the app.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 34, fontWeight: '800', color: colours.brand }}>Convoy</Text>
          <Text style={{ fontSize: 17, color: colours.textMuted, marginBottom: space.xl }}>Drive together. Stop together.</Text>

          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
          <ErrorText>{error}</ErrorText>
          <Button title="Sign in" onPress={submit} busy={busy} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: space.lg }}>
            <Text style={{ color: colours.textMuted, fontSize: 16 }}>New here? </Text>
            <Link href="/sign-up" style={{ color: colours.brand, fontWeight: '700', fontSize: 16 }}>
              Create an account
            </Link>
          </View>
          {__DEV__ && (
            <Link href="/demo" style={{ color: colours.textMuted, textAlign: 'center', marginTop: space.lg, fontSize: 15 }}>
              Map demo (testing)
            </Link>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
