import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '../../core/theme';
import { Button, Card } from '../../core/components';

const CONTENT: Record<string, { title: string; body: string }> = {
  privacy_safety: {
    title: 'Privacy & Safety',
    body:
      'Your messages and check-ins are intended to stay within Care Space. Avoid sharing sensitive personal identifiers in chat. If you feel unsafe or at risk, contact local emergency services immediately.',
  },
  help_support: {
    title: 'Help & Support',
    body:
      'For product help, email support@carespace.app with screenshots and your account email. For therapy-related concerns, contact your assigned therapist through in-app messages.',
  },
  terms: {
    title: 'Terms of Service',
    body:
      'Care Space provides a platform to connect users with therapists. It does not provide emergency medical services. By using the app, you agree to responsible usage and professional communication guidelines.',
  },
  privacy_policy: {
    title: 'Privacy Policy',
    body:
      'Care Space stores profile data, booking data, and check-in metrics to provide therapy workflows. Access is restricted by authentication and role-based policies. Do not use this app for emergency care.',
  },
  about: {
    title: 'About Care Space',
    body:
      'Care Space is a dual-role mental wellness platform for clients and therapists. It combines therapist discovery, booking, sessions, messaging, and mood tracking into one product experience.',
  },
};

export const InfoScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const topic = route?.params?.topic || 'about';
  const content = CONTENT[topic] || CONTENT.about;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{content.title}</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.infoCard}>
          <Text style={styles.body}>{content.body}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
  },
  infoCard: {
    borderRadius: 24,
  },
  body: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 24,
  },
});
