/**
 * Live map ("drive") screen — milestone 4.
 * Full-screen map with every car (dot + name), the shared route and the destination.
 *
 * Route: the LEADER's phone calculates it (from the leader's position to the destination) the
 * first time anyone opens this screen without one, and saves it on the trip for everyone.
 * Leader can recalculate (e.g. after changing the destination).
 *
 * "Test convoy" (development builds / web only) adds simulated cars — see src/lib/simulate.ts.
 * Alerts (useAlerts) and driver buttons: Break / Slow down / I'm OK (useHalt, DriveControls).
 */
import { useRouter } from 'expo-router';
import { goBack } from '../../src/components/goBack';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TripMap from '../../src/components/map/TripMap';
import { ageLabel } from '../../src/components/map/types';
import { space, useColours } from '../../src/components/theme';
import { Button, ErrorText } from '../../src/components/ui';
import { getCurrentPosition } from '../../src/services/location';
import { fetchRoute } from '../../src/services/route';
import { saveRoute, setHalt } from '../../src/services/trips';
import { ActionBar, HaltBanner } from '../../src/components/DriveControls';
import type { TripEvent } from '../../src/services/live';
import { useAuth } from '../../src/state/AuthProvider';
import { useHalt } from '../../src/state/useHalt';
import { useVoiceMuted } from '../../src/state/voice';
import { useButtonLimits } from '../../src/state/useButtonLimits';
import { NavBanner } from '../../src/components/NavBanner';
import { useNavigation } from '../../src/state/useNavigation';
import { useFollowBearing } from '../../src/state/useFollowBearing';
import { useConvoy } from '../../src/state/useConvoy';
import { AlertBanners } from '../../src/components/AlertBanners';
import { DEFAULT_TRIP_SETTINGS } from '../../src/config';
import { useAlerts } from '../../src/state/useAlerts';
import { useTrip } from '../../src/state/useTrip';

/** Used as the route start only when the leader's GPS is unavailable (e.g. testing on a PC). */
const FALLBACK_START = { lat: 37.9838, lng: 23.7275 }; // Athens, Omonoia
/** How long the leader's screen waits for GPS before routing from the fallback. */
const GPS_WAIT_MS = 10000;

export default function Drive() {
  const c = useColours();
  const router = useRouter();
  const { me, trip, reload } = useTrip();
  const [simulate, setSimulate] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [routeBusy, setRouteBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const { profile } = useAuth();
  const [muted, setMuted] = useVoiceMuted();
  // Group messages from other phones. Handled below once notify/snooze exist (ref breaks the cycle).
  const onEventRef = useRef<(e: TripEvent) => void>(() => {});
  const { cars, route, trackingNote, myFix, sendEvent } = useConvoy(trip, me, simulate, (e) => onEventRef.current(e));
  // Follow me: camera stays on my car. Dragging the map or "Fit all" turns it off.
  const [following, setFollowing] = useState(true);
  // Heading up: while following, the map turns so my driving direction points up (🧭 toggles).
  const [headingUp, setHeadingUp] = useState(true);
  const myCar = cars.find((car) => car.isMe);
  // Turn-by-turn for my car (replaces Google Maps): next turn, voice prompts, join-the-route leg.
  const nav = useNavigation(trip?.route, myCar);
  const bearing = useFollowBearing(myCar, headingUp);
  const { alerts, dismiss, notify, snoozeCar } = useAlerts(cars, route, trip?.settings ?? DEFAULT_TRIP_SETTINGS, !!trip?.halt);
  const limits = useButtonLimits();
  onEventRef.current = (e) => {
    if (!limits.acceptIncoming(e)) return; // same person repeating the button: ignore
    if (e.type === 'slow') notify(`${e.byName} asks everyone to slow down.`, true);
    if (e.type === 'ok') {
      snoozeCar(e.by);
      notify(`${e.byName} says they're OK.`);
    }
  };
  const brk = useHalt({
    halt: trip?.halt ?? null,
    saveHalt: async (h) => {
      if (!trip) return;
      await setHalt(trip.id, h);
      await reload();
    },
    cars,
    route,
    me: me && profile ? { id: me, name: profile.display_name } : null,
    notify,
  });
  const sendGroup = (type: TripEvent['type'], confirmText: string) => {
    if (!me || !profile) return;
    sendEvent({ type, by: me, byName: profile.display_name, at: Date.now() });
    limits.markUsed(type);
    notify(confirmText);
  };

  const isLeader = !!trip && trip.leaderId === me;

  async function calculateRoute() {
    if (!trip?.destination) return;
    setRouteBusy(true);
    setError('');
    try {
      // Start from where I am: my live GPS fix, else ask GPS once, else (no GPS at all) Athens.
      let start = myFix ? { lat: myFix.lat, lng: myFix.lng } : await getCurrentPosition();
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

  // Leader: make the route automatically if there isn't one yet — as soon as my GPS answers,
  // or after GPS_WAIT_MS without an answer (then calculateRoute falls back).
  const needsRoute = isLeader && !!trip?.destination && !trip?.route;
  useEffect(() => {
    if (!needsRoute || routeBusy) return;
    if (myFix) {
      calculateRoute();
      return;
    }
    const t = setTimeout(calculateRoute, GPS_WAIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRoute, !!myFix, trip?.destination?.lat, trip?.destination?.lng]);

  if (!trip) {
    return (
      <SafeAreaView style={{ flex: 1, padding: space.lg, justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: c.text, marginBottom: space.md }}>You're not in a trip.</Text>
        <Button title="Home" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const r = trip.route;
  // The WHOLE route (what's left for me is in the green nav banner).
  const routeText = r ? `Route: ${Math.round(r.distanceM / 1000)} km total · ${Math.floor(r.durationS / 3600)} h ${Math.round((r.durationS % 3600) / 60)} min` : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <TripMap
        route={route}
        destination={trip.destination}
        cars={cars}
        fitKey={fitKey}
        stop={trip.halt?.stop ?? null}
        joinLine={nav.joinLine}
        follow={following && myCar ? myCar.position : null}
        followBearing={following ? bearing : null}
        onUserMove={() => setFollowing(false)}
      />

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <NavBanner
          maneuver={nav.maneuver}
          remainingM={nav.remainingM}
          etaS={nav.etaS}
          joining={nav.joining}
          hint={
            trip.route && !nav.hasSteps
              ? isLeader
                ? 'Tap "New route" to get turn-by-turn directions.'
                : 'Turn-by-turn starts when the leader taps "New route".'
              : undefined
          }
        />
        <View style={{ margin: space.md, padding: space.md, borderRadius: 14, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Button small variant="secondary" title="Lobby" onPress={() => goBack('/trip')} />
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
        {trip.halt && (
          <HaltBanner halt={trip.halt} myDistanceM={brk.myDistanceM} arrived={brk.arrived} total={brk.total} meId={me} onContinue={brk.endBreak} />
        )}
        <AlertBanners alerts={alerts} onDismiss={dismiss} />
      </SafeAreaView>

      {/* Bottom panel */}
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={{ margin: space.md, padding: space.md, borderRadius: 14, backgroundColor: c.card }}>
          <View style={{ marginBottom: space.md }}>
            <ActionBar
              breakActive={!!trip.halt}
              busy={brk.busy}
              onBreak={brk.requestBreak}
              onSlow={() => sendGroup('slow', 'Sent: everyone slow down.')}
              onOk={() => sendGroup('ok', "Sent: you're OK.")}
              breakLeftMs={brk.breakLeftMs}
              slowLeftMs={limits.slowLeftMs}
              okLeftMs={limits.okLeftMs}
            />
          </View>
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
            {following ? (
              <Button
                small
                variant="secondary"
                title="Fit all"
                onPress={() => {
                  setFollowing(false);
                  setFitKey((k) => k + 1);
                }}
              />
            ) : (
              <Button small title="Follow me" onPress={() => setFollowing(true)} />
            )}
            <Button small variant="secondary" title={muted ? '🔇 Voice off' : '🔊 Voice on'} onPress={() => setMuted(!muted)} />
            <Button small variant="secondary" title={headingUp ? '🧭 Heading up' : '🧭 North up'} onPress={() => setHeadingUp(!headingUp)} />
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
                  setFollowing(true); // ride along with the simulated "You"
                }}
              />
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
