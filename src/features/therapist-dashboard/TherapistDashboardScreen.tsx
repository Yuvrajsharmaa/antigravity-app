import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Avatar, Button, Card, LoadingState, EmptyState, BackendSetupCard, CoveModal } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useClientMetricsReadiness } from '../../core/hooks/useClientMetricsReadiness';
import { assessCareRisk, riskPriority } from '../../core/utils/careRisk';
import { CoveModalAction, CoveModalVariant, RiskLevel } from '../../core/models/types';
import {
  confirmBookingAndEnsureSession,
  createCareNudgeEvent,
  getNudgeCooldownState,
} from '../../core/services/careFlowService';
import { therapistNudgePrefill } from '../../core/utils/careBuddy';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { localDateKey } from '../../core/utils/date';

interface DashboardClient {
  id: string;
  conversationId: string;
  name: string;
  avatar: string | null;
  alertMsg: string;
  riskLevel: RiskLevel;
  hasAutoNudge: boolean;
  lastNudgeAt: string | null;
  rhythmDays: number;
  reasonChips: string[];
  openingPrompt: string;
}

interface UpcomingSession {
  bookingId: string;
  slotId: string | null;
  bookingStatus: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'failed';
  scheduledStartAt: string;
  scheduledEndAt: string;
  amountInr: number;
  sessionType: 'video' | 'chat';
  clientId: string;
  clientName: string;
  clientAvatar: string | null;
  sessionId: string | null;
  sessionStatus: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | null;
  videoCallId: string | null;
}

const getFirst = <T,>(value: T | T[] | null | undefined): T | undefined => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const toDateKey = (iso: string) => localDateKey(new Date(iso));

const computeRhythmDays = (metrics: Array<{ created_at: string }>) => {
  if (!metrics.length) return 0;
  const daySet = new Set(metrics.map((item) => toDateKey(item.created_at)));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (daySet.has(toDateKey(cursor.toISOString()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (streak > 0) return streak;

  const yesterday = new Date();
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  while (daySet.has(toDateKey(yesterday.toISOString()))) {
    streak += 1;
    yesterday.setDate(yesterday.getDate() - 1);
  }
  return streak;
};

const openingPromptForRisk = (riskLevel: RiskLevel) => {
  if (riskLevel === 'high') return 'Start gently: “How has this week felt in your body and mind?”';
  if (riskLevel === 'medium') return 'Start with progress + strain: “What improved, and what still feels heavy?”';
  return 'Start with continuity: “What would make today’s session most useful for you?”';
};

export const TherapistDashboardScreen: React.FC = () => {
  const { profile, user, isTherapistMode, canUseTherapistMode } = useAuth();
  const navigation = useNavigation<any>();
  const { ready, requiresSetup, issue, refresh } = useClientMetricsReadiness();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);

  const [clients, setClients] = useState<DashboardClient[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [stats, setStats] = useState({ activeClients: 0, upcomingCount: 0, expectedRevenueInr: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [dismissedClientIds, setDismissedClientIds] = useState<string[]>([]);
  const [modalState, setModalState] = useState<{
    visible: boolean;
    variant: CoveModalVariant;
    title: string;
    message: string;
    primaryAction?: CoveModalAction | null;
    secondaryAction?: CoveModalAction | null;
  }>({
    visible: false,
    variant: 'info',
    title: '',
    message: '',
    primaryAction: null,
    secondaryAction: null,
  });

  const showModal = React.useCallback(
    (
      variant: CoveModalVariant,
      title: string,
      message: string,
      primaryAction?: CoveModalAction | null,
      secondaryAction?: CoveModalAction | null,
    ) => {
      setModalState({
        visible: true,
        variant,
        title,
        message,
        primaryAction: primaryAction || {
          label: 'Okay',
          onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
        },
        secondaryAction: secondaryAction || null,
      });
    },
    [],
  );

  const fetchDashboard = React.useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`
          id,
          users:user_id ( id, first_name, display_name, avatar_url )
        `)
        .eq('therapist_id', user.id);

      if (convError) throw convError;

      const conversationRows = convData || [];
      const clientIds = conversationRows
        .map((row: any) => getFirst<any>(row.users)?.id)
        .filter(Boolean);

      let metricsByUser: Record<string, any[]> = {};
      if (ready && clientIds.length > 0) {
        const { data: metrics, error: metricsError } = await supabase
          .from('client_metrics')
          .select('user_id, mood, stress_level, sleep_hours, care_score_snapshot, created_at')
          .in('user_id', clientIds)
          .order('created_at', { ascending: false });

        if (metricsError) {
          setError(metricsError.message || 'Unable to evaluate CareScore alerts right now.');
        } else {
          for (const item of metrics || []) {
            metricsByUser[item.user_id] = metricsByUser[item.user_id] || [];
            metricsByUser[item.user_id].push(item);
          }
        }
      }

      let latestNudgeByUser: Record<string, string> = {};
      if (clientIds.length > 0) {
        const { data: nudgeEvents, error: nudgeError } = await supabase
          .from('care_nudge_events')
          .select('user_id, created_at')
          .eq('therapist_id', user.id)
          .in('user_id', clientIds)
          .order('created_at', { ascending: false });

        if (!nudgeError) {
          for (const event of nudgeEvents || []) {
            if (!latestNudgeByUser[event.user_id]) {
              latestNudgeByUser[event.user_id] = event.created_at;
            }
          }
        }
      }

      const nextClients: DashboardClient[] = conversationRows.map((row: any) => {
        const profileRow = getFirst<any>(row.users);
        const clientId = profileRow?.id;
        const clientMetrics = clientId ? metricsByUser[clientId] || [] : [];
        const risk = assessCareRisk(clientMetrics.slice(0, 5));
        const hasAutoNudge = clientId ? Boolean(latestNudgeByUser[clientId]) : false;
        const latestMetric = clientMetrics[0];
        const rhythmDays = computeRhythmDays(clientMetrics.slice(0, 21));
        const reasonChips: string[] = [];

        if (latestMetric?.mood) {
          reasonChips.push(`Recent mood: ${latestMetric.mood}`);
        }
        const sleepHours = Number(latestMetric?.sleep_hours);
        if (Number.isFinite(sleepHours) && sleepHours > 0) {
          reasonChips.push(`Sleep: ${sleepHours}h`);
        }
        if (rhythmDays > 0) {
          reasonChips.push(`Care rhythm: ${rhythmDays}d`);
        }
        if (!reasonChips.length) {
          reasonChips.push('No recent logs yet');
        }

        let alertMsg = risk.reason;
        if (!ready) {
          alertMsg = 'CareScore unavailable until setup is completed';
        }

        return {
          id: clientId || row.id,
          conversationId: row.id,
          name: profileRow?.display_name || profileRow?.first_name || 'Client',
          avatar: profileRow?.avatar_url || null,
          alertMsg,
          riskLevel: ready ? risk.level : 'stable',
          hasAutoNudge,
          lastNudgeAt: clientId ? latestNudgeByUser[clientId] || null : null,
          rhythmDays,
          reasonChips: reasonChips.slice(0, 3),
          openingPrompt: openingPromptForRisk(ready ? risk.level : 'stable'),
        };
      });

      nextClients.sort((a, b) => {
        const riskDiff = riskPriority(b.riskLevel) - riskPriority(a.riskLevel);
        if (riskDiff !== 0) return riskDiff;

        const nudgeTimeA = a.lastNudgeAt ? new Date(a.lastNudgeAt).getTime() : 0;
        const nudgeTimeB = b.lastNudgeAt ? new Date(b.lastNudgeAt).getTime() : 0;
        return nudgeTimeB - nudgeTimeA;
      });

      const nowIso = new Date().toISOString();
      const weekAheadIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          id, slot_id, status, scheduled_start_at, scheduled_end_at, amount_inr, session_type,
          users:user_id (id, display_name, first_name, avatar_url),
          sessions (id, status, video_call_id)
        `)
        .eq('therapist_id', user.id)
        .gte('scheduled_start_at', nowIso)
        .lte('scheduled_start_at', weekAheadIso)
        .order('scheduled_start_at', { ascending: true });

      if (bookingError) throw bookingError;

      const nextUpcoming: UpcomingSession[] = (bookingData || [])
        .filter((row: any) => ['pending_payment', 'confirmed'].includes(row.status))
        .map((row: any) => {
          const clientProfile = getFirst<any>(row.users);
          const session = getFirst<any>(row.sessions);
          return {
            bookingId: row.id,
            slotId: row.slot_id,
            bookingStatus: row.status,
            scheduledStartAt: row.scheduled_start_at,
            scheduledEndAt: row.scheduled_end_at,
            amountInr: row.amount_inr,
            sessionType: row.session_type,
            clientId: clientProfile?.id || '',
            clientName: clientProfile?.display_name || clientProfile?.first_name || 'Client',
            clientAvatar: clientProfile?.avatar_url || null,
            sessionId: session?.id || null,
            sessionStatus: session?.status || null,
            videoCallId: session?.video_call_id || null,
          } as UpcomingSession;
        });

      const expectedRevenueInr = nextUpcoming
        .filter((s) => s.bookingStatus === 'confirmed')
        .reduce((acc, curr) => acc + curr.amountInr, 0);

      setClients(nextClients);
      setUpcomingSessions(nextUpcoming);
      setStats({
        activeClients: new Set(nextClients.map((c) => c.id)).size,
        upcomingCount: nextUpcoming.length,
        expectedRevenueInr,
      });
    } catch (err: any) {
      setError(err.message || 'Unable to load therapist dashboard right now.');
    } finally {
      setLoading(false);
    }
  }, [ready, user]);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
      fetchDashboard();
    }, [fetchDashboard, refresh])
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, ready]);

  const goToSessions = () => {
    const parentNav = navigation.getParent();
    if (parentNav) {
      parentNav.navigate('SessionsTab', { initialTab: 'upcoming' });
      return;
    }
    navigation.navigate('SessionsTab', { initialTab: 'upcoming' });
  };

  const canJoin = (item: UpcomingSession) => {
    if (item.sessionType !== 'video') return false;
    if (item.bookingStatus !== 'confirmed') return false;
    if (!item.sessionId) return false;
    if (item.sessionStatus && ['completed', 'cancelled'].includes(item.sessionStatus)) return false;
    return true;
  };

  const getRiskVisuals = (level: RiskLevel) => {
    if (level === 'high') {
      return {
        label: 'High',
        badgeBg: Colors.status.dangerSoft,
        badgeText: Colors.status.danger,
        icon: 'alert-circle-outline' as const,
      };
    }
    if (level === 'medium') {
      return {
        label: 'Medium',
        badgeBg: Colors.status.warningSoft,
        badgeText: Colors.status.warning,
        icon: 'warning-outline' as const,
      };
    }
    return {
      label: 'Stable',
      badgeBg: Colors.status.successSoft,
      badgeText: Colors.status.success,
      icon: 'checkmark-circle-outline' as const,
    };
  };

  const confirmBooking = async (item: UpcomingSession) => {
    if (!item.slotId) {
      showModal('blocking', 'Cannot confirm', 'This booking does not have a linked availability slot.');
      return;
    }

    setActionLoadingId(item.bookingId);
    try {
      await confirmBookingAndEnsureSession({
        bookingId: item.bookingId,
        slotId: item.slotId,
      });

      showModal('success', 'Booking confirmed', 'Client can now join the video session.');
      fetchDashboard();
    } catch (err: any) {
      showModal('error', 'Confirmation failed', err.message || 'Unable to confirm booking.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendNudge = async (clientName: string, conversationId: string, reason: string) => {
    if (!user?.id) return;
    const client = clients.find((item) => item.conversationId === conversationId);
    if (!client?.id) {
      showModal('error', 'Unavailable', 'Client context missing. Please refresh and try again.');
      return;
    }

    showModal(
      'confirm',
      'Send check-in?',
      `Send a supportive follow-up to ${clientName}?`,
      {
        label: 'Send template',
        onPress: async () => {
          try {
            const cooldown = await getNudgeCooldownState({
              userId: client.id,
              therapistId: user.id,
              source: 'therapist_manual',
              cooldownHours: 24,
            });
            if (cooldown.isBlocked) {
              showModal(
                'info',
                'Cooldown active',
                'A manual nudge was already sent in the last 24 hours.',
              );
              return;
            }

            const riskLevel = reason.toLowerCase().includes('high')
              ? 'high'
              : reason.toLowerCase().includes('strain')
                ? 'medium'
                : 'stable';
            const text = `Hi ${clientName}, ${therapistNudgePrefill(riskLevel as RiskLevel, reason)}`;
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              sender_id: user.id,
              body: text,
              message_type: 'text',
            });
            await supabase
              .from('conversations')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', conversationId);

            await createCareNudgeEvent({
              userId: client.id,
              therapistId: user.id,
              triggerType: 'therapist_checkin',
              riskLevel: riskLevel as RiskLevel,
              source: 'therapist_manual',
              messagePreview: text,
            });
            showModal('success', 'Sent', 'Check-in sent successfully.');
          } catch {
            showModal('error', 'Error', 'Failed to send message.');
          }
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  };

  const openChatForClient = (client: DashboardClient) => {
    const parentNav = navigation.getParent();
    const payload = {
      screen: 'Chat',
      params: {
        conversationId: client.conversationId,
        therapistName: client.name,
        therapistAvatar: client.avatar,
        therapistId: client.id,
        attentionCue: {
          riskLevel: client.riskLevel,
          reason: client.alertMsg,
          nudgeRecommended: client.riskLevel !== 'stable',
        },
      },
    };

    if (parentNav) {
      parentNav.navigate('MessagesTab', payload);
      return;
    }
    navigation.navigate('MessagesTab', payload);
  };

  const formatSessionTime = (iso: string) => {
    const date = new Date(iso);
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const visibleAttentionClients = clients
    .filter((item) => !dismissedClientIds.includes(item.id))
    .slice(0, 8);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {!canUseTherapistMode || !isTherapistMode ? (
        <View style={styles.guardWrap}>
          <EmptyState
            icon="shield-checkmark-outline"
            title="Therapist mode required"
            message="This dashboard is only available to therapist or admin accounts in therapist mode."
          />
        </View>
      ) : (
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: tabSafeBottomPadding }]}>
        {loading && <LoadingState message="Loading dashboard..." />}

        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Practice Dashboard</Text>
            <Text style={styles.subtitle}>Welcome back, Dr. {profile?.display_name || 'Therapist'}</Text>
          </View>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name || 'Dr.'} size={48} />
        </View>

        {requiresSetup && (
          <BackendSetupCard
            title="CareScore Setup Required"
            message={issue || undefined}
            onRetry={refresh}
          />
        )}

        {error && !loading && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Dashboard warning</Text>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        )}

        <View style={styles.statsContainer}>
          <Card style={styles.statCard}>
            <Ionicons name="people-outline" size={24} color={Colors.accent.primary} />
            <Text style={styles.statValue}>{stats.activeClients}</Text>
            <Text style={styles.statLabel}>Active Clients</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="calendar-outline" size={24} color={Colors.status.success} />
            <Text style={styles.statValue}>{stats.upcomingCount}</Text>
            <Text style={styles.statLabel}>Upcoming (7 days)</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="card-outline" size={24} color={Colors.status.warning} />
            <Text style={styles.statValue}>₹{stats.expectedRevenueInr}</Text>
            <Text style={styles.statLabel}>Expected Revenue</Text>
          </Card>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Needs Attention</Text>
          <TouchableOpacity onPress={goToSessions}>
            <Text style={styles.sectionAction}>View all</Text>
          </TouchableOpacity>
        </View>

        {visibleAttentionClients.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No attention items"
            message="Client signals that need action will appear here."
          />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.attentionScrollRow}
          >
            {visibleAttentionClients.map((client) => (
              <Card key={client.conversationId} style={styles.clientCard}>
                <View style={styles.clientHeader}>
                  <Avatar uri={client.avatar} name={client.name} size={48} />
                  <View style={styles.clientInfo}>
                    <Text style={styles.clientName}>{client.name}</Text>
                    <Text style={styles.clientLastContact} numberOfLines={1}>{client.alertMsg}</Text>
                  </View>
                  <View
                    style={[
                      styles.riskBadge,
                      { backgroundColor: getRiskVisuals(client.riskLevel).badgeBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.riskBadgeText,
                        { color: getRiskVisuals(client.riskLevel).badgeText },
                      ]}
                    >
                      {getRiskVisuals(client.riskLevel).label}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDismissedClientIds((prev) => [...prev, client.id])}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss alert"
                  >
                    <Ionicons name="close" size={18} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                </View>
                {client.hasAutoNudge ? (
                  <View style={styles.nudgeFlag}>
                    <Text style={styles.nudgeFlagText}>Nudge sent recently</Text>
                  </View>
                ) : null}
                <View style={styles.actionButtons}>
                  <Button
                    title="Open chat"
                    variant="secondary"
                    fullWidth={false}
                    style={{ flex: 1 }}
                    icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.text.primary} />}
                    onPress={() => openChatForClient(client)}
                  />
                  <Button
                    title="Send check-in"
                    variant="primary"
                    fullWidth={false}
                    style={{ flex: 1 }}
                    icon={<Ionicons name="paper-plane-outline" size={16} color={Colors.text.inverse} />}
                    onPress={() => handleSendNudge(client.name, client.conversationId, client.alertMsg)}
                  />
                </View>
              </Card>
            ))}
          </ScrollView>
        )}

        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
          <TouchableOpacity onPress={goToSessions}>
            <Text style={styles.sectionAction}>View all</Text>
          </TouchableOpacity>
        </View>

        {upcomingSessions.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No upcoming sessions"
            message="Confirmed and pending sessions will appear here."
          />
        ) : (
          upcomingSessions.map((session) => (
            <Card key={session.bookingId} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <Avatar uri={session.clientAvatar} name={session.clientName} size={40} />
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionName}>{session.clientName}</Text>
                  <Text style={styles.sessionTime}>{formatSessionTime(session.scheduledStartAt)}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    session.bookingStatus === 'pending_payment' ? styles.pendingPill : styles.confirmedPill,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      session.bookingStatus === 'pending_payment' ? styles.pendingPillText : styles.confirmedPillText,
                    ]}
                  >
                    {session.bookingStatus === 'pending_payment' ? 'Pending' : 'Confirmed'}
                  </Text>
                </View>
              </View>

              <View style={styles.sessionActions}>
                {session.bookingStatus === 'pending_payment' ? (
                  <Button
                    title="Confirm booking"
                    onPress={() => confirmBooking(session)}
                    variant="primary"
                    loading={actionLoadingId === session.bookingId}
                    disabled={actionLoadingId === session.bookingId}
                  />
                ) : (
                  <View style={styles.sessionActionRow}>
                    <Button
                      title="Session prep"
                      variant="secondary"
                      fullWidth={false}
                      style={{ flex: 1 }}
                      onPress={() =>
                        navigation.navigate('SessionPrep', {
                          session: {
                            id: session.sessionId,
                            booking_id: session.bookingId,
                            scheduled_start_at: session.scheduledStartAt,
                            scheduled_end_at: session.scheduledEndAt,
                            participant_id: session.clientId,
                            participant_name: session.clientName,
                            participant_avatar: session.clientAvatar,
                            status: session.sessionStatus || 'scheduled',
                            video_call_id: session.videoCallId,
                            booking_status: session.bookingStatus,
                            session_type: session.sessionType,
                          },
                        })
                      }
                    />
                    {canJoin(session) ? (
                      <Button
                        title="Join session"
                        variant="primary"
                        fullWidth={false}
                        style={{ flex: 1 }}
                        onPress={() =>
                          navigation.navigate('VideoCall', {
                            session: {
                              id: session.sessionId,
                              booking_id: session.bookingId,
                              scheduled_start_at: session.scheduledStartAt,
                              scheduled_end_at: session.scheduledEndAt,
                              participant_id: session.clientId,
                              participant_name: session.clientName,
                              participant_avatar: session.clientAvatar,
                              status: session.sessionStatus || 'scheduled',
                              video_call_id: session.videoCallId,
                              booking_status: session.bookingStatus,
                              session_type: session.sessionType,
                            },
                          })
                        }
                      />
                    ) : (
                      <View style={styles.sessionHintWrap}>
                        <Text style={styles.sessionHint}>Session room is being prepared.</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
      )}

      <CoveModal
        visible={modalState.visible}
        variant={modalState.variant}
        title={modalState.title}
        message={modalState.message}
        primaryAction={modalState.primaryAction || undefined}
        secondaryAction={modalState.secondaryAction || undefined}
        onDismiss={() => setModalState((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  guardWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  scrollContent: { padding: Spacing.xl, paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  greeting: { ...Typography.title1, color: Colors.text.primary },
  subtitle: { ...Typography.body, color: Colors.text.secondary, marginTop: 4 },
  errorCard: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.status.warningSoft,
    borderColor: Colors.status.warning + '20',
    gap: Spacing.xs,
  },
  errorTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  statCard: {
    flex: 1,
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  statValue: { ...Typography.title2, color: Colors.text.primary, marginTop: Spacing.xs },
  statLabel: { ...Typography.caption, color: Colors.text.secondary },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: { ...Typography.title2, color: Colors.text.primary },
  sectionAction: { ...Typography.bodySemibold, color: Colors.accent.primary },
  attentionScrollRow: {
    paddingRight: Spacing.md,
    gap: Spacing.md,
  },
  clientCard: {
    width: 332,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    borderRadius: 24,
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: { ...Typography.bodySemibold, color: Colors.text.primary },
  clientLastContact: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  riskBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  riskBadgeText: {
    ...Typography.micro,
  },
  reasonChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: -2,
  },
  reasonChip: {
    backgroundColor: Colors.accent.soft,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  reasonChipText: {
    ...Typography.caption,
    color: Colors.accent.dark,
  },
  promptCard: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'flex-start',
    backgroundColor: Colors.ui.glass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  promptText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 18,
    flex: 1,
  },
  nudgeFlag: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.bg.tertiary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
  },
  nudgeFlagText: {
    ...Typography.caption,
    color: Colors.accent.dark,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: 14,
  },
  actionBtnOutline: {
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.accent.primary,
  },
  actionBtnTextOutline: { ...Typography.bodySemibold, color: Colors.text.primary, fontSize: 13 },
  actionBtnTextPrimary: { ...Typography.bodySemibold, color: Colors.text.inverse, fontSize: 13 },
  sessionCard: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: 22,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: { ...Typography.bodySemibold, color: Colors.text.primary },
  sessionTime: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pendingPill: {
    backgroundColor: Colors.status.warningSoft,
  },
  confirmedPill: {
    backgroundColor: Colors.status.successSoft,
  },
  statusPillText: {
    ...Typography.micro,
  },
  pendingPillText: {
    color: Colors.status.warning,
  },
  confirmedPillText: {
    color: Colors.status.success,
  },
  sessionActions: {
    marginTop: Spacing.xs,
  },
  sessionActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  sessionHintWrap: {
    flex: 1,
  },
  sessionHint: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  disabled: {
    opacity: 0.6,
  },
});
