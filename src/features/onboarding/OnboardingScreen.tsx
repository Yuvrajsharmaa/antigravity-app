import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Button, Card, CoveMascot, CoveModal, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { CoveModalAction, CoveModalVariant, OnboardingStepV2 } from '../../core/models/types';
import { MascotSizes } from '../../core/constants/mascot';
import {
  ensureNotificationPermission,
  scheduleAdaptiveWellbeingReminders,
} from '../../core/utils/wellbeingNotifications';
import { supabase } from '../../services/supabase';
import { careBuddyLine } from '../../core/utils/careBuddy';
import { upsertDailyCheckIn, upsertTherapistApplication } from '../../core/services/careFlowService';
import { MOOD_OPTIONS } from '../../core/utils/mood';

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

const REFLECTION_MOODS = MOOD_OPTIONS;
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

const CLIENT_FEATURE_HIGHLIGHTS = [
  {
    icon: 'chatbubbles-outline' as const,
    color: Colors.semantic.reflect,
    soft: Colors.semanticSoft.reflect,
    title: 'Talk with confidence',
    subtitle: 'Get matched with a therapist who fits your style.',
  },
  {
    icon: 'heart-outline' as const,
    color: Colors.semantic.insight,
    soft: Colors.semanticSoft.insight,
    title: 'Track your CareScore',
    subtitle: 'Log a daily check-in: mood, stress, sleep, and recovery.',
  },
  {
    icon: 'timer-outline' as const,
    color: Colors.semantic.effort,
    soft: Colors.semanticSoft.effort,
    title: 'Build a calm routine',
    subtitle: 'Gentle reminders with zero guilt or pressure.',
  },
];

const THERAPIST_FEATURE_HIGHLIGHTS = [
  {
    icon: 'people-outline' as const,
    color: Colors.semantic.reflect,
    soft: Colors.semanticSoft.reflect,
    title: 'Meet best-fit clients',
    subtitle: 'Get matched with clients aligned to your specialties.',
  },
  {
    icon: 'analytics-outline' as const,
    color: Colors.semantic.insight,
    soft: Colors.semanticSoft.insight,
    title: 'Review check-in snapshots',
    subtitle: 'See recent client check-ins before each session.',
  },
  {
    icon: 'send-outline' as const,
    color: Colors.semantic.effort,
    soft: Colors.semanticSoft.effort,
    title: 'Follow up clearly',
    subtitle: 'Use check-in nudges and notes between sessions.',
  },
];

const asTimeLabel = (value: string) => value.slice(0, 5);

const normalizeIntentTag = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-');

const toggleTag = (value: string, list: string[], setter: (next: string[]) => void, limit?: number) => {
  if (list.includes(value)) {
    setter(list.filter((item) => item !== value));
    return;
  }
  if (limit && list.length >= limit) return;
  setter([...list, value]);
};

const CLIENT_ONBOARDING_STEPS: OnboardingStepV2[] = [
  { id: 'intro', title: 'Welcome', role: 'shared', required: false, optional: true, resumeKey: 'intro' },
  { id: 'features', title: 'What You Get', role: 'shared', required: false, optional: true, resumeKey: 'features' },
  { id: 'name', title: 'Your Name', role: 'shared', required: false, optional: true, resumeKey: 'name' },
  { id: 'intent', title: 'What Brings You Here', role: 'shared', required: true, optional: false, resumeKey: 'intent' },
  { id: 'care-style', title: 'Support Style', role: 'client', required: true, optional: false, resumeKey: 'care_style' },
  { id: 'session-prefs', title: 'Session Preferences', role: 'shared', required: true, optional: false, resumeKey: 'session_preferences' },
  { id: 'baseline', title: 'Baseline Check-in', role: 'client', required: false, optional: true, resumeKey: 'baseline' },
  { id: 'reminder-consent', title: 'Reminders & Consent', role: 'client', required: true, optional: false, resumeKey: 'reminder_consent' },
];

const THERAPIST_ONBOARDING_STEPS: OnboardingStepV2[] = [
  { id: 'intro', title: 'Welcome', role: 'shared', required: false, optional: true, resumeKey: 'intro' },
  { id: 'features', title: 'What You Get', role: 'shared', required: false, optional: true, resumeKey: 'features' },
  { id: 'name', title: 'Your Name', role: 'shared', required: false, optional: true, resumeKey: 'name' },
  { id: 'focus', title: 'Client Focus', role: 'shared', required: true, optional: false, resumeKey: 'focus' },
  { id: 'care-style', title: 'Communication Style', role: 'therapist', required: true, optional: false, resumeKey: 'communication_style' },
  { id: 'session-prefs', title: 'Session Preferences', role: 'shared', required: true, optional: false, resumeKey: 'session_preferences' },
  { id: 'practice-profile', title: 'Practice Profile', role: 'therapist', required: false, optional: true, resumeKey: 'practice_profile' },
  { id: 'availability-compliance', title: 'Availability & Compliance', role: 'therapist', required: true, optional: false, resumeKey: 'availability_compliance' },
];

const parseTimeToMinutes = (value: string) => {
  const [hour = '0', minute = '0'] = value.split(':');
  const hours = Number.parseInt(hour, 10);
  const minutes = Number.parseInt(minute, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (Math.max(0, Math.min(23, hours)) * 60) + Math.max(0, Math.min(59, minutes));
};

const stepBubble = (isTherapistFlow: boolean, step: number) => {
  if (step === 0) return isTherapistFlow ? 'Welcome to Care Space. Let us set up your therapist workflow.' : 'Welcome to Care Space. Let us set up your daily support workflow.';
  if (step === 1) return isTherapistFlow ? 'Here is what Care Space supports each day.' : 'Here is what you can do in Care Space.';
  if (step === 2) return 'Add your first name (optional).';
  if (step === 3) return isTherapistFlow ? 'Pick your focus areas so clients can find you faster.' : 'Pick up to 2 support areas so we can match you better.';
  if (step === 4) return isTherapistFlow ? 'Choose your communication style.' : 'Choose the support style that feels best for you.';
  if (step === 5) return 'Set your language, session mode, and timing preference.';
  if (step === 6) return isTherapistFlow ? 'Add a quick profile headline.' : 'A quick baseline helps your first session.';
  return isTherapistFlow ? 'Confirm your compliance setup to finish.' : 'Set reminders and consent to complete setup.';
};

const ONBOARDING_HELPER_MASCOT_SIZE = MascotSizes.inline;

export const OnboardingScreen: React.FC = () => {
  const { user, profile, refreshProfile, signupRoleIntent } = useAuth();
  const isTherapistFlow = profile?.role === 'therapist'
    || (profile?.role === 'user' && signupRoleIntent === 'therapist');
  const steps = isTherapistFlow ? THERAPIST_ONBOARDING_STEPS : CLIENT_ONBOARDING_STEPS;
  const totalSteps = steps.length;

  const { height: viewportHeight } = useWindowDimensions();
  const fade = useRef(new Animated.Value(1)).current;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
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
  const [therapistQuote, setTherapistQuote] = useState('');
  const [therapistPrompt, setTherapistPrompt] = useState('');

  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedNotEmergency, setAgreedNotEmergency] = useState(false);
  const [agreedConfidentiality, setAgreedConfidentiality] = useState(false);
  const [agreedBoundaries, setAgreedBoundaries] = useState(false);

  const stepStorageKey = user?.id
    ? `care_space_onboarding_step_v4_${user.id}_${isTherapistFlow ? 'therapist' : 'client'}`
    : null;
  const legacyStepStorageKey = user?.id
    ? `care_space_onboarding_step_v3_${user.id}_${isTherapistFlow ? 'therapist' : 'client'}`
    : null;
  const legacyStepStorageKeyV2 = user?.id
    ? `care_space_onboarding_step_v2_${user.id}_${isTherapistFlow ? 'therapist' : 'client'}`
    : null;
  const legacyStepStorageKeyV1 = user?.id
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

        const legacySaved = legacyStepStorageKey
          ? await AsyncStorage.getItem(legacyStepStorageKey)
          : null;
        const fallbackV2 = (!legacySaved && legacyStepStorageKeyV2)
          ? await AsyncStorage.getItem(legacyStepStorageKeyV2)
          : null;
        const fallbackLegacySaved = (!legacySaved && !fallbackV2 && legacyStepStorageKeyV1)
          ? await AsyncStorage.getItem(legacyStepStorageKeyV1)
          : null;
        const resolvedLegacy = legacySaved ?? fallbackV2 ?? fallbackLegacySaved;
        const legacyStep = Number.parseInt(resolvedLegacy || '', 10);
        if (!Number.isFinite(legacyStep) || legacyStep < 0) return;

        const mappedLegacyStep = legacyStep <= 0
          ? 0
          : Math.min(totalSteps - 1, legacyStep + 1);
        setStep(mappedLegacyStep);
      })
      .catch(() => {
        // Resume is best effort.
      });
  }, [legacyStepStorageKey, legacyStepStorageKeyV1, legacyStepStorageKeyV2, stepStorageKey, totalSteps]);

  useEffect(() => {
    if (!stepStorageKey) return;
    AsyncStorage.setItem(stepStorageKey, `${step}`).catch(() => {
      // Resume is best effort.
    });
  }, [step, stepStorageKey]);

  const canProceed = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return true;
    if (step === 2) return true;

    if (step === 3) {
      return isTherapistFlow ? selectedSpecialties.length > 0 : selectedIntents.length > 0;
    }

    if (step === 4) {
      return isTherapistFlow ? communicationStyle.length > 0 : careStylePreference.length > 0;
    }

    if (step === 5) {
      if (isTherapistFlow) {
        return therapistLanguages.length > 0 && sessionPref.length > 0;
      }
      return language.length > 0 && sessionPref.length > 0;
    }

    if (step === 6) {
      if (isTherapistFlow) {
        return true;
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
    careStylePreference,
    communicationStyle,
    isTherapistFlow,
    language,
    selectedIntents.length,
    selectedSpecialties.length,
    sessionPref,
    step,
    therapistLanguages.length,
  ]);

  const proceedHint = useMemo(() => {
    if (canProceed) return '';
    if (step === 3) return isTherapistFlow ? 'Pick at least 1 focus area.' : 'Pick at least 1 reason for support.';
    if (step === 4) return isTherapistFlow ? 'Choose a communication style.' : 'Choose your preferred support style.';
    if (step === 5) return 'Choose your preferred session mode to continue.';
    if (step === totalSteps - 1) return isTherapistFlow ? 'Please accept both compliance checks.' : 'Please accept safety and terms.';
    return 'Complete this step to continue.';
  }, [canProceed, isTherapistFlow, step, totalSteps]);

  const saveInitialCheckInIfProvided = async (userId: string) => {
    const sleepNum = Number.parseFloat(checkInSleep.replace(',', '.'));
    if (!checkInMood || Number.isNaN(sleepNum) || sleepNum <= 0 || sleepNum > 24) return;

    await upsertDailyCheckIn({
      userId,
      mood: checkInMood,
      stressLevel: checkInStress,
      sleepHours: sleepNum,
      note: checkInNote,
    });
  };

  const upsertWithMissingColumnFallback = async (
    table: 'user_preferences' | 'therapist_match_profile',
    payload: Record<string, any>,
    onConflict: string,
  ) => {
    const workingPayload: Record<string, any> = { ...payload };
    const conflictColumns = onConflict
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const extractMissingColumn = (error: any) => {
      const message = `${(error as any)?.message || ''}`.toLowerCase();
      const match = message.match(/column\s+"?([a-z0-9_]+)"?\s+/i);
      return match?.[1] || null;
    };
    const isMissingColumnError = (error: any) => {
      const code = `${(error as any)?.code || ''}`.toUpperCase();
      const message = `${(error as any)?.message || ''}`.toLowerCase();
      return code === '42703' || message.includes('does not exist');
    };

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { error } = await supabase
        .from(table)
        .upsert(workingPayload, { onConflict });

      if (!error) return;

      const code = `${(error as any)?.code || ''}`.toUpperCase();
      const message = `${(error as any)?.message || ''}`.toLowerCase();
      if (code === '42P01' || message.includes('relation') && message.includes('does not exist')) {
        return;
      }
      const missingUpsertConstraint =
        code === '42P10'
        || message.includes('no unique or exclusion constraint')
        || message.includes('on conflict specification');
      if (missingUpsertConstraint) {
        const matchValues = conflictColumns.reduce<Record<string, any>>((acc, key) => {
          if (workingPayload[key] !== undefined) acc[key] = workingPayload[key];
          return acc;
        }, {});

        if (!Object.keys(matchValues).length) {
          throw error;
        }

        const { data: updatedRows, error: updateError } = await supabase
          .from(table)
          .update(workingPayload)
          .match(matchValues)
          .select(conflictColumns[0] || '*')
          .limit(1);
        if (updateError) {
          if (isMissingColumnError(updateError)) {
            const missingColumn = extractMissingColumn(updateError);
            if (missingColumn && missingColumn in workingPayload) {
              delete workingPayload[missingColumn];
              continue;
            }
          }
          throw updateError;
        }
        if (updatedRows && updatedRows.length > 0) return;

        const { error: insertError } = await supabase
          .from(table)
          .insert(workingPayload);
        if (!insertError) return;
        if (isMissingColumnError(insertError)) {
          const missingColumn = extractMissingColumn(insertError);
          if (missingColumn && missingColumn in workingPayload) {
            delete workingPayload[missingColumn];
            continue;
          }
        }
        throw insertError;
      }

      const isMissingColumn = isMissingColumnError(error);
      if (!isMissingColumn) {
        throw error;
      }

      const missingColumn = extractMissingColumn(error);
      if (!missingColumn || !(missingColumn in workingPayload)) {
        throw error;
      }

      delete workingPayload[missingColumn];
    }

    throw new Error(`Unable to save ${table.replace('_', ' ')} with current schema.`);
  };

  const completeOnboarding = async () => {
    if (!user) return;

    if (!isTherapistFlow && remindersEnabled) {
      const quietStartMinutes = parseTimeToMinutes(quietStart);
      const quietEndMinutes = parseTimeToMinutes(quietEnd);
      if (quietStartMinutes === null || quietEndMinutes === null || quietStartMinutes === quietEndMinutes) {
        showModal('blocking', 'Invalid quiet hours', 'Please select a valid quiet-hours range.');
        return;
      }
    }

    setLoading(true);
    let saveStage:
      | 'profile'
      | 'preferences'
      | 'therapist_application'
      | 'therapist_profile'
      | 'therapist_match_profile'
      | 'client_checkin'
      | 'notifications'
      | 'finalize'
      = 'profile';
    try {
      const trimmedName = firstName.trim();
      const displayName = trimmedName || profile?.display_name || profile?.first_name || null;

      const isApprovedTherapist = profile?.role === 'therapist' || profile?.role === 'admin';

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          first_name: trimmedName || profile?.first_name || null,
          display_name: displayName,
          language: isTherapistFlow ? therapistLanguages[0] || profile?.language || 'English' : language,
          role: isApprovedTherapist ? (profile?.role === 'admin' ? 'admin' : 'therapist') : 'user',
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (profileError) throw profileError;

      saveStage = 'preferences';
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
        walkthrough_completed: false,
      };

      await upsertWithMissingColumnFallback('user_preferences', preferencePayload, 'user_id');

      if (isTherapistFlow) {
        const finalHeadline = headline.trim() || `Psychologist · ${selectedSpecialties.slice(0, 2).join(' + ') || 'General Care'}`;
        const preferredMode = sessionPref.toLowerCase();
        const finalQuote = therapistQuote.trim() || null;
        const finalPrompt = therapistPrompt.trim() || null;

        saveStage = 'therapist_application';
        await upsertTherapistApplication({
          userId: user.id,
          specialties: selectedSpecialties,
          languages: therapistLanguages,
          communicationStyle,
          headline: finalHeadline,
        });

        saveStage = 'therapist_profile';
        const { error: therapistError } = await supabase
          .from('therapists')
          .upsert(
            {
              id: user.id,
              headline: finalHeadline,
              bio: `${communicationStyle}. Focused on collaborative and evidence-based care.`,
              languages: therapistLanguages,
              specialties: selectedSpecialties,
              is_active: isApprovedTherapist,
              is_verified: isApprovedTherapist,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          );

        if (therapistError) throw therapistError;

        saveStage = 'therapist_match_profile';
        await upsertWithMissingColumnFallback(
          'therapist_match_profile',
          {
            therapist_id: user.id,
            treats_tags: selectedSpecialties,
            not_fit_tags: [],
            modalities: selectedSpecialties.includes('mindfulness') ? ['mindfulness'] : ['cbt'],
            style_tags: [communicationStyle],
            population_tags: [],
            session_modes: preferredMode === 'both' ? ['chat', 'video'] : [preferredMode],
            languages: therapistLanguages,
            intake_windows: [{ day: 'weekdays', from: '10:00', to: '20:00' }],
            new_client_capacity: 5,
            accepts_new_clients: true,
            standout_quote: finalQuote,
            standout_prompt: finalPrompt,
            updated_at: new Date().toISOString(),
          },
          'therapist_id',
        );
      } else {
        saveStage = 'client_checkin';
        await saveInitialCheckInIfProvided(user.id);

        if (remindersEnabled) {
          saveStage = 'notifications';
          await ensureNotificationPermission();
          await scheduleAdaptiveWellbeingReminders(user.id);
        }
      }

      saveStage = 'finalize';
      await refreshProfile();
      if (stepStorageKey) {
        await AsyncStorage.removeItem(stepStorageKey);
      }
      if (legacyStepStorageKey) {
        await AsyncStorage.removeItem(legacyStepStorageKey);
      }
      if (legacyStepStorageKeyV2) {
        await AsyncStorage.removeItem(legacyStepStorageKeyV2);
      }
      if (legacyStepStorageKeyV1) {
        await AsyncStorage.removeItem(legacyStepStorageKeyV1);
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Something went wrong while saving onboarding.';
      const stageMessage = (() => {
        if (saveStage === 'profile') return 'We could not save your profile details. Please try again.';
        if (saveStage === 'preferences') return 'We could not save your preferences. Please retry this step.';
        if (saveStage === 'therapist_application') return 'Therapist application details could not be saved.';
        if (saveStage === 'therapist_profile') return 'Therapist profile setup could not be completed.';
        if (saveStage === 'therapist_match_profile') return 'Therapist matching profile could not be saved.';
        if (saveStage === 'client_checkin') return 'Your first check-in could not be saved.';
        if (saveStage === 'notifications') return 'Reminder settings could not be finalized.';
        return rawMessage;
      })();
      const message = rawMessage.includes('user_id,check_in_date')
        ? 'A check-in for today already exists. We can update it after onboarding finishes.'
        : stageMessage;
      showModal('error', 'Unable to finish onboarding', message);
    } finally {
      setLoading(false);
    }
  };

  const goNextStep = () => {
    if (step >= totalSteps - 1) return;
    setTransitioning(true);
    setTimeout(() => {
      setStep((prev) => Math.min(totalSteps - 1, prev + 1));
      setTransitioning(false);
    }, 220);
  };

  const welcomeMinHeight = Math.max(460, viewportHeight - 250);

  const renderWelcome = () => {
    const cleanName = (firstName.trim() || profile?.first_name || '').trim();
    const introName = cleanName ? `, ${cleanName}` : '';

    return (
      <View style={[styles.introScreen, { minHeight: welcomeMinHeight }]}>
        <View style={styles.introMascotWrap}>
          <CoveMascot variant="welcome" size={MascotSizes.hero} animate />
        </View>
        <Text style={styles.introHeadline}>
          {isTherapistFlow
            ? `Welcome to Care Space${introName}.`
            : `Welcome to Care Space${introName}.`}
        </Text>
        <Text style={styles.introSubhead}>
          {isTherapistFlow
            ? 'Set your practice details and start accepting clients.'
            : 'Set up your support flow and start with confidence.'}
        </Text>
      </View>
    );
  };

  const renderFeatureHighlights = () => {
    const features = isTherapistFlow ? THERAPIST_FEATURE_HIGHLIGHTS : CLIENT_FEATURE_HIGHLIGHTS;
    return (
      <View style={styles.featuresScreen}>
      <View style={styles.featureHeroRow}>
        <CoveMascot variant={isTherapistFlow ? 'thinking' : 'default'} size={ONBOARDING_HELPER_MASCOT_SIZE} animate />
        <View style={styles.featureBubble}>
          <Text style={styles.featureBubbleText}>
            Here&apos;s what you can do in Care Space.
          </Text>
        </View>
      </View>

        <View style={styles.featureList}>
          {features.map((feature) => (
            <View key={feature.title} style={styles.featureRow}>
              <View style={[styles.featureIconWrap, { backgroundColor: feature.soft }]}>
                <Ionicons name={feature.icon} size={20} color={feature.color} />
              </View>
              <View style={styles.featureCopyWrap}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

const renderNameStep = () => (
    <Card style={styles.stepCard}>
      <Text style={styles.stepTitle}>First name</Text>
      <Text style={styles.stepSubtitle}>Optional. You can change this later in Profile.</Text>
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
          <Text style={styles.stepTitle}>What support areas are you focusing on?</Text>
          <Text style={styles.stepSubtitle}>Pick up to 3 so clients find the right fit quickly.</Text>
          <View style={styles.optionStack}>
            {THERAPIST_SPECIALTIES.map((item) => {
              const selected = selectedSpecialties.includes(item);
              return (
                <TouchableOpacity
                  key={item}
                  activeOpacity={0.85}
                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  onPress={() => toggleTag(item, selectedSpecialties, setSelectedSpecialties, 3)}
                  accessibilityRole="button"
                  accessibilityLabel={`Focus area ${item.replace('-', ' ')}`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.optionCardTitle, selected && styles.optionCardTitleSelected]}>
                    {item.replace('-', ' ')}
                  </Text>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={selected ? Colors.accent.primary : Colors.text.tertiary}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      );
    }

    return (
      <Card style={styles.stepCard}>
        <Text style={styles.stepTitle}>What brings you here today?</Text>
        <Text style={styles.stepSubtitle}>Pick up to 2. This helps matching stay thoughtful.</Text>
        <View style={styles.optionStack}>
          {CLIENT_INTENTS.map((intent) => {
            const selected = selectedIntents.includes(intent);
            return (
              <TouchableOpacity
                key={intent}
                activeOpacity={0.85}
                style={[styles.optionCard, selected && styles.optionCardSelected]}
                onPress={() => toggleTag(intent, selectedIntents, setSelectedIntents, 2)}
                accessibilityRole="button"
                accessibilityLabel={intent}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.optionCardTitle, selected && styles.optionCardTitleSelected]}>{intent}</Text>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={selected ? Colors.accent.primary : Colors.text.tertiary}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>
    );
  };

  const renderCareStyleStep = () => {
    if (isTherapistFlow) {
      return (
        <Card style={styles.stepCard}>
          <Text style={styles.stepTitle}>How do you usually guide sessions?</Text>
          <Text style={styles.stepSubtitle}>Clients use this to find a therapist who matches their communication style.</Text>
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
        </Card>
      );
    }

    return (
      <Card style={styles.stepCard}>
        <Text style={styles.stepTitle}>What kind of support style fits you?</Text>
        <Text style={styles.stepSubtitle}>{careBuddyLine('reflect')}</Text>
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
      </Card>
    );
  };

  const renderSessionPreferences = () => (
    <View style={styles.stepStack}>
      <Card style={styles.stepCard}>
        <Text style={styles.stepTitle}>Session preferences</Text>

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
            key={item.value}
            label={`${item.emoji} ${item.label}`}
            selected={checkInMood === item.label}
            onPress={() => setCheckInMood(item.label)}
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

      <Text style={styles.fieldLabel}>Profile headline (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Clinical Psychologist · CBT"
        placeholderTextColor={Colors.text.tertiary}
        value={headline}
        onChangeText={setHeadline}
      />

      <Text style={styles.fieldHelper}>You can refine this later in Edit Profile.</Text>

      <Text style={styles.fieldLabel}>Short quote for matches (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="A calm first session can change a whole week."
        placeholderTextColor={Colors.text.tertiary}
        value={therapistQuote}
        onChangeText={setTherapistQuote}
      />

      <Text style={styles.fieldLabel}>Intro prompt (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="What has been feeling hardest lately?"
        placeholderTextColor={Colors.text.tertiary}
        value={therapistPrompt}
        onChangeText={setTherapistPrompt}
        multiline
      />
    </Card>
  );

  const renderClientCareBuddy = () => (
    <View style={styles.stepStack}>
      <Card style={styles.stepCard}>
        <Text style={styles.stepTitle}>Cove settings</Text>

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
          label="Show supportive Cove guidance in the app"
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
    if (step === 1) return renderFeatureHighlights();
    if (step === 2) return renderNameStep();
    if (step === 3) return renderSharedFocus();
    if (step === 4) return renderCareStyleStep();
    if (step === 5) return renderSessionPreferences();
    if (step === 6) return isTherapistFlow ? renderTherapistPractice() : renderClientBaseline();
    return isTherapistFlow ? renderTherapistCompliance() : renderClientCareBuddy();
  };

  const progress = (step + 1) / totalSteps;
  const isIntroStep = step === 0;
  const isFeatureStep = step === 1;
  const showGuidedHeader = step >= 2;
  const primaryCtaTitle = step === 0 ? "Let's go!" : step === totalSteps - 1 ? 'Done' : 'Continue';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topNav}>
        <TouchableOpacity
          style={[styles.navSquircle, step === 0 && styles.navSquircleGhost]}
          onPress={() => setStep((prev) => Math.max(prev - 1, 0))}
          disabled={step === 0}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Moves to the previous onboarding step"
        >
          <Ionicons name="chevron-back" size={18} color={step === 0 ? Colors.text.tertiary : Colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(8, progress * 100)}%` }]} />
        </View>

        <TouchableOpacity
          style={styles.navSquircle}
          onPress={() => {
            if (step === 0) {
              setStep(1);
              return;
            }
            showModal('info', 'Need help?', 'You can skip optional fields and change these settings later in Profile.');
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={step === 0 ? 'Skip intro' : 'Onboarding help'}
          accessibilityHint={step === 0 ? 'Jump to the next onboarding screen' : 'Shows setup guidance'}
        >
          <Ionicons name={step === 0 ? 'play-forward-outline' : 'help-outline'} size={17} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>

      {showGuidedHeader ? (
        <>
          <View style={styles.stepMetaRow}>
            <Text style={styles.stepMeta}>{`Step ${step + 1} of ${totalSteps}`}</Text>
            <Text style={styles.stepMetaTitle}>{steps[step]?.title || 'Setup'}</Text>
          </View>
          <View style={styles.coachPanel}>
            <View style={styles.coachMascotWrap}>
              <CoveMascot variant="default" size={ONBOARDING_HELPER_MASCOT_SIZE} animate={step >= 2} />
            </View>
            <View style={styles.coachBubble}>
              <Text style={styles.coachBubbleText}>{stepBubble(isTherapistFlow, step)}</Text>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.introMetaRow}>
          <Text style={styles.stepMeta}>{`Step ${step + 1} of ${totalSteps}`}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isIntroStep ? styles.scrollWelcome : isFeatureStep ? styles.scrollFeature : styles.scrollSteps,
          ]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          {transitioning ? (
            <View style={styles.loadingInterlude}>
              <ActivityIndicator size="large" color={Colors.accent.primary} />
              <Text style={styles.loadingInterludeText}>Setting up your profile...</Text>
            </View>
          ) : (
            <Animated.View style={{ opacity: fade }}>
              {renderStepContent()}
            </Animated.View>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.backCircleBtn, step === 0 && styles.backCircleBtnDisabled]}
            onPress={() => setStep((prev) => Math.max(prev - 1, 0))}
            disabled={step === 0}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Moves to the previous onboarding step"
          >
            <Ionicons name="chevron-back" size={18} color={step === 0 ? Colors.text.tertiary : Colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.flexGrow}>
            {!canProceed ? <Text style={styles.disabledHint}>{proceedHint}</Text> : null}
            <Button
              title={primaryCtaTitle}
              onPress={step === totalSteps - 1 ? completeOnboarding : goNextStep}
              disabled={!canProceed}
              loading={loading}
              size="lg"
            />
          </View>
        </View>
      </KeyboardAvoidingView>

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

const CheckBox: React.FC<{ checked: boolean; onPress: () => void; label: string }> = ({
  checked,
  onPress,
  label,
}) => (
  <Pressable
    onPress={onPress}
    style={checkStyles.row}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={label}
  >
    <View style={[checkStyles.box, checked && checkStyles.checked]}>
      {checked ? <Ionicons name="checkmark" size={14} color={Colors.text.inverse} /> : null}
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
    backgroundColor: Colors.ui.glass,
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
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  navSquircle: {
    width: 48,
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSquircleGhost: {
    backgroundColor: Colors.bg.primary,
  },
  progressTrack: {
    flex: 1,
    height: 18,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.tertiary,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: Colors.accent.primary,
  },
  stepMetaRow: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  coachPanel: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  coachMascotWrap: {
    width: ONBOARDING_HELPER_MASCOT_SIZE,
    height: ONBOARDING_HELPER_MASCOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachBubble: {
    flex: 1,
    backgroundColor: Colors.ui.glass,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  coachBubbleText: {
    ...Typography.bodyEmphasis,
    color: Colors.text.secondary,
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
    paddingTop: Spacing.md,
  },
  scrollFeature: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingTop: Spacing.xs,
  },
  scrollSteps: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingTop: Spacing.xs,
  },
  introMetaRow: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  introScreen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  introMascotWrap: {
    width: 256,
    height: 256,
    borderRadius: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introHeadline: {
    ...Typography.title1,
    color: Colors.text.primary,
    textAlign: 'center',
    lineHeight: 34,
    maxWidth: 320,
  },
  introSubhead: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  featuresScreen: {
    gap: Spacing.sm,
  },
  featureHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxs,
    marginTop: 0,
  },
  featureBubble: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    borderRadius: 20,
    backgroundColor: Colors.ui.glass,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  featureBubbleText: {
    ...Typography.bodySemibold,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  featureList: {
    gap: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopyWrap: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  featureSubtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  stepStack: {
    gap: Spacing.sm,
  },
  stepCard: {
    gap: Spacing.xs,
    borderRadius: 24,
  },
  optionStack: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  optionCard: {
    backgroundColor: Colors.ui.glass,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  optionCardSelected: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.soft,
  },
  optionCardTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    flex: 1,
    textTransform: 'capitalize',
  },
  optionCardTitleSelected: {
    color: Colors.accent.dark,
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
    backgroundColor: 'rgba(255,255,255,0.92)',
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
  disabledHint: {
    ...Typography.caption,
    color: Colors.status.warning,
    marginBottom: 4,
  },
  loadingInterlude: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  loadingInterludeText: {
    ...Typography.bodyEmphasis,
    color: Colors.text.secondary,
  },
  backCircleBtn: {
    width: 50,
    height: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
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
