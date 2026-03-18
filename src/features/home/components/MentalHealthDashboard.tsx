import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Modal, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../../core/theme';
import { Card, BackendSetupCard } from '../../../core/components';
import { useAuth } from '../../../core/context/AuthContext';
import { supabase } from '../../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { DailyCheckInModal } from './DailyCheckInModal';
import { useClientMetricsReadiness } from '../../../core/hooks/useClientMetricsReadiness';
import {
  carePatternExplanation,
  calculateCareScoreBreakdown,
  getCarePatternState,
} from '../../../core/utils/careScore';
import { localDateKey } from '../../../core/utils/date';
import { getMoodOption, normalizeMoodLabel } from '../../../core/utils/mood';

export const MentalHealthDashboard: React.FC<{ openSignal?: number }> = ({ openSignal = 0 }) => {
  const { user } = useAuth();
  const { ready, checking, requiresSetup, issue, refresh } = useClientMetricsReadiness();

  const [latestScoreSnapshot, setLatestScoreSnapshot] = useState<number | null>(null);
  const [previousScoreSnapshot, setPreviousScoreSnapshot] = useState<number | null>(null);
  const [hasCheckInToday, setHasCheckInToday] = useState(false);
  const [mood, setMood] = useState<string | null>(null);
  const [sleep, setSleep] = useState<number>(0);
  const [stress, setStress] = useState<number>(0);
  const [energy, setEnergy] = useState<number>(3);
  const [connectedness, setConnectedness] = useState<number>(3);
  const [coping, setCoping] = useState<number>(3);
  const [hasJournaled, setHasJournaled] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showScoreSheet, setShowScoreSheet] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchTodayMetrics = useCallback(async () => {
    if (!user || !ready) return;

    const localMidnight = new Date();
    localMidnight.setHours(0, 0, 0, 0);
    const todayKey = localDateKey();

    const isMissingColumnError = (error: any, columnName: string) => {
      const code = `${error?.code || ''}`.toUpperCase();
      const message = `${error?.message || ''}`.toLowerCase();
      return code === '42703' || message.includes(columnName.toLowerCase());
    };

    let metric: any = null;
    const modernQuery = await supabase
      .from('client_metrics')
      .select('id,care_score_snapshot,mood,sleep_hours,stress_level,energy_level,connectedness_level,coping_helpfulness,journal_entry,created_at,check_in_date')
      .eq('user_id', user.id)
      .eq('check_in_date', todayKey)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (modernQuery.error) {
      const useLegacyPath =
        isMissingColumnError(modernQuery.error, 'check_in_date')
        || isMissingColumnError(modernQuery.error, 'energy_level')
        || isMissingColumnError(modernQuery.error, 'connectedness_level')
        || isMissingColumnError(modernQuery.error, 'coping_helpfulness')
        || isMissingColumnError(modernQuery.error, 'updated_at');

      if (!useLegacyPath) {
        setLoadError(modernQuery.error.message || 'Could not load today\'s check-in.');
        return;
      }

      const dayStart = `${todayKey}T00:00:00.000Z`;
      const dayEndDate = new Date(dayStart);
      dayEndDate.setUTCDate(dayEndDate.getUTCDate() + 1);
      const dayEnd = dayEndDate.toISOString();

      const legacyQuery = await supabase
        .from('client_metrics')
        .select('id,care_score_snapshot,mood,sleep_hours,stress_level,journal_entry,created_at')
        .eq('user_id', user.id)
        .gte('created_at', dayStart)
        .lt('created_at', dayEnd)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (legacyQuery.error) {
        const careScoreMissing = isMissingColumnError(legacyQuery.error, 'care_score_snapshot');
        if (!careScoreMissing) {
          setLoadError(legacyQuery.error.message || 'Could not load today\'s check-in.');
          return;
        }

        const freudFallback = await supabase
          .from('client_metrics')
          .select('id,freud_score_snapshot,mood,sleep_hours,stress_level,journal_entry,created_at')
          .eq('user_id', user.id)
          .gte('created_at', dayStart)
          .lt('created_at', dayEnd)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (freudFallback.error) {
          setLoadError(freudFallback.error.message || 'Could not load today\'s check-in.');
          return;
        }

        metric = freudFallback.data
          ? { ...freudFallback.data, care_score_snapshot: (freudFallback.data as any).freud_score_snapshot }
          : null;
      } else {
        metric = legacyQuery.data;
      }
    } else {
      metric = modernQuery.data;
    }

    setLoadError(null);

    if (metric) {
      setLatestScoreSnapshot(metric.care_score_snapshot);
      setHasCheckInToday(true);
      setMood(metric.mood);
      setSleep(metric.sleep_hours);
      setStress(metric.stress_level);
      setEnergy(metric.energy_level ?? 3);
      setConnectedness(metric.connectedness_level ?? 3);
      setCoping(metric.coping_helpfulness ?? 3);
      const { data: journalRows } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', localMidnight.toISOString())
        .limit(1);

      const hasJournalToday = Boolean(journalRows?.length) || Boolean(metric.journal_entry);
      setHasJournaled(hasJournalToday);

      const previousRowsQuery = await supabase
        .from('client_metrics')
        .select('care_score_snapshot')
        .eq('user_id', user.id)
        .neq('check_in_date', todayKey)
        .order('check_in_date', { ascending: false })
        .limit(1);
      if (!previousRowsQuery.error) {
        setPreviousScoreSnapshot(previousRowsQuery.data?.[0]?.care_score_snapshot ?? null);
      } else {
        const previousLegacy = await supabase
          .from('client_metrics')
          .select('care_score_snapshot,created_at')
          .eq('user_id', user.id)
          .lt('created_at', `${todayKey}T00:00:00.000Z`)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!previousLegacy.error) {
          setPreviousScoreSnapshot(previousLegacy.data?.[0]?.care_score_snapshot ?? null);
        } else if (isMissingColumnError(previousLegacy.error, 'care_score_snapshot')) {
          const previousFreud = await supabase
            .from('client_metrics')
            .select('freud_score_snapshot,created_at')
            .eq('user_id', user.id)
            .lt('created_at', `${todayKey}T00:00:00.000Z`)
            .order('created_at', { ascending: false })
            .limit(1);
          setPreviousScoreSnapshot((previousFreud.data?.[0] as any)?.freud_score_snapshot ?? null);
        } else {
          setPreviousScoreSnapshot(null);
        }
      }
      return;
    }

    setLatestScoreSnapshot(null);
    setPreviousScoreSnapshot(null);
    setHasCheckInToday(false);
    setMood(null);
    setSleep(0);
    setStress(0);
    setEnergy(3);
    setConnectedness(3);
    setCoping(3);
    setHasJournaled(false);
  }, [ready, user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (ready) {
      fetchTodayMetrics();
    }
  }, [fetchTodayMetrics, ready]);

  useEffect(() => {
    if (openSignal > 0) {
      setShowModal(true);
    }
  }, [openSignal]);

  if (requiresSetup) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.sectionTitle}>Mental Health Metrics</Text>
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text.secondary} />
        </View>
        <BackendSetupCard
          title="Mood Tracking Setup Required"
          message={issue || undefined}
          onRetry={refresh}
        />
      </View>
    );
  }

  const dashboardIssue = loadError || (!ready && !checking ? issue : null);
  const scoreBreakdown = mood && sleep > 0
    ? calculateCareScoreBreakdown({
      mood,
      stressLevel: stress || 3,
      sleepHours: sleep,
      energyLevel: energy || 3,
      connectednessLevel: connectedness || 3,
      copingHelpfulness: coping || 3,
    })
    : null;
  const patternState = scoreBreakdown
    ? getCarePatternState(scoreBreakdown.score, previousScoreSnapshot)
    : null;
  const hasLoggedToday = hasCheckInToday && Boolean(latestScoreSnapshot !== null || mood);
  const moodOption = getMoodOption(mood);
  const moodDisplayText = useMemo(() => {
    const raw = moodOption?.label || normalizeMoodLabel(mood) || 'Not logged';
    if (raw === 'Not logged') return 'Log now';
    const compact = raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = compact.split(' ');
    return tokens
      .filter((token, index) => index === 0 || token.toLowerCase() !== tokens[index - 1].toLowerCase())
      .join(' ');
  }, [mood, moodOption?.label]);
  const moodBadge = moodOption?.emoji || '🙂';

  return (
    <View style={styles.container}>
      <DailyCheckInModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => fetchTodayMetrics()}
        backendReady={ready}
        setupIssue={requiresSetup ? issue : null}
        onRetrySetup={refresh}
      />

      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Mental Health Metrics</Text>
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text.secondary} />
      </View>

      {dashboardIssue ? (
        <Card style={styles.issueCard}>
          <Text style={styles.issueTitle}>We couldn&apos;t load today&apos;s metrics</Text>
          <Text style={styles.issueText}>{dashboardIssue}</Text>
          <TouchableOpacity style={styles.issueRetry} onPress={fetchTodayMetrics}>
            <Text style={styles.issueRetryText}>Retry</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        <View style={styles.metricsRow}>
          <TouchableOpacity
            style={[styles.metricCard, styles.careCard]}
            activeOpacity={0.8}
            onPress={() => setShowScoreSheet(true)}
          >
            <View style={styles.metricCardHeader}>
              <Ionicons name="heart-half-outline" size={16} color={Colors.accent.dark} />
              <Text style={[styles.metricCardTitle, styles.metricCardTitleCare]}>CareScore</Text>
            </View>
            <View style={styles.scoreContainer}>
              <View style={styles.patternPill}>
                <Text style={styles.patternPillText}>
                  {patternState ? patternState.label.replace('-', ' ') : 'Pending'}
                </Text>
              </View>
            </View>
            <Text style={[styles.scoreLabel, styles.scoreLabelCare]}>
              {patternState
                ? `Current direction: ${patternState.trend === 'needs-support' ? 'needs support' : patternState.trend}`
                : 'Log today'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.metricCard, styles.moodCard]}
            activeOpacity={0.8}
            onPress={() => setShowModal(true)}
          >
            <View style={styles.metricCardHeader}>
              <Ionicons name="happy-outline" size={16} color={Colors.text.secondary} />
              <Text style={[styles.metricCardTitle, styles.metricCardTitleMood]}>Mood</Text>
            </View>
            <View style={styles.moodIconContainer}>
              <Text style={styles.moodEmoji}>{moodBadge}</Text>
            </View>
            <Text
              style={[styles.scoreLabel, styles.scoreLabelMood]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {moodDisplayText}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!hasLoggedToday && (
        <TouchableOpacity style={styles.logPromptCard} onPress={() => setShowModal(true)}>
          <View style={styles.logPromptIcon}>
            <Ionicons name="add-circle" size={24} color={Colors.accent.primary} />
          </View>
          <View style={styles.logPromptTextContainer}>
            <Text style={styles.logPromptTitle}>Daily check-in</Text>
            <Text style={styles.logPromptDesc}>Log your mood and mental state for today.</Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Mindful Tracker</Text>
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text.secondary} />
      </View>

      <Card style={styles.trackerCard}>
        <TrackerRow
          icon="time-outline"
          iconColor={Colors.status.success}
          iconBg={Colors.status.successSoft}
          title="Sleep Quality"
          subtitle="Hours of sleep"
          rightElement={<Text style={styles.trackerScoreText}>{sleep > 0 ? `${sleep}h` : '--'}</Text>}
        />

        <TrackerRow
          icon="journal-outline"
          iconColor={Colors.status.warning}
          iconBg={Colors.status.warningSoft}
          title="Daily Journal"
          subtitle="Thoughts and reflections"
          rightElement={
            <Ionicons
              name={hasJournaled ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={hasJournaled ? Colors.status.success : Colors.stroke.medium}
            />
          }
        />

        <TrackerRow
          icon="water-outline"
          iconColor={Colors.status.warning}
          iconBg={Colors.status.warningSoft}
          title="Stress Level"
          subtitle={`Level ${stress > 0 ? stress : '-'}`}
          noBorder
        />
      </Card>

      <Modal visible={showScoreSheet} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <View style={styles.scoreSheet}>
            <View style={styles.scoreSheetHeader}>
              <Text style={styles.scoreSheetTitle}>{carePatternExplanation.title}</Text>
              <TouchableOpacity onPress={() => setShowScoreSheet(false)} accessibilityRole="button" accessibilityLabel="Close score explanation">
                <Ionicons name="close" size={22} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scoreSheetContent} showsVerticalScrollIndicator={false}>
              {patternState ? (
                <>
                  <Text style={styles.scoreSheetLead}>
                    {carePatternExplanation.description}
                  </Text>
                  {carePatternExplanation.factors.map((factor) => (
                    <Card key={factor.id} style={styles.factorCard}>
                      <Text style={styles.factorTitle}>{factor.title}</Text>
                      <Text style={styles.factorSummary}>{factor.summary}</Text>
                    </Card>
                  ))}

                  <Card style={styles.rangeCard}>
                    <Text style={styles.rangeLabel}>Current pattern</Text>
                    <Text style={styles.rangeTitle}>{patternState.label.replace('-', ' ')}</Text>
                    <Text style={styles.rangeDescription}>{patternState.guidance}</Text>
                  </Card>
                </>
              ) : (
                <Text style={styles.scoreSheetLead}>
                  Complete today&apos;s check-in to view your CareScore guidance.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const TrackerRow = ({ icon, iconColor, iconBg, title, subtitle, rightElement, noBorder = false }: any) => (
  <TouchableOpacity style={[styles.trackerRow, !noBorder && styles.trackerBorder]}>
    <View style={[styles.trackerIconBox, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={20} color={iconColor} />
    </View>
    <View style={styles.trackerContent}>
      <Text style={styles.trackerTitle}>{title}</Text>
      <Text style={styles.trackerSubtitle}>{subtitle}</Text>
    </View>
    {rightElement && <View>{rightElement}</View>}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  issueCard: {
    backgroundColor: Colors.status.warningSoft,
    borderColor: Colors.status.warning + '20',
    gap: Spacing.xs,
  },
  issueTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  issueText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  issueRetry: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  issueRetryText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  metricCard: {
    flex: 1,
    borderRadius: Radius.xxl,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 154,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  careCard: {
    backgroundColor: Colors.ui.glass,
  },
  moodCard: {
    backgroundColor: Colors.ui.glass,
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    alignSelf: 'flex-start',
  },
  metricCardTitle: {
    ...Typography.captionEmphasis,
  },
  metricCardTitleCare: {
    color: Colors.accent.dark,
  },
  metricCardTitleMood: {
    color: Colors.text.secondary,
  },
  moodEmoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  scoreContainer: {
    minHeight: 66,
    minWidth: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patternPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.ui.glass,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  patternPillText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.dark,
    textTransform: 'capitalize',
  },
  moodIconContainer: {
    width: '100%',
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreLabel: {
    ...Typography.bodySemibold,
  },
  scoreLabelCare: {
    color: Colors.accent.dark,
  },
  scoreLabelMood: {
    color: Colors.text.primary,
    width: '100%',
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 20,
  },
  trackerCard: {
    padding: Spacing.md,
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.xl,
    ...Shadow.card,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.36)',
    justifyContent: 'flex-end',
  },
  scoreSheet: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    maxHeight: '78%',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  scoreSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xs,
  },
  scoreSheetTitle: {
    ...Typography.title2,
    color: Colors.text.primary,
  },
  scoreSheetContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  scoreSheetLead: {
    ...Typography.body,
    color: Colors.text.secondary,
    lineHeight: 21,
  },
  factorCard: {
    borderRadius: Radius.xl,
    gap: Spacing.xxs,
  },
  factorTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  factorSummary: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  rangeCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    gap: Spacing.xs,
  },
  rangeLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rangeTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    textTransform: 'capitalize',
  },
  rangeDescription: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 19,
  },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  trackerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.ui.divider,
  },
  trackerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackerContent: {
    flex: 1,
  },
  trackerTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  trackerSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  trackerScoreText: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  logPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ui.glass,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    gap: Spacing.sm,
  },
  logPromptIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Colors.accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logPromptTextContainer: {
    flex: 1,
  },
  logPromptTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  logPromptDesc: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
