import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Card, PillChip, Avatar, EmptyState, LoadingState } from '../../core/components';
import { Shadow } from '../../core/theme/spacing';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { Therapist } from '../../core/models/types';
import { TherapistDashboardScreen } from '../therapist-dashboard/TherapistDashboardScreen';
import { MentalHealthDashboard } from './components/MentalHealthDashboard';

const FILTER_OPTIONS = ['All', 'Anxiety', 'Relationships', 'Loneliness', 'Work Stress', 'Self-Esteem', 'Grief'];

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { profile, isTherapistMode, user } = useAuth();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [nextSession, setNextSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('All');

  const fetchTherapists = useCallback(async () => {
    try {
      let query = supabase
        .from('therapists')
        .select(`
          *,
          profiles!inner (display_name, avatar_url, first_name)
        `)
        .eq('is_verified', true)
        .eq('is_active', true)
        .order('featured_rank', { ascending: true });

      if (selectedFilter !== 'All') {
        query = query.contains('specialties', [selectedFilter.toLowerCase().replace(' ', '-')]);
      }

      const { data, error } = await query;

      if (!error && data) {
        const mapped = data.map((t: any) => ({
          ...t,
          display_name: t.profiles?.display_name || t.profiles?.first_name || 'Therapist',
          avatar_url: t.profiles?.avatar_url,
          first_name: t.profiles?.first_name,
        }));
        setTherapists(mapped);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedFilter]);

  useEffect(() => {
    fetchTherapists();
  }, [fetchTherapists]);

  const fetchNextSession = useCallback(async () => {
    if (!user || isTherapistMode) return;

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

    if (error) {
      setNextSession(null);
      return;
    }

    if (!data) {
      setNextSession(null);
      return;
    }

    const therapist = Array.isArray((data as any).therapists) ? (data as any).therapists[0] : (data as any).therapists;
    const therapistProfile = Array.isArray(therapist?.profiles) ? therapist?.profiles[0] : therapist?.profiles;
    const session = Array.isArray((data as any).sessions) ? (data as any).sessions[0] : (data as any).sessions;

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
  }, [isTherapistMode, user]);

  useEffect(() => {
    fetchNextSession();
  }, [fetchNextSession]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNextSession();
    fetchTherapists();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const renderTherapistCard = ({ item }: { item: Therapist }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigation.navigate('TherapistProfile', { therapist: item })}
    >
      <Card style={styles.therapistCard}>
        <View style={styles.cardHeader}>
          <Avatar
            uri={item.avatar_url}
            name={item.display_name}
            size={52}
            showOnline
          />
          <View style={styles.cardHeaderText}>
            <Text style={styles.therapistName} numberOfLines={1}>
              {item.display_name}
            </Text>
            <Text style={styles.therapistHeadline} numberOfLines={1}>
              {item.headline}
            </Text>
          </View>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={12} color={Colors.status.warning} />
            <Text style={styles.ratingText}>{item.rating?.toFixed(1) || '—'}</Text>
          </View>
        </View>

        <Text style={styles.therapistBio} numberOfLines={2}>
          {item.bio}
        </Text>

        <View style={styles.tagsRow}>
          {item.specialties?.slice(0, 3).map((s) => (
            <View key={s} style={styles.tag}>
              <Text style={styles.tagText}>{s}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.feeContainer}>
            <Text style={styles.feeLabel}>From</Text>
            <Text style={styles.feeAmount}>₹{item.session_fee_inr}</Text>
            <Text style={styles.feeLabel}>/session</Text>
          </View>
          <View style={styles.viewProfileBtn}>
            <Text style={styles.viewProfileText}>View profile</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.accent.primary} />
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.userName}>{profile?.first_name || 'there'} 👋</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('HomeNotifications')}>
          <Ionicons
            name="notifications-outline"
            size={22}
            color={Colors.text.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Conditional Rendering based on Role Mode */}
      {isTherapistMode ? (
        <TherapistDashboardScreen />
      ) : (
        <>
          {/* Care Plan Section (Client UX) */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />
            }
          >
            <MentalHealthDashboard />
            {nextSession && (
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
            )}
            <View style={styles.carePlanContainer}>
              <Text style={styles.sectionTitle}>Your Care Plan</Text>
              <Card style={styles.actionCard}>
                <View style={styles.actionIconContainer}>
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color={Colors.accent.primary} />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Therapist Check-in</Text>
                  <Text style={styles.actionDesc}>Check-in on your breathing exercise</Text>
                </View>
                <TouchableOpacity 
                  style={styles.actionBtnPrimary}
                  onPress={() => navigation.navigate('MessagesTab')}
                >
                  <Text style={styles.actionBtnText}>Reply</Text>
                </TouchableOpacity>
              </Card>

              <Card style={styles.actionCard}>
                <View style={[styles.actionIconContainer, { backgroundColor: Colors.status.warningSoft }]}>
                  <Ionicons name="journal-outline" size={24} color={Colors.status.warning} />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Daily Journal</Text>
                  <Text style={styles.actionDesc}>Take 5 minutes to reflect on your goals for this week.</Text>
                </View>
                <TouchableOpacity
                  style={styles.actionBtnOutline}
                  onPress={() => navigation.navigate('Journal')}
                >
                  <Text style={styles.actionBtnTextOutline}>Start</Text>
                </TouchableOpacity>
              </Card>
            </View>

            <Text style={styles.sectionTitle}>Available therapists</Text>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContainer}
      >
        {FILTER_OPTIONS.map((filter) => (
          <PillChip
            key={filter}
            label={filter}
            selected={selectedFilter === filter}
            onPress={() => setSelectedFilter(filter)}
          />
        ))}
      </ScrollView>

        {/* Therapist list */}
        {loading ? (
          <LoadingState message="Finding therapists..." />
        ) : therapists.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No therapists found"
            message="Try changing your filters or check back later."
            actionLabel="Clear filters"
            onAction={() => setSelectedFilter('All')}
          />
        ) : (
          <View style={styles.listContent}>
            {therapists.map(t => <React.Fragment key={t.id}>{renderTherapistCard({ item: t })}</React.Fragment>)}
          </View>
        )}
        </ScrollView>
        </>
      )}
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
    borderRadius: 22,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  sectionTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filtersContainer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  scrollContent: {
    paddingBottom: 100, // accommodate tab bar overlay space
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
    gap: Spacing.md,
  },
  therapistCard: {
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardHeaderText: {
    flex: 1,
  },
  therapistName: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  therapistHeadline: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.status.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  ratingText: {
    ...Typography.captionEmphasis,
    color: Colors.status.warning,
  },
  therapistBio: {
    ...Typography.body,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  tagText: {
    ...Typography.caption,
    color: Colors.accent.primary,
    textTransform: 'capitalize',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.ui.divider,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xxs,
  },
  feeContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  feeLabel: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  feeAmount: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  viewProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewProfileText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  nextSessionCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  nextSessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nextSessionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    gap: Spacing.xs,
  },
  nextSessionActionBtn: {
    flex: 1,
    alignItems: 'center',
  },
  carePlanContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 2,
    lineHeight: 18,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  actionBtnText: {
    ...Typography.captionEmphasis,
    color: Colors.text.inverse,
  },
  actionBtnOutline: {
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  actionBtnTextOutline: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
});
