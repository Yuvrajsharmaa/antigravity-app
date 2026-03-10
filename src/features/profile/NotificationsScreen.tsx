import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button, Card } from '../../core/components';

const STORAGE_KEY = 'care_space_notification_preferences';

interface NotificationPrefs {
  sessionReminders: boolean;
  messageAlerts: boolean;
  wellbeingReminders: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  sessionReminders: true,
  messageAlerts: true,
  wellbeingReminders: true,
};

export const NotificationsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadPrefs = async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as NotificationPrefs) });
        } catch {
          setPrefs(DEFAULT_PREFS);
        }
      }
      setLoaded(true);
    };

    loadPrefs();
  }, []);

  const update = async (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 56 }} />
      </View>

      <Card style={styles.card}>
        <ToggleRow
          title="Session reminders"
          subtitle="Get reminded before upcoming sessions"
          value={prefs.sessionReminders}
          onChange={(val) => update('sessionReminders', val)}
          disabled={!loaded}
        />

        <ToggleRow
          title="Message alerts"
          subtitle="Get notified about new messages"
          value={prefs.messageAlerts}
          onChange={(val) => update('messageAlerts', val)}
          disabled={!loaded}
        />

        <ToggleRow
          title="Wellbeing nudges"
          subtitle="Daily reminders for check-in and journal"
          value={prefs.wellbeingReminders}
          onChange={(val) => update('wellbeingReminders', val)}
          disabled={!loaded}
          noBorder
        />
      </Card>
    </SafeAreaView>
  );
};

const ToggleRow: React.FC<{
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  noBorder?: boolean;
}> = ({ title, subtitle, value, onChange, disabled = false, noBorder = false }) => (
  <View style={[styles.row, !noBorder && styles.rowBorder]}>
    <View style={styles.rowTextWrap}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowSubtitle}>{subtitle}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: Colors.stroke.medium, true: Colors.accent.primary }}
    />
  </View>
);

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
  card: {
    marginHorizontal: Spacing.xl,
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.ui.divider,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  rowSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
});
