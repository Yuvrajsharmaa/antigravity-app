import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../../core/theme';
import { supabase } from '../../../services/supabase';
import { useAuth } from '../../../core/context/AuthContext';
import { BackendSetupCard } from '../../../core/components';
import { assessCareRisk } from '../../../core/utils/careRisk';
import {
  scheduleAdaptiveWellbeingReminders,
  triggerSupportiveNudgeNotification,
} from '../../../core/utils/wellbeingNotifications';

interface DailyCheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  backendReady: boolean;
  setupIssue: string | null;
  onRetrySetup: () => void;
}

const MOODS = ['Happy', 'Neutral', 'Sad', 'Anxious', 'Angry'];

export const DailyCheckInModal: React.FC<DailyCheckInModalProps> = ({
  visible,
  onClose,
  onSuccess,
  backendReady,
  setupIssue,
  onRetrySetup,
}) => {
  const { user } = useAuth();
  const [mood, setMood] = useState<string | null>(null);
  const [stress, setStress] = useState(3);
  const [sleep, setSleep] = useState('7');
  const [journal, setJournal] = useState('');
  const [loading, setLoading] = useState(false);

  const calculateCareScore = (selectedMood: string, stressLvl: number, sleepHrs: number) => {
    let score = 50; // Base score
    if (selectedMood === 'Happy') score += 20;
    else if (selectedMood === 'Neutral') score += 10;
    else if (selectedMood === 'Sad') score -= 10;
    else if (selectedMood === 'Anxious') score -= 15;
    else if (selectedMood === 'Angry') score -= 20;

    // Stress (1-5), lower is better
    score += (3 - stressLvl) * 5; 

    // Sleep (optimal 7-9)
    if (sleepHrs >= 7 && sleepHrs <= 9) score += 15;
    else if (sleepHrs >= 5 && sleepHrs < 7) score += 5;
    else score -= 10;

    // Journaling adds a small bonus
    if (journal.trim().length > 10) score += 5;

    return Math.max(0, Math.min(100, score));
  };

  const handleSave = async () => {
    if (!backendReady) {
      Alert.alert('Setup required', setupIssue || 'Backend is not ready. Please run migration and retry.');
      return;
    }

    if (!user || !mood) {
      Alert.alert('Missing Info', 'Please select a mood to continue.');
      return;
    }

    const sleepNum = parseFloat(sleep.replace(',', '.'));
    if (Number.isNaN(sleepNum) || sleepNum <= 0 || sleepNum > 24) {
      Alert.alert('Invalid sleep input', 'Enter a valid sleep duration between 0 and 24 hours.');
      return;
    }

    setLoading(true);
    try {
      const score = calculateCareScore(mood, stress, sleepNum);

      const { error } = await supabase.from('client_metrics').insert({
        user_id: user.id,
        mood,
        stress_level: stress,
        sleep_hours: sleepNum,
        journal_entry: journal.trim() || null,
        care_score_snapshot: score
      });

      if (error) throw error;

      const { data: riskMetrics } = await supabase
        .from('client_metrics')
        .select('created_at, stress_level, care_score_snapshot')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const risk = assessCareRisk(riskMetrics || []);
      if (risk.level === 'high') {
        const supportiveMessage =
          'Your recent check-in suggests you might need extra support. We gently notified your therapist.';

        const { data: conversations } = await supabase
          .from('conversations')
          .select('therapist_id')
          .eq('user_id', user.id);

        const events = (conversations || [])
          .map((row) => row.therapist_id)
          .filter(Boolean)
          .map((therapistId) => ({
            user_id: user.id,
            therapist_id: therapistId,
            trigger_type: 'care_score_high_risk',
            risk_level: 'high',
            source: 'system_auto',
            message_preview: supportiveMessage,
          }));

        if (events.length > 0) {
          await supabase.from('care_nudge_events').insert(events);
        }

        await triggerSupportiveNudgeNotification();
      }

      await scheduleAdaptiveWellbeingReminders(user.id);
      
      onSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save check-in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.avoidingView}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Daily Check-in</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{top:10,right:10,bottom:10,left:10}}>
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
              {setupIssue ? (
                <BackendSetupCard
                  title="Mood Tracking Setup Required"
                  message={setupIssue}
                  onRetry={onRetrySetup}
                />
              ) : (
                <>
                  <Text style={styles.label}>How are you feeling today?</Text>
                  <View style={styles.moodRow}>
                    {MOODS.map(m => (
                      <TouchableOpacity 
                        key={m} 
                        style={[styles.moodBtn, mood === m && styles.moodBtnActive]}
                        onPress={() => setMood(m)}
                      >
                        <Text style={[styles.moodText, mood === m && styles.moodTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Stress Level (1-5)</Text>
                  <View style={styles.stressRow}>
                    {[1,2,3,4,5].map(lvl => (
                      <TouchableOpacity 
                        key={lvl} 
                        style={[styles.stressBtn, stress === lvl && styles.stressBtnActive]}
                        onPress={() => setStress(lvl)}
                      >
                        <Text style={[styles.stressText, stress === lvl && styles.stressTextActive]}>{lvl}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Hours of Sleep</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="e.g. 7.5"
                    placeholderTextColor={Colors.text.tertiary}
                    keyboardType="numeric"
                    value={sleep}
                    onChangeText={setSleep}
                  />

                  <Text style={styles.label}>Journal (Optional)</Text>
                  <TextInput 
                    style={[styles.input, styles.textArea]}
                    placeholder="Write down any thoughts..."
                    placeholderTextColor={Colors.text.tertiary}
                    multiline
                    numberOfLines={4}
                    value={journal}
                    onChangeText={setJournal}
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, (!mood || loading || !backendReady || !!setupIssue) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!mood || loading || !backendReady || !!setupIssue}
              >
                <Text style={styles.saveBtnText}>
                  {setupIssue ? 'Setup required' : loading ? 'Saving...' : 'Complete Check-in'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  avoidingView: {
    width: '100%',
    maxHeight: '90%',
  },
  sheet: {
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.title2,
    color: Colors.text.primary,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  label: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    marginTop: Spacing.sm,
  },
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  moodBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.bg.secondary,
  },
  moodBtnActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  moodText: {
    ...Typography.bodySemibold,
    color: Colors.text.secondary,
  },
  moodTextActive: {
    color: Colors.text.inverse,
  },
  stressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stressBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
  },
  stressBtnActive: {
    backgroundColor: Colors.status.warning,
    borderColor: Colors.status.warning,
  },
  stressText: {
    ...Typography.bodySemibold,
    color: Colors.text.secondary,
  },
  stressTextActive: {
    color: Colors.text.inverse,
  },
  input: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  saveBtn: {
    backgroundColor: Colors.accent.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    ...Typography.bodySemibold,
    color: Colors.text.inverse,
  },
});
