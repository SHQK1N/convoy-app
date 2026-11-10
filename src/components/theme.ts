/**
 * Colours and sizes, taken from the app icon (orange road + cream).
 * Change here to restyle the whole app.
 *
 * Light and dark palettes: the phone's system setting picks one (app.json → userInterfaceStyle: "automatic").
 * The brand orange is the same in both, as the icon.
 *
 * In a component:   const colours = useColours();   then use colours.text, colours.card, ...
 */
import { useColorScheme } from 'react-native';

const BRAND = '#FF4D26'; // icon orange (sampled from the logo)

export type Palette = {
  brand: string;
  brandDark: string;
  /** text/icons drawn ON the orange */
  onBrand: string;
  /** screen background */
  background: string;
  /** list rows, inputs, cards */
  card: string;
  text: string;
  textMuted: string;
  border: string;
  danger: string;
  success: string;
};

export const lightColours: Palette = {
  brand: BRAND,
  brandDark: '#D93A17',
  onBrand: '#FFFFFF',
  background: '#F7F3EE', // icon road cream
  card: '#FFFFFF',
  text: '#1D1B19',
  textMuted: '#6B655E',
  border: '#E2DDD4',
  danger: '#C62828',
  success: '#2E7D32',
};

export const darkColours: Palette = {
  brand: BRAND,
  brandDark: '#FF7A5C', // lighter on dark backgrounds, used for pressed/links
  onBrand: '#FFFFFF',
  background: '#121110', // warm near-black (not pure black: less harsh at night)
  card: '#1F1C1A',
  text: '#F5F2EC',
  textMuted: '#A39C93',
  border: '#36312C',
  danger: '#FF6B6B',
  success: '#5FD068',
};

/** Current palette, following the phone's light/dark setting (updates live when it changes). */
export function useColours(): Palette {
  return useColorScheme() === 'dark' ? darkColours : lightColours;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 14, pill: 999 };
/** Minimum touch size. Large on purpose — the app is used in cars. */
export const minTouch = 52;
