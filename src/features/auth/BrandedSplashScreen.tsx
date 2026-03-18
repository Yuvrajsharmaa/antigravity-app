import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '../../core/theme';
import { CoveMascot } from '../../core/components';

export const BrandedSplashScreen: React.FC = () => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.content}>
      <CoveMascot variant="welcome" size={152} animate style={styles.logoAnim} />
      <Text style={styles.name}>Care Space</Text>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  logoAnim: {
    width: 152,
    height: 152,
  },
  name: {
    ...Typography.title1,
    color: Colors.text.primary,
    letterSpacing: 0.5,
  },
});
