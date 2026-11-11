/**
 * Alert banners shown over the map (newest on top). Red = problem, green = resolved.
 * Big text, tap to dismiss — they also go away on their own and are spoken aloud (useAlerts).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AlertEvent } from '../lib/alerts';
import { space, useColours } from './theme';

export function AlertBanners({ alerts, onDismiss }: { alerts: AlertEvent[]; onDismiss: (id: string) => void }) {
  const c = useColours();
  if (!alerts.length) return null;
  return (
    <View style={{ marginHorizontal: space.md, marginTop: space.sm, gap: space.sm }}>
      {alerts.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="alert"
          accessibilityLabel={a.text}
          onPress={() => onDismiss(a.id)}
          style={{
            backgroundColor: a.problem ? c.danger : c.success,
            borderRadius: 14,
            paddingVertical: space.md,
            paddingHorizontal: space.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
          }}
        >
          <Text style={{ fontSize: 22 }}>{a.problem ? (a.kind === 'offline' ? '📡' : '⚠️') : '✅'}</Text>
          <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>{a.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}
