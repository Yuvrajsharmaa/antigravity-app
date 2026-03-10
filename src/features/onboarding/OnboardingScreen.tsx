import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import {
  ensureNotificationPermission,
  scheduleAdaptiveWellbeingReminders,
} from '../../core/utils/wellbeingNotifications';
import { supabase } from '../../services/supabase';

const CLIENT_INTENTS = [
  'I feel anxious or stressed',
  'I feel low or emotionally heavy',
  'Relationship issues',
  'Work or career stress',
  'I feel lonely',
  'I just need someone to talk to',
];

const THERAPIST_SPECIALTIES = [
  'anxiety',
  'stress',
  'relationships',
  'self-esteem',
  'grief',
  'work-stress',
  'mindfulness',
];

const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Both'];
const SESSION_PREF_OPTIONS = ['Chat', 'Video', 'Both'];
const GENDER_PREF_OPTIONS = [
  { label: 'No preference', value: 'no_preference' },
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Non-binary', value: 'non_binary' },
] as const;
const TIME_PREF_OPTIONS = [
  { label: 'Morning', value: 'morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
  { label: 'Flexible', value: 'flexible' },
] as const;
const CARE_STYLE_OPTIONS = ['Gentle', 'Direct', 'Structured', 'Reflective'];
const REFLECTION_MOODS = ['Calm', 'Low', 'Anxious', 'Overwhelmed', 'Numb', 'Hopeful'];
const JOURNAL_SHARE_OPTIONS = [
  { label: 'Summary only', value: 'summary' },
  { label: 'Only when I choose', value: 'entry_by_entry' },
  { label: 'Share all', value: 'all' },
  { label: 'Do not share', value: 'none' },
] as const;
const REMINDER_TIMES = ['09:00:00', '14:00:00', '19:00:00'];
const QUIET_START_OPTIONS = ['20:00:00', '21:00:00', '22:00:00'];
const QUIET_END_OPTIONS = ['07:00:00', '08:00:00', '09:00:00'];
const THERAPIST_STYLE_OPTIONS = ['Warm and conversational', 'Structured and goal-focused', 'Mindfulness-led'];

const asTimeLabel = (value: string) => value.slice(0, 5);

const normalizeIntentTag = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-');

const calculateCareScore = (mood: string, stressLevel: number, sleepHours: number, note: string) => {
  let score = 50;

  if (mood === 'Calm' || mood === 'Hopeful') score += 16;
  if (mood === 'Low') score -= 10;
  if (mood === 'Anxious') score -= 12;
  if (mood === 'Overwhelmed') score -= 16;
  if (mood === 'Numb') score -= 8;

  score += (3 - stressLevel) * 5;

  if (sleepHours >= 7 && sleepHours <= 9) score += 14;
  else if (sleepHours >= 5) score += 4;
  else score -= 8;

  if (note.trim().length > 12) score += 3;

  return Math.max(0, Math.min(100, score));
};

export const OnboardingScreen: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const isTherapistFlow = profile?.role === 'therapist';

  const totalSteps = isTherapistFlow ? 5 : 6;
  const fade = useRef(new Animated.Value(1)).current;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [selectedIntents, setSelectedIntents] = useState<string[]>([]);
  const [language, setLanguage] = useState('English');
  const [sessionPref, setSessionPref] = useState('Both');
  const [genderPreference, setGenderPreference] = useState<(typeof GENDER_PREF_OPTIONS)[number]['value']>('no_preference');
  const [timePreference, setTimePreference] = useState<(typeof TIME_PREF_OPTIONS)[number]['value']>('evening');
  const [careStylePreference, setCareStylePreference] = useState('Gentle');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('19:00:00');
  const [quietStart, setQuietStart] = useState('21:00:00');
  const [quietEnd, setQuietEnd] = useState('08:00:00');
  const [journalEnabled, setJournalEnabled] = useState(false);
  const [journalSharing, setJournalSharing] = useState<(typeof JOURNAL_SHARE_OPTIONS)[number]['value']>('summary');
  const [checkInMood, setCheckInMood] = useState<string | null>(null);
  const [checkInStress, setCheckInStress] = useState(3);
  const [checkInSleep, setCheckInSleep] = useState('7');
  const [checkInNote, setCheckInNote] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedNotEmergency, setAgreedNotEmergency] = useState(false);

  const [headline, setHeadline] = useState('');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [therapistLanguages, setTherapistLanguages] = useState<string[]>(['English']);
  const [communicationStyle, setCommunicationStyle] = useState(THERAPIST_STYLE_OPTIONS[0]);
  const [agreedConfidentiality, setAgreedConfidentiality] = useState(false);
  const [agreedBoundaries, setAgreedBoundaries] = useState(false);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 110, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [fade, step]);

  const welcomeTitle = useMemo(() => {
    if (isTherapistFlow) return 'Welcome to your Care Space practice';
    return 'Talk to a qualified psychologist, without awkward admin';
  }, [isTherapistFlow]);

  const toggleTag = (value: string, list: string[], setter: (value: string[]) => void, limit?: number) => {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value));
      return;
    }

    if (limit && list.length >= limit) return;
    setter([...list, value]);
  };

  const canProceed = () => {
    if (isTherapistFlow) {
      switch (step) {
        case 0:
          return true;
        case 1:
          return firstName.trim().length >= 2 && headline.trim().length >= 8;
        case 2:
          return selectedSpecialties.length > 0 && therapistLanguages.length > 0;
        case 3:
          return sessionPref.length > 0 && communicationStyle.length > 0;
        case 4:
          return agreedConfidentiality && agreedBoundaries;
        default:
          return false;
      }
    }

    switch (step) {
      case 0:
        return true;
      case 1:
        return firstName.trim().length >= 2;
      case 2:
        return selectedIntents.length > 0;
      case 3:
        return language.length > 0 && sessionPref.length > 0;
      case 4:
        return true;
      case 5:
        return agreedTerms && agreedNotEmergency;
      default:
        return false;
    }
  };

  const saveInitialCheckInIfProvided = async (userId: string) => {
    const sleepNum = Number.parseFloat(checkInSleep.replace(',', '.'));
    if (!checkInMood || Number.isNaN(sleepNum) || sleepNum <= 0 || sleepNum > 24) return;

    const score = calculateCareScore(checkInMood, checkInStress, sleepNum, checkInNote);

    await supabase.from('client_metrics').insert({
      user_id: userId,
      mood: checkInMood,
      stress_level: checkInStress,
      sleep_hours: sleepNum,
      journal_entry: checkInNote.trim() || null,
      care_score_snapshot: score,
    });
  };

  const completeOnboarding = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const trimmedName = firstName.trim();

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: trimmedName || profile?.first_name || null,
          display_name: trimmedName || profile?.display_name || null,
          language: isTherapistFlow ? profile?.language || 'English' : language,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      const preferencePayload = {
        user_id: user.id,
        intent_tags: isTherapistFlow
          ? selectedSpecialties
          : selectedIntents.map((item) => normalizeIntentTag(item)),
        session_preference: sessionPref.toLowerCase() as 'chat' | 'video' | 'both',
        wellbeing_reminders_enabled: remindersEnabled,
        wellbeing_reminder_time: reminderTime,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
        therapist_gender_preference: genderPreference,
        time_preference: timePreference,
        care_style_preference: careStylePreference,
        journal_enabled: journalEnabled,
        journal_sharing: journalEnabled ? journalSharing : 'none',
      };

      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert(preferencePayload, { onConflict: 'user_id' });

      if (prefError) throw prefError;

      if (isTherapistFlow) {
        const { error: therapistError } = await supabase
          .from('therapists')
          .upsert(
            {
              id: user.id,
              headline: headline.trim(),
              bio: `${communicationStyle}. Focused on collaborative and evidence-based care.`,
              languages: therapistLanguages,
              specialties: selectedSpecialties,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          );

        if (therapistError) throw therapistError;
      } else {
        await saveInitialCheckInIfProvided(user.id);

        if (remindersEnabled) {
          await ensureNotificationPermission();
          await scheduleAdaptiveWellbeingReminders(user.id);
        }
      }

      await refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong saving onboarding.';
      Alert.alert('Unable to finish onboarding', message);
    } finally {
      setLoading(false);
    }
  };

  const renderClientStep = () => {
    switch (step) {
      case 0:
        return (
          <Card style={styles.heroCard}>
            <Ionicons name="leaf-outline" size={28} color={Colors.accent.primary} />
            <Text style={styles.heroTitle}>{welcomeTitle}</Text>
            <Text style={styles.heroSubtitle}>Private. Structured. No long-term commitment needed.</Text>
            <Text style={styles.heroEmergency}>This is not for emergencies.</Text>
          </Card>
        );
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What should we call you?</Text>
            <Text style={styles.stepSubtitle}>Just your first name is enough.</Text>
            <TextInput
              style={styles.input}
              placeholder="Your first name"
              placeholderTextColor={Colors.text.tertiary}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoFocus
            />
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What brings you here today?</Text>
            <Text style={styles.stepSubtitle}>Pick up to 2. This helps us match without forcing labels.</Text>
            <View style={styles.wrapRow}>
              {CLIENT_INTENTS.map((intent) => (
                <PillChip
                  key={intent}
                  label={intent}
                  selected={selectedIntents.includes(intent)}
                  onPress={() => toggleTag(intent, selectedIntents, setSelectedIntents, 2)}
                />
              ))}
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Preferences</Text>

            <Text style={styles.fieldLabel}>Language</Text>
            <View style={styles.row}>
              {LANGUAGE_OPTIONS.map((item) => (
                <PillChip key={item} label={item} selected={language === item} onPress={() => setLanguage(item)} />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Session mode</Text>
            <View style={styles.row}>
              {SESSION_PREF_OPTIONS.map((item) => (
                <PillChip key={item} label={item} selected={sessionPref === item} onPress={() => setSessionPref(item)} />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Therapist gender preference (optional)</Text>
            <View style={styles.wrapRow}>
              {GENDER_PREF_OPTIONS.map((item) => (
                <PillChip
                  key={item.value}
                  label={item.label}
                  selected={genderPreference === item.value}
                  onPress={() => setGenderPreference(item.value)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Preferred time</Text>
            <View style={styles.wrapRow}>
              {TIME_PREF_OPTIONS.map((item) => (
                <PillChip
                  key={item.value}
                  label={item.label}
                  selected={timePreference === item.value}
                  onPress={() => setTimePreference(item.value)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Care style</Text>
            <View style={styles.wrapRow}>
              {CARE_STYLE_OPTIONS.map((item) => (
                <PillChip
                  key={item}
                  label={item}
                  selected={careStylePreference === item}
                  onPress={() => setCareStylePreference(item)}
                />
              ))}
            </View>
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Quick check-in (light and optional)</Text>
            <Text style={styles.stepSubtitle}>This helps your first session start with less repetition.</Text>

            <Text style={styles.fieldLabel}>How are you feeling today?</Text>
            <View style={styles.wrapRow}>
              {REFLECTION_MOODS.map((item) => (
                <PillChip
                  key={item}
                  label={item}
                  selected={checkInMood === item}
                  onPress={() => setCheckInMood(item)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Stress today (1-5)</Text>
            <View style={styles.row}>
              {[1, 2, 3, 4, 5].map((item) => (
                <PillChip
                  key={item}
                  label={`${item}`}
                  selected={checkInStress === item}
                  onPress={() => setCheckInStress(item)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Hours of sleep</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 7"
              placeholderTextColor={Colors.text.tertiary}
              keyboardType="numeric"
              value={checkInSleep}
              onChangeText={setCheckInSleep}
            />

            <Text style={styles.fieldLabel}>Anything to share before your first session? (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Optional note"
              placeholderTextColor={Colors.text.tertiary}
              multiline
              value={checkInNote}
              onChangeText={setCheckInNote}
            />

            <Text style={styles.fieldLabel}>Journaling</Text>
            <CheckBox
              checked={journalEnabled}
              onPress={() => setJournalEnabled((prev) => !prev)}
              label="Enable mood, stress, sleep, and note journaling"
            />

            {journalEnabled && (
              <>
                <Text style={styles.fieldLabel}>Therapist visibility</Text>
                <View style={styles.wrapRow}>
                  {JOURNAL_SHARE_OPTIONS.map((item) => (
                    <PillChip
                      key={item.value}
                      label={item.label}
                      selected={journalSharing === item.value}
                      onPress={() => setJournalSharing(item.value)}
                    />
                  ))}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>Reminders (non-pushy)</Text>
            <CheckBox
              checked={remindersEnabled}
              onPress={() => setRemindersEnabled((prev) => !prev)}
              label="Enable gentle mood check-in reminders"
            />

            {remindersEnabled && (
              <>
                <View style={styles.row}>
                  {REMINDER_TIMES.map((item) => (
                    <PillChip
                      key={item}
                      label={asTimeLabel(item)}
                      selected={reminderTime === item}
                      onPress={() => setReminderTime(item)}
                    />
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Quiet hours start</Text>
                <View style={styles.row}>
                  {QUIET_START_OPTIONS.map((item) => (
                    <PillChip
                      key={item}
                      label={asTimeLabel(item)}
                      selected={quietStart === item}
                      onPress={() => setQuietStart(item)}
                    />
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Quiet hours end</Text>
                <View style={styles.row}>
                  {QUIET_END_OPTIONS.map((item) => (
                    <PillChip
                      key={item}
                      label={asTimeLabel(item)}
                      selected={quietEnd === item}
                      onPress={() => setQuietEnd(item)}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        );
      case 5:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Safety and consent</Text>
            <Card style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.accent.primary} />
              <Text style={styles.infoText}>
                Care Space is for psychological support and is not a substitute for emergency response.
              </Text>
            </Card>

            <CheckBox
              checked={agreedNotEmergency}
              onPress={() => setAgreedNotEmergency((prev) => !prev)}
              label="I understand this is not emergency support"
            />
            <CheckBox
              checked={agreedTerms}
              onPress={() => setAgreedTerms((prev) => !prev)}
              label="I agree to the terms of service"
            />
          </View>
        );
      default:
        return null;
    }
  };

  const renderTherapistStep = () => {
    switch (step) {
      case 0:
        return (
          <Card style={styles.heroCard}>
            <Ionicons name="sparkles-outline" size={28} color={Colors.accent.primary} />
            <Text style={styles.heroTitle}>{welcomeTitle}</Text>
            <Text style={styles.heroSubtitle}>
              Set up your profile so clients get a warm and trustworthy first impression.
            </Text>
          </Card>
        );
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Profile intro</Text>
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={Colors.text.tertiary}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Headline (e.g. Clinical Psychologist · CBT)"
              placeholderTextColor={Colors.text.tertiary}
              value={headline}
              onChangeText={setHeadline}
            />
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Expertise and languages</Text>
            <Text style={styles.fieldLabel}>Specialties</Text>
            <View style={styles.wrapRow}>
              {THERAPIST_SPECIALTIES.map((item) => (
                <PillChip
                  key={item}
                  label={item}
                  selected={selectedSpecialties.includes(item)}
                  onPress={() => toggleTag(item, selectedSpecialties, setSelectedSpecialties)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Languages</Text>
            <View style={styles.row}>
              {LANGUAGE_OPTIONS.map((item) => (
                <PillChip
                  key={item}
                  label={item}
                  selected={therapistLanguages.includes(item)}
                  onPress={() => toggleTag(item, therapistLanguages, setTherapistLanguages)}
                />
              ))}
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Practice preferences</Text>
            <Text style={styles.fieldLabel}>Session mode</Text>
            <View style={styles.row}>
              {SESSION_PREF_OPTIONS.map((item) => (
                <PillChip key={item} label={item} selected={sessionPref === item} onPress={() => setSessionPref(item)} />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Communication style</Text>
            <View style={styles.wrapRow}>
              {THERAPIST_STYLE_OPTIONS.map((item) => (
                <PillChip
                  key={item}
                  label={item}
                  selected={communicationStyle === item}
                  onPress={() => setCommunicationStyle(item)}
                />
              ))}
            </View>
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Compliance checks</Text>
            <CheckBox
              checked={agreedConfidentiality}
              onPress={() => setAgreedConfidentiality((prev) => !prev)}
              label="I commit to confidentiality and secure communication"
            />
            <CheckBox
              checked={agreedBoundaries}
              onPress={() => setAgreedBoundaries((prev) => !prev)}
              label="I acknowledge crisis escalation and professional boundaries"
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.progressContainer}>
        {Array.from({ length: totalSteps }).map((_, index) => (
          <View
            key={index}
            style={[styles.progressDot, index <= step ? styles.progressActive : styles.progressInactive]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fade }}>
          {isTherapistFlow ? renderTherapistStep() : renderClientStep()}
        </Animated.View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {step > 0 && (
          <Button
            title="Back"
            variant="ghost"
            fullWidth={false}
            onPress={() => setStep((prev) => Math.max(prev - 1, 0))}
            style={styles.backBtn}
          />
        )}
        <View style={styles.flexGrow}>
          <Button
            title={step === totalSteps - 1 ? 'Finish' : 'Continue'}
            onPress={step === totalSteps - 1 ? completeOnboarding : () => setStep((prev) => prev + 1)}
            disabled={!canProceed()}
            loading={loading}
            size="lg"
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

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
  progressContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  progressDot: {
    height: 6,
    borderRadius: 4,
    flex: 1,
  },
  progressActive: {
    backgroundColor: Colors.accent.primary,
  },
  progressInactive: {
    backgroundColor: Colors.ui.divider,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  heroCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.accent.soft,
    borderColor: Colors.accent.soft,
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  heroTitle: {
    ...Typography.title2,
    color: Colors.text.primary,
  },
  heroSubtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  heroEmergency: {
    ...Typography.captionEmphasis,
    color: Colors.status.warning,
    marginTop: 2,
  },
  stepContent: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  stepTitle: {
    ...Typography.title2,
    color: Colors.text.primary,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
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
    minHeight: 84,
    textAlignVertical: 'top',
  },
  fieldLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: Colors.bg.secondary,
  },
  infoText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    flex: 1,
    lineHeight: 18,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.primary,
  },
  backBtn: {
    minWidth: 80,
  },
  flexGrow: {
    flex: 1,
  },
});
