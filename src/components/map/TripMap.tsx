/**
 * Trip map for PHONES (MapLibre Native + OpenFreeMap — free, no API key). Web version: TripMap.web.tsx.
 * Draws: route line, my dashed "join the route" leg, destination, break stop, and every car as a
 * coloured dot with the name above it. Offline cars (predicted position) are faded.
 *
 * Needs a development build (MapLibre is native code, not in Expo Go).
 * Camera: "Follow me" eases continuously (linear 1 s moves that chain, matching the ~1 s position
 * updates) and can turn the map to the driving direction (followBearing).
 */
import { Camera, type CameraRef, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColours, useIsDark } from '../theme';
import { ageLabel, boundsOf, FOLLOW_ZOOM, MAP_STYLE, MapCar, TripMapProps } from './types';

const GLIDE_MS = 1000;

const lineGeo = (pts: { lat: number; lng: number }[]): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) },
});

function CarDot({ car }: { car: MapCar }) {
  const c = useColours();
  return (
    <View style={{ alignItems: 'center', opacity: car.predicted ? 0.5 : 1 }}>
      <View style={[styles.label, { backgroundColor: c.card, borderColor: car.colour }]}>
        <Text style={[styles.labelText, { color: c.text }]} numberOfLines={1}>
          {car.isMe ? 'You' : car.name}
          {car.predicted ? ` · ${ageLabel(car.ageMs)}` : ''}
        </Text>
      </View>
      <View style={[styles.dot, { backgroundColor: car.colour, borderStyle: car.predicted ? 'dashed' : 'solid' }]} />
    </View>
  );
}

export default function TripMap(props: TripMapProps) {
  const c = useColours();
  const dark = useIsDark();
  const camera = useRef<CameraRef>(null);
  const zoomedIn = useRef(false);

  // Follow me (+ heading up).
  useEffect(() => {
    if (!camera.current || !props.follow) {
      zoomedIn.current = false;
      return;
    }
    const first = !zoomedIn.current;
    zoomedIn.current = true;
    camera.current.easeTo({
      center: [props.follow.lng, props.follow.lat],
      ...(first ? { zoom: FOLLOW_ZOOM } : {}),
      bearing: props.followBearing ?? 0,
      padding: { top: 260, bottom: 120, left: 0, right: 0 },
      duration: first ? 800 : GLIDE_MS,
      easing: first ? 'ease' : 'linear',
    });
  }, [props.follow?.lat, props.follow?.lng, props.followBearing]);

  // Fit all on request, or when the route first arrives (not while following).
  useEffect(() => {
    if (props.follow) return;
    const b = boundsOf(props);
    if (!b || !camera.current) return;
    camera.current.fitBounds([b.minLng, b.minLat, b.maxLng, b.maxLat], {
      padding: { top: 220, bottom: 280, left: 40, right: 40 },
      bearing: 0,
      duration: 800,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey, props.route.length > 0]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={dark ? MAP_STYLE.dark : MAP_STYLE.light}
      logo={false}
      compass={false}
      attribution
      onRegionWillChange={(e) => e.nativeEvent.userInteraction && props.onUserMove?.()}
    >
      <Camera ref={camera} initialViewState={{ center: [23.7, 38.0], zoom: 7 }} />

      <GeoJSONSource id="route" data={lineGeo(props.route)}>
        <Layer id="route-line" type="line" layout={{ 'line-join': 'round', 'line-cap': 'round' }} paint={{ 'line-color': c.brand, 'line-width': 7, 'line-opacity': 0.9 }} />
      </GeoJSONSource>
      <GeoJSONSource id="join" data={lineGeo(props.joinLine ?? [])}>
        <Layer id="join-line" type="line" paint={{ 'line-color': '#1E88E5', 'line-width': 5, 'line-dasharray': [1.5, 1.5] }} />
      </GeoJSONSource>

      {props.destination && (
        <Marker id="destination" lngLat={[props.destination.lng, props.destination.lat]}>
          <View style={[styles.dest, { backgroundColor: c.brand }]} />
        </Marker>
      )}
      {props.stop && (
        <Marker id="stop" lngLat={[props.stop.lng, props.stop.lat]}>
          <View style={[styles.stop, { borderColor: c.brand }]}>
            <Text style={{ fontSize: 17 }}>🛑</Text>
          </View>
        </Marker>
      )}
      {props.cars.map((car) => (
        <Marker key={car.id} id={`car-${car.id}`} lngLat={[car.position.lng, car.position.lat]} anchor="bottom">
          <CarDot car={car} />
        </Marker>
      ))}
    </Map>
  );
}

const styles = StyleSheet.create({
  label: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 3, maxWidth: 160 },
  labelText: { fontSize: 13, fontWeight: '700' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#FFFFFF' },
  dest: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#FFFFFF' },
  stop: { width: 34, height: 34, borderRadius: 17, borderWidth: 4, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
