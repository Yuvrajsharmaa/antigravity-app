import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/spacing';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  padded = true,
  elevated = true,
}) => (
  <View
    style={[
      styles.card,
      padded && styles.padded,
      elevated && Shadow.card,
      style,
    ]}
  >
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  padded: {
    padding: Spacing.lg,
  },
});
