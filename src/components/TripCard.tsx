/**
 * Top of the home screen: trip invites waiting for me, and my current trip (or "Start a trip").
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { acceptInvite, createTrip, declineInvite } from '../services/trips';
import { useTrip } from '../state/useTrip';
import { space, useColours } from './theme';
import { Avatar, Button, Card, ErrorText, SectionTitle } from './ui';

export function TripCard() {
  const c = useColours();
  const router = useRouter();
  const { trip, invites, loading, error, reload } = useTrip();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  async function run(key: string, fn: () => Promise<unknown>, openLobby = false) {
    setBusy(key);
    setActionError('');
    try {
      await fn();
      await reload();
      if (openLobby) router.push('/trip');
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return null;

  return (
    <View>
      {invites.length > 0 && (
        <>
          <SectionTitle>Trip invites ({invites.length})</SectionTitle>
          {invites.map((inv) => (
            <Card key={inv.id}>
              <Avatar name={inv.from.display_name} colour={inv.from.colour} />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: c.text }}>{inv.from.display_name} invited you</Text>
                <Text style={{ fontSize: 14, color: c.textMuted }} numberOfLines={1}>
                  {inv.destinationLabel ? `to ${inv.destinationLabel}` : 'Destination not set yet'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button small title="Join" busy={busy === inv.id} disabled={!!trip} onPress={() => run(inv.id, () => acceptInvite(inv.id), true)} />
                <Button small variant="secondary" title="No" disabled={busy === inv.id} onPress={() => run(inv.id, () => declineInvite(inv.id))} />
              </View>
            </Card>
          ))}
          {trip && <Text style={{ color: c.textMuted, marginBottom: space.sm }}>Leave your current trip to join another.</Text>}
        </>
      )}

      <SectionTitle>Trip</SectionTitle>
      {trip ? (
        <Card style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.text }} numberOfLines={2}>
            {trip.destination ? `To ${trip.destination.label}` : 'No destination yet'}
          </Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginBottom: space.md }}>
            {trip.members.length} of {trip.settings.maxCars} cars
          </Text>
          <Button title="Open trip" onPress={() => router.push('/trip')} />
        </Card>
      ) : (
        <Button title="Start a trip" busy={busy === 'create'} onPress={() => run('create', createTrip, true)} />
      )}
      <View style={{ marginTop: space.sm }}>
        <ErrorText>{error || actionError}</ErrorText>
      </View>
    </View>
  );
}
