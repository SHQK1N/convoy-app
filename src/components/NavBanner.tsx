/**
 * Turn-by-turn banner at the top of the map: big arrow, distance to the turn, the instruction,
 * "then …", and distance / time left to the destination. Data: useNavigation().
 */
import React from 'react';
import { Text, View } from 'react-native';
import { fmtKm } from '../lib/halt';
import { arrowFor, Maneuver } from '../lib/nav';
import { radius, space, useColours } from './theme';

function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function NavBanner(props: { maneuver: Maneuver | null; remainingM: number | null; etaS: number | null; joining: boolean; hint?: string }) {
  const c = useColours();
  const { maneuver: m } = props;

  if (!m) {
    if (!props.hint) return null;
    return (
      <View style={{ marginHorizontal: space.md, marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.card }}>
        <Text style={{ color: c.textMuted, fontSize: 15 }}>{props.hint}</Text>
      </View>
    );
  }

  const name = m.step.name && m.step.name !== '-' ? m.step.name : '';
  return (
    <View style={{ marginHorizontal: space.md, marginTop: space.md, borderRadius: radius.md, overflow: 'hidden' }}>
      <View style={{ backgroundColor: '#1F6F43', padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text style={{ fontSize: 44, color: '#FFFFFF', width: 56, textAlign: 'center' }}>{arrowFor(m.step.type)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '800' }}>{fmtKm(m.distanceM)}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
            {m.step.instruction}
            {m.step.exit ? ` (exit ${m.step.exit})` : ''}
          </Text>
        </View>
      </View>
      <View style={{ backgroundColor: '#17573A', paddingHorizontal: space.md, paddingVertical: 6, flexDirection: 'row', gap: space.md }}>
        <Text style={{ flex: 1, color: '#D8F3E3', fontSize: 14 }} numberOfLines={1}>
          {m.then ? `Then ${arrowFor(m.then.type)} ${m.then.instruction}` : props.joining ? 'Driving to the group route' : name}
        </Text>
        {props.remainingM != null && (
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
            {fmtKm(props.remainingM)}
            {props.etaS != null ? ` · ${fmtTime(props.etaS)}` : ''}
          </Text>
        )}
      </View>
    </View>
  );
}
