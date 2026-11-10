/**
 * Home screen.
 * Top: trip invites + my trip / "Start a trip" (src/components/TripCard.tsx).
 * Below: friend requests to me (accept / decline), my friends, requests I've sent (cancel).
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirm } from '../../src/components/confirm';
import { TripCard } from '../../src/components/TripCard';
import { Avatar, Button, ErrorText, SectionTitle } from '../../src/components/ui';
import { space, useColours } from '../../src/components/theme';
import { signOut } from '../../src/services/auth';
import { acceptRequest, FriendEntry, removeFriendship } from '../../src/services/friends';
import { stopTracking } from '../../src/services/location';
import { unregisterPush } from '../../src/services/push';
import { useAuth } from '../../src/state/AuthProvider';
import { useFriends } from '../../src/state/useFriends';

export default function Home() {
  const colours = useColours();
  const router = useRouter();
  const { profile } = useAuth();
  const { me, entries, loading, error, reload } = useFriends();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  async function run(otherId: string, action: () => Promise<void>) {
    setBusyId(otherId);
    setActionError('');
    try {
      await action();
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const incoming = entries.filter((e) => e.status === 'incoming');
  const friends = entries.filter((e) => e.status === 'friend');
  const outgoing = entries.filter((e) => e.status === 'outgoing');

  // One flat list with section headers keeps scrolling smooth on long lists.
  type Row = { kind: 'header'; title: string } | { kind: 'entry'; entry: FriendEntry } | { kind: 'empty'; text: string };
  const rows: Row[] = [];
  if (incoming.length) {
    rows.push({ kind: 'header', title: `Requests (${incoming.length})` });
    incoming.forEach((entry) => rows.push({ kind: 'entry', entry }));
  }
  rows.push({ kind: 'header', title: `My friends (${friends.length})` });
  if (friends.length) friends.forEach((entry) => rows.push({ kind: 'entry', entry }));
  else rows.push({ kind: 'empty', text: 'No friends yet. Tap “Add friend” and search by username.' });
  if (outgoing.length) {
    rows.push({ kind: 'header', title: 'Sent requests' });
    outgoing.forEach((entry) => rows.push({ kind: 'entry', entry }));
  }

  function renderEntry({ profile: p, status }: FriendEntry) {
    const busy = busyId === p.id;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.card, padding: space.md, borderRadius: 14, marginBottom: space.sm }}>
        <Avatar name={p.display_name} colour={p.colour} />
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colours.text }}>{p.display_name}</Text>
          <Text style={{ fontSize: 14, color: colours.textMuted }}>@{p.username}</Text>
        </View>
        {status === 'incoming' && (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button small title="Accept" busy={busy} onPress={() => run(p.id, () => acceptRequest(me!, p.id))} />
            <Button small variant="secondary" title="Decline" disabled={busy} onPress={() => run(p.id, () => removeFriendship(me!, p.id))} />
          </View>
        )}
        {status === 'outgoing' && (
          <Button small variant="secondary" title="Cancel" busy={busy} onPress={() => run(p.id, () => removeFriendship(me!, p.id))} />
        )}
        {status === 'friend' && (
          <Button
            small
            variant="secondary"
            title="Remove"
            busy={busy}
            onPress={async () => {
              if (await confirm('Remove friend?', `Remove ${p.display_name} from your friends?`)) run(p.id, () => removeFriendship(me!, p.id));
            }}
          />
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colours.brand }}>Convoy</Text>
          {profile && <Text style={{ color: colours.textMuted }}>Signed in as @{profile.username}</Text>}
        </View>
        <Button
          small
          variant="secondary"
          title="Sign out"
          onPress={async () => {
            if (me) await unregisterPush(me); // stop pushes to this phone
            await stopTracking(); // stop sharing location
            await signOut();
          }}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colours.brand} style={{ marginTop: space.xl }} />
      ) : (
        <FlatList
          ListHeaderComponent={
            <View>
              <TripCard />
              <SectionTitle>Friends</SectionTitle>
              <Button variant="secondary" title="+ Add friend" onPress={() => router.push('/add-friend')} />
              <View style={{ marginTop: space.sm }}>
                <ErrorText>{error || actionError}</ErrorText>
              </View>
            </View>
          }
          data={rows}
          keyExtractor={(r, i) => (r.kind === 'entry' ? r.entry.profile.id : `${r.kind}-${i}`)}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <SectionTitle>{item.title}</SectionTitle>
            ) : item.kind === 'empty' ? (
              <Text style={{ color: colours.textMuted, fontSize: 15 }}>{item.text}</Text>
            ) : (
              renderEntry(item.entry)
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
