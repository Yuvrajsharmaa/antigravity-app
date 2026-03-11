import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';

export const BrandedSplashScreen: React.FC = () => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.content}>
      <View style={styles.logoWrap}>
        <Ionicons name="leaf-outline" size={40} color={Colors.accent.primary} />
      </View>
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
  logoWrap: {
    width: 92,
    height: 92,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    ...Typography.title1,
    color: Colors.text.primary,
    letterSpacing: 0.3,
  },
});

