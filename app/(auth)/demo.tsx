/**
 * Map demo (development only): the live map with a simulated convoy on a real route
 * (Athens → Meteora), no account or trip needed. Linked from the sign-in screen when __DEV__.
 * Shows exactly what drive.tsx draws: dots + names, route, a car losing signal (faded,
 * predicted), a car falling behind.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TripMap from '../../src/components/map/TripMap';
import { ageLabel, MapCar } from '../../src/components/map/types';
import { space, useColours } from '../../src/components/theme';
import { Button, ErrorText } from '../../src/components/ui';
import { cumulativeDistances, LatLng } from '../../src/lib/geo';
import { estimateCar } from '../../src/lib/prediction';
import { SIM_CARS, simulateConvoy, SPEEDUP } from '../../src/lib/simulate';
import { fetchRoute, routePoints } from '../../src/services/route';

const START = { lat: 37.9838, lng: 23.7275 }; // Athens
const DEST = { lat: 39.7217, lng: 21.6306, label: 'Meteora, Kalambaka' };
const CARS = [...SIM_CARS, { id: 'me', name: 'You', colour: '#FF4D26', kmh: 100, startOffsetM: 600 }];

export default function Demo() {
  const c = useColours();
  const router = useRouter();
  const [route, setRoute] = useState<LatLng[]>([]);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [fitKey, setFitKey] = useState(0);

  useEffect(() => {
    fetchRoute([START, DEST])
      .then((r) => {
        setRoute(routePoints(r));
        setStartedAt(Date.now());
      })
      .catch((e) => setError((e as Error).message));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cum = useMemo(() => cumulativeDistances(route), [route]);
  const cars: MapCar[] = useMemo(
    () =>
      simulateConvoy(route, startedAt, now, CARS, cum).map((f) => {
        const car = CARS.find((x) => x.id === f.userId)!;
        const est = estimateCar(f, route, now, cum);
        return { id: f.userId, name: car.name, colour: car.colour, position: est.position, predicted: est.predicted, ageMs: est.ageMs, isMe: f.userId === 'me' };
      }),
    [route, startedAt, now, cum],
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <TripMap route={route} destination={DEST} cars={cars} fitKey={fitKey} />
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={{ margin: space.md, padding: space.md, borderRadius: 14, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Button small variant="secondary" title="Back" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>Map demo · {DEST.label}</Text>
            <Text style={{ fontSize: 13, color: c.textMuted }}>Simulated convoy, {SPEEDUP}× speed</Text>
          </View>
        </View>
        {!!error && (
          <View style={{ marginHorizontal: space.md, padding: space.sm, borderRadius: 10, backgroundColor: c.card }}>
            <ErrorText>{error}</ErrorText>
          </View>
        )}
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={{ margin: space.md, padding: space.md, borderRadius: 14, backgroundColor: c.card, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
          {cars.map((car) => (
            <View key={car.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: c.border, opacity: car.predicted ? 0.6 : 1 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: car.colour }} />
              <Text style={{ color: c.text, fontWeight: '600' }}>{car.name}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{car.predicted ? ageLabel(car.ageMs) : 'live'}</Text>
            </View>
          ))}
          <Button small variant="secondary" title="Fit all" onPress={() => setFitKey((k) => k + 1)} />
          <Button small variant="secondary" title="Restart" onPress={() => { setStartedAt(Date.now()); setFitKey((k) => k + 1); }} />
        </View>
      </SafeAreaView>
    </View>
  );
}
