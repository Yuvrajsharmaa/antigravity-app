import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { Radius, Spacing } from '../theme/spacing';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = true,
  icon,
  style,
  textStyle,
}) => {
  const containerStyle = [
    styles.base,
    styles[`${variant}Container`],
    styles[`${size}Container`],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    style,
  ];

  const labelStyle = [
    styles.baseText,
    styles[`${variant}Text`],
    styles[`${size}Text`],
    (disabled || loading) && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' ? '#fff' : Colors.accent.primary}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={labelStyle}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    gap: Spacing.xs,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },

  // Variants
  primaryContainer: {
    backgroundColor: Colors.accent.primary,
    borderWidth: 1,
    borderColor: Colors.accent.dark + '22',
  },
  secondaryContainer: {
    backgroundColor: Colors.accent.soft,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '28',
  },
  ghostContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  dangerContainer: {
    backgroundColor: Colors.status.danger,
    borderWidth: 1,
    borderColor: Colors.status.danger + '30',
  },

  // Sizes
  smContainer: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  mdContainer: {
    paddingVertical: Spacing.sm + 1,
    paddingHorizontal: Spacing.lg,
  },
  lgContainer: {
    paddingVertical: Spacing.md + 1,
    paddingHorizontal: Spacing.xl,
  },

  // Text base
  baseText: {
    ...Typography.bodyEmphasis,
  },
  disabledText: {
    opacity: 0.7,
  },

  // Text variants
  primaryText: {
    color: Colors.text.inverse,
  },
  secondaryText: {
    color: Colors.accent.primary,
  },
  ghostText: {
    color: Colors.accent.primary,
  },
  dangerText: {
    color: Colors.text.inverse,
  },

  // Text sizes
  smText: {
    ...Typography.caption,
    fontWeight: '500',
  },
  mdText: {
    ...Typography.bodyEmphasis,
  },
  lgText: {
    ...Typography.bodySemibold,
  },
});
