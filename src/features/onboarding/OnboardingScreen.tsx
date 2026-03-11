import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
const TIME_PREF_OPTIONS = [
  { label: 'Morning', value: 'morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
  { label: 'Flexible', value: 'flexible' },
] as const;
const GENDER_PREF_OPTIONS = [
  { label: 'No preference', value: 'no_preference' },
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Non-binary', value: 'non_binary' },
] as const;

const REFLECTION_MOODS = ['Calm', 'Low', 'Anxious', 'Overwhelmed', 'Numb', 'Hopeful'];
const SLEEP_OPTIONS = ['5', '6', '7', '8', '9'];
const REMINDER_TIMES = ['09:00:00', '14:00:00', '19:00:00'];
const QUIET_START_OPTIONS = ['20:00:00', '21:00:00', '22:00:00'];
const QUIET_END_OPTIONS = ['07:00:00', '08:00:00', '09:00:00'];
const CARE_STYLE_OPTIONS = ['Gentle', 'Direct', 'Structured', 'Reflective'];
const THERAPIST_STYLE_OPTIONS = ['Warm and conversational', 'Structured and goal-focused', 'Mindfulness-led'];
const ENGAGEMENT_OPTIONS: Array<{ label: string; value: 'gentle' | 'balanced' | 'high' }> = [
  { label: 'Gentle', value: 'gentle' },
  { label: 'Balanced', value: 'balanced' },
  { label: 'High', value: 'high' },
];

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

const toggleTag = (value: string, list: string[], setter: (next: string[]) => void, limit?: number) => {
  if (list.includes(value)) {
    setter(list.filter((item) => item !== value));
    return;
  }
  if (limit && list.length >= limit) return;
  setter([...list, value]);
};

const getStepTitle = (isTherapistFlow: boolean, step: number) => {
  if (step === 0) return 'Welcome';
  if (step === 1) return 'Your Name';
  if (step === 2) return isTherapistFlow ? 'Care Focus' : 'What Brings You Here';
  if (step === 3) return 'Quick Preferences';
  if (step === 4) return isTherapistFlow ? 'Practice Profile' : 'Baseline Check-in';
  return isTherapistFlow ? 'Availability & Compliance' : 'Care Buddy Settings';
};

const parseTimeToMinutes = (value: string) => {
  const [hour = '0', minute = '0'] = value.split(':');
  const hours = Number.parseInt(hour, 10);
  const minutes = Number.parseInt(minute, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (Math.max(0, Math.min(23, hours)) * 60) + Math.max(0, Math.min(59, minutes));
};

export const OnboardingScreen: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const isTherapistFlow = profile?.role === 'therapist';
  const totalSteps = 6;

  const { height: viewportHeight } = useWindowDimensions();
  const fade = useRef(new Animated.Value(1)).current;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState(profile?.first_name || '');

  const [selectedIntents, setSelectedIntents] = useState<string[]>([]);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [language, setLanguage] = useState('English');
  const [therapistLanguages, setTherapistLanguages] = useState<string[]>(['English']);
  const [sessionPref, setSessionPref] = useState('Both');
  const [timePreference, setTimePreference] = useState<(typeof TIME_PREF_OPTIONS)[number]['value']>('evening');
  const [genderPreference, setGenderPreference] = useState<(typeof GENDER_PREF_OPTIONS)[number]['value']>('no_preference');
  const [careStylePreference, setCareStylePreference] = useState('Gentle');

  const [checkInMood, setCheckInMood] = useState<string | null>(null);
  const [checkInStress, setCheckInStress] = useState(3);
  const [checkInSleep, setCheckInSleep] = useState('7');
  const [checkInNote, setCheckInNote] = useState('');

  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('19:00:00');
  const [quietStart, setQuietStart] = useState('21:00:00');
  const [quietEnd, setQuietEnd] = useState('08:00:00');
  const [careBuddyEnabled, setCareBuddyEnabled] = useState(true);
  const [engagementMode, setEngagementMode] = useState<'gentle' | 'balanced' | 'high'>('balanced');

  const [headline, setHeadline] = useState('');
  const [communicationStyle, setCommunicationStyle] = useState(THERAPIST_STYLE_OPTIONS[0]);

  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedNotEmergency, setAgreedNotEmergency] = useState(false);
  const [agreedConfidentiality, setAgreedConfidentiality] = useState(false);
  const [agreedBoundaries, setAgreedBoundaries] = useState(false);

  const stepStorageKey = user?.id
    ? `care_space_onboarding_step_v2_${user.id}_${isTherapistFlow ? 'therapist' : 'client'}`
    : null;
  const legacyStepStorageKey = user?.id
    ? `care_space_onboarding_step_${user.id}_${isTherapistFlow ? 'therapist' : 'client'}`
    : null;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 90, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [fade, step]);

  useEffect(() => {
    if (!stepStorageKey) return;

    AsyncStorage.getItem(stepStorageKey)
      .then(async (saved) => {
        const parsed = Number.parseInt(saved || '', 10);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed < totalSteps) {
          setStep(parsed);
          return;
        }

        if (!legacyStepStorageKey) return;
        const legacySaved = await AsyncStorage.getItem(legacyStepStorageKey);
        const legacyStep = Number.parseInt(legacySaved || '', 10);
        if (!Number.isFinite(legacyStep) || legacyStep < 0) return;

        const mappedLegacyStep = legacyStep === 0 ? 0 : Math.min(totalSteps - 1, legacyStep + 1);
        setStep(mappedLegacyStep);
      })
      .catch(() => {
        // Resume is best effort.
      });
  }, [legacyStepStorageKey, stepStorageKey, totalSteps]);

  useEffect(() => {
    if (!stepStorageKey) return;
    AsyncStorage.setItem(stepStorageKey, `${step}`).catch(() => {
      // Resume is best effort.
    });
  }, [step, stepStorageKey]);

  const canProceed = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return true;

    if (step === 2) {
      return isTherapistFlow ? selectedSpecialties.length > 0 : selectedIntents.length > 0;
    }

    if (step === 3) {
      if (isTherapistFlow) {
        return therapistLanguages.length > 0 && sessionPref.length > 0;
      }
      return language.length > 0 && sessionPref.length > 0;
    }

    if (step === 4) {
      if (isTherapistFlow) {
        return communicationStyle.length > 0;
      }
      return true;
    }

    if (isTherapistFlow) {
      return agreedConfidentiality && agreedBoundaries;
    }

    return agreedTerms && agreedNotEmergency;
  }, [
    agreedBoundaries,
    agreedConfidentiality,
    agreedNotEmergency,
    agreedTerms,
    communicationStyle,
    isTherapistFlow,
    language,
    selectedIntents.length,
    selectedSpecialties.length,
    sessionPref,
    step,
    therapistLanguages.length,
  ]);

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

    if (!isTherapistFlow && remindersEnabled) {
      const quietStartMinutes = parseTimeToMinutes(quietStart);
      const quietEndMinutes = parseTimeToMinutes(quietEnd);
      if (quietStartMinutes === null || quietEndMinutes === null || quietStartMinutes === quietEndMinutes) {
        Alert.alert('Invalid quiet hours', 'Please select a valid quiet-hours range.');
        return;
      }
    }

    setLoading(true);
    try {
      const trimmedName = firstName.trim();
      const displayName = trimmedName || profile?.display_name || profile?.first_name || null;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: trimmedName || profile?.first_name || null,
          display_name: displayName,
          language: isTherapistFlow ? therapistLanguages[0] || profile?.language || 'English' : language,
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
        wellbeing_reminders_enabled: isTherapistFlow ? false : remindersEnabled,
        wellbeing_reminder_time: reminderTime,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
        therapist_gender_preference: genderPreference,
        time_preference: timePreference,
        care_style_preference: isTherapistFlow ? communicationStyle : careStylePreference,
        journal_enabled: false,
        journal_sharing: 'none',
        care_buddy_enabled: isTherapistFlow ? true : careBuddyEnabled,
        engagement_mode: isTherapistFlow ? 'balanced' : engagementMode,
        nudge_snooze_until: null,
      };

      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert(preferencePayload, { onConflict: 'user_id' });

      if (prefError) throw prefError;

      if (isTherapistFlow) {
        const finalHeadline = headline.trim() || `Psychologist · ${selectedSpecialties.slice(0, 2).join(' + ') || 'General Care'}`;
        const { error: therapistError } = await supabase
          .from('therapists')
          .upsert(
            {
              id: user.id,
              headline: finalHeadline,
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
      if (stepStorageKey) {
        await AsyncStorage.removeItem(stepStorageKey);
      }
      if (legacyStepStorageKey) {
        await AsyncStorage.removeItem(legacyStepStorageKey);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while saving onboarding.';
      Alert.alert('Unable to finish onboarding', message);
    } finally {
      setLoading(false);
    }
  };

  const welcomeMinHeight = Math.max(480, viewportHeight - 220);

  const renderWelcome = () => (
    <View
      style={[
        styles.welcomePanel,
        isTherapistFlow && styles.welcomePanelTherapist,
        { minHeight: welcomeMinHeight },
      ]}
    >
      <View style={styles.welcomeHaloTop} />
      <View style={styles.welcomeHaloBottom} />

      <View style={styles.brandIconWrap}>
        <Ionicons name="leaf-outline" size={34} color={Colors.accent.primary} />
      </View>

      <Text style={styles.brandName}>Care Space</Text>
      <Text style={styles.brandTagline}>A calm place to care for your mind.</Text>

      <Text style={styles.heroTitle}>
        {isTherapistFlow
          ? 'Build a warm, trusted practice in minutes.'
          : 'Talk to a qualified psychologist, without awkward admin.'}
      </Text>
      <Text style={styles.heroSubtitle}>Private. Structured. No long-term commitment needed.</Text>

      {!isTherapistFlow ? <Text style={styles.heroSafety}>This is not for emergencies.</Text> : null}
    </View>
  );

  const renderNameStep = () => (
    <Card style={styles.stepCard}>
      <Text style={styles.stepTitle}>What should we call you?</Text>
      <Text style={styles.stepSubtitle}>Optional. You can edit this later in Profile.</Text>
      <TextInput
        style={styles.input}
        placeholder="First name"
        placeholderTextColor={Colors.text.tertiary}
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
      />
    </Card>
  );

  const renderSharedFocus = () => {
    if (isTherapistFlow) {
      return (
        <Card style={styles.stepCard}>
          <Text style={styles.stepTitle}>What care areas are you focusing on?</Text>
          <Text style={styles.stepSubtitle}>Pick up to 3 so clients find the right fit quickly.</Text>
          <View style={styles.wrapRow}>
            {THERAPIST_SPECIALTIES.map((item) => (
              <PillChip
                key={item}
                label={item}
                selected={selectedSpecialties.includes(item)}
                onPress={() => toggleTag(item, selectedSpecialties, setSelectedSpecialties, 3)}
              />
            ))}
          </View>
        </Card>
      );
    }

    return (
      <Card style={styles.stepCard}>
        <Text style={styles.stepTitle}>What brings you here today?</Text>
        <Text style={styles.stepSubtitle}>Pick up to 2. This helps matching stay thoughtful.</Text>
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
      </Card>
    );
  };

  const renderSharedPreferences = () => (
    <View style={styles.stepStack}>
      <Card style={styles.stepCard}>
        <Text style={styles.stepTitle}>Quick preferences</Text>

        <Text style={styles.fieldLabel}>Language</Text>
        <View style={styles.wrapRow}>
          {LANGUAGE_OPTIONS.map((item) => (
            <PillChip
              key={item}
              label={item}
              selected={isTherapistFlow ? therapistLanguages.includes(item) : language === item}
              onPress={() => {
                if (isTherapistFlow) {
                  toggleTag(item, therapistLanguages, setTherapistLanguages);
                } else {
                  setLanguage(item);
                }
              }}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Preferred mode</Text>
        <View style={styles.wrapRow}>
          {SESSION_PREF_OPTIONS.map((item) => (
            <PillChip
              key={item}
              label={item}
              selected={sessionPref === item}
              onPress={() => setSessionPref(item)}
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
      </Card>

      {!isTherapistFlow ? (
        <Card style={styles.stepCard}>
          <Text style={styles.fieldLabel}>Therapist gender preference</Text>
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

          <Text style={styles.fieldLabel}>Care style preference</Text>
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
        </Card>
      ) : null}
    </View>
  );

  const renderClientBaseline = () => (
    <Card style={styles.stepCard}>
      <Text style={styles.stepTitle}>How are you feeling today?</Text>
      <Text style={styles.stepSubtitle}>Fast check-in to make your first session easier.</Text>

      <Text style={styles.fieldLabel}>Mood</Text>
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
      <View style={styles.wrapRow}>
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
      <View style={styles.wrapRow}>
        {SLEEP_OPTIONS.map((item) => (
          <PillChip
            key={item}
            label={`${item}h`}
            selected={checkInSleep === item}
            onPress={() => setCheckInSleep(item)}
          />
        ))}
      </View>

      <Text style={styles.fieldLabel}>Optional note</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Anything to share before your first session?"
        placeholderTextColor={Colors.text.tertiary}
        multiline
        value={checkInNote}
        onChangeText={setCheckInNote}
      />
    </Card>
  );

  const renderTherapistPractice = () => (
    <Card style={styles.stepCard}>
      <Text style={styles.stepTitle}>Practice setup</Text>

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

      <Text style={styles.fieldLabel}>Profile headline (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Clinical Psychologist · CBT"
        placeholderTextColor={Colors.text.tertiary}
        value={headline}
        onChangeText={setHeadline}
      />

      <Text style={styles.fieldHelper}>You can refine this later in Edit Profile.</Text>
    </Card>
  );

  const renderClientCareBuddy = () => (
    <View style={styles.stepStack}>
      <Card style={styles.stepCard}>
        <Text style={styles.stepTitle}>Care Buddy settings</Text>

        <CheckBox
          checked={remindersEnabled}
          onPress={() => setRemindersEnabled((prev) => !prev)}
          label="Enable gentle wellbeing reminders"
        />

        {remindersEnabled ? (
          <>
            <Text style={styles.fieldLabel}>Reminder time</Text>
            <View style={styles.wrapRow}>
              {REMINDER_TIMES.map((item) => (
                <PillChip
                  key={item}
                  label={asTimeLabel(item)}
                  selected={reminderTime === item}
                  onPress={() => setReminderTime(item)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Quiet hours</Text>
            <View style={styles.wrapRow}>
              {QUIET_START_OPTIONS.map((item) => (
                <PillChip
                  key={item}
                  label={`Start ${asTimeLabel(item)}`}
                  selected={quietStart === item}
                  onPress={() => setQuietStart(item)}
                />
              ))}
            </View>
            <View style={styles.wrapRow}>
              {QUIET_END_OPTIONS.map((item) => (
                <PillChip
                  key={item}
                  label={`End ${asTimeLabel(item)}`}
                  selected={quietEnd === item}
                  onPress={() => setQuietEnd(item)}
                />
              ))}
            </View>
          </>
        ) : null}

        <CheckBox
          checked={careBuddyEnabled}
          onPress={() => setCareBuddyEnabled((prev) => !prev)}
          label="Show supportive Care Buddy guidance in the app"
        />

        <Text style={styles.fieldLabel}>Engagement mode</Text>
        <View style={styles.wrapRow}>
          {ENGAGEMENT_OPTIONS.map((item) => (
            <PillChip
              key={item.value}
              label={item.label}
              selected={engagementMode === item.value}
              onPress={() => setEngagementMode(item.value)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.stepCard}>
        <Text style={styles.stepTitle}>Safety consent</Text>
        <CheckBox
          checked={agreedNotEmergency}
          onPress={() => setAgreedNotEmergency((prev) => !prev)}
          label="I understand this app is not emergency support"
        />
        <CheckBox
          checked={agreedTerms}
          onPress={() => setAgreedTerms((prev) => !prev)}
          label="I agree to the terms of service"
        />
      </Card>
    </View>
  );

  const renderTherapistCompliance = () => (
    <Card style={styles.stepCard}>
      <Text style={styles.stepTitle}>Availability and compliance</Text>
      <Text style={styles.stepSubtitle}>You can edit slots later from your schedule module.</Text>

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
    </Card>
  );

  const renderStepContent = () => {
    if (step === 0) return renderWelcome();
    if (step === 1) return renderNameStep();
    if (step === 2) return renderSharedFocus();
    if (step === 3) return renderSharedPreferences();
    if (step === 4) return isTherapistFlow ? renderTherapistPractice() : renderClientBaseline();
    return isTherapistFlow ? renderTherapistCompliance() : renderClientCareBuddy();
  };

  const progressDots = Array.from({ length: totalSteps });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topNav}>
        <TouchableOpacity
          style={[styles.navSquircle, step === 0 && styles.navSquircleGhost]}
          onPress={() => setStep((prev) => Math.max(prev - 1, 0))}
          disabled={step === 0}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={18} color={step === 0 ? Colors.text.tertiary : Colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.progressDotsRow}>
          {progressDots.map((_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index <= step && styles.progressDotActive,
                index === step && styles.progressDotCurrent,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.navSquircle}
          onPress={() => {
            if (step === 0) {
              setStep(1);
              return;
            }
            Alert.alert('Need help?', 'You can skip optional fields and change these settings later in Profile.');
          }}
          activeOpacity={0.8}
        >
          <Ionicons name={step === 0 ? 'play-forward-outline' : 'help-outline'} size={17} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.stepMetaRow}>
        <View style={styles.stepMetaTopRow}>
          <Text style={styles.stepMeta}>{`Step ${step + 1} of ${totalSteps}`}</Text>
        </View>
        <Text style={styles.stepMetaTitle}>{getStepTitle(isTherapistFlow, step)}</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, step === 0 ? styles.scrollWelcome : styles.scrollSteps]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fade }}>
            {renderStepContent()}
          </Animated.View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.backCircleBtn, step === 0 && styles.backCircleBtnDisabled]}
            onPress={() => setStep((prev) => Math.max(prev - 1, 0))}
            disabled={step === 0}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={18} color={step === 0 ? Colors.text.tertiary : Colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.flexGrow}>
            <Button
              title={step === totalSteps - 1 ? 'Done' : 'Continue'}
              onPress={step === totalSteps - 1 ? completeOnboarding : () => setStep((prev) => prev + 1)}
              disabled={!canProceed}
              loading={loading}
              size="lg"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const CheckBox: React.FC<{ checked: boolean; onPress: () => void; label: string }> = ({
  checked,
  onPress,
  label,
}) => (
  <Pressable onPress={onPress} style={checkStyles.row}>
    <View style={[checkStyles.box, checked && checkStyles.checked]}>
      {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
    </View>
    <Text style={checkStyles.label}>{label}</Text>
  </Pressable>
);

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: 16,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    marginTop: Spacing.sm,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 8,
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
  flex: {
    flex: 1,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xs,
  },
  navSquircle: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSquircleGhost: {
    backgroundColor: Colors.bg.primary,
  },
  progressDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 18,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.ui.divider,
  },
  progressDotActive: {
    backgroundColor: Colors.accent.primary + '80',
  },
  progressDotCurrent: {
    backgroundColor: Colors.accent.primary,
    width: 26,
  },
  stepMetaRow: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  stepMetaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  stepMeta: {
    ...Typography.micro,
    color: Colors.text.tertiary,
  },
  stepMetaTitle: {
    ...Typography.title3,
    color: Colors.text.primary,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  scrollWelcome: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  scrollSteps: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: Spacing.md,
  },
  welcomePanel: {
    backgroundColor: Colors.accent.soft,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    justifyContent: 'center',
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  welcomePanelTherapist: {
    backgroundColor: Colors.status.warningSoft,
  },
  welcomeHaloTop: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: Radius.pill,
    top: -80,
    right: -60,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  welcomeHaloBottom: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: Radius.pill,
    bottom: -38,
    left: -24,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  brandIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  brandName: {
    ...Typography.title1,
    color: Colors.text.primary,
    fontFamily: Platform.select({
      ios: 'AvenirNext-DemiBold',
      android: 'sans-serif-medium',
      default: undefined,
    }),
    letterSpacing: 0.2,
  },
  brandTagline: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  heroTitle: {
    ...Typography.title2,
    color: Colors.text.primary,
    marginTop: Spacing.sm,
  },
  heroSubtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  heroSafety: {
    ...Typography.captionEmphasis,
    color: Colors.status.warning,
    marginTop: 2,
  },
  stepStack: {
    gap: Spacing.sm,
  },
  stepCard: {
    gap: Spacing.xs,
    borderRadius: 24,
  },
  stepTitle: {
    ...Typography.title2,
    color: Colors.text.primary,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  fieldLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  fieldHelper: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  input: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    marginTop: Spacing.xs,
  },
  textArea: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
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
  backCircleBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCircleBtnDisabled: {
    opacity: 0.45,
  },
  flexGrow: {
    flex: 1,
  },
});
