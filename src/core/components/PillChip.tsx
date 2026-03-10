import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { Radius, Spacing } from '../theme/spacing';

interface PillChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export const PillChip: React.FC<PillChipProps> = ({
  label,
  selected = false,
  onPress,
  style,
}) => (
  <TouchableOpacity
    style={[
      styles.chip,
      selected ? styles.selected : styles.unselected,
      style,
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={[styles.label, selected ? styles.selectedLabel : styles.unselectedLabel]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  chip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  selected: {
    backgroundColor: Colors.accent.soft,
    borderColor: Colors.accent.primary,
  },
  unselected: {
    backgroundColor: Colors.bg.secondary,
    borderColor: Colors.stroke.subtle,
  },
  label: {
    ...Typography.captionEmphasis,
  },
  selectedLabel: {
    color: Colors.accent.dark,
  },
  unselectedLabel: {
    color: Colors.text.secondary,
  },
});
