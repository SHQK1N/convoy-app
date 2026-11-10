/**
 * Live map ("drive") screen — milestone 4.
 * Full-screen map with every car (dot + name), the shared route and the destination.
 *
 * Route: the LEADER's phone calculates it (from the leader's position to the destination) the
 * first time anyone opens this screen without one, and saves it on the trip for everyone.
 * Leader can recalculate (e.g. after changing the destination).
 *
 * "Test convoy" (development builds / web only) adds simulated cars — see src/lib/simulate.ts.
 * Alerts and action buttons (Halt, Slow down, I'm OK) come in milestones 5–6.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TripMap from '../../src/components/map/TripMap';
import { ageLabel } from '../../src/components/map/types';
import { space, useColours } from '../../src/components/theme';
import { Button, ErrorText } from '../../src/components/ui';
import { getCurrentPosition } from '../../src/services/location';
import { fetchRoute } from '../../src/services/route';
import { saveRoute } from '../../src/services/trips';
import { useConvoy } from '../../src/state/useConvoy';
import { useTrip } from '../../src/state/useTrip';

/** Used as the route start only when the leader's GPS is unavailable (e.g. testing on a PC). */
const FALLBACK_START = { lat: 37.9838, lng: 23.7275 }; // Athens, Syntagma

export default function Drive() {
  const c = useColours();
  const router = useRouter();
  const { me, trip, reload } = useTrip();
  const [simulate, setSimulate] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [routeBusy, setRouteBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const { cars, route, trackingNote } = useConvoy(trip, me, simulate);

  const isLeader = !!trip && trip.leaderId === me;

  async function calculateRoute() {
    if (!trip?.destination) return;
    setRouteBusy(true);
    setError('');
    try {
      let start = await getCurrentPosition();
      if (!start) {
        start = FALLBACK_START;
        setNote('No GPS here — route starts from Athens for testing.');
      }
      await saveRoute(trip.id, await fetchRoute([start, trip.destination]));
      await reload();
      setFitKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRouteBusy(false);
    }
  }

  // Leader: make the route automatically if there isn't one yet.
  useEffect(() => {
    if (isLeader && trip?.destination && !trip.route && !routeBusy) calculateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader, trip?.destination?.lat, trip?.destination?.lng, !!trip?.route]);

  if (!trip) {
    return (
      <SafeAreaView style={{ flex: 1, padding: space.lg, justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: c.text, marginBottom: space.md }}>You're not in a trip.</Text>
        <Button title="Home" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const r = trip.route;
  const routeText = r ? `${Math.round(r.distanceM / 1000)} km · ${Math.floor(r.durationS / 3600)} h ${Math.round((r.durationS % 3600) / 60)} min` : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <TripMap route={route} destination={trip.destination} cars={cars} fitKey={fitKey} />

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={{ margin: space.md, padding: space.md, borderRadius: 14, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Button small variant="secondary" title="Lobby" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }} numberOfLines={1}>
              {trip.destination ? trip.destination.label : 'No destination yet'}
            </Text>
            <Text style={{ fontSize: 13, color: c.textMuted }}>
              {routeBusy ? 'Calculating route…' : routeText ?? (isLeader ? 'Set a destination in the lobby' : 'Waiting for the leader’s route')}
            </Text>
          </View>
        </View>
        {(error || note || trackingNote) && (
          <View style={{ marginHorizontal: space.md, padding: space.sm, borderRadius: 10, backgroundColor: c.card }}>
            <ErrorText>{error}</ErrorText>
            {!!(note || trackingNote) && <Text style={{ color: c.textMuted, fontSize: 13 }}>{note || trackingNote}</Text>}
          </View>
        )}
      </SafeAreaView>

      {/* Bottom panel */}
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={{ margin: space.md, padding: space.md, borderRadius: 14, backgroundColor: c.card }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {cars.length === 0 && <Text style={{ color: c.textMuted }}>Waiting for cars to share their position…</Text>}
            {cars.map((car) => (
              <View key={car.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: c.border, opacity: car.predicted ? 0.6 : 1 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: car.colour }} />
                <Text style={{ color: c.text, fontWeight: '600' }}>{car.isMe ? 'You' : car.name}</Text>
                <Text style={{ color: c.textMuted, fontSize: 12 }}>{car.predicted ? ageLabel(car.ageMs) : 'live'}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' }}>
            <Button small variant="secondary" title="Fit all" onPress={() => setFitKey((k) => k + 1)} />
            {isLeader && trip.destination && (
              <Button small variant="secondary" title="New route" busy={routeBusy} onPress={calculateRoute} />
            )}
            {__DEV__ && (
              <Button
                small
                variant={simulate ? 'primary' : 'secondary'}
                title={simulate ? 'Stop test convoy' : 'Test convoy'}
                disabled={route.length < 2}
                onPress={() => {
                  setSimulate((s) => !s);
                  setFitKey((k) => k + 1);
                }}
              />
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
