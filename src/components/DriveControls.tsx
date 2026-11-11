/**
 * Driver controls on the map — SPEC §7. Few, big buttons; no typing.
 *   ActionBar:  ☕ Break (then pick a reason) · 🐢 Slow down · 👍 I'm OK
 *   HaltBanner: shown to everyone during a break — where to stop, how far, who's there, Continue.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BREAK_LABELS, BreakReason, fmtKm, Halt } from '../lib/halt';
import { minTouch, radius, space, useColours } from './theme';

function BigButton({ label, onPress, tone = 'normal', disabled }: { label: string; onPress: () => void; tone?: 'normal' | 'brand' | 'muted'; disabled?: boolean }) {
  const c = useColours();
  const bg = tone === 'brand' ? c.brand : tone === 'muted' ? c.background : c.card;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: minTouch + 8,
        borderRadius: radius.md,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: tone === 'brand' ? c.brand : c.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        paddingHorizontal: 4,
      })}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', color: tone === 'brand' ? c.onBrand : c.text, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

/** "45s" / "4 min" for a button that is cooling down. */
function wait(ms: number) {
  return ms >= 60000 ? `${Math.ceil(ms / 60000)} min` : `${Math.ceil(ms / 1000)}s`;
}

export function ActionBar(props: {
  onBreak: (r: BreakReason) => void;
  onSlow: () => void;
  onOk: () => void;
  breakActive: boolean;
  busy: boolean;
  /** Anti-spam: ms until each button can be used again (0 = ready). */
  breakLeftMs: number;
  slowLeftMs: number;
  okLeftMs: number;
}) {
  const [choosing, setChoosing] = useState(false);

  if (choosing) {
    return (
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(Object.keys(BREAK_LABELS) as BreakReason[]).map((r) => (
            <BigButton
              key={r}
              tone="brand"
              label={`${BREAK_LABELS[r].icon}\n${BREAK_LABELS[r].text}`}
              onPress={() => {
                setChoosing(false);
                props.onBreak(r);
              }}
            />
          ))}
        </View>
        <BigButton tone="muted" label="Cancel" onPress={() => setChoosing(false)} />
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <BigButton
        tone="brand"
        label={props.busy ? 'Finding a stop…' : props.breakLeftMs > 0 && !props.breakActive ? `☕ Break · ${wait(props.breakLeftMs)}` : '☕ Break'}
        disabled={props.breakActive || props.busy || props.breakLeftMs > 0}
        onPress={() => setChoosing(true)}
      />
      <BigButton
        label={props.slowLeftMs > 0 ? `🐢 Slow down · ${wait(props.slowLeftMs)}` : '🐢 Slow down'}
        disabled={props.slowLeftMs > 0}
        onPress={props.onSlow}
      />
      <BigButton
        label={props.okLeftMs > 0 ? `👍 I'm OK · ${wait(props.okLeftMs)}` : "👍 I'm OK"}
        disabled={props.okLeftMs > 0}
        onPress={props.onOk}
      />
    </View>
  );
}

export function HaltBanner(props: { halt: Halt; myDistanceM: number | null; arrived: number; total: number; meId?: string; onContinue: () => void }) {
  const c = useColours();
  const { halt } = props;
  const who = halt.by === props.meId ? 'You' : halt.byName;
  return (
    <View style={{ marginHorizontal: space.md, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.brand, gap: 6 }}>
      <Text style={{ color: c.onBrand, fontSize: 18, fontWeight: '800' }}>
        🛑 {BREAK_LABELS[halt.reason].icon} {BREAK_LABELS[halt.reason].text} break · called by {who}
      </Text>
      <Text style={{ color: c.onBrand, fontSize: 16, fontWeight: '600' }}>
        Pull over at {halt.stop.label}
        {props.myDistanceM != null ? (props.myDistanceM > 250 ? ` · ${fmtKm(props.myDistanceM)}` : ' · you are there') : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text style={{ flex: 1, color: c.onBrand, fontSize: 14 }}>
          {props.arrived}/{props.total} cars at the stop
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={props.onContinue}
          style={({ pressed }) => ({ backgroundColor: '#FFFFFF', borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10, opacity: pressed ? 0.8 : 1 })}
        >
          <Text style={{ color: c.brand, fontWeight: '800', fontSize: 15 }}>Continue trip</Text>
        </Pressable>
      </View>
    </View>
  );
}
