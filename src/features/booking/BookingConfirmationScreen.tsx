import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button, Card, Avatar } from '../../core/components';
import { careBuddyLine } from '../../core/utils/careBuddy';

export const BookingConfirmationScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { therapist, booking } = route.params;
  const startDate = new Date(booking.scheduled_start_at);
  const isPendingConfirmation = booking.status === 'pending_payment';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Success icon */}
        <View style={[styles.successCircle, isPendingConfirmation && styles.pendingCircle]}>
          <Ionicons
            name={isPendingConfirmation ? 'time-outline' : 'checkmark'}
            size={40}
            color={Colors.text.inverse}
          />
        </View>

        <Text style={styles.title}>{isPendingConfirmation ? 'Request sent' : 'Session booked!'}</Text>
        <Text style={styles.subtitle}>
          {isPendingConfirmation
            ? 'Awaiting therapist confirmation. You will see it in Sessions once accepted.'
            : "You're all set. Here are the details."}
        </Text>

        {/* Details card */}
        <Card style={styles.detailsCard}>
          <View style={styles.therapistRow}>
            <Avatar uri={therapist.avatar_url} name={therapist.display_name} size={44} />
            <View style={styles.therapistInfo}>
              <Text style={styles.therapistName}>{therapist.display_name}</Text>
              <Text style={styles.therapistRole}>{therapist.headline}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={18} color={Colors.text.secondary} />
            <Text style={styles.detailText}>
              {startDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={18} color={Colors.text.secondary} />
            <Text style={styles.detailText}>
              {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="videocam-outline" size={18} color={Colors.text.secondary} />
            <Text style={styles.detailText}>Video session</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="wallet-outline" size={18} color={Colors.text.secondary} />
            <Text style={styles.detailText}>₹{booking.amount_inr}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.text.secondary} />
            <Text style={styles.detailText}>
              {isPendingConfirmation ? 'Status: Awaiting confirmation' : 'Status: Confirmed'}
            </Text>
          </View>
        </Card>

        {/* Reminder */}
        <View style={styles.reminderCard}>
          <Ionicons name="notifications-outline" size={16} color={Colors.accent.primary} />
          <Text style={styles.reminderText}>
            {isPendingConfirmation
              ? 'Your therapist needs to confirm this slot first. We will keep this request in your Sessions tab.'
              : 'You can join the waiting room 5 minutes before your session starts.'}
          </Text>
        </View>

        <Card style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>What happens next</Text>
          <StepRow icon="checkmark-circle-outline" label="Booking request saved" done />
          <StepRow
            icon="time-outline"
            label="Therapist confirms your slot"
            done={!isPendingConfirmation}
          />
          <StepRow icon="videocam-outline" label="Join from Sessions when ready" done={!isPendingConfirmation} />
          <Text style={styles.timelineHint}>{careBuddyLine('reassure')}</Text>
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Message therapist"
            variant="secondary"
            onPress={() => navigation.navigate('MessagesTab')}
          />
          <Button
            title="Go to sessions"
            onPress={() => {
              navigation.popToTop();
              navigation.navigate('SessionsTab');
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.status.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  pendingCircle: {
    backgroundColor: Colors.status.warning,
  },
  title: { ...Typography.title1, color: Colors.text.primary, marginBottom: Spacing.xs },
  subtitle: { ...Typography.body, color: Colors.text.secondary, marginBottom: Spacing.xl },
  detailsCard: { width: '100%', marginBottom: Spacing.md },
  therapistRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  therapistInfo: { flex: 1 },
  therapistName: { ...Typography.bodySemibold, color: Colors.text.primary },
  therapistRole: { ...Typography.caption, color: Colors.text.secondary },
  divider: {
    height: 1,
    backgroundColor: Colors.ui.divider,
    marginVertical: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  detailText: { ...Typography.body, color: Colors.text.primary },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: Colors.accent.soft,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    width: '100%',
    marginBottom: Spacing.xl,
  },
  reminderText: { ...Typography.caption, color: Colors.accent.dark, flex: 1, lineHeight: 18 },
  timelineCard: {
    width: '100%',
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  timelineTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  stepLabel: {
    ...Typography.caption,
    color: Colors.text.primary,
  },
  stepDone: {
    color: Colors.status.success,
  },
  timelineHint: {
    ...Typography.caption,
    color: Colors.accent.primary,
    marginTop: Spacing.xs,
  },
  actions: { width: '100%', gap: Spacing.sm },
});

const StepRow: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; done: boolean }> = ({ icon, label, done }) => (
  <View style={styles.stepRow}>
    <Ionicons name={icon} size={16} color={done ? Colors.status.success : Colors.text.tertiary} />
    <Text style={[styles.stepLabel, done && styles.stepDone]}>{label}</Text>
  </View>
);
