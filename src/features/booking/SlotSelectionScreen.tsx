import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button, Card, Avatar } from '../../core/components';
import { Therapist, AvailabilitySlot } from '../../core/models/types';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../core/context/AuthContext';

export const SlotSelectionScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { therapist } = route.params as { therapist: Therapist };
  const { user } = useAuth();
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [duration, setDuration] = useState(45);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const dates = getNext7Days();

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0].key);
    }
  }, []);

  useEffect(() => {
    if (selectedDate) fetchSlots();
  }, [selectedDate]);

  const fetchSlots = async () => {
    if (!selectedDate) return;
    setSlotsLoading(true);
    setSlotsError(null);
    try {
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate);
      dayEnd.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('therapist_id', therapist.id)
        .eq('is_available', true)
        .gte('start_at', dayStart.toISOString())
        .lte('start_at', dayEnd.toISOString())
        .order('start_at', { ascending: true });

      if (error) throw error;
      const nextSlots = (data || []) as AvailabilitySlot[];
      setSlots(nextSlots);
      setSelectedSlot((prev) => (
        prev && nextSlots.some((slot) => slot.id === prev.id) ? prev : null
      ));
    } catch (err: any) {
      setSlots([]);
      setSlotsError(err.message || 'Could not load availability.');
    } finally {
      setSlotsLoading(false);
    }
  };

  const groupSlotsByPeriod = () => {
    const morning: AvailabilitySlot[] = [];
    const afternoon: AvailabilitySlot[] = [];
    const evening: AvailabilitySlot[] = [];

    slots.forEach((slot) => {
      const hour = new Date(slot.start_at).getHours();
      if (hour < 12) morning.push(slot);
      else if (hour < 17) afternoon.push(slot);
      else evening.push(slot);
    });

    return { morning, afternoon, evening };
  };

  const handleBook = async () => {
    if (!selectedSlot || !user) return;
    setLoading(true);

    try {
      const endAt = new Date(new Date(selectedSlot.start_at).getTime() + duration * 60000);

      // Create booking without payment gateway integration (current prototype behavior)
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id,
          therapist_id: therapist.id,
          slot_id: selectedSlot.id,
          session_type: 'video',
          status: 'pending_payment',
          scheduled_start_at: selectedSlot.start_at,
          scheduled_end_at: endAt.toISOString(),
          amount_inr: therapist.session_fee_inr,
        })
        .select()
        .single();

      if (error) throw error;

      // Create or get conversation
      const { data: existingConv, error: convFetchError } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('therapist_id', therapist.id)
        .maybeSingle();

      if (convFetchError) throw convFetchError;

      if (!existingConv) {
        const { error: convCreateError } = await supabase.from('conversations').insert({
          user_id: user.id,
          therapist_id: therapist.id,
        });
        if (convCreateError) throw convCreateError;
      }

      navigation.navigate('BookingConfirmation', {
        therapist,
        booking,
      });
    } catch (err: any) {
      Alert.alert('Booking failed', err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const { morning, afternoon, evening } = groupSlotsByPeriod();
  const formatTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select a time</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Therapist mini card */}
        <Card style={styles.miniCard}>
          <View style={styles.miniCardContent}>
            <Avatar uri={therapist.avatar_url} name={therapist.display_name} size={40} />
            <View style={styles.miniCardText}>
              <Text style={styles.miniCardName}>{therapist.display_name}</Text>
              <Text style={styles.miniCardHeadline}>{therapist.headline}</Text>
            </View>
          </View>
        </Card>

        {/* Date carousel */}
        <Text style={styles.sectionLabel}>Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {dates.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[styles.dateChip, selectedDate === d.key && styles.dateChipSelected]}
              onPress={() => { setSelectedDate(d.key); setSelectedSlot(null); }}
            >
              <Text style={[styles.dateDay, selectedDate === d.key && styles.dateDaySelected]}>{d.day}</Text>
              <Text style={[styles.dateNum, selectedDate === d.key && styles.dateNumSelected]}>{d.num}</Text>
              <Text style={[styles.dateMonth, selectedDate === d.key && styles.dateMonthSelected]}>{d.month}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Duration toggle */}
        <Text style={styles.sectionLabel}>Duration</Text>
        <View style={styles.durationRow}>
          {[30, 45].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.durationChip, duration === d && styles.durationChipSelected]}
              onPress={() => setDuration(d)}
            >
              <Text style={[styles.durationText, duration === d && styles.durationTextSelected]}>
                {d} min
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Slots */}
        {slotsLoading ? (
          <View style={styles.inlineStateCard}>
            <ActivityIndicator size="small" color={Colors.accent.primary} />
            <Text style={styles.inlineStateText}>Loading available slots...</Text>
          </View>
        ) : slotsError ? (
          <Card style={styles.errorCard}>
            <View style={styles.errorHeader}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.status.danger} />
              <Text style={styles.errorTitle}>Could not load slots</Text>
            </View>
            <Text style={styles.errorMessage}>{slotsError}</Text>
            <Button
              title="Retry"
              variant="secondary"
              onPress={fetchSlots}
              fullWidth={false}
              style={styles.retryButton}
            />
          </Card>
        ) : (
          <>
            {renderSlotGroup('Morning', morning, '☀️')}
            {renderSlotGroup('Afternoon', afternoon, '🌤')}
            {renderSlotGroup('Evening', evening, '🌙')}

            {slots.length === 0 && (
              <View style={styles.noSlots}>
                <Text style={styles.noSlotsText}>No slots available for this day</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Total</Text>
          <Text style={styles.priceAmount}>₹{therapist.session_fee_inr}</Text>
        </View>
        <Button
          title="Confirm booking"
          onPress={handleBook}
          disabled={!selectedSlot || slotsLoading || !!slotsError}
          loading={loading}
          size="lg"
        />
      </View>
    </SafeAreaView>
  );

  function renderSlotGroup(label: string, groupSlots: AvailabilitySlot[], emoji: string) {
    if (groupSlots.length === 0) return null;
    return (
      <View style={styles.slotGroup}>
        <Text style={styles.groupLabel}>{emoji} {label}</Text>
        <View style={styles.slotsRow}>
          {groupSlots.map((slot) => (
            <TouchableOpacity
              key={slot.id}
              style={[styles.slotBtn, selectedSlot?.id === slot.id && styles.slotBtnSelected]}
              onPress={() => setSelectedSlot(slot)}
            >
              <Text style={[styles.slotText, selectedSlot?.id === slot.id && styles.slotTextSelected]}>
                {formatTime(slot.start_at)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }
};

function getNext7Days() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      key: d.toISOString().split('T')[0],
      day: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString([], { weekday: 'short' }),
      num: d.getDate().toString(),
      month: d.toLocaleDateString([], { month: 'short' }),
    });
  }
  return days;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  headerTitle: { ...Typography.bodySemibold, color: Colors.text.primary },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingBottom: 180 },
  miniCard: { marginBottom: Spacing.lg },
  miniCardContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  miniCardText: { flex: 1 },
  miniCardName: { ...Typography.bodySemibold, color: Colors.text.primary },
  miniCardHeadline: { ...Typography.caption, color: Colors.text.secondary },
  sectionLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  dateRow: { gap: Spacing.xs, paddingBottom: Spacing.sm },
  dateChip: {
    width: 64,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  dateChipSelected: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  dateDay: { ...Typography.micro, color: Colors.text.secondary },
  dateDaySelected: { color: Colors.text.inverse },
  dateNum: { ...Typography.title2, color: Colors.text.primary, marginVertical: 2 },
  dateNumSelected: { color: Colors.text.inverse },
  dateMonth: { ...Typography.caption, color: Colors.text.tertiary },
  dateMonthSelected: { color: Colors.text.inverse + 'CC' },
  durationRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  durationChipSelected: {
    backgroundColor: Colors.accent.soft,
    borderColor: Colors.accent.primary,
  },
  durationText: { ...Typography.bodyEmphasis, color: Colors.text.secondary },
  durationTextSelected: { color: Colors.accent.primary },
  slotGroup: { marginBottom: Spacing.md },
  groupLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginBottom: Spacing.xs,
  },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  slotBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  slotBtnSelected: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  slotText: { ...Typography.captionEmphasis, color: Colors.text.primary },
  slotTextSelected: { color: Colors.text.inverse },
  inlineStateCard: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  inlineStateText: { ...Typography.body, color: Colors.text.secondary },
  errorCard: {
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  errorHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  errorTitle: { ...Typography.bodySemibold, color: Colors.status.danger },
  errorMessage: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 18 },
  retryButton: { marginTop: Spacing.xs },
  noSlots: { paddingVertical: Spacing.xxl, alignItems: 'center' },
  noSlotsText: { ...Typography.body, color: Colors.text.tertiary },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    backgroundColor: Colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.stroke.subtle,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  priceLabel: { ...Typography.body, color: Colors.text.secondary },
  priceAmount: { ...Typography.title2, color: Colors.text.primary },
});
