import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CoveModal } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { supabase } from '../../services/supabase';
import {
  createCareNudgeEvent,
  createJournalEntry,
  ensureConversation,
  fetchActiveTherapistLock,
  setTherapistLockAction,
} from '../../core/services/careFlowService';
import { calculateCareScore } from '../../core/utils/careScore';
import * as Haptics from 'expo-haptics';
import { ActiveTherapistLock, CoveModalAction, CoveModalVariant } from '../../core/models/types';
import { navigateBackSafe } from '../../navigation/safeBack';

interface ReflectionSessionPayload {
  id: string | null;
  booking_id: string;
  participant_id?: string;
  participant_name?: string;
}

const REFLECTION_MOODS = ['Relieved', 'Calm', 'Unsure', 'Overwhelmed'];

const moodToStress = (mood: string) => {
  if (mood === 'Relieved') return 1;
  if (mood === 'Calm') return 2;
  if (mood === 'Unsure') return 3;
  return 4;
};

const moodToScoreSource = (mood: string) => (mood === 'Relieved' ? 'Calm' : mood);

export const PostSessionReflectionScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { user, isTherapistMode } = useAuth();
  const session = route.params?.session as ReflectionSessionPayload;

  const [mood, setMood] = useState<string | null>(null);
  const [takeaway, setTakeaway] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [followUpSent, setFollowUpSent] = useState(false);
  const [activeLock, setActiveLock] = useState<ActiveTherapistLock | null>(null);
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

  const reflectionSummary = useMemo(() => {
    return `${takeaway.trim()}\n\nNext step: ${nextAction.trim()}`;
  }, [nextAction, takeaway]);

  useEffect(() => {
    if (!user?.id || isTherapistMode) return;
    fetchActiveTherapistLock(user.id)
      .then(setActiveLock)
      .catch(() => setActiveLock(null));
  }, [isTherapistMode, user?.id]);

  const goToSessions = () => {
    navigation.navigate('Main', { screen: 'SessionsTab', params: { initialTab: 'past' } });
  };

  const saveClientReflection = async () => {
    if (!user || !mood) {
      showModal('blocking', 'Add reflection', 'Choose how you are feeling after the session.');
      return;
    }

    if (!takeaway.trim() || !nextAction.trim()) {
      showModal('blocking', 'Almost there', 'Please add one takeaway and one next action.');
      return;
    }

    setSaving(true);
    try {
      const inferredScore = calculateCareScore({
        mood: moodToScoreSource(mood),
        stressLevel: moodToStress(mood),
        sleepHours: 7,
      });

      await createJournalEntry({
        userId: user.id,
        entryType: 'post_session_reflection',
        title: 'Post-session reflection',
        body: reflectionSummary,
        mood,
        stressLevel: moodToStress(mood),
        sleepHours: null,
        careScoreSnapshot: inferredScore,
        sessionId: session.id || null,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showModal('success', 'Saved', 'Your post-session reflection is saved.');
      goToSessions();
    } catch (err: any) {
      showModal('error', 'Unable to save', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const lockTherapistFromSession = async () => {
    if (!user?.id || !session.participant_id || isTherapistMode) return;
    const alreadyLocked = activeLock?.therapist_id === session.participant_id;
    if (alreadyLocked) {
      showModal('info', 'Already set', `${session.participant_name || 'This therapist'} is already your primary therapist.`);
      return;
    }

    const switching = Boolean(activeLock?.therapist_id && activeLock.therapist_id !== session.participant_id);
    showModal(
      'confirm',
      switching ? 'Switch primary therapist?' : 'Set as primary therapist?',
      switching
        ? `${activeLock?.therapist_name} will be replaced as your primary therapist.`
        : `You can still change this later from Profile.`,
      {
        label: switching ? 'Switch' : 'Set primary',
        onPress: async () => {
          try {
            await setTherapistLockAction({
              userId: user.id,
              therapistId: session.participant_id as string,
              action: switching ? 'switch' : 'lock',
              switchReason: switching ? 'Client switched after session' : null,
            });
            setModalState((prev) => ({ ...prev, visible: false }));
            const lock = await fetchActiveTherapistLock(user.id);
            setActiveLock(lock);
            showModal('success', 'Saved', `${session.participant_name || 'Therapist'} is now your primary therapist.`);
          } catch (err: any) {
            showModal('error', 'Unable to save', err.message || 'Please try again.');
          }
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  };

  const findOrCreateConversation = async () => {
    if (!user || !session.participant_id) return null;
    return ensureConversation({
      userId: session.participant_id,
      therapistId: user.id,
    });
  };

  const sendTherapistFollowUp = async () => {
    if (!user || !session.participant_id) return;

    setSaving(true);
    try {
      const conversationId = await findOrCreateConversation();
      if (!conversationId) throw new Error('Missing conversation channel.');

      const body = `Hi ${session.participant_name || 'there'}, thank you for today. How are you feeling after the session, and would you like a small check-in tomorrow?`;

      const { error: msgError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
        message_type: 'text',
      });

      if (msgError) throw msgError;

      const { error: updateConvError } = await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (updateConvError) throw updateConvError;

      await createCareNudgeEvent({
        userId: session.participant_id,
        therapistId: user.id,
        triggerType: 'followup_sent',
        riskLevel: 'stable',
        source: 'therapist_manual',
        messagePreview: 'Post-session follow-up sent by therapist',
      });

      setFollowUpSent(true);
      showModal('success', 'Sent', 'Follow-up nudge delivered to the client chat.');
    } catch (err: any) {
      showModal('error', 'Unable to send', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const markFollowUp = async () => {
    if (!user || !session.participant_id) return;

    setSaving(true);
    try {
      await createCareNudgeEvent({
        userId: session.participant_id,
        therapistId: user.id,
        triggerType: 'followup_marked',
        riskLevel: 'stable',
        source: 'therapist_manual',
        messagePreview: 'Therapist marked post-session follow-up as sent',
      });

      setFollowUpSent(true);
      showModal('success', 'Saved', 'Follow-up marked as sent.');
    } catch (err: any) {
      showModal('error', 'Unable to mark', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => navigateBackSafe(navigation, 'Main', { screen: 'SessionsTab' })} />
        <Text style={styles.title}>{isTherapistMode ? 'Session Follow-up' : 'Post Session Reflection'}</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView
        style={styles.containerScroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {!isTherapistMode ? (
          <>
            <Card>
              <Text style={styles.sectionTitle}>How do you feel after this session?</Text>
              <View style={styles.chipsRow}>
                {REFLECTION_MOODS.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.chip, mood === item && styles.chipActive]}
                    onPress={() => setMood(item)}
                  >
                    <Text style={[styles.chipText, mood === item && styles.chipTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>One key takeaway</Text>
              <TextInput
                style={styles.input}
                placeholder="What stood out for you today?"
                placeholderTextColor={Colors.text.tertiary}
                value={takeaway}
                onChangeText={setTakeaway}
              />

              <Text style={[styles.sectionTitle, { marginTop: Spacing.md }]}>One next action</Text>
              <TextInput
                style={styles.input}
                placeholder="What will you do before your next session?"
                placeholderTextColor={Colors.text.tertiary}
                value={nextAction}
                onChangeText={setNextAction}
              />
            </Card>

            <Button title={saving ? 'Saving...' : 'Save reflection'} onPress={saveClientReflection} loading={saving} />

            {session.participant_id ? (
              <Button
                title={
                  activeLock?.therapist_id === session.participant_id
                    ? 'Primary therapist set'
                    : 'Set as primary therapist'
                }
                onPress={lockTherapistFromSession}
                variant="secondary"
                icon={<Ionicons name="checkmark-circle-outline" size={18} color={Colors.text.primary} />}
                style={{ marginTop: Spacing.sm }}
              />
            ) : null}
          </>
        ) : (
          <>
            <Card>
              <Text style={styles.sectionTitle}>Quick follow-up for {session.participant_name || 'client'}</Text>
              <Text style={styles.helperText}>
                Send a warm nudge, then mark the follow-up as complete for your dashboard trail.
              </Text>

              <Button
                title="Send follow-up nudge"
                onPress={sendTherapistFollowUp}
                variant="primary"
                icon={<Ionicons name="paper-plane-outline" size={16} color={Colors.text.inverse} />}
                loading={saving}
                disabled={saving || followUpSent}
              />

              <Button
                title="Mark follow-up as sent"
                onPress={markFollowUp}
                variant="secondary"
                icon={<Ionicons name="checkmark-circle-outline" size={18} color={Colors.text.primary} />}
                loading={saving}
                disabled={saving || followUpSent}
                style={{ marginTop: Spacing.sm }}
              />
            </Card>

            <Button title="Done" onPress={goToSessions} />
          </>
        )}
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  container: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xxxxl + 24,
  },
  containerScroll: {
    flex: 1,
  },
  sectionTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.ui.glass,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  chipActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.soft,
  },
  chipText: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  chipTextActive: {
    color: Colors.accent.dark,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
    color: Colors.text.primary,
  },
  helperText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
  },
});
