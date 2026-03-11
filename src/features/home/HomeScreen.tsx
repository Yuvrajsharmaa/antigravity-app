import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { Card, ErrorState, LoadingState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { useCareJourney } from '../../core/hooks/useCareJourney';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { careBuddyGreeting, careBuddyLine, journeyStatusCopy } from '../../core/utils/careBuddy';
import { getRoleModeContract } from '../../core/utils/roleAccess';
import { supabase } from '../../services/supabase';
import { MentalHealthDashboard } from './components/MentalHealthDashboard';
import { TherapistDashboardScreen } from '../therapist-dashboard/TherapistDashboardScreen';

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { profile, isTherapistMode, user } = useAuth();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);
  const roleMode = getRoleModeContract(profile?.role, isTherapistMode);
  const effectiveTherapistMode = roleMode.canUseTherapistMode && isTherapistMode;
  const [nextSession, setNextSession] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInSignal, setCheckInSignal] = useState(0);

  const {
    journey,
    loading: journeyLoading,
    error: journeyError,
    refresh: refreshJourney,
  } = useCareJourney(effectiveTherapistMode ? null : user?.id || null);

  const journeyCopy = useMemo(
    () => (journey ? journeyStatusCopy(journey) : null),
    [journey],
  );

  const fetchNextSession = useCallback(async () => {
    if (!user || effectiveTherapistMode) {
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
  }, [effectiveTherapistMode, user]);

  useEffect(() => {
    fetchNextSession();
  }, [fetchNextSession]);

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([fetchNextSession(), refreshJourney()]).finally(() => setRefreshing(false));
  };

  const handleJourneyGoal = async (goalKey: 'check_in' | 'reflect' | 'connect') => {
    await Haptics.selectionAsync();

    if (goalKey === 'check_in') {
      setCheckInSignal((prev) => prev + 1);
      return;
    }

    if (goalKey === 'reflect') {
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
      Alert.alert('Great rhythm', 'You completed your care journey for today.');
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

  if (effectiveTherapistMode) {
    return <TherapistDashboardScreen />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.userName}>{profile?.first_name || 'there'} 👋</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('HomeNotifications')}>
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
          <MentalHealthDashboard openSignal={checkInSignal} />

          {journeyLoading ? (
            <View style={styles.journeyLoadingWrap}>
              <LoadingState message="Loading Care Rhythm..." />
            </View>
          ) : journeyError ? (
            <View style={styles.journeyErrorWrap}>
              <ErrorState message={journeyError} onRetry={refreshJourney} />
            </View>
          ) : journey ? (
            <Card style={styles.journeyCard}>
              <View style={styles.journeyHeader}>
                <View style={styles.journeyIcon}>
                  <Ionicons name="leaf-outline" size={20} color={Colors.accent.primary} />
                </View>
                <View style={styles.journeyHeaderText}>
                  <Text style={styles.journeyTitle}>{journeyCopy?.title || 'Daily Care Journey'}</Text>
                  <Text style={styles.journeySubtitle}>{careBuddyGreeting(profile?.first_name)}</Text>
                </View>
                <View style={styles.rhythmFlame}>
                  <Text style={styles.rhythmFlameEmoji}>🔥</Text>
                  <Text style={styles.rhythmFlameValue}>{journey.rhythm.currentStreak}</Text>
                </View>
              </View>

              <Text style={styles.journeySupportText}>{journeyCopy?.subtitle || careBuddyLine('coach')}</Text>

              <View style={styles.rhythmWeekRow}>
                {journey.rhythm.weekMarkers.map((marker) => (
                  <View key={marker.dateKey} style={styles.rhythmDayWrap}>
                    <View
                      style={[
                        styles.rhythmDayDot,
                        marker.completed && styles.rhythmDayDotDone,
                        marker.isToday && styles.rhythmDayDotToday,
                      ]}
                    >
                      {marker.completed ? <Ionicons name="checkmark" size={10} color={Colors.text.inverse} /> : null}
                    </View>
                    <Text style={styles.rhythmDayLabel}>{marker.dayLabel}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.rhythmMetaRow}>
                <Text style={styles.rhythmMetaText}>Best rhythm: {journey.rhythm.highestStreak} days</Text>
                {journey.rhythm.repairsAvailable > 0 ? (
                  <Text style={styles.rhythmRepairText}>Repair available today</Text>
                ) : null}
              </View>

              <View style={styles.journeyGoalRow}>
                {journey.goals.map((goal) => (
                  <TouchableOpacity
                    key={goal.key}
                    style={[styles.journeyGoalChip, goal.completed && styles.journeyGoalChipDone]}
                    onPress={() => handleJourneyGoal(goal.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={goal.completed ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={goal.completed ? Colors.status.success : Colors.text.tertiary}
                    />
                    <Text style={[styles.journeyGoalText, goal.completed && styles.journeyGoalTextDone]}>
                      {goal.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.journeyActionBtn} onPress={handleNextJourneyAction} activeOpacity={0.85}>
                <Text style={styles.journeyActionText}>Next: {journey.nextActionLabel}</Text>
                <Ionicons name="arrow-forward" size={16} color={Colors.text.inverse} />
              </TouchableOpacity>
            </Card>
          ) : null}

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
                <TouchableOpacity
                  style={[styles.actionBtnOutline, styles.nextSessionActionBtn]}
                  onPress={() => navigation.navigate('SessionPrep', { session: nextSession })}
                >
                  <Text style={styles.actionBtnTextOutline}>Session prep</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtnPrimary, styles.nextSessionActionBtn]}
                  onPress={() => navigation.navigate('VideoCall', { session: nextSession })}
                >
                  <Text style={styles.actionBtnText}>Join</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : null}

          <Text style={styles.sectionTitle}>Today in Care Space</Text>

          <Card style={styles.actionCard}>
            <View style={[styles.actionIconContainer, { backgroundColor: Colors.accent.soft }]}>
              <Ionicons name="sparkles-outline" size={22} color={Colors.accent.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Find your therapist fit</Text>
              <Text style={styles.actionDesc}>Answer a short form to get your best 3 therapist matches.</Text>
            </View>
            <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => navigation.navigate('MatchTab')}>
              <Text style={styles.actionBtnText}>Match</Text>
            </TouchableOpacity>
          </Card>

          <Card style={styles.actionCard}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={Colors.accent.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Therapist check-in</Text>
              <Text style={styles.actionDesc}>Respond to your latest message in under a minute.</Text>
            </View>
            <TouchableOpacity style={styles.actionBtnOutline} onPress={() => navigation.navigate('MessagesTab')}>
              <Text style={styles.actionBtnTextOutline}>Reply</Text>
            </TouchableOpacity>
          </Card>

          <Card style={styles.actionCard}>
            <View style={[styles.actionIconContainer, { backgroundColor: Colors.status.warningSoft }]}>
              <Ionicons name="journal-outline" size={22} color={Colors.status.warning} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Daily journal</Text>
              <Text style={styles.actionDesc}>Capture one thought so your progress stays visible.</Text>
            </View>
            <TouchableOpacity style={styles.actionBtnOutline} onPress={() => navigation.navigate('Journal')}>
              <Text style={styles.actionBtnTextOutline}>Reflect</Text>
            </TouchableOpacity>
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
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  scrollContent: {
    paddingBottom: 108,
  },
  journeyLoadingWrap: {
    minHeight: 120,
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
    width: 42,
    height: 42,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.soft,
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
  nextSessionActionBtn: {
    flex: 1,
  },
  sectionTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.tertiary,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  actionDesc: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 1,
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
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  actionBtnTextOutline: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
});
