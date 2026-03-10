import { TextStyle, Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: {
    regular: 'AvenirNext-Regular',
    medium: 'AvenirNext-Medium',
    semibold: 'AvenirNext-DemiBold',
  },
  android: {
    regular: 'sans-serif',
    medium: 'sans-serif-medium',
    semibold: 'sans-serif-medium',
  },
  default: {
    regular: 'sans-serif',
    medium: 'sans-serif-medium',
    semibold: 'sans-serif-medium',
  },
}) as { regular: string; medium: string; semibold: string };

export const Typography: Record<string, TextStyle> = {
  largeTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
    letterSpacing: -0.4,
  },
  title1: {
    fontFamily: fontFamily.semibold,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    letterSpacing: -0.25,
  },
  title2: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 27,
  },
  title3: {
    fontFamily: fontFamily.semibold,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodyEmphasis: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  bodySemibold: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  captionEmphasis: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  micro: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
};
