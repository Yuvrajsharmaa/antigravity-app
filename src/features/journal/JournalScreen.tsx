import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Card, Button, EmptyState, LoadingState, BackendSetupCard, ErrorState, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useClientMetricsReadiness } from '../../core/hooks/useClientMetricsReadiness';
import { careBuddyLine } from '../../core/utils/careBuddy';

interface JournalEntry {
  id: string;
  created_at: string;
  mood: string;
  stress_level: number;
  sleep_hours: number;
  care_score_snapshot: number;
  journal_entry: string | null;
}

export const JournalScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { ready, requiresSetup, issue, refresh } = useClientMetricsReadiness();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [todayMetricId, setTodayMetricId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchJournal = useCallback(async () => {
    if (!user) return;

    if (!ready) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayData, error: todayError } = await supabase
      .from('client_metrics')
      .select('id, journal_entry')
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (todayError) {
      setLoadError(todayError.message || 'Unable to load today\'s check-in.');
      setLoading(false);
      return;
    }

    setTodayMetricId(todayData?.id || null);
    setDraft(todayData?.journal_entry || '');

    const { data: logs, error: logsError } = await supabase
      .from('client_metrics')
      .select('id, created_at, mood, stress_level, sleep_hours, care_score_snapshot, journal_entry')
      .eq('user_id', user.id)
      .not('journal_entry', 'is', null)
      .order('created_at', { ascending: false });

    if (logsError) {
      setLoadError(logsError.message || 'Unable to load journal entries.');
      setLoading(false);
      return;
    }

    setEntries((logs || []) as JournalEntry[]);
    setLoading(false);
  }, [ready, user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      fetchJournal();
    }, [fetchJournal, refresh])
  );

  useEffect(() => {
    if (ready) {
      fetchJournal();
    }
  }, [fetchJournal, ready]);

  const saveJournal = async () => {
    if (!ready) {
      Alert.alert('Setup required', issue || 'Backend setup is incomplete.');
      return;
    }

    if (!todayMetricId) {
      Alert.alert(
        'Complete daily check-in first',
        'To save today\'s journal, complete today\'s Daily Check-in from Home.'
      );
      return;
    }

    if (!draft.trim()) {
      Alert.alert('Journal is empty', 'Please write something before saving.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('client_metrics')
      .update({ journal_entry: draft.trim() })
      .eq('id', todayMetricId);

    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message || 'Unable to save journal entry.');
      return;
    }

    Alert.alert('Saved', 'Your journal has been saved to today\'s check-in.');
    fetchJournal();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Journal</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {requiresSetup ? (
              <BackendSetupCard
                title="Journal Setup Required"
                message={issue || undefined}
                onRetry={refresh}
              />
            ) : (
              <Card style={styles.composeCard}>
                <Text style={styles.composeTitle}>Today&apos;s reflection</Text>
                <Text style={styles.composeSubtitle}>
                  This saves into today&apos;s check-in. Complete check-in first if this is disabled.
                </Text>
                <Text style={styles.buddyHint}>{careBuddyLine('reflect')}</Text>
                <View style={styles.promptRow}>
                  {[
                    'What felt heavy today?',
                    'What helped even a little?',
                    'One next step for tomorrow',
                  ].map((prompt) => (
                    <PillChip
                      key={prompt}
                      label={prompt}
                      selected={false}
                      onPress={() => setDraft((prev) => (prev ? `${prev}\n\n${prompt}\n` : `${prompt}\n`))}
                    />
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Write about today..."
                  placeholderTextColor={Colors.text.tertiary}
                  multiline
                  value={draft}
                  onChangeText={setDraft}
                />
                <Button
                  title={saving ? 'Saving...' : 'Save Journal'}
                  onPress={saveJournal}
                  loading={saving}
                  disabled={!ready || !todayMetricId}
                />
                {!todayMetricId && (
                  <Text style={styles.helperText}>No check-in found for today yet.</Text>
                )}
              </Card>
            )}

            <Text style={styles.sectionTitle}>Past journal entries</Text>
          </>
        }
        ListEmptyComponent={
          loadError ? (
            <ErrorState message={loadError} onRetry={fetchJournal} />
          ) : loading ? (
            <LoadingState message="Loading journal..." />
          ) : (
            <EmptyState
              icon="journal-outline"
              title="No journal entries yet"
              message="Your saved reflections will show here after you add them in daily check-ins."
            />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryDate}>{formatDate(item.created_at)}</Text>
              <View style={styles.scorePill}>
                <Text style={styles.scoreText}>CareScore {item.care_score_snapshot}</Text>
              </View>
            </View>
            <Text style={styles.entryBody}>{item.journal_entry}</Text>
            <Text style={styles.entryMeta}>
              Mood: {item.mood} · Stress: {item.stress_level} · Sleep: {item.sleep_hours}h
            </Text>
          </Card>
        )}
      />
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
    paddingBottom: Spacing.sm,
  },
  backBtn: {
    width: 32,
  },
  title: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
    gap: Spacing.md,
  },
  composeCard: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  composeTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  composeSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  buddyHint: {
    ...Typography.caption,
    color: Colors.accent.primary,
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  input: {
    minHeight: 120,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Colors.text.primary,
    textAlignVertical: 'top',
  },
  helperText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  sectionTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
    marginTop: Spacing.xs,
  },
  entryCard: {
    gap: Spacing.xs,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDate: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  scorePill: {
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  scoreText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  entryBody: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  entryMeta: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
