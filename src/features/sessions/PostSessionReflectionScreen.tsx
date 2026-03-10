import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { scheduleAdaptiveWellbeingReminders } from '../../core/utils/wellbeingNotifications';
import { supabase } from '../../services/supabase';
import { createCareNudgeEvent, ensureConversation } from '../../core/services/careFlowService';
import { careBuddyLine } from '../../core/utils/careBuddy';
import * as Haptics from 'expo-haptics';

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

const moodToScore = (mood: string) => {
  if (mood === 'Relieved') return 78;
  if (mood === 'Calm') return 68;
  if (mood === 'Unsure') return 56;
  return 42;
};

export const PostSessionReflectionScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { user, isTherapistMode } = useAuth();
  const session = route.params?.session as ReflectionSessionPayload;

  const [mood, setMood] = useState<string | null>(null);
  const [takeaway, setTakeaway] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [followUpSent, setFollowUpSent] = useState(false);

  const reflectionSummary = useMemo(() => {
    return `Post-session reflection\nTakeaway: ${takeaway.trim() || '-'}\nNext action: ${nextAction.trim() || '-'}`;
  }, [nextAction, takeaway]);

  const goToSessions = () => {
    navigation.navigate('Main', { screen: 'SessionsTab', params: { initialTab: 'past' } });
  };

  const saveClientReflection = async () => {
    if (!user || !mood) {
      Alert.alert('Add reflection', 'Choose how you are feeling after the session.');
      return;
    }

    if (!takeaway.trim() || !nextAction.trim()) {
      Alert.alert('Almost there', 'Please add one takeaway and one next action.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('client_metrics').insert({
        user_id: user.id,
        mood,
        stress_level: moodToStress(mood),
        sleep_hours: 7,
        journal_entry: reflectionSummary,
        care_score_snapshot: moodToScore(mood),
      });

      if (error) throw error;

      await scheduleAdaptiveWellbeingReminders(user.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Reflection captured. Great work showing up for yourself.');
      goToSessions();
    } catch (err: any) {
      Alert.alert('Unable to save', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
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
      Alert.alert('Sent', 'Follow-up nudge delivered to the client chat.');
    } catch (err: any) {
      Alert.alert('Unable to send', err.message || 'Please try again.');
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
      Alert.alert('Saved', 'Follow-up marked as sent.');
    } catch (err: any) {
      Alert.alert('Unable to mark', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Button title="Back" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
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
              <Text style={styles.helperText}>{careBuddyLine('reflect')}</Text>
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
          </>
        ) : (
          <>
            <Card>
              <Text style={styles.sectionTitle}>Quick follow-up for {session.participant_name || 'client'}</Text>
              <Text style={styles.helperText}>
                Send a warm nudge, then mark the follow-up as complete for your dashboard trail.
              </Text>

              <TouchableOpacity
                style={[styles.actionBtn, followUpSent && styles.actionBtnDisabled]}
                disabled={saving || followUpSent}
                onPress={sendTherapistFollowUp}
              >
                <Ionicons name="paper-plane-outline" size={16} color={Colors.text.inverse} />
                <Text style={styles.actionBtnText}>Send follow-up nudge</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.markBtn, followUpSent && styles.actionBtnDisabled]}
                disabled={saving || followUpSent}
                onPress={markFollowUp}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={Colors.accent.primary} />
                <Text style={styles.markBtnText}>Mark follow-up as sent</Text>
              </TouchableOpacity>
            </Card>

            <Button title="Done" onPress={goToSessions} />
          </>
        )}
      </ScrollView>
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
    backgroundColor: Colors.bg.secondary,
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
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
    color: Colors.text.primary,
  },
  helperText: {
    ...Typography.caption,
    color: Colors.accent.primary,
    marginBottom: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
  },
  actionBtnText: {
    ...Typography.bodySemibold,
    color: Colors.text.inverse,
  },
  markBtn: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.bg.secondary,
  },
  markBtnText: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
});
