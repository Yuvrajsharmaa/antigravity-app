import { ThemeV2Tokens, ThemeV3Tokens } from '../models/types';
import { Colors } from './colors';
import { Radius } from './spacing';

export const ThemeV2: ThemeV2Tokens = {
  semantic: Colors.semantic,
  semanticSoft: Colors.semanticSoft,
  radius: {
    sm: Radius.sm,
    md: Radius.md,
    lg: Radius.lg,
    xl: Radius.xl,
    xxl: Radius.xxl,
  },
};

export const ThemeV3: ThemeV3Tokens = {
  semantic: Colors.semantic,
  semanticSoft: Colors.semanticSoft,
  radius: {
    sm: Radius.sm,
    md: Radius.md,
    lg: Radius.lg,
    xl: Radius.xl,
    xxl: Radius.xxl,
  },
  color: {
    primary: Colors.accent.primary,
    cream: Colors.bg.primary,
    ink: Colors.text.primary,
    mist: Colors.bg.tertiary,
  },
};
