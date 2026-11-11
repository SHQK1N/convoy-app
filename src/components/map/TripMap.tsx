/**
 * Trip map for PHONES (react-native-maps). Web version: TripMap.web.tsx.
 * Draws: route line, destination pin, every car as a coloured dot with the name above it.
 * Offline cars (predicted position) are faded and say "last seen …".
 *
 * Android needs GOOGLE_MAPS_ANDROID_KEY (docs/SETUP.md §3) and a development build.
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useColours, useIsDark } from '../theme';
import { ageLabel, boundsOf, FOLLOW_ZOOM, MapCar, TripMapProps } from './types';

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
  const map = useRef<MapView>(null);

  // Follow me: keep my car centred (street-level zoom the first time).
  const zoomedIn = useRef(false);
  useEffect(() => {
    if (!map.current || !props.follow) {
      zoomedIn.current = false;
      return;
    }
    const center = { latitude: props.follow.lat, longitude: props.follow.lng };
    map.current.animateCamera(zoomedIn.current ? { center } : { center, zoom: FOLLOW_ZOOM }, { duration: 800 });
    zoomedIn.current = true;
  }, [props.follow?.lat, props.follow?.lng]);

  // Zoom to fit when asked (fitKey changes) or when the route first arrives (not while following).
  useEffect(() => {
    const b = boundsOf(props);
    if (!b || !map.current || (props.follow && props.fitKey === 0)) return;
    map.current.fitToCoordinates(
      [
        { latitude: b.minLat, longitude: b.minLng },
        { latitude: b.maxLat, longitude: b.maxLng },
      ],
      { edgePadding: { top: 120, right: 60, bottom: 220, left: 60 }, animated: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey, props.route.length > 0]);

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      userInterfaceStyle={dark ? 'dark' : 'light'}
      showsCompass={false}
      toolbarEnabled={false}
      onPanDrag={() => props.onUserMove?.()}
    >
      {props.route.length > 1 && (
        <Polyline
          coordinates={props.route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={c.brand}
          strokeWidth={6}
        />
      )}
      {props.destination && (
        <Marker
          coordinate={{ latitude: props.destination.lat, longitude: props.destination.lng }}
          title={props.destination.label}
          pinColor={c.brand}
        />
      )}
      {props.cars.map((car) => (
        <Marker
          key={car.id}
          coordinate={{ latitude: car.position.lat, longitude: car.position.lng }}
          anchor={{ x: 0.5, y: 1 }}
          // Redrawing custom markers is expensive; only while the label text can change.
          tracksViewChanges={car.predicted}
          zIndex={car.isMe ? 10 : 1}
        >
          <CarDot car={car} />
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  label: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 3, maxWidth: 160 },
  labelText: { fontSize: 13, fontWeight: '700' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#FFFFFF' },
});
