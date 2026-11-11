/**
 * Add friend: search by username (starts-with, 2+ characters), then send a request.
 * Shows the current relationship next to each result so you can't double-request.
 */
import { useRouter } from 'expo-router';
import { goBack } from '../../src/components/goBack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, ErrorText, Field } from '../../src/components/ui';
import { space, useColours } from '../../src/components/theme';
import type { Profile } from '../../src/services/auth';
import { acceptRequest, searchUsers, sendRequest } from '../../src/services/friends';
import { useFriends } from '../../src/state/useFriends';

export default function AddFriend() {
  const colours = useColours();
  const router = useRouter();
  const { me, entries, reload } = useFriends();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Search 300 ms after typing stops.
  useEffect(() => {
    if (!me || query.trim().length < 2) return setResults([]);
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchUsers(query, me));
        setError('');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, me]);

  const statusOf = (id: string) => entries.find((e) => e.profile.id === id)?.status;

  async function act(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
          <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', color: colours.text }}>Add friend</Text>
          <Button small variant="secondary" title="Done" onPress={() => goBack('/')} />
        </View>
        <Field label="Search by username" value={query} onChangeText={setQuery} placeholder="e.g. nikos" autoFocus />
        <ErrorText>{error}</ErrorText>
        {searching && <ActivityIndicator color={colours.brand} />}
      </View>

      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
        ListEmptyComponent={
          !searching && query.trim().length >= 2 ? (
            <Text style={{ color: colours.textMuted, fontSize: 15 }}>Nobody found with a username starting “{query.trim()}”.</Text>
          ) : undefined
        }
        renderItem={({ item: p }) => {
          const status = statusOf(p.id);
          const busy = busyId === p.id;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.card, padding: space.md, borderRadius: 14, marginBottom: space.sm }}>
              <Avatar name={p.display_name} colour={p.colour} />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: colours.text }}>{p.display_name}</Text>
                <Text style={{ fontSize: 14, color: colours.textMuted }}>@{p.username}</Text>
              </View>
              {status === 'friend' && <Text style={{ color: colours.success, fontWeight: '600' }}>Friends ✓</Text>}
              {status === 'outgoing' && <Text style={{ color: colours.textMuted, fontWeight: '600' }}>Requested</Text>}
              {status === 'incoming' && <Button small title="Accept" busy={busy} onPress={() => act(p.id, () => acceptRequest(me!, p.id))} />}
              {!status && <Button small title="Add" busy={busy} onPress={() => act(p.id, () => sendRequest(me!, p.id))} />}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
