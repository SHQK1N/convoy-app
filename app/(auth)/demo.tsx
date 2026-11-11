/**
 * Map demo (development only): the live map with a simulated convoy on a real route
 * (Athens → Meteora), no account or trip needed. Linked from the sign-in screen when __DEV__.
 * Same pieces as the real map (drive.tsx): dots + names, route, alerts, and the driver buttons.
 *
 * What to watch: Eleni is slower and falls behind → alert → the cars ahead slow down until she
 * catches up. Tap ☕ Break → a real stop ahead is found → everyone drives there and parks →
 * "Continue trip" sends everyone on. The break lives in local state here (the real map stores it on the trip).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertBanners } from '../../src/components/AlertBanners';
import { ActionBar, HaltBanner } from '../../src/components/DriveControls';
import { goBack } from '../../src/components/goBack';
import TripMap from '../../src/components/map/TripMap';
import { ageLabel, MapCar } from '../../src/components/map/types';
import { space, useColours } from '../../src/components/theme';
import { Button, ErrorText } from '../../src/components/ui';
import { DEFAULT_TRIP_SETTINGS } from '../../src/config';
import { cumulativeDistances, LatLng } from '../../src/lib/geo';
import type { Halt } from '../../src/lib/halt';
import { estimateCar } from '../../src/lib/prediction';
import { ConvoySim, SIM_CARS, SimCar } from '../../src/lib/simulate';
import { fetchRoute, routePoints } from '../../src/services/route';
import { useAlerts } from '../../src/state/useAlerts';
import { useHalt } from '../../src/state/useHalt';
import { useVoiceMuted } from '../../src/state/voice';
import { NavBanner } from '../../src/components/NavBanner';
import { useNavigation } from '../../src/state/useNavigation';
import type { StoredRoute } from '../../src/services/route';
import { useButtonLimits } from '../../src/state/useButtonLimits';

const START = { lat: 37.9838, lng: 23.7275 }; // Athens
const DEST = { lat: 39.7217, lng: 21.6306, label: 'Meteora, Kalambaka' };
const ME: SimCar = { id: 'me', name: 'You', colour: '#FF4D26', kmh: 100, startOffsetM: 600 };
const CARS = [...SIM_CARS, ME];
/** Time speed-up choices (tap the speed button to cycle). 1× = real driving speed. */
const SPEEDS = [1, 10, 30];

export default function Demo() {
  const c = useColours();
  const [stored, setStored] = useState<StoredRoute | null>(null);
  const route = useMemo<LatLng[]>(() => routePoints(stored), [stored]);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [fitKey, setFitKey] = useState(0);
  const [following, setFollowing] = useState(true);
  const [halt, setHalt] = useState<Halt | null>(null);
  const [speedup, setSpeedup] = useState(10);
  const [muted, setMuted] = useVoiceMuted();

  useEffect(() => {
    fetchRoute([START, DEST])
      .then((r) => {
        setStored(r);
        setStartedAt(Date.now());
      })
      .catch((e) => setError((e as Error).message));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cum = useMemo(() => cumulativeDistances(route), [route]);

  // The simulator keeps state (slowing down, parking), so one instance per run.
  const sim = useRef<ConvoySim | null>(null);
  useEffect(() => {
    sim.current = route.length > 1 ? new ConvoySim(route, CARS, startedAt, speedup) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, startedAt]);
  useEffect(() => {
    if (sim.current) sim.current.speedup = speedup;
  }, [speedup]);

  const cars: MapCar[] = useMemo(() => {
    if (!sim.current) return [];
    return sim.current.step(now, halt ? halt.stop.alongM : null).map((f) => {
      const car = CARS.find((x) => x.id === f.userId)!;
      const est = estimateCar(f, route, now, cum);
      return { id: f.userId, name: car.name, colour: car.colour, position: est.position, speed: f.speed, predicted: est.predicted, ageMs: est.ageMs, isMe: f.userId === ME.id };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, route, cum]);

  const { alerts, dismiss, notify } = useAlerts(cars, route, DEFAULT_TRIP_SETTINGS, !!halt);
  const limits = useButtonLimits();
  const nav = useNavigation(stored, cars.find((x) => x.isMe));
  const brk = useHalt({ halt, saveHalt: async (h) => setHalt(h), cars, route, me: { id: ME.id, name: 'You' }, notify });

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <TripMap
        route={route}
        destination={DEST}
        cars={cars}
        fitKey={fitKey}
        stop={halt?.stop ?? null}
        follow={following ? cars.find((x) => x.isMe)?.position ?? null : null}
        onUserMove={() => setFollowing(false)}
      />
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <NavBanner maneuver={nav.maneuver} remainingM={nav.remainingM} etaS={nav.etaS} joining={nav.joining} />
        <View style={{ marginHorizontal: space.md, marginTop: space.sm, padding: space.sm, borderRadius: 14, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Button small variant="secondary" title="Back" onPress={() => goBack('/sign-in')} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }} numberOfLines={1}>Map demo · {DEST.label}</Text>
            <Text style={{ fontSize: 13, color: c.textMuted }}>Simulated convoy, {speedup}× speed</Text>
          </View>
        </View>
        {!!error && (
          <View style={{ marginHorizontal: space.md, padding: space.sm, borderRadius: 10, backgroundColor: c.card }}>
            <ErrorText>{error}</ErrorText>
          </View>
        )}
        {halt && <HaltBanner halt={halt} myDistanceM={brk.myDistanceM} arrived={brk.arrived} total={brk.total} meId={ME.id} onContinue={brk.endBreak} />}
        <AlertBanners alerts={alerts} onDismiss={dismiss} />
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={{ margin: space.md, padding: space.md, borderRadius: 14, backgroundColor: c.card }}>
          <ActionBar
            breakActive={!!halt}
            busy={brk.busy}
            onBreak={brk.requestBreak}
            onSlow={() => {
              limits.markUsed('slow');
              notify('Sent: everyone slow down.');
            }}
            onOk={() => {
              limits.markUsed('ok');
              notify("Sent: you're OK.");
            }}
            breakLeftMs={brk.breakLeftMs}
            slowLeftMs={limits.slowLeftMs}
            okLeftMs={limits.okLeftMs}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }} contentContainerStyle={{ gap: space.sm }}>
            {cars.map((car) => (
              <View key={car.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: c.border, opacity: car.predicted ? 0.6 : 1 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: car.colour }} />
                <Text style={{ color: c.text, fontWeight: '600' }}>{car.name}</Text>
                <Text style={{ color: c.textMuted, fontSize: 12 }}>{car.predicted ? ageLabel(car.ageMs) : 'live'}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            {following ? (
              <Button small variant="secondary" title="Fit all" onPress={() => { setFollowing(false); setFitKey((k) => k + 1); }} />
            ) : (
              <Button small title="Follow me" onPress={() => setFollowing(true)} />
            )}
            <Button small variant="secondary" title="Restart" onPress={() => { setHalt(null); setStartedAt(Date.now()); setFollowing(true); }} />
            <Button small variant="secondary" title={muted ? '🔇 Voice off' : '🔊 Voice on'} onPress={() => setMuted(!muted)} />
            <Button small variant="secondary" title={`⏩ ${speedup}×`} onPress={() => setSpeedup(SPEEDS[(SPEEDS.indexOf(speedup) + 1) % SPEEDS.length])} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
