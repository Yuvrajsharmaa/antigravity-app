import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button, Card, Avatar, PillChip, LoadingState, ErrorState, CoveModal } from '../../core/components';
import {
  ActiveTherapistLock,
  Therapist,
  AvailabilitySlot,
  MatchReasonChip,
  CoveModalAction,
  CoveModalVariant,
} from '../../core/models/types';
import { supabase } from '../../services/supabase';
import { careBuddyLine } from '../../core/utils/careBuddy';
import { useAuth } from '../../core/context/AuthContext';
import {
  ensureConversation,
  fetchActiveTherapistLock,
  setTherapistLockAction,
} from '../../core/services/careFlowService';
import { TherapistProfileRouteParams } from '../../navigation/types';
import { navigateBackSafe } from '../../navigation/safeBack';

export const TherapistProfileScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { user } = useAuth();
  const { therapist, matchReasonChips } = (route.params || {}) as TherapistProfileRouteParams;
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [activeLock, setActiveLock] = useState<ActiveTherapistLock | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
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

  const showModal = (
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
  };

  useEffect(() => {
    if (therapist?.id) {
      fetchSlots();
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    refreshLockState();
  }, [user?.id]);

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

  const startChat = async () => {
    if (!user?.id || !therapist?.id) return;
    setOpeningChat(true);
    try {
      const conversationId = await ensureConversation({
        userId: user.id,
        therapistId: therapist.id,
      });
      navigation.navigate('MessagesTab', {
        screen: 'Chat',
        params: {
          conversationId,
          therapistName: therapist.display_name,
          therapistAvatar: therapist.avatar_url,
          therapistId: therapist.id,
        },
      });
    } catch (error: any) {
      showModal('error', 'Unable to open chat', error.message || 'Please try again.');
    } finally {
      setOpeningChat(false);
    }
  };

  const refreshLockState = async () => {
    if (!user?.id) return;
    try {
      const lock = await fetchActiveTherapistLock(user.id);
      setActiveLock(lock);
    } catch {
      setActiveLock(null);
    }
  };

  const lockTherapist = async () => {
    if (!user?.id || !therapist?.id) return;
    const sameLock = activeLock?.therapist_id === therapist.id;
    if (sameLock) {
      showModal('info', 'Already locked', `${therapist.display_name} is already your primary therapist.`);
      return;
    }

    const isSwitch = Boolean(activeLock?.therapist_id && activeLock.therapist_id !== therapist.id);
    showModal(
      'confirm',
      isSwitch ? 'Switch primary therapist?' : 'Lock this therapist?',
      isSwitch
        ? `${activeLock?.therapist_name} will be replaced as your primary therapist.`
        : `${therapist.display_name} will become your primary therapist.`,
      {
        label: isSwitch ? 'Switch' : 'Lock therapist',
        onPress: async () => {
          setLockBusy(true);
          try {
            await setTherapistLockAction({
              userId: user.id,
              therapistId: therapist.id,
              action: isSwitch ? 'switch' : 'lock',
              switchReason: isSwitch ? 'Client switched therapist' : null,
            });
            setModalState((prev) => ({ ...prev, visible: false }));
            await refreshLockState();
            showModal('success', 'Saved', `${therapist.display_name} is now your primary therapist.`);
          } catch (error: any) {
            showModal('error', 'Unable to update', error.message || 'Please try again.');
          } finally {
            setLockBusy(false);
          }
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  };

  const keepExploring = async () => {
    if (!user?.id || !therapist?.id) return;
    showModal(
      'confirm',
      'Keep exploring?',
      'This therapist will no longer be marked as primary.',
      {
        label: 'Keep exploring',
        onPress: async () => {
          setLockBusy(true);
          try {
            await setTherapistLockAction({
              userId: user.id,
              therapistId: activeLock?.therapist_id || therapist.id,
              action: 'keep_exploring',
              switchReason: 'Client reopened exploration',
            });
            setModalState((prev) => ({ ...prev, visible: false }));
            await refreshLockState();
          } catch (error: any) {
            showModal('error', 'Unable to update', error.message || 'Please try again.');
          } finally {
            setLockBusy(false);
          }
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  };

  if (!therapist?.id) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ErrorState
          message="Therapist details are missing. Please return to Match and open a profile again."
          onRetry={() => navigateBackSafe(navigation, 'TherapistMatch')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigateBackSafe(navigation, 'TherapistMatch')}>
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
            <Text style={styles.sectionTitle}>Therapist preference</Text>
            {activeLock?.therapist_id === therapist.id ? (
              <>
                <Text style={styles.lockTitle}>Primary therapist set</Text>
                <Text style={styles.lockMeta}>You are currently locked with {therapist.display_name}.</Text>
                <View style={styles.lockActions}>
                  <Button
                    title="Keep exploring"
                    variant="secondary"
                    fullWidth={false}
                    onPress={keepExploring}
                    loading={lockBusy}
                    style={styles.lockActionBtn}
                  />
                  <Button
                    title="Message"
                    variant="ghost"
                    fullWidth={false}
                    onPress={startChat}
                    loading={openingChat}
                    style={styles.lockActionBtn}
                  />
                </View>
              </>
            ) : (
              <>
                {activeLock ? (
                  <Text style={styles.lockMeta}>
                    You are currently locked with {activeLock.therapist_name}. Switch if this therapist feels like a better fit.
                  </Text>
                ) : (
                  <Text style={styles.lockMeta}>No therapist is locked yet. You can keep exploring or lock when ready.</Text>
                )}
                <Button
                  title={activeLock ? 'Switch to this therapist' : 'Lock this therapist'}
                  fullWidth={false}
                  onPress={lockTherapist}
                  loading={lockBusy}
                  style={styles.singleLockBtn}
                />
              </>
            )}
          </Card>

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
          {matchReasonChips && matchReasonChips.length > 0 ? (
            <View style={styles.matchChipRow}>
              {matchReasonChips.map((chip) => (
                <View key={chip.id} style={styles.matchChip}>
                  <Text style={styles.matchChipText}>{chip.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
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
          title={openingChat ? 'Opening chat...' : 'Start chat'}
          variant="secondary"
          onPress={startChat}
          loading={openingChat}
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
    backgroundColor: Colors.ui.glass,
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
    marginBottom: Spacing.sm,
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
  lockTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    marginBottom: 2,
  },
  lockMeta: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  lockActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  lockActionBtn: {
    flex: 1,
  },
  singleLockBtn: {
    marginTop: Spacing.sm,
  },
  matchChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  matchChip: {
    backgroundColor: Colors.accent.soft,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  matchChipText: {
    ...Typography.caption,
    color: Colors.accent.dark,
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
