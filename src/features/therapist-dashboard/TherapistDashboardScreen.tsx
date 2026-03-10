import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Avatar, Card, LoadingState, EmptyState, BackendSetupCard } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useClientMetricsReadiness } from '../../core/hooks/useClientMetricsReadiness';
import { assessCareRisk, riskPriority } from '../../core/utils/careRisk';
import { RiskLevel } from '../../core/models/types';
import { confirmBookingAndEnsureSession, createCareNudgeEvent } from '../../core/services/careFlowService';
import { therapistNudgePrefill } from '../../core/utils/careBuddy';

interface DashboardClient {
  id: string;
  conversationId: string;
  name: string;
  avatar: string | null;
  alertMsg: string;
  riskLevel: RiskLevel;
  hasAutoNudge: boolean;
  lastNudgeAt: string | null;
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

export const TherapistDashboardScreen: React.FC = () => {
  const { profile, user } = useAuth();
  const navigation = useNavigation<any>();
  const { ready, requiresSetup, issue, refresh } = useClientMetricsReadiness();

  const [clients, setClients] = useState<DashboardClient[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [stats, setStats] = useState({ activeClients: 0, upcomingCount: 0, expectedRevenueInr: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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
          .select('user_id, stress_level, care_score_snapshot, created_at')
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
      Alert.alert('Cannot confirm', 'This booking does not have a linked availability slot.');
      return;
    }

    setActionLoadingId(item.bookingId);
    try {
      await confirmBookingAndEnsureSession({
        bookingId: item.bookingId,
        slotId: item.slotId,
      });

      Alert.alert('Booking confirmed', 'Client can now join the video session.');
      fetchDashboard();
    } catch (err: any) {
      Alert.alert('Confirmation failed', err.message || 'Unable to confirm booking.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendNudge = async (clientName: string, conversationId: string, reason: string) => {
    Alert.alert(
      'Send check-in',
      `Send a supportive follow-up to ${clientName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Template',
          onPress: async () => {
            try {
              const riskLevel = reason.toLowerCase().includes('high') ? 'high' : reason.toLowerCase().includes('strain') ? 'medium' : 'stable';
              const text = `Hi ${clientName}, ${therapistNudgePrefill(riskLevel as RiskLevel, reason)}`;
              await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: user?.id,
                body: text,
                message_type: 'text',
              });
              await supabase
                .from('conversations')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', conversationId);

              const client = clients.find((item) => item.conversationId === conversationId);
              if (client?.id) {
                await createCareNudgeEvent({
                  userId: client.id,
                  therapistId: user?.id || null,
                  triggerType: 'therapist_checkin',
                  riskLevel: riskLevel as RiskLevel,
                  source: 'therapist_manual',
                  messagePreview: text,
                });
              }
              Alert.alert('Sent', 'Check-in sent successfully!');
            } catch (sendError) {
              Alert.alert('Error', 'Failed to send message.');
            }
          },
        },
      ]
    );
  };

  const formatSessionTime = (iso: string) => {
    const date = new Date(iso);
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
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

        {clients.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No clients yet"
            message="Clients will appear here after they start a conversation with you."
          />
        ) : (
          clients.map((client) => (
            <Card key={client.conversationId} style={styles.clientCard}>
              <View style={styles.clientHeader}>
                <Avatar uri={client.avatar} name={client.name} size={48} />
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientLastContact}>Conversation active</Text>
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
              </View>
              <View style={styles.issueContainer}>
                <Ionicons
                  name={getRiskVisuals(client.riskLevel).icon}
                  size={16}
                  color={getRiskVisuals(client.riskLevel).badgeText}
                />
                <Text style={[styles.issueText, { color: getRiskVisuals(client.riskLevel).badgeText }]}>{client.alertMsg}</Text>
              </View>
              {client.hasAutoNudge && (
                <View style={styles.nudgeFlag}>
                  <Ionicons name="notifications-outline" size={14} color={Colors.accent.primary} />
                  <Text style={styles.nudgeFlagText}>Auto nudge triggered recently</Text>
                </View>
              )}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnOutline]}
                  onPress={() => navigation.navigate('ClientDetail', { clientId: client.id, clientName: client.name })}
                >
                  <Ionicons name="reader-outline" size={18} color={Colors.text.primary} />
                  <Text style={styles.actionBtnTextOutline}>View Notes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnPrimary]}
                  onPress={() => handleSendNudge(client.name, client.conversationId, client.alertMsg)}
                >
                  <Ionicons name="paper-plane-outline" size={18} color={Colors.text.inverse} />
                  <Text style={styles.actionBtnTextPrimary}>Send Check-in</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))
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
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary, actionLoadingId === session.bookingId && styles.disabled]}
                    disabled={actionLoadingId === session.bookingId}
                    onPress={() => confirmBooking(session)}
                  >
                    <Text style={styles.actionBtnTextPrimary}>
                      {actionLoadingId === session.bookingId ? 'Confirming...' : 'Confirm Booking'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.sessionActionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnOutline]}
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
                    >
                      <Text style={styles.actionBtnTextOutline}>Session Prep</Text>
                    </TouchableOpacity>
                    {canJoin(session) ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPrimary]}
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
                      >
                        <Text style={styles.actionBtnTextPrimary}>Join Session</Text>
                      </TouchableOpacity>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  scrollContent: { padding: Spacing.xl, paddingBottom: 100 },
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
  clientCard: {
    marginBottom: Spacing.md,
    gap: Spacing.md,
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
  issueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.status.warningSoft,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  issueText: { ...Typography.captionEmphasis, color: Colors.text.secondary, flex: 1 },
  nudgeFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent.soft,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
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
    borderRadius: Radius.md,
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
