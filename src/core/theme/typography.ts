import { TextStyle, Platform } from 'react-native';

const fontFamily = Platform.OS === 'ios' ? 'System' : 'Roboto';

export const Typography: Record<string, TextStyle> = {
  largeTitle: {
    fontFamily,
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 38,
    letterSpacing: -0.4,
  },
  title1: {
    fontFamily,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 30,
    letterSpacing: -0.2,
  },
  title2: {
    fontFamily,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
  },
  title3: {
    fontFamily,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodyEmphasis: {
    fontFamily,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  bodySemibold: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  caption: {
    fontFamily,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  captionEmphasis: {
    fontFamily,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  micro: {
    fontFamily,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
};
