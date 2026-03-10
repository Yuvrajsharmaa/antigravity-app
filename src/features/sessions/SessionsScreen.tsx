import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Card, Avatar, EmptyState, LoadingState, Button, ErrorState } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { confirmBookingAndEnsureSession } from '../../core/services/careFlowService';
import { asDependencyState, describeBlockingDependency, dependenciesReady } from '../../core/utils/flowDependencies';

interface SessionItem {
  booking_id: string;
  slot_id: string | null;
  booking_status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'failed';
  scheduled_start_at: string;
  scheduled_end_at: string;
  participant_id: string;
  participant_name: string;
  participant_avatar: string | null;
  participant_subtitle: string;
  amount_inr: number;
  session_type: 'video' | 'chat';
  session_id: string | null;
  session_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | null;
  video_call_id: string | null;
}

const getFirst = <T,>(value: T | T[] | null | undefined): T | undefined => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

export const SessionsScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { user, isTherapistMode, isDevAdmin } = useAuth();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const desiredTab = route?.params?.initialTab;
    if (desiredTab === 'upcoming' || desiredTab === 'past') {
      setTab(desiredTab);
    }
  }, [route?.params?.initialTab]);

  const fetchSessions = useCallback(async () => {
    if (!user) return;

    try {
      setLoadError(null);
      let mapped: SessionItem[] = [];

      if (isTherapistMode) {
        const { data, error } = await supabase
          .from('bookings')
          .select(`
            id, slot_id, status, scheduled_start_at, scheduled_end_at, amount_inr, session_type,
            users:user_id (id, display_name, first_name, avatar_url),
            sessions (id, status, video_call_id)
          `)
          .eq('therapist_id', user.id);

        if (error) throw error;

        mapped = (data || []).map((booking: any) => {
          const participant = getFirst<any>(booking.users);
          const session = getFirst<any>(booking.sessions);

          return {
            booking_id: booking.id,
            slot_id: booking.slot_id,
            booking_status: booking.status,
            scheduled_start_at: booking.scheduled_start_at,
            scheduled_end_at: booking.scheduled_end_at,
            participant_id: participant?.id || '',
            participant_name: participant?.display_name || participant?.first_name || 'Client',
            participant_avatar: participant?.avatar_url || null,
            participant_subtitle: 'Client',
            amount_inr: booking.amount_inr,
            session_type: booking.session_type,
            session_id: session?.id || null,
            session_status: session?.status || null,
            video_call_id: session?.video_call_id || null,
          } as SessionItem;
        });
      } else {
        const { data, error } = await supabase
          .from('bookings')
          .select(`
            id, therapist_id, slot_id, status, scheduled_start_at, scheduled_end_at, amount_inr, session_type,
            therapists:therapist_id (
              headline,
              profiles (display_name, avatar_url)
            ),
            sessions (id, status, video_call_id)
          `)
          .eq('user_id', user.id);

        if (error) throw error;

        mapped = (data || []).map((booking: any) => {
          const therapist = getFirst<any>(booking.therapists);
          const profile = getFirst<any>(therapist?.profiles);
          const session = getFirst<any>(booking.sessions);

          return {
            booking_id: booking.id,
            slot_id: booking.slot_id,
            booking_status: booking.status,
            scheduled_start_at: booking.scheduled_start_at,
            scheduled_end_at: booking.scheduled_end_at,
            participant_id: booking.therapist_id,
            participant_name: profile?.display_name || 'Therapist',
            participant_avatar: profile?.avatar_url || null,
            participant_subtitle: therapist?.headline || 'Therapist',
            amount_inr: booking.amount_inr,
            session_type: booking.session_type,
            session_id: session?.id || null,
            session_status: session?.status || null,
            video_call_id: session?.video_call_id || null,
          } as SessionItem;
        });
      }

      const isPast = (item: SessionItem) => {
        if (['completed', 'cancelled', 'failed'].includes(item.booking_status)) return true;
        if (item.session_status && ['completed', 'cancelled'].includes(item.session_status)) return true;
        return false;
      };

      const filtered = tab === 'upcoming'
        ? mapped.filter((m) => !isPast(m))
        : mapped.filter((m) => isPast(m));

      filtered.sort((a, b) =>
        tab === 'upcoming'
          ? new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime()
          : new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime()
      );

      setSessions(filtered);
    } catch (err) {
      console.error(err);
      setLoadError('Unable to load sessions right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isTherapistMode, tab, user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSessions();
    }, [fetchSessions])
  );

  const canJoin = (item: SessionItem) => {
    if (item.session_type !== 'video') return false;
    if (item.booking_status !== 'confirmed') return false;
    if (!item.session_id) return false;
    if (item.session_status && ['completed', 'cancelled'].includes(item.session_status)) return false;
    return true;
  };

  const confirmBooking = async (item: SessionItem) => {
    const deps = [
      asDependencyState(
        'booking_id',
        'Booking reference',
        Boolean(item.booking_id),
        'Refresh and open this booking again.',
      ),
      asDependencyState(
        'slot_id',
        'Availability slot',
        Boolean(item.slot_id),
        'Ask the client to rebook a valid slot.',
      ),
    ];
    if (!dependenciesReady(deps)) {
      Alert.alert('Cannot confirm', describeBlockingDependency(deps) || 'Missing required dependency.');
      return;
    }

    setActionLoadingId(item.booking_id);
    try {
      const { data: liveBooking, error: liveBookingError } = await supabase
        .from('bookings')
        .select('id, status, slot_id')
        .eq('id', item.booking_id)
        .maybeSingle();

      if (liveBookingError) throw liveBookingError;
      if (!liveBooking) throw new Error('Booking not found.');

      if (liveBooking.status !== 'pending_payment') {
        Alert.alert('Already updated', 'This booking is no longer awaiting confirmation.');
        await fetchSessions();
        return;
      }

      await confirmBookingAndEnsureSession({
        bookingId: item.booking_id,
        slotId: liveBooking.slot_id,
      });

      Alert.alert('Booking confirmed', 'The client can now join this session.');
      await fetchSessions();
    } catch (err: any) {
      Alert.alert('Confirmation failed', err.message || 'Something went wrong while confirming.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getStatusConfig = (item: SessionItem) => {
    if (item.booking_status === 'pending_payment') {
      return { label: 'Awaiting Confirmation', color: Colors.status.warning, bgColor: Colors.status.warningSoft };
    }
    if (item.booking_status === 'cancelled' || item.session_status === 'cancelled') {
      return { label: 'Cancelled', color: Colors.status.danger, bgColor: Colors.status.dangerSoft };
    }
    if (item.booking_status === 'failed') {
      return { label: 'Failed', color: Colors.status.danger, bgColor: Colors.status.dangerSoft };
    }
    if (item.booking_status === 'completed' || item.session_status === 'completed') {
      return { label: 'Completed', color: Colors.status.success, bgColor: Colors.status.successSoft };
    }
    if (item.session_status === 'in_progress') {
      return { label: 'In Progress', color: Colors.status.success, bgColor: Colors.status.successSoft };
    }
    return { label: 'Confirmed', color: Colors.accent.primary, bgColor: Colors.accent.soft };
  };

  const renderSession = ({ item }: { item: SessionItem }) => {
    const sc = getStatusConfig(item);
    const joinable = canJoin(item);
    const showConfirm = (isTherapistMode || isDevAdmin) && item.booking_status === 'pending_payment';
    const showPrep =
      tab === 'upcoming' &&
      !['cancelled', 'completed', 'failed'].includes(item.booking_status) &&
      item.session_type === 'video';
    const confirmLabel = isTherapistMode ? 'Confirm booking' : 'Dev: Confirm booking';

    return (
      <Card style={styles.sessionCard}>
        <View style={styles.cardHeader}>
          <Avatar uri={item.participant_avatar} name={item.participant_name} size={44} />
          <View style={styles.cardHeaderText}>
            <Text style={styles.participantName}>{item.participant_name}</Text>
            <Text style={styles.participantMeta}>{item.participant_subtitle}</Text>
            <Text style={styles.dateTime}>{formatDateTime(item.scheduled_start_at)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bgColor }]}>
            <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>

        {showConfirm && (
          <Button
            title={confirmLabel}
            variant="secondary"
            loading={actionLoadingId === item.booking_id}
            onPress={() => confirmBooking(item)}
          />
        )}

        {(showPrep || joinable) && (
          <View style={styles.sessionActionsRow}>
            {showPrep && (
              <TouchableOpacity
                style={styles.prepBtn}
                onPress={() =>
                  navigation.navigate('SessionPrep', {
                    session: {
                      id: item.session_id,
                      booking_id: item.booking_id,
                      scheduled_start_at: item.scheduled_start_at,
                      scheduled_end_at: item.scheduled_end_at,
                      participant_id: item.participant_id,
                      participant_name: item.participant_name,
                      participant_avatar: item.participant_avatar,
                      status: item.session_status || 'scheduled',
                      video_call_id: item.video_call_id,
                      booking_status: item.booking_status,
                      session_type: item.session_type,
                    },
                  })
                }
              >
                <Ionicons name="sparkles-outline" size={16} color={Colors.text.primary} />
                <Text style={styles.prepBtnText}>Session prep</Text>
              </TouchableOpacity>
            )}

            {joinable && (
              <TouchableOpacity
                style={styles.joinBtn}
                onPress={() =>
                  navigation.navigate('VideoCall', {
                    session: {
                      id: item.session_id,
                      booking_id: item.booking_id,
                      scheduled_start_at: item.scheduled_start_at,
                      scheduled_end_at: item.scheduled_end_at,
                      participant_id: item.participant_id,
                      participant_name: item.participant_name,
                      participant_avatar: item.participant_avatar,
                      status: item.session_status || 'scheduled',
                      video_call_id: item.video_call_id,
                      booking_status: item.booking_status,
                      session_type: item.session_type,
                    },
                  })
                }
              >
                <Ionicons name="videocam" size={18} color={Colors.text.inverse} />
                <Text style={styles.joinBtnText}>Join session</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!joinable && item.booking_status === 'confirmed' && !item.session_id && (
          <Text style={styles.helperText}>Video room is being prepared. Refresh shortly.</Text>
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Text style={styles.screenTitle}>{isTherapistMode ? 'Practice Sessions' : 'Sessions'}</Text>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'upcoming' && styles.tabActive]}
          onPress={() => setTab('upcoming')}
        >
          <Text style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'past' && styles.tabActive]}
          onPress={() => setTab('past')}
        >
          <Text style={[styles.tabText, tab === 'past' && styles.tabTextActive]}>Past</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState message="Loading sessions..." />
      ) : loadError ? (
        <ErrorState
          message={loadError}
          onRetry={() => {
            setLoading(true);
            fetchSessions();
          }}
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={tab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
          title={tab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'}
          message={
            tab === 'upcoming'
              ? isTherapistMode
                ? 'Pending and confirmed client sessions will appear here.'
                : 'Book a session with a therapist to get started.'
              : 'Completed or cancelled sessions will appear here.'
          }
          actionLabel={tab === 'upcoming' && !isTherapistMode ? 'Find a therapist' : undefined}
          onAction={tab === 'upcoming' && !isTherapistMode ? () => navigation.navigate('HomeTab') : undefined}
        />
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSession}
          keyExtractor={(item) => item.booking_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchSessions();
              }}
              tintColor={Colors.accent.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  screenTitle: {
    ...Typography.title1,
    color: Colors.text.primary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xxs,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  tabActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  tabText: {
    ...Typography.bodyEmphasis,
    color: Colors.text.secondary,
  },
  tabTextActive: {
    color: Colors.text.inverse,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
    gap: Spacing.sm,
  },
  sessionCard: {
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardHeaderText: { flex: 1 },
  participantName: { ...Typography.bodySemibold, color: Colors.text.primary },
  participantMeta: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  dateTime: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statusText: {
    ...Typography.micro,
  },
  joinBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.status.success,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },
  joinBtnText: {
    ...Typography.bodyEmphasis,
    color: Colors.text.inverse,
  },
  helperText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  sessionActionsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  prepBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.bg.secondary,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },
  prepBtnText: {
    ...Typography.bodyEmphasis,
    color: Colors.text.primary,
  },
});
