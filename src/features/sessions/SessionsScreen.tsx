import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Card, Avatar, EmptyState, LoadingState } from '../../core/components';
import { Shadow } from '../../core/theme/spacing';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { useFocusEffect } from '@react-navigation/native';

interface SessionItem {
  id: string;
  booking_id: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  therapist_name: string;
  therapist_headline: string;
  therapist_avatar: string | null;
  amount_inr: number;
  session_type: string;
  video_call_id: string | null;
}

export const SessionsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date().toISOString();

      const query = supabase
        .from('sessions')
        .select(`
          id, status, video_call_id, created_at,
          bookings!inner (
            id, scheduled_start_at, scheduled_end_at, amount_inr, session_type,
            therapists!inner (
              id,
              profiles!inner (display_name, avatar_url)
            ),
            therapist_id
          )
        `)
        .eq('bookings.user_id', user.id);

      const { data, error } = await query;

      if (!error && data) {
        const mapped: SessionItem[] = data.map((s: any) => ({
          id: s.id,
          booking_id: s.bookings.id,
          status: s.status,
          scheduled_start_at: s.bookings.scheduled_start_at,
          scheduled_end_at: s.bookings.scheduled_end_at,
          therapist_name: s.bookings.therapists?.profiles?.display_name || 'Therapist',
          therapist_headline: '',
          therapist_avatar: s.bookings.therapists?.profiles?.avatar_url,
          amount_inr: s.bookings.amount_inr,
          session_type: s.bookings.session_type,
          video_call_id: s.video_call_id,
        }));

        const filtered = tab === 'upcoming'
          ? mapped.filter((m) => ['scheduled', 'in_progress'].includes(m.status))
          : mapped.filter((m) => ['completed', 'cancelled'].includes(m.status));

        filtered.sort((a, b) =>
          tab === 'upcoming'
            ? new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime()
            : new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime()
        );

        setSessions(filtered);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, tab]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSessions();
    }, [fetchSessions])
  );

  const canJoin = (session: SessionItem) => {
    const start = new Date(session.scheduled_start_at);
    const now = new Date();
    const fiveMinBefore = new Date(start.getTime() - 5 * 60000);
    const end = new Date(session.scheduled_end_at);
    return now >= fiveMinBefore && now <= end && ['scheduled', 'in_progress'].includes(session.status);
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'scheduled':
        return { label: 'Scheduled', color: Colors.accent.primary, bgColor: Colors.accent.soft };
      case 'in_progress':
        return { label: 'In Progress', color: Colors.status.success, bgColor: Colors.status.successSoft };
      case 'completed':
        return { label: 'Completed', color: Colors.status.success, bgColor: Colors.status.successSoft };
      case 'cancelled':
        return { label: 'Cancelled', color: Colors.status.danger, bgColor: Colors.status.dangerSoft };
      default:
        return { label: status, color: Colors.text.secondary, bgColor: Colors.bg.tertiary };
    }
  };

  const renderSession = ({ item }: { item: SessionItem }) => {
    const sc = getStatusConfig(item.status);
    const joinable = canJoin(item);

    return (
      <Card style={styles.sessionCard}>
        <View style={styles.cardHeader}>
          <Avatar uri={item.therapist_avatar} name={item.therapist_name} size={44} />
          <View style={styles.cardHeaderText}>
            <Text style={styles.therapistName}>{item.therapist_name}</Text>
            <Text style={styles.dateTime}>{formatDateTime(item.scheduled_start_at)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bgColor }]}>
            <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>

        {joinable && (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => navigation.navigate('VideoCall', { session: item })}
          >
            <Ionicons name="videocam" size={18} color={Colors.text.inverse} />
            <Text style={styles.joinBtnText}>Join session</Text>
          </TouchableOpacity>
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Text style={styles.screenTitle}>Sessions</Text>

      {/* Tabs */}
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
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={tab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
          title={tab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'}
          message={tab === 'upcoming' ? 'Book a session with a therapist to get started.' : 'Your completed sessions will appear here.'}
          actionLabel={tab === 'upcoming' ? 'Find a therapist' : undefined}
          onAction={tab === 'upcoming' ? () => navigation.navigate('HomeTab') : undefined}
        />
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSessions(); }} tintColor={Colors.accent.primary} />
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
  therapistName: { ...Typography.bodySemibold, color: Colors.text.primary },
  dateTime: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statusText: {
    ...Typography.micro,
  },
  joinBtn: {
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
});
