import { TextStyle, Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: {
    regular: 'Nunito-Regular',
    medium: 'Nunito-Medium',
    semibold: 'Nunito-SemiBold',
    bold: 'Nunito-Bold',
  },
  android: {
    regular: 'Nunito-Regular',
    medium: 'Nunito-Medium',
    semibold: 'Nunito-SemiBold',
    bold: 'Nunito-Bold',
  },
  default: {
    regular: 'sans-serif',
    medium: 'sans-serif-medium',
    semibold: 'sans-serif-medium',
    bold: 'sans-serif-medium',
  },
}) as { regular: string; medium: string; semibold: string; bold: string };

export const Typography: Record<string, TextStyle> = {
  largeTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 38,
    fontWeight: '600',
    lineHeight: 44,
    letterSpacing: -0.3,
  },
  title1: {
    fontFamily: fontFamily.semibold,
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 36,
    letterSpacing: -0.2,
  },
  title2: {
    fontFamily: fontFamily.semibold,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
  },
  title3: {
    fontFamily: fontFamily.semibold,
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 26,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 26,
  },
  bodyEmphasis: {
    fontFamily: fontFamily.medium,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 26,
  },
  bodySemibold: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 26,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
  captionEmphasis: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  micro: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
};
