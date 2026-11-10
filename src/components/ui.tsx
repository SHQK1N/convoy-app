/**
 * Small shared UI building blocks. Keep them dumb: props in, UI out, no data fetching.
 * Colours come from useColours() so everything follows light/dark mode.
 * Layout-only styles live in the StyleSheet at the bottom; colours are applied inline.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { minTouch, radius, space, useColours } from './theme';

export function Button(props: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
}) {
  const c = useColours();
  const { variant = 'primary', busy, disabled, small } = props;
  const bg = variant === 'primary' ? c.brand : variant === 'danger' ? c.danger : c.card;
  const fg = variant === 'secondary' ? c.text : c.onBrand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.title}
      onPress={props.onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: c.border },
        props.style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: fg }]}>{props.title}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const c = useColours();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { borderColor: c.border, color: c.text, backgroundColor: c.card }, style]}
        {...rest}
      />
    </View>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  const c = useColours();
  if (!children) return null;
  return <Text style={[styles.error, { color: c.danger }]}>{children}</Text>;
}

/** Coloured circle with the person's initial — the same look their dot will have on the map. */
export function Avatar({ name, colour, size = 40 }: { name: string; colour: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.42 }}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const c = useColours();
  return <Text style={[styles.section, { color: c.textMuted }]}>{children}</Text>;
}

/** A white (light) / dark-grey (dark) rounded row, used for friend lists. */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColours();
  return <View style={[styles.card, { backgroundColor: c.card }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.sm },
  buttonText: { fontSize: 17, fontWeight: '700' },
  buttonTextSmall: { fontSize: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: space.xs },
  input: {
    minHeight: minTouch,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 17,
  },
  error: { fontSize: 15, marginBottom: space.md },
  section: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.md,
    marginBottom: space.sm,
  },
});
