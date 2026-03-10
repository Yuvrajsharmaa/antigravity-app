import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Button, PillChip, Card } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { supabase } from '../../services/supabase';
import { Ionicons } from '@expo/vector-icons';

const INTENT_OPTIONS = [
  'Anxiety / Stress',
  'Feeling low / Lonely',
  'Relationship issues',
  'Work / Career confusion',
  'Just need someone to talk to',
];

const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Both'];
const SESSION_PREF_OPTIONS = ['Chat', 'Video', 'Both'];

export const OnboardingScreen: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [selectedIntents, setSelectedIntents] = useState<string[]>([]);
  const [language, setLanguage] = useState('English');
  const [sessionPref, setSessionPref] = useState('Both');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedNotEmergency, setAgreedNotEmergency] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleIntent = (intent: string) => {
    setSelectedIntents((prev) =>
      prev.includes(intent) ? prev.filter((i) => i !== intent) : [...prev, intent],
    );
  };

  const canProceed = () => {
    switch (step) {
      case 0: return firstName.trim().length >= 2;
      case 1: return selectedIntents.length > 0;
      case 2: return true;
      case 3: return agreedTerms && agreedNotEmergency;
      default: return false;
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Update profile
      await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          display_name: firstName.trim(),
          onboarding_completed: true,
        })
        .eq('id', user.id);

      // Create preferences
      await supabase.from('user_preferences').upsert({
        user_id: user.id,
        intent_tags: selectedIntents,
        session_preference: sessionPref.toLowerCase() as 'chat' | 'video' | 'both',
      });

      await refreshProfile();
    } catch (err) {
      Alert.alert('Error', 'Something went wrong saving your preferences.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What should we call you?</Text>
            <Text style={styles.stepSubtitle}>Just your first name is fine.</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Your first name"
              placeholderTextColor={Colors.text.tertiary}
              value={firstName}
              onChangeText={setFirstName}
              autoFocus
              autoCapitalize="words"
            />
          </View>
        );
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What brings you here?</Text>
            <Text style={styles.stepSubtitle}>Pick as many as you like. This helps us suggest therapists.</Text>
            <View style={styles.chipsWrap}>
              {INTENT_OPTIONS.map((intent) => (
                <PillChip
                  key={intent}
                  label={intent}
                  selected={selectedIntents.includes(intent)}
                  onPress={() => toggleIntent(intent)}
                  style={styles.intentChip}
                />
              ))}
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Your preferences</Text>
            <Text style={styles.stepSubtitle}>We'll use these to personalise your experience.</Text>

            <Text style={styles.fieldLabel}>Preferred language</Text>
            <View style={styles.optionRow}>
              {LANGUAGE_OPTIONS.map((opt) => (
                <PillChip
                  key={opt}
                  label={opt}
                  selected={language === opt}
                  onPress={() => setLanguage(opt)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Session preference</Text>
            <View style={styles.optionRow}>
              {SESSION_PREF_OPTIONS.map((opt) => (
                <PillChip
                  key={opt}
                  label={opt}
                  selected={sessionPref === opt}
                  onPress={() => setSessionPref(opt)}
                />
              ))}
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Almost there</Text>
            <Text style={styles.stepSubtitle}>Please review and agree to continue.</Text>

            <Card style={styles.disclaimerCard}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.accent.primary} />
              <Text style={styles.disclaimerText}>
                Antigravity connects you with qualified psychologists. This is not a substitute for emergency services or psychiatric treatment.
              </Text>
            </Card>

            <CheckBox
              checked={agreedNotEmergency}
              onPress={() => setAgreedNotEmergency(!agreedNotEmergency)}
              label="I understand this is not emergency support"
            />
            <CheckBox
              checked={agreedTerms}
              onPress={() => setAgreedTerms(!agreedTerms)}
              label="I agree to the terms of service"
            />
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i <= step ? styles.progressActive : styles.progressInactive,
            ]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderStep()}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        {step > 0 && (
          <Button
            title="Back"
            variant="ghost"
            onPress={() => setStep(step - 1)}
            fullWidth={false}
            style={styles.backBtn}
          />
        )}
        <View style={styles.flex}>
          <Button
            title={step === 3 ? "Let's go" : 'Continue'}
            onPress={step === 3 ? handleComplete : () => setStep(step + 1)}
            disabled={!canProceed()}
            loading={loading}
            size="lg"
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

// Simple checkbox component
const CheckBox: React.FC<{ checked: boolean; onPress: () => void; label: string }> = ({
  checked,
  onPress,
  label,
}) => (
  <View style={checkStyles.row}>
    <View style={[checkStyles.box, checked && checkStyles.checked]}>
      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
    </View>
    <Text style={checkStyles.label} onPress={onPress}>{label}</Text>
  </View>
);

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.stroke.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  label: {
    ...Typography.body,
    color: Colors.text.primary,
    flex: 1,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  flex: { flex: 1 },
  progressContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressActive: {
    backgroundColor: Colors.accent.primary,
  },
  progressInactive: {
    backgroundColor: Colors.stroke.subtle,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    ...Typography.title1,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  nameInput: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.md,
    height: 52,
    ...Typography.body,
    color: Colors.text.primary,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  intentChip: {
    marginBottom: Spacing.xxs,
  },
  fieldLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  disclaimerCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
    backgroundColor: Colors.accent.soft,
    borderColor: Colors.accent.primary + '20',
  },
  disclaimerText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    flex: 1,
    lineHeight: 18,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.primary,
    gap: Spacing.sm,
  },
  backBtn: {
    paddingHorizontal: Spacing.md,
  },
});
