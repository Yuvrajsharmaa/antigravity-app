import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Card, CoveMascot, CoveModal, ErrorState, LoadingState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { useCareJourney } from '../../core/hooks/useCareJourney';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { ActiveTherapistLock } from '../../core/models/types';
import { ensureConversation, fetchActiveTherapistLock } from '../../core/services/careFlowService';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import {
  getCarePersonalityState,
} from '../../core/utils/careBuddy';
import { formatMinutesShort, getJoinWindowState } from '../../core/utils/date';
import { getRoleModeContract } from '../../core/utils/roleAccess';
import { supabase } from '../../services/supabase';
import { MentalHealthDashboard } from './components/MentalHealthDashboard';
import { TherapistDashboardScreen } from '../therapist-dashboard/TherapistDashboardScreen';
import { WeeklyRhythmGrid } from './components/WeeklyRhythmGrid';

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { profile, isTherapistMode, user } = useAuth();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);
  const roleMode = getRoleModeContract(profile?.role, isTherapistMode);
  const effectiveTherapistMode = roleMode.canUseTherapistMode && isTherapistMode;
  const [nextSession, setNextSession] = useState<any | null>(null);
  const [lockedTherapist, setLockedTherapist] = useState<ActiveTherapistLock | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInSignal, setCheckInSignal] = useState(0);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const {
    journey,
    loading: journeyLoading,
    error: journeyError,
    refresh: refreshJourney,
  } = useCareJourney(effectiveTherapistMode ? null : user?.id || null);

  const personalityState = useMemo(
    () => (journey ? getCarePersonalityState({
      completedCount: journey.completedCount,
      totalCount: journey.totalCount,
      repairsAvailable: journey.rhythm.repairsAvailable,
    }) : null),
    [journey],
  );

  const weeklyCalendar = useMemo(() => {
    if (journey?.rhythm.weekMarkers?.length) {
      const journalMap = new Map(
        (journey.rhythm.journalWeekMarkers || []).map((marker) => [marker.dateKey, marker.completed] as const),
      );
      return journey.rhythm.weekMarkers.map((item) => ({
        dateKey: item.dateKey,
        label: item.dayLabel.slice(0, 1),
        completed: item.completed,
        isToday: item.isToday,
        journalCompleted: journalMap.get(item.dateKey) || false,
      }));
    }
    const today = new Date();
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - (6 - index));
      return {
        dateKey: `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`,
        label: date.toLocaleDateString([], { weekday: 'short' }).slice(0, 1),
        completed: false,
        isToday: index === 6,
        journalCompleted: false,
      };
    });
  }, [journey?.rhythm.journalWeekMarkers, journey?.rhythm.weekMarkers]);

  const weeklyCareCount = useMemo(() => weeklyCalendar.filter((day) => day.completed).length, [weeklyCalendar]);
  const weeklyJournalCount = useMemo(() => weeklyCalendar.filter((day) => day.journalCompleted).length, [weeklyCalendar]);

  const fetchNextSession = useCallback(async () => {
    if (!user?.id || effectiveTherapistMode) {
      setNextSession(null);
      return;
    }

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, therapist_id, status, scheduled_start_at, scheduled_end_at, session_type,
        therapists:therapist_id (
          headline,
          profiles (display_name, avatar_url)
        ),
        sessions (id, status, video_call_id)
      `)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .gte('scheduled_start_at', new Date().toISOString())
      .order('scheduled_start_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setNextSession(null);
      return;
    }

    const therapist = Array.isArray((data as any).therapists)
      ? (data as any).therapists[0]
      : (data as any).therapists;
    const therapistProfile = Array.isArray(therapist?.profiles)
      ? therapist?.profiles[0]
      : therapist?.profiles;
    const session = Array.isArray((data as any).sessions)
      ? (data as any).sessions[0]
      : (data as any).sessions;

    setNextSession({
      booking_id: data.id,
      participant_id: data.therapist_id,
      participant_name: therapistProfile?.display_name || 'Therapist',
      participant_avatar: therapistProfile?.avatar_url || null,
      participant_subtitle: therapist?.headline || 'Therapist',
      scheduled_start_at: data.scheduled_start_at,
      scheduled_end_at: data.scheduled_end_at,
      booking_status: data.status,
      session_type: data.session_type,
      id: session?.id || null,
      status: session?.status || 'scheduled',
      video_call_id: session?.video_call_id || null,
    });
  }, [effectiveTherapistMode, user?.id]);

  const fetchLockState = useCallback(async () => {
    if (!user?.id || effectiveTherapistMode) {
      setLockedTherapist(null);
      return;
    }
    try {
      const lock = await fetchActiveTherapistLock(user.id);
      setLockedTherapist(lock);
    } catch {
      setLockedTherapist(null);
    }
  }, [effectiveTherapistMode, user?.id]);

  useEffect(() => {
    Promise.all([fetchNextSession(), fetchLockState()]).catch(() => {
      // Best effort.
    });
  }, [fetchLockState, fetchNextSession]);

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([fetchNextSession(), refreshJourney(), fetchLockState()])
      .finally(() => setRefreshing(false));
  };

  const handleJourneyGoal = async (goalKey: 'check_in' | 'journal' | 'connect') => {
    await Haptics.selectionAsync();

    if (goalKey === 'check_in') {
      setCheckInSignal((prev) => prev + 1);
      return;
    }

    if (goalKey === 'journal') {
      navigation.navigate('Journal');
      return;
    }

    navigation.navigate('MessagesTab');
  };

  const handleNextJourneyAction = async () => {
    if (!journey) return;
    const nextGoal = journey.goals.find((goal) => !goal.completed)?.key;

    if (!nextGoal) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCompletionModal(true);
      return;
    }

    handleJourneyGoal(nextGoal);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const openLockedChat = async () => {
    if (!user?.id || !lockedTherapist?.therapist_id) return;
    try {
      const conversationId = await ensureConversation({
        userId: user.id,
        therapistId: lockedTherapist.therapist_id,
      });
      navigation.navigate('MessagesTab', {
        screen: 'Chat',
        params: {
          conversationId,
          therapistName: lockedTherapist.therapist_name,
          therapistAvatar: lockedTherapist.therapist_avatar,
          therapistId: lockedTherapist.therapist_id,
        },
      });
    } catch {
      // No-op: chat bootstrap can be retried from Messages list.
    }
  };

  const openMatchFlow = () => {
    const parentNav = navigation.getParent();
    if (parentNav) {
      parentNav.navigate('MatchTab', { screen: 'TherapistMatch' });
      return;
    }
    navigation.navigate('MatchTab', { screen: 'TherapistMatch' });
  };

  const openLockedTherapistProfile = async () => {
    if (!lockedTherapist?.therapist_id) return;
    try {
      const { data, error } = await supabase
        .from('therapists')
        .select(`
          *,
          profiles!inner (display_name, avatar_url, first_name)
        `)
        .eq('id', lockedTherapist.therapist_id)
        .maybeSingle();

      if (error || !data) return;
      const p = Array.isArray((data as any).profiles) ? (data as any).profiles[0] : (data as any).profiles;
      const therapist = {
        ...data,
        display_name: p?.display_name || p?.first_name || lockedTherapist.therapist_name,
        avatar_url: p?.avatar_url || lockedTherapist.therapist_avatar,
        first_name: p?.first_name || null,
      };

      navigation.navigate('MatchTab', {
        screen: 'TherapistProfile',
        params: { therapist },
      });
    } catch {
      // Best effort.
    }
  };

  if (effectiveTherapistMode) {
    return <TherapistDashboardScreen />;
  }

  const nextGoal = journey?.goals.find((goal) => !goal.completed) || null;
  const nextGoalHelper = nextGoal?.helper || 'Keep the momentum going.';
  const continueCtaLabel = nextGoal
    ? nextGoal.key === 'check_in'
      ? 'Start check-in'
      : nextGoal.key === 'journal'
        ? 'Open journal'
        : 'Open messages'
    : 'Review today';

  const nextSessionJoinWindow = nextSession?.scheduled_start_at && nextSession?.scheduled_end_at
    ? getJoinWindowState(nextSession.scheduled_start_at, nextSession.scheduled_end_at)
    : null;
  const nextSessionJoinable =
    Boolean(nextSession) &&
    nextSession.session_type === 'video' &&
    nextSession.booking_status === 'confirmed' &&
    Boolean(nextSession.id) &&
    Boolean(nextSessionJoinWindow?.isOpen);
  const nextSessionJoinHint = Boolean(nextSession) &&
    nextSession.session_type === 'video' &&
    nextSession.booking_status === 'confirmed' &&
    Boolean(nextSession.id) &&
    !nextSessionJoinable &&
    nextSessionJoinWindow?.minutesUntilOpen
    ? `Join opens in ${formatMinutesShort(nextSessionJoinWindow.minutesUntilOpen)}`
    : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.userName}>{profile?.first_name || 'there'}</Text>
        </View>
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => navigation.navigate('HomeNotifications')}
          accessibilityRole="button"
          accessibilityLabel="Open notifications"
        >
          <Ionicons name="notifications-outline" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabSafeBottomPadding }]}
        refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />
        }
      >
          {journeyLoading ? (
            <View style={styles.journeyLoadingWrap}>
              <LoadingState message="Loading your next action..." />
            </View>
          ) : journeyError ? (
            <View style={styles.journeyErrorWrap}>
              <ErrorState message={journeyError} onRetry={refreshJourney} />
            </View>
          ) : personalityState && journey ? (
            <Card style={styles.nextBestCard}>
              <View style={styles.nextBestTopRow}>
                <CoveMascot variant="default" size={40} />
                <View style={styles.nextBestTextWrap}>
                  <Text style={styles.nextBestTitle}>Next best action</Text>
                  <Text style={styles.nextBestSubtitle}>
                    {journey.nextActionLabel}
                  </Text>
                </View>
                {journey ? (
                  <View style={styles.rhythmPill}>
                    <Text style={styles.rhythmPillText}>
                      {journey.rhythm.currentStreak} day{journey.rhythm.currentStreak === 1 ? '' : 's'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.nextBestReason}>{nextGoalHelper}</Text>
              <View style={styles.weeklyProgressMeta}>
                <Text style={styles.weeklyProgressText}>
                  {`This week: Care ${weeklyCareCount}/7 · Journal ${weeklyJournalCount}/7`}
                </Text>
              </View>
              <WeeklyRhythmGrid
                days={weeklyCalendar.map((day) => ({
                  label: day.label,
                  careDone: day.completed,
                  journalDone: day.journalCompleted,
                  isToday: day.isToday,
                }))}
              />
              <View style={styles.nextBestActions}>
                <Button
                  title={continueCtaLabel}
                  onPress={handleNextJourneyAction}
                  variant="primary"
                  size="md"
                />
              </View>
            </Card>
          ) : null}

          <Card style={styles.lockedTherapistCard}>
            <View style={styles.lockedTopRow}>
              <View style={styles.lockedIconWrap}>
                <Ionicons name={lockedTherapist ? 'checkmark-circle-outline' : 'person-add-outline'} size={18} color={Colors.accent.primary} />
              </View>
              <View style={styles.lockedTextWrap}>
                <Text style={styles.lockedTitle}>Your therapist</Text>
                <Text style={styles.lockedSubtitle}>
                  {lockedTherapist ? lockedTherapist.therapist_name : 'No therapist locked yet'}
                </Text>
              </View>
            </View>
            <View style={styles.lockedActions}>
              {lockedTherapist ? (
                <>
                  <Button
                    title="Message"
                    onPress={openLockedChat}
                    variant="primary"
                    size="sm"
                    fullWidth={false}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Book"
                    onPress={openLockedTherapistProfile}
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Manage"
                    onPress={() => navigation.navigate('ProfileTab')}
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    style={{ flex: 1 }}
                  />
                </>
              ) : (
                <Button
                  title="Find therapist"
                  onPress={openMatchFlow}
                  variant="primary"
                  size="md"
                />
              )}
            </View>
          </Card>

          <MentalHealthDashboard openSignal={checkInSignal} />

          {nextSession ? (
            <Card style={styles.nextSessionCard}>
              <View style={styles.nextSessionHeader}>
                <View style={styles.nextSessionIcon}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.accent.primary} />
                </View>
                <View style={styles.nextSessionText}>
                  <Text style={styles.nextSessionTitle}>Upcoming session</Text>
                  <Text style={styles.nextSessionMeta}>
                    {nextSession.participant_name}
                    {' · '}
                    {new Date(nextSession.scheduled_start_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    {' · '}
                    {new Date(nextSession.scheduled_start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>

              <View style={styles.nextSessionActions}>
                <Button
                  title="Session prep"
                  onPress={() => navigation.navigate('SessionPrep', { session: nextSession })}
                  variant={nextSessionJoinable ? 'secondary' : 'primary'}
                  size="md"
                  fullWidth={false}
                  style={{ flex: 1 }}
                />
                {nextSessionJoinable && (
                  <Button
                    title="Join"
                    onPress={() => navigation.navigate('VideoCall', { session: nextSession })}
                    variant="primary"
                    size="md"
                    fullWidth={false}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
              {nextSessionJoinHint ? (
                <Text style={styles.nextSessionHint}>{nextSessionJoinHint}</Text>
              ) : null}
            </Card>
          ) : null}

          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => navigation.navigate('MessagesTab')}
              accessibilityRole="button"
              accessibilityLabel="Open messages"
            >
              <View style={styles.actionIconContainer}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={Colors.accent.primary} />
              </View>
              <Text style={styles.quickActionTitle}>Messages</Text>
              <Text style={styles.quickActionDesc}>Latest therapist chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => navigation.navigate('Journal')}
              accessibilityRole="button"
              accessibilityLabel="Open journal"
            >
              <View style={[styles.actionIconContainer, { backgroundColor: Colors.status.warningSoft }]}>
                <Ionicons name="journal-outline" size={22} color={Colors.status.warning} />
              </View>
              <Text style={styles.quickActionTitle}>Journal</Text>
              <Text style={styles.quickActionDesc}>Write today clearly</Text>
            </TouchableOpacity>
          </View>
      </ScrollView>

      <CoveModal
        visible={showCompletionModal}
        variant="success"
        title="Today is complete"
        message="You’ve finished today’s key actions. Come back tomorrow."
        primaryAction={{
          label: 'Done',
          onPress: () => setShowCompletionModal(false),
        }}
        onDismiss={() => setShowCompletionModal(false)}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  greeting: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  userName: {
    ...Typography.title1,
    color: Colors.text.primary,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: Colors.ui.glass,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  scrollContent: {
    paddingBottom: 108,
  },
  nextBestCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  nextBestTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nextBestTextWrap: {
    flex: 1,
  },
  nextBestTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  nextBestSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  nextBestReason: {
    ...Typography.body,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  nextBestBtn: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent.primary,
    borderWidth: 1,
    borderColor: Colors.accent.dark,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTherapistCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  lockedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockedIconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  lockedSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  lockedTextWrap: {
    flex: 1,
  },
  lockedActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  lockedActionBtn: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.bg.secondary,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedActionBtnPrimary: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.primary,
  },
  lockedActionBtnFull: {
    flex: 0,
    width: '100%',
  },
  lockedActionText: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  lockedActionTextPrimary: {
    ...Typography.captionEmphasis,
    color: Colors.text.inverse,
  },
  rhythmPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 4,
  },
  rhythmPillText: {
    ...Typography.micro,
    letterSpacing: 0.2,
    color: Colors.text.secondary,
  },
  weeklyProgressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weeklyProgressText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  nextBestActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  nextBestBtnText: {
    ...Typography.captionEmphasis,
    color: Colors.text.inverse,
  },
  nextBestBtnSecondary: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBestBtnSecondaryText: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  journeyLoadingWrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  journeyErrorWrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  journeyCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  journeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  journeyIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyHeaderText: {
    flex: 1,
    gap: 1,
  },
  journeyTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  journeySubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  rhythmFlame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bg.tertiary,
    borderColor: Colors.stroke.subtle,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 5,
  },
  rhythmFlameEmoji: {
    fontSize: 13,
  },
  rhythmFlameValue: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  journeySupportText: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  rhythmWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  rhythmDayWrap: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  rhythmDayDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rhythmDayDotDone: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  rhythmDayDotToday: {
    borderColor: Colors.accent.dark,
    borderWidth: 2,
  },
  rhythmDayLabel: {
    ...Typography.micro,
    color: Colors.text.tertiary,
    letterSpacing: 0,
  },
  rhythmMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rhythmMetaText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  rhythmRepairText: {
    ...Typography.caption,
    color: Colors.accent.primary,
  },
  journeyGoalRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  journeyGoalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.tertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
  },
  journeyGoalChipDone: {
    backgroundColor: Colors.status.successSoft,
    borderColor: Colors.status.success + '50',
  },
  journeyGoalText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  journeyGoalTextDone: {
    color: Colors.status.success,
  },
  journeyActionBtn: {
    marginTop: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  journeyActionText: {
    ...Typography.bodySemibold,
    color: Colors.text.inverse,
  },
  nextSessionCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  nextSessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nextSessionIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextSessionText: {
    flex: 1,
  },
  nextSessionTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  nextSessionMeta: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  nextSessionActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  nextSessionHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: Spacing.xs,
  },
  nextSessionActionBtn: {
    flex: 1,
  },
  quickActionsRow: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.xl,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  quickActionCard: {
    flex: 1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
    padding: Spacing.md,
  },
  quickActionTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    marginTop: Spacing.sm,
  },
  quickActionDesc: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.tertiary,
  },
  actionBtnPrimary: {
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent.primary,
  },
  actionBtnText: {
    ...Typography.captionEmphasis,
    color: Colors.text.inverse,
  },
  actionBtnOutline: {
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.bg.secondary,
  },
  actionBtnTextOutline: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
});
