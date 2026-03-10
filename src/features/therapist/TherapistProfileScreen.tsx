import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button, Card, Avatar, PillChip, LoadingState, ErrorState } from '../../core/components';
import { Therapist, AvailabilitySlot } from '../../core/models/types';
import { supabase } from '../../services/supabase';
import { careBuddyLine } from '../../core/utils/careBuddy';

export const TherapistProfileScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { therapist } = route.params as { therapist: Therapist };
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  useEffect(() => {
    fetchSlots();
  }, []);

  const fetchSlots = async () => {
    setSlotsLoading(true);
    setSlotsError(null);
    const now = new Date().toISOString();
    const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    try {
      const { data, error } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('therapist_id', therapist.id)
        .eq('is_available', true)
        .gte('start_at', now)
        .lte('start_at', weekLater)
        .order('start_at', { ascending: true })
        .limit(6);

      if (error) throw error;
      setSlots(data || []);
    } catch (error: any) {
      setSlots([]);
      setSlotsError(error.message || 'Could not load availability.');
    } finally {
      setSlotsLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>

        {/* Hero */}
        <View style={styles.heroSection}>
          <Avatar uri={therapist.avatar_url} name={therapist.display_name} size={88} />
          <Text style={styles.name}>{therapist.display_name}</Text>
          <Text style={styles.headline}>{therapist.headline}</Text>

          <View style={styles.infoPills}>
            <View style={styles.infoPill}>
              <Ionicons name="briefcase-outline" size={14} color={Colors.accent.primary} />
              <Text style={styles.infoPillText}>{therapist.years_experience} yrs exp</Text>
            </View>
            {therapist.rating && (
              <View style={styles.infoPill}>
                <Ionicons name="star" size={14} color={Colors.status.warning} />
                <Text style={styles.infoPillText}>{therapist.rating.toFixed(1)}</Text>
              </View>
            )}
            <View style={styles.infoPill}>
              <Ionicons name="globe-outline" size={14} color={Colors.accent.primary} />
              <Text style={styles.infoPillText}>{therapist.languages?.join(', ')}</Text>
            </View>
          </View>
        </View>

        {/* About */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bio}>{therapist.bio}</Text>
        </Card>

        {/* Specialties */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Specialties</Text>
          <View style={styles.specialtiesRow}>
            {therapist.specialties?.map((s) => (
              <PillChip key={s} label={s} selected={false} />
            ))}
          </View>
        </Card>

        {/* Session Info */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Session details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Video session</Text>
            <Text style={styles.detailValue}>₹{therapist.session_fee_inr}</Text>
          </View>
          {therapist.chat_fee_inr && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Chat session</Text>
              <Text style={styles.detailValue}>₹{therapist.chat_fee_inr}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration</Text>
            <Text style={styles.detailValue}>45 min</Text>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>What working together feels like</Text>
          <Text style={styles.fitCopy}>
            {therapist.headline || 'Supportive and structured care.'} Your first session focuses on understanding context, not rushing conclusions.
          </Text>
          <Text style={styles.fitHint}>{careBuddyLine('reassure')}</Text>
        </Card>

        {/* Availability preview */}
        {slotsLoading ? (
          <View style={styles.availabilityState}>
            <LoadingState message="Checking available slots..." />
          </View>
        ) : slotsError ? (
          <View style={styles.availabilityState}>
            <ErrorState message={slotsError} onRetry={fetchSlots} />
          </View>
        ) : slots.length > 0 && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Available soon</Text>
            <View style={styles.slotsGrid}>
              {slots.map((slot) => (
                <TouchableOpacity
                  key={slot.id}
                  style={styles.slotChip}
                  onPress={() => navigation.navigate('SlotSelection', { therapist, preselectedSlot: slot })}
                >
                  <Text style={styles.slotDate}>{formatDate(slot.start_at)}</Text>
                  <Text style={styles.slotTime}>{formatTime(slot.start_at)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={styles.stickyBottom}>
        <Button
          title="Start chat"
          variant="secondary"
          onPress={() => navigation.navigate('MessagesTab', { screen: 'Chat', params: { therapist } })}
          fullWidth={false}
          style={styles.chatBtn}
        />
        <View style={styles.flex}>
          <Button
            title="Book session"
            onPress={() => navigation.navigate('SlotSelection', { therapist })}
            size="lg"
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  name: {
    ...Typography.title1,
    color: Colors.text.primary,
    marginTop: Spacing.md,
  },
  headline: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: Spacing.xxs,
  },
  infoPills: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  infoPillText: {
    ...Typography.caption,
    color: Colors.accent.primary,
    fontWeight: '500',
  },
  sectionCard: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  bio: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 24,
  },
  availabilityState: {
    minHeight: 120,
  },
  fitCopy: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  fitHint: {
    ...Typography.caption,
    color: Colors.accent.primary,
    marginTop: Spacing.xs,
  },
  specialtiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ui.divider,
  },
  detailLabel: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  detailValue: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  slotChip: {
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accent.primary + '20',
  },
  slotDate: {
    ...Typography.micro,
    color: Colors.accent.primary,
  },
  slotTime: {
    ...Typography.captionEmphasis,
    color: Colors.accent.dark,
    marginTop: 2,
  },
  bottomSpacer: { height: 40 },
  stickyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingBottom: Spacing.xxl,
    backgroundColor: Colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.stroke.subtle,
  },
  chatBtn: {
    paddingHorizontal: Spacing.lg,
  },
});
