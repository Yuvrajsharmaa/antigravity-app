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

const FILTER_OPTIONS = ['All', 'Anxiety', 'Relationships', 'Loneliness', 'Work Stress', 'Self-Esteem', 'Grief'];

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { profile } = useAuth();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
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

  const onRefresh = () => {
    setRefreshing(true);
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
        <TouchableOpacity style={styles.notifBtn}>
          <Ionicons name="notifications-outline" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
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
        <FlatList
          data={therapists}
          renderItem={renderTherapistCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />
          }
        />
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
});
