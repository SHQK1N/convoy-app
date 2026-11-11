/**
 * Trip lobby.
 * - Destination: shown to all; only the leader can set/change it.
 * - Cars: everyone in the trip, leader marked. Max = trip.settings.maxCars (5 while testing).
 * - Invite friends: friends not yet in the trip; shows "Invited" for open invites.
 * - Leave trip: leader leaving hands over to the earliest-joined member; last one out ends the trip.
 *
 * "Open map" → the live map (drive.tsx). Opening it starts sharing your location.
 */
import { useRouter } from 'expo-router';
import { goBack } from '../../src/components/goBack';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirm } from '../../src/components/confirm';
import { Avatar, Button, Card, ErrorText, SectionTitle } from '../../src/components/ui';
import { space, useColours } from '../../src/components/theme';
import { stopTracking } from '../../src/services/location';
import { inviteToTrip, leaveTrip } from '../../src/services/trips';
import { useFriends } from '../../src/state/useFriends';
import { useTrip } from '../../src/state/useTrip';

export default function TripLobby() {
  const c = useColours();
  const router = useRouter();
  const { me, trip, loading, error, reload } = useTrip();
  const { entries } = useFriends();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setActionError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <ActivityIndicator color={c.brand} style={{ marginTop: 80 }} />;
  }

  if (!trip) {
    return (
      <SafeAreaView style={{ flex: 1, padding: space.lg, justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: c.text, marginBottom: space.md }}>You're not in a trip.</Text>
        <Button title="Back" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const isLeader = trip.leaderId === me;
  const full = trip.members.length >= trip.settings.maxCars;
  const memberIds = new Set(trip.members.map((m) => m.profile.id));
  const friends = entries.filter((e) => e.status === 'friend' && !memberIds.has(e.profile.id));

  async function onLeave() {
    const others = trip!.members.length - 1;
    const msg =
      others === 0
        ? 'You are the last one here — the trip will end.'
        : isLeader
          ? `${trip!.members.find((m) => m.profile.id !== me)?.profile.display_name} will become the leader.`
          : 'You will stop sharing your location with this group.';
    if (!(await confirm('Leave trip?', msg, 'Leave'))) return;
    setBusy('leave');
    try {
      await leaveTrip(trip!.id);
      await stopTracking(); // SPEC §4: location sharing stops when you leave
      router.replace('/');
    } catch (e) {
      setActionError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', color: c.text }}>Trip</Text>
          <Button small variant="secondary" title="Back" onPress={() => goBack('/')} />
        </View>

        <Button style={{ marginTop: space.md }} title="Open map" onPress={() => router.push('/drive')} />

        <SectionTitle>Destination</SectionTitle>
        <Card style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: trip.destination ? c.text : c.textMuted }}>
            {trip.destination?.label ?? (isLeader ? 'Not set — choose where you are going.' : 'The leader has not set it yet.')}
          </Text>
          {isLeader && (
            <Button
              small
              style={{ marginTop: space.md }}
              title={trip.destination ? 'Change destination' : 'Set destination'}
              onPress={() => router.push('/set-destination')}
            />
          )}
        </Card>

        <SectionTitle>
          Cars ({trip.members.length}/{trip.settings.maxCars})
        </SectionTitle>
        {trip.members.map((m) => (
          <Card key={m.profile.id}>
            <Avatar name={m.profile.display_name} colour={m.profile.colour} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: c.text }}>
                {m.profile.display_name}
                {m.profile.id === me ? ' (you)' : ''}
              </Text>
              <Text style={{ fontSize: 14, color: c.textMuted }}>@{m.profile.username}</Text>
            </View>
            {m.profile.id === trip.leaderId && (
              <View style={{ backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: c.onBrand, fontWeight: '700', fontSize: 12 }}>LEADER</Text>
              </View>
            )}
          </Card>
        ))}

        <SectionTitle>Invite friends</SectionTitle>
        {full ? (
          <Text style={{ color: c.textMuted }}>The trip is full ({trip.settings.maxCars} cars).</Text>
        ) : friends.length === 0 ? (
          <Text style={{ color: c.textMuted }}>All your friends are already here — or add friends from the home screen.</Text>
        ) : (
          friends.map(({ profile: p }) => {
            const invited = trip.pendingInviteeIds.includes(p.id);
            return (
              <Card key={p.id}>
                <Avatar name={p.display_name} colour={p.colour} />
                <View style={{ flex: 1, marginLeft: space.md }}>
                  <Text style={{ fontSize: 17, fontWeight: '600', color: c.text }}>{p.display_name}</Text>
                  <Text style={{ fontSize: 14, color: c.textMuted }}>@{p.username}</Text>
                </View>
                {invited ? (
                  <Text style={{ color: c.textMuted, fontWeight: '600' }}>Invited</Text>
                ) : (
                  <Button small title="Invite" busy={busy === p.id} onPress={() => run(p.id, () => inviteToTrip(trip.id, p.id))} />
                )}
              </Card>
            );
          })
        )}

        <View style={{ marginTop: space.lg }}>
          <ErrorText>{error || actionError}</ErrorText>
          <Button variant="danger" title="Leave trip" busy={busy === 'leave'} onPress={onLeave} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
