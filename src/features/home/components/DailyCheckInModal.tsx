import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../../core/theme';
import { supabase } from '../../../services/supabase';
import { useAuth } from '../../../core/context/AuthContext';

interface DailyCheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MOODS = ['Happy', 'Neutral', 'Sad', 'Anxious', 'Angry'];

export const DailyCheckInModal: React.FC<DailyCheckInModalProps> = ({ visible, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [mood, setMood] = useState<string | null>(null);
  const [stress, setStress] = useState(3);
  const [sleep, setSleep] = useState('7');
  const [journal, setJournal] = useState('');
  const [loading, setLoading] = useState(false);

  const calculateFreudScore = (selectedMood: string, stressLvl: number, sleepHrs: number) => {
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
    if (!user || !mood) {
      Alert.alert('Missing Info', 'Please select a mood to continue.');
      return;
    }

    setLoading(true);
    try {
      const sleepNum = parseFloat(sleep) || 0;
      const score = calculateFreudScore(mood, stress, sleepNum);

      const { error } = await supabase.from('client_metrics').insert({
        user_id: user.id,
        mood,
        stress_level: stress,
        sleep_hours: sleepNum,
        journal_entry: journal.trim() || null,
        freud_score_snapshot: score
      });

      if (error) throw error;
      
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

              <TouchableOpacity 
                style={[styles.saveBtn, (!mood || loading) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!mood || loading}
              >
                <Text style={styles.saveBtnText}>{loading ? 'Saving...' : 'Complete Check-in'}</Text>
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
