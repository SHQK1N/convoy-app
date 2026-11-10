/**
 * Leader picks the trip destination: type a place, tap a result.
 * Search: OpenRouteService geocoder (src/services/geocode.ts), 400 ms after typing stops.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Field } from '../../src/components/ui';
import { space, useColours } from '../../src/components/theme';
import { Place, searchPlaces } from '../../src/services/geocode';
import { setDestination } from '../../src/services/trips';
import { useTrip } from '../../src/state/useTrip';

export default function SetDestination() {
  const c = useColours();
  const router = useRouter();
  const { trip } = useTrip();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length < 3) return setResults([]);
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchPlaces(query));
        setError('');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  async function choose(place: Place) {
    if (!trip) return;
    setSaving(true);
    try {
      await setDestination(trip.id, place);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
          <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', color: c.text }}>Where to?</Text>
          <Button small variant="secondary" title="Cancel" onPress={() => router.back()} />
        </View>
        <Field label="Search for a place" value={query} onChangeText={setQuery} placeholder="e.g. Meteora, Kalambaka" autoCapitalize="words" autoFocus />
        <ErrorText>{error}</ErrorText>
        {(searching || saving) && <ActivityIndicator color={c.brand} />}
      </View>
      <FlatList
        data={results}
        keyExtractor={(p, i) => `${p.lat},${p.lng},${i}`}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !searching && query.trim().length >= 3 && !error ? (
            <Text style={{ color: c.textMuted }}>No places found.</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            disabled={saving}
            onPress={() => choose(item)}
            style={({ pressed }) => ({
              backgroundColor: c.card,
              padding: space.md,
              borderRadius: 14,
              marginBottom: space.sm,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 16, color: c.text }}>{item.label}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
