/**
 * One place for everything the app SAYS (alerts, break reminders), with one mute switch.
 *
 *   speak('Eleni is falling behind');
 *   const [muted, setMuted] = useVoiceMuted();
 */
import * as Speech from 'expo-speech';
import { useSyncExternalStore } from 'react';

import { Platform } from 'react-native';

/** Web testing: open any page with ?mute=1 to start with the voice off (used for automated checks). */
let muted = Platform.OS === 'web' && typeof window !== 'undefined' && /[?&]mute=1\b/.test(window.location.search);
const listeners = new Set<() => void>();

export function speak(text: string) {
  if (!muted) Speech.speak(text, { language: 'en-GB', rate: 1.0 });
}

export function stopSpeaking() {
  Speech.stop();
}

export function setVoiceMuted(m: boolean) {
  muted = m;
  if (m) Speech.stop();
  listeners.forEach((l) => l());
}

export function useVoiceMuted(): [boolean, (m: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => muted,
  );
  return [value, setVoiceMuted];
}
