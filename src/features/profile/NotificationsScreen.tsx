import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing } from '../../core/theme';
import { Button, Card, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { cancelWellbeingReminders, scheduleAdaptiveWellbeingReminders } from '../../core/utils/wellbeingNotifications';
import { careBuddyLine } from '../../core/utils/careBuddy';

const STORAGE_KEY = 'care_space_notification_preferences';
const REMINDER_TIMES = ['09:00:00', '14:00:00', '19:00:00'];
const QUIET_START_OPTIONS = ['20:00:00', '21:00:00', '22:00:00'];
const QUIET_END_OPTIONS = ['07:00:00', '08:00:00', '09:00:00'];

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

const formatTime = (value: string) => value.slice(0, 5);

export const NotificationsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [reminderTime, setReminderTime] = useState('19:00:00');
  const [quietStart, setQuietStart] = useState('21:00:00');
  const [quietEnd, setQuietEnd] = useState('08:00:00');
  const [careBuddyEnabled, setCareBuddyEnabled] = useState(true);
  const [engagementMode, setEngagementMode] = useState<'gentle' | 'balanced' | 'high'>('balanced');
  const [nudgeSnoozeUntil, setNudgeSnoozeUntil] = useState<string | null>(null);

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

      if (user?.id) {
        const { data } = await supabase
          .from('user_preferences')
          .select('wellbeing_reminders_enabled, wellbeing_reminder_time, quiet_hours_start, quiet_hours_end, care_buddy_enabled, engagement_mode, nudge_snooze_until')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          setPrefs((prev) => ({
            ...prev,
            wellbeingReminders: data.wellbeing_reminders_enabled ?? prev.wellbeingReminders,
          }));

          if (data.wellbeing_reminder_time) setReminderTime(data.wellbeing_reminder_time);
          if (data.quiet_hours_start) setQuietStart(data.quiet_hours_start);
          if (data.quiet_hours_end) setQuietEnd(data.quiet_hours_end);
          setCareBuddyEnabled(data.care_buddy_enabled ?? true);
          setEngagementMode((data.engagement_mode as 'gentle' | 'balanced' | 'high') || 'balanced');
          setNudgeSnoozeUntil(data.nudge_snooze_until || null);
        }
      }

      setLoaded(true);
    };

    loadPrefs();
  }, [user?.id]);

  const persistLocalPrefs = async (next: NotificationPrefs) => {
    setPrefs(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const persistReminderPrefs = async (
    next: Partial<{
      wellbeingReminders: boolean;
      reminderTime: string;
      quietStart: string;
      quietEnd: string;
      careBuddyEnabled: boolean;
      engagementMode: 'gentle' | 'balanced' | 'high';
      nudgeSnoozeUntil: string | null;
    }>,
  ) => {
    if (!user?.id) return;

    const mergedPrefs = {
      wellbeingReminders: next.wellbeingReminders ?? prefs.wellbeingReminders,
      reminderTime: next.reminderTime ?? reminderTime,
      quietStart: next.quietStart ?? quietStart,
      quietEnd: next.quietEnd ?? quietEnd,
      careBuddyEnabled: next.careBuddyEnabled ?? careBuddyEnabled,
      engagementMode: next.engagementMode ?? engagementMode,
      nudgeSnoozeUntil: next.nudgeSnoozeUntil ?? nudgeSnoozeUntil,
    };

    await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          wellbeing_reminders_enabled: mergedPrefs.wellbeingReminders,
          wellbeing_reminder_time: mergedPrefs.reminderTime,
          quiet_hours_start: mergedPrefs.quietStart,
          quiet_hours_end: mergedPrefs.quietEnd,
          care_buddy_enabled: mergedPrefs.careBuddyEnabled,
          engagement_mode: mergedPrefs.engagementMode,
          nudge_snooze_until: mergedPrefs.nudgeSnoozeUntil,
        },
        { onConflict: 'user_id' },
      );

    if (mergedPrefs.wellbeingReminders) {
      await scheduleAdaptiveWellbeingReminders(user.id);
    } else {
      await cancelWellbeingReminders(user.id);
    }
  };

  const applySnooze = async (hours: number) => {
    if (!user?.id) return;
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    setNudgeSnoozeUntil(until);
    await persistReminderPrefs({ nudgeSnoozeUntil: until });
    await cancelWellbeingReminders(user.id);
  };

  const clearSnooze = async () => {
    if (!user?.id) return;
    setNudgeSnoozeUntil(null);
    await persistReminderPrefs({ nudgeSnoozeUntil: null });
    await scheduleAdaptiveWellbeingReminders(user.id);
  };

  const update = async (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    await persistLocalPrefs(next);

    if (key === 'wellbeingReminders') {
      await persistReminderPrefs({ wellbeingReminders: value });
    }
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
          subtitle="Gentle check-in reminders for mood and CareScore"
          value={prefs.wellbeingReminders}
          onChange={(val) => update('wellbeingReminders', val)}
          disabled={!loaded}
          noBorder
        />
      </Card>

      {prefs.wellbeingReminders && (
        <Card style={styles.preferencesCard}>
          <Text style={styles.buddyHint}>{careBuddyLine('reassure')}</Text>
          <ToggleRow
            title="Care Buddy personality"
            subtitle="Friendly coaching copy in reminders and care prompts"
            value={careBuddyEnabled}
            onChange={async (val) => {
              setCareBuddyEnabled(val);
              await persistReminderPrefs({ careBuddyEnabled: val });
            }}
            noBorder
          />

          <Text style={styles.prefLabel}>Engagement mode</Text>
          <View style={styles.pillRow}>
            {[
              { label: 'Gentle', value: 'gentle' },
              { label: 'Balanced', value: 'balanced' },
              { label: 'High', value: 'high' },
            ].map((mode) => (
              <PillChip
                key={mode.value}
                label={mode.label}
                selected={engagementMode === mode.value}
                onPress={async () => {
                  setEngagementMode(mode.value as 'gentle' | 'balanced' | 'high');
                  await persistReminderPrefs({ engagementMode: mode.value as 'gentle' | 'balanced' | 'high' });
                }}
              />
            ))}
          </View>

          <Text style={styles.prefLabel}>Reminder time</Text>
          <View style={styles.pillRow}>
            {REMINDER_TIMES.map((item) => (
              <PillChip
                key={item}
                label={formatTime(item)}
                selected={reminderTime === item}
                onPress={async () => {
                  setReminderTime(item);
                  await persistReminderPrefs({ reminderTime: item });
                }}
              />
            ))}
          </View>

          <Text style={styles.prefLabel}>Quiet hours start</Text>
          <View style={styles.pillRow}>
            {QUIET_START_OPTIONS.map((item) => (
              <PillChip
                key={item}
                label={formatTime(item)}
                selected={quietStart === item}
                onPress={async () => {
                  setQuietStart(item);
                  await persistReminderPrefs({ quietStart: item });
                }}
              />
            ))}
          </View>

          <Text style={styles.prefLabel}>Quiet hours end</Text>
          <View style={styles.pillRow}>
            {QUIET_END_OPTIONS.map((item) => (
              <PillChip
                key={item}
                label={formatTime(item)}
                selected={quietEnd === item}
                onPress={async () => {
                  setQuietEnd(item);
                  await persistReminderPrefs({ quietEnd: item });
                }}
              />
            ))}
          </View>

          <Text style={styles.prefLabel}>Snooze wellbeing nudges</Text>
          <View style={styles.pillRow}>
            <PillChip label="Today" selected={false} onPress={() => applySnooze(12)} />
            <PillChip label="48h" selected={false} onPress={() => applySnooze(48)} />
            <PillChip label="This week" selected={false} onPress={() => applySnooze(168)} />
            {nudgeSnoozeUntil ? (
              <PillChip label="Resume now" selected={false} onPress={clearSnooze} />
            ) : null}
          </View>
          {nudgeSnoozeUntil ? (
            <Text style={styles.snoozeText}>
              Snoozed until {new Date(nudgeSnoozeUntil).toLocaleString()}.
            </Text>
          ) : null}
        </Card>
      )}
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
  preferencesCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  prefLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  buddyHint: {
    ...Typography.caption,
    color: Colors.accent.primary,
    marginBottom: Spacing.xs,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  snoozeText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: 2,
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
