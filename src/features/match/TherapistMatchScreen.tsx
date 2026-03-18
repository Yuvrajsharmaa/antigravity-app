import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar,
  Button,
  Card,
  CoveMascot,
  CoveModal,
  EmptyState,
  ErrorState,
  LoadingState,
  PillChip,
} from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import {
  ActiveTherapistLock,
  CoveModalAction,
  CoveModalVariant,
  MatchedTherapist,
  TherapistMatchRequestStatus,
} from '../../core/models/types';
import {
  createTherapistMatchRequest,
  fetchActiveTherapistLock,
  fetchTherapistMatchRequestsForClient,
} from '../../core/services/careFlowService';
import { matchTherapistsForClient } from '../../core/services/matchingService';
import { Colors, Radius, Shadow, Spacing, Typography } from '../../core/theme';
import { getRoleModeContract } from '../../core/utils/roleAccess';
import { supabase } from '../../services/supabase';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';

type SessionPreference = 'chat' | 'video' | 'both';
type TimePreference = 'morning' | 'afternoon' | 'evening' | 'flexible';
type GenderPreference = 'no_preference' | 'female' | 'male' | 'non_binary';

type IntentOption = {
  id: string;
  label: string;
  tags: string[];
  subtitle: string;
};

const INTENT_OPTIONS: IntentOption[] = [
  {
    id: 'anxious-stressed',
    label: 'Anxious or stressed',
    tags: ['anxiety', 'stress'],
    subtitle: 'Racing thoughts, overwhelm, or pressure',
  },
  {
    id: 'low-heavy',
    label: 'Low or emotionally heavy',
    tags: ['self-esteem', 'mindfulness'],
    subtitle: 'Low energy, numbness, or emotional weight',
  },
  {
    id: 'relationship',
    label: 'Relationship issues',
    tags: ['relationships'],
    subtitle: 'Conflict, trust, attachment, or breakups',
  },
  {
    id: 'work-pressure',
    label: 'Work pressure',
    tags: ['work-stress', 'stress'],
    subtitle: 'Burnout, deadlines, and performance stress',
  },
  {
    id: 'grief-loss',
    label: 'Grief or transition',
    tags: ['grief'],
    subtitle: 'Loss, life changes, or uncertainty',
  },
  {
    id: 'exploration',
    label: 'General support',
    tags: ['mindfulness', 'self-esteem'],
    subtitle: 'Build consistency and emotional balance',
  },
];

const CARE_STYLE_OPTIONS = ['Gentle', 'Direct', 'Structured', 'Reflective'];
const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Both'];
const GOAL_OPTIONS = [
  'Feel calmer in daily routines',
  'Improve emotional clarity',
  'Build stronger relationships',
  'Reduce work stress impact',
  'Sleep more consistently',
];
const MODALITY_OPTIONS = ['CBT', 'Mindfulness', 'Psychodynamic', 'Solution-focused'];
const SESSION_OPTIONS: Array<{ label: string; value: SessionPreference }> = [
  { label: 'Chat', value: 'chat' },
  { label: 'Video', value: 'video' },
  { label: 'Both', value: 'both' },
];
const TIME_OPTIONS: Array<{ label: string; value: TimePreference }> = [
  { label: 'Morning', value: 'morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
  { label: 'Flexible', value: 'flexible' },
];
const GENDER_OPTIONS: Array<{ label: string; value: GenderPreference }> = [
  { label: 'No preference', value: 'no_preference' },
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Non-binary', value: 'non_binary' },
];

const STEP_TITLES = [
  'What support do you need right now?',
  'Goals and care style',
  'Session preferences',
  'Optional refiners',
];

const stepDescription = (step: number) => {
  if (step === 0) return 'Choose up to 2 focus areas so we can rank your best matches.';
  if (step === 1) return 'Pick goals and communication style for better fit.';
  if (step === 2) return 'Set language, session mode, and timing preferences.';
  return 'Add optional filters and a short note about how you are feeling today.';
};

const normalizeIntentTag = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-');

const intentIdsFromTags = (tags: string[]) =>
  INTENT_OPTIONS
    .filter((item) => item.tags.some((tag) => tags.includes(tag)))
    .map((item) => item.id)
    .slice(0, 2);

const flattenedIntentTags = (intentIds: string[]) => {
  const tags = intentIds.flatMap((id) => INTENT_OPTIONS.find((item) => item.id === id)?.tags || []);
  return Array.from(new Set(tags)).slice(0, 4);
};

const confidenceText = (score: MatchedTherapist['confidenceLabel']) => {
  if (score === 'excellent') return 'Excellent fit';
  if (score === 'strong') return 'Strong fit';
  return 'Good fit';
};

const formatAvailability = (iso: string | null) => {
  if (!iso) return 'No near-term availability';
  const date = new Date(iso);
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

export const TherapistMatchScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, profile, isTherapistMode, canUseTherapistMode } = useAuth();
  const roleMode = getRoleModeContract(profile?.role, isTherapistMode);
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxl);
  const { width: viewportWidth } = useWindowDimensions();

  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [formStep, setFormStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [intentSelections, setIntentSelections] = useState<string[]>([]);
  const [goalSelections, setGoalSelections] = useState<string[]>([]);
  const [careStyle, setCareStyle] = useState('Gentle');
  const [language, setLanguage] = useState('English');
  const [sessionPreference, setSessionPreference] = useState<SessionPreference>('both');
  const [timePreference, setTimePreference] = useState<TimePreference>('evening');
  const [genderPreference, setGenderPreference] = useState<GenderPreference>('no_preference');
  const [preferredModalities, setPreferredModalities] = useState<string[]>([]);
  const [urgencyLevel, setUrgencyLevel] = useState(2);
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const [supportContext, setSupportContext] = useState('');

  const [topMatches, setTopMatches] = useState<MatchedTherapist[]>([]);
  const [curatedMatches, setCuratedMatches] = useState<MatchedTherapist[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [activeLock, setActiveLock] = useState<ActiveTherapistLock | null>(null);
  const [showMoreMatches, setShowMoreMatches] = useState(false);
  const [visibleMoreCount, setVisibleMoreCount] = useState(6);

  const [requestStatusByTherapist, setRequestStatusByTherapist] = useState<Record<string, TherapistMatchRequestStatus>>({});
  const [introTarget, setIntroTarget] = useState<MatchedTherapist | null>(null);
  const [introQuestion, setIntroQuestion] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);

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

  const canGoForward = useMemo(() => {
    if (formStep === 0) return intentSelections.length > 0 && intentSelections.length <= 2;
    if (formStep === 1) return Boolean(careStyle);
    if (formStep === 2) return Boolean(sessionPreference);
    return true;
  }, [careStyle, formStep, intentSelections.length, sessionPreference]);

  const topMatchIds = useMemo(() => new Set(topMatches.map((item) => item.therapist.id)), [topMatches]);
  const additionalMatches = useMemo(
    () => curatedMatches.filter((item) => !topMatchIds.has(item.therapist.id)),
    [curatedMatches, topMatchIds],
  );
  const visibleAdditionalMatches = useMemo(
    () => (showMoreMatches ? additionalMatches.slice(0, visibleMoreCount) : []),
    [additionalMatches, showMoreMatches, visibleMoreCount],
  );

  const cardWidth = useMemo(() => Math.max(292, Math.min(viewportWidth - (Spacing.xl * 2), 370)), [viewportWidth]);

  const fetchMatches = useCallback(async () => {
    if (!user?.id) return;
    setResultsError(null);
    setResultsLoading(true);
    try {
      const result = await matchTherapistsForClient(user.id, { rosterLimit: 20 });
      setTopMatches(result.topMatches);
      setCuratedMatches(result.curatedTherapists);
    } catch (err: any) {
      setTopMatches([]);
      setCuratedMatches([]);
      setResultsError(err.message || 'Unable to load matches right now.');
    } finally {
      setResultsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const fetchRequestStatuses = useCallback(async () => {
    if (!user?.id) return;
    try {
      const rows = await fetchTherapistMatchRequestsForClient(user.id);
      const next: Record<string, TherapistMatchRequestStatus> = {};
      for (const row of rows) {
        if (!next[row.therapist_id]) {
          next[row.therapist_id] = row.status;
        }
      }
      setRequestStatusByTherapist(next);
    } catch {
      // Best effort.
    }
  }, [user?.id]);

  const hydratePreferences = useCallback(async () => {
    if (!user?.id) {
      setLoadingPrefs(false);
      return;
    }

    setLoadingPrefs(true);
    try {
      const lockPromise = fetchActiveTherapistLock(user.id).catch(() => null);
      const [{ data: prefData, error: prefError }, { data: matchData, error: matchError }] = await Promise.all([
        supabase
          .from('user_preferences')
          .select('intent_tags, care_style_preference, session_preference, time_preference, therapist_gender_preference')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('client_match_profile')
          .select('concern_tags, goal_tags, style_preference, urgency_level, budget_max_inr, modality_preferences')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (prefError) throw prefError;
      if (matchError) throw matchError;

      const combinedIntentTags = matchData?.concern_tags || prefData?.intent_tags || [];
      if (combinedIntentTags?.length) setIntentSelections(intentIdsFromTags(combinedIntentTags));
      if (matchData?.goal_tags?.length) setGoalSelections(matchData.goal_tags.slice(0, 3));
      if (matchData?.style_preference || prefData?.care_style_preference) {
        setCareStyle(matchData?.style_preference || prefData?.care_style_preference);
      }
      if (prefData?.session_preference) setSessionPreference(prefData.session_preference);
      if (prefData?.time_preference) setTimePreference(prefData.time_preference);
      if (prefData?.therapist_gender_preference) setGenderPreference(prefData.therapist_gender_preference);
      if (matchData?.urgency_level) setUrgencyLevel(matchData.urgency_level);
      if (typeof matchData?.budget_max_inr === 'number') setBudgetMax(matchData.budget_max_inr);
      if (matchData?.modality_preferences?.preferred?.length) {
        setPreferredModalities(matchData.modality_preferences.preferred);
      }
      if (typeof matchData?.modality_preferences?.context_note === 'string') {
        setSupportContext(matchData.modality_preferences.context_note);
      }
      if (profile?.language) setLanguage(profile.language);

      const lock = await lockPromise;
      setActiveLock(lock);
      await fetchRequestStatuses();
    } catch {
      // Prefill best effort.
    } finally {
      setLoadingPrefs(false);
    }
  }, [fetchRequestStatuses, profile?.language, user?.id]);

  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  useEffect(() => {
    if (showResults) {
      fetchRequestStatuses();
    }
  }, [fetchRequestStatuses, showResults]);

  const persistAndMatch = async () => {
    if (!user?.id) return;

    setSaving(true);
    setResultsError(null);

    const intentTags = flattenedIntentTags(intentSelections);
    const normalizedGoals = goalSelections.map((goal) =>
      goal.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'));

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          language,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (profileError) throw profileError;

      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            intent_tags: intentTags,
            care_style_preference: careStyle,
            session_preference: sessionPreference,
            time_preference: timePreference,
            therapist_gender_preference: genderPreference,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (prefError) throw prefError;

      const { error: matchProfileError } = await supabase
        .from('client_match_profile')
        .upsert(
          {
            user_id: user.id,
            concern_tags: intentTags,
            goal_tags: normalizedGoals,
            style_preference: careStyle,
            session_preference: sessionPreference,
            language_preference: language,
            availability_windows: [],
            gender_preference: genderPreference,
            modality_preferences: {
              preferred: preferredModalities,
              avoid: [],
              context_note: supportContext.trim() || null,
            },
            urgency_level: urgencyLevel,
            first_session_sla_hours: urgencyLevel >= 4 ? 24 : urgencyLevel === 3 ? 48 : 72,
            budget_max_inr: budgetMax,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (matchProfileError) throw matchProfileError;

      await fetchMatches();
      await fetchRequestStatuses();
      setShowResults(true);
      setShowMoreMatches(false);
      setVisibleMoreCount(6);
    } catch (err: any) {
      setResultsError(err.message || 'Could not save your matching preferences.');
      showModal('error', 'Unable to continue', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openTherapistProfile = useCallback(
    (item: MatchedTherapist) => {
      navigation.navigate('TherapistProfile', {
        therapist: item.therapist,
        matchReasonChips: item.reasonChips,
        matchScore: item.score,
        nextAvailableAt: item.nextAvailableAt,
      });
    },
    [navigation],
  );

  const openIntroQuestion = (item: MatchedTherapist) => {
    setIntroTarget(item);
    setIntroQuestion(item.therapist.standout_prompt || 'What would be the best first step for us to focus on?');
  };

  const submitIntroQuestion = async () => {
    if (!user?.id || !introTarget) return;
    const text = introQuestion.trim();
    if (!text.length) {
      showModal('blocking', 'Add a message', 'Write a short intro question to continue.');
      return;
    }

    setRequestSubmitting(true);
    try {
      await createTherapistMatchRequest({
        userId: user.id,
        therapistId: introTarget.therapist.id,
        introQuestion: text,
      });
      setRequestStatusByTherapist((prev) => ({
        ...prev,
        [introTarget.therapist.id]: 'pending',
      }));
      setIntroTarget(null);
      setIntroQuestion('');
      showModal('success', 'Intro sent', `Your intro message was sent to ${introTarget.therapist.display_name}.`);
    } catch (err: any) {
      showModal('error', 'Unable to send', err.message || 'Please try again.');
    } finally {
      setRequestSubmitting(false);
    }
  };

  const openIntroBooking = (item: MatchedTherapist) => {
    navigation.navigate('SlotSelection', {
      therapist: item.therapist,
      bookingPurpose: 'intro',
      durationMinutes: 15,
    });
  };

  const renderStep = () => {
    if (formStep === 0) {
      return (
        <View style={styles.formSection}>
          {INTENT_OPTIONS.map((option) => {
            const selected = intentSelections.includes(option.id);
            return (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.75}
                onPress={() => {
                  if (selected) {
                    setIntentSelections((prev) => prev.filter((id) => id !== option.id));
                    return;
                  }
                  if (intentSelections.length >= 2) return;
                  setIntentSelections((prev) => [...prev, option.id]);
                }}
                style={[styles.intentCard, selected && styles.intentCardSelected]}
              >
                <View style={styles.intentHeaderRow}>
                  <Text style={styles.intentTitle}>{option.label}</Text>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={selected ? Colors.accent.primary : Colors.text.tertiary}
                  />
                </View>
                <Text style={styles.intentSubtitle}>{option.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (formStep === 1) {
      return (
        <View style={styles.formSection}>
          <Card style={styles.preferenceCard}>
            <Text style={styles.preferenceTitle}>What should improve in the next few weeks?</Text>
            <View style={styles.chipsWrap}>
              {GOAL_OPTIONS.map((option) => (
                <PillChip
                  key={option}
                  label={option}
                  selected={goalSelections.includes(option)}
                  onPress={() => {
                    if (goalSelections.includes(option)) {
                      setGoalSelections((prev) => prev.filter((goal) => goal !== option));
                      return;
                    }
                    if (goalSelections.length >= 3) return;
                    setGoalSelections((prev) => [...prev, option]);
                  }}
                />
              ))}
            </View>
          </Card>

          <Card style={styles.preferenceCard}>
            <Text style={styles.preferenceTitle}>Preferred therapist style</Text>
            <View style={styles.chipsWrap}>
              {CARE_STYLE_OPTIONS.map((option) => (
                <PillChip
                  key={option}
                  label={option}
                  selected={careStyle === option}
                  onPress={() => setCareStyle(option)}
                />
              ))}
            </View>
          </Card>
        </View>
      );
    }

    if (formStep === 2) {
      return (
        <View style={styles.formSection}>
          <Card style={styles.preferenceCard}>
            <Text style={styles.preferenceTitle}>Language</Text>
            <View style={styles.chipsWrap}>
              {LANGUAGE_OPTIONS.map((option) => (
                <PillChip
                  key={option}
                  label={option}
                  selected={language === option}
                  onPress={() => setLanguage(option)}
                />
              ))}
            </View>
          </Card>

          <Card style={styles.preferenceCard}>
            <Text style={styles.preferenceTitle}>Session mode</Text>
            <View style={styles.chipsWrap}>
              {SESSION_OPTIONS.map((option) => (
                <PillChip
                  key={option.value}
                  label={option.label}
                  selected={sessionPreference === option.value}
                  onPress={() => setSessionPreference(option.value)}
                />
              ))}
            </View>
          </Card>

          <Card style={styles.preferenceCard}>
            <Text style={styles.preferenceTitle}>Preferred time</Text>
            <View style={styles.chipsWrap}>
              {TIME_OPTIONS.map((option) => (
                <PillChip
                  key={option.value}
                  label={option.label}
                  selected={timePreference === option.value}
                  onPress={() => setTimePreference(option.value)}
                />
              ))}
            </View>
          </Card>
        </View>
      );
    }

    return (
      <View style={styles.formSection}>
        <Card style={styles.preferenceCard}>
          <Text style={styles.preferenceTitle}>Therapist gender (optional)</Text>
          <View style={styles.chipsWrap}>
            {GENDER_OPTIONS.map((option) => (
              <PillChip
                key={option.value}
                label={option.label}
                selected={genderPreference === option.value}
                onPress={() => setGenderPreference(option.value)}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.preferenceCard}>
          <Text style={styles.preferenceTitle}>Preferred modalities (optional)</Text>
          <View style={styles.chipsWrap}>
            {MODALITY_OPTIONS.map((option) => (
              <PillChip
                key={option}
                label={option}
                selected={preferredModalities.includes(option)}
                onPress={() => {
                  if (preferredModalities.includes(option)) {
                    setPreferredModalities((prev) => prev.filter((item) => item !== option));
                    return;
                  }
                  setPreferredModalities((prev) => [...prev, option]);
                }}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.preferenceCard}>
          <Text style={styles.preferenceTitle}>Urgency of support</Text>
          <View style={styles.chipsWrap}>
            {[1, 2, 3, 4, 5].map((option) => (
              <PillChip
                key={option}
                label={`Level ${option}`}
                selected={urgencyLevel === option}
                onPress={() => setUrgencyLevel(option)}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.preferenceCard}>
          <Text style={styles.preferenceTitle}>Budget per session (optional)</Text>
          <View style={styles.chipsWrap}>
            {[
              { label: 'No limit', value: null },
              { label: 'Up to ₹500', value: 500 },
              { label: 'Up to ₹800', value: 800 },
              { label: 'Up to ₹1200', value: 1200 },
            ].map((option) => (
              <PillChip
                key={option.label}
                label={option.label}
                selected={budgetMax === option.value}
                onPress={() => setBudgetMax(option.value)}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.preferenceCard}>
          <Text style={styles.preferenceTitle}>Anything else to share? (optional)</Text>
          <TextInput
            style={styles.contextInput}
            multiline
            value={supportContext}
            onChangeText={setSupportContext}
            placeholder="Share how you are feeling and what support would help most."
            placeholderTextColor={Colors.text.tertiary}
            textAlignVertical="top"
            maxLength={300}
          />
        </Card>
      </View>
    );
  };

  const renderMatchCard = (item: MatchedTherapist, featured: boolean) => {
    const requestStatus = requestStatusByTherapist[item.therapist.id];
    const isLocked = activeLock?.therapist_id === item.therapist.id;
    const confidence = confidenceText(item.confidenceLabel);
    const quote = item.therapist.standout_quote?.trim() || 'A steady first session can change a whole week.';
    const prompt = item.therapist.standout_prompt?.trim() || 'What has felt most difficult lately?';

    let primaryLabel = 'Send intro';
    let primaryDisabled = false;
    let primaryAction = () => openIntroQuestion(item);

    if (requestStatus === 'pending') {
      primaryLabel = 'Intro pending';
      primaryDisabled = true;
    } else if (requestStatus === 'accepted') {
      primaryLabel = 'Book 15-min intro';
      primaryAction = () => openIntroBooking(item);
    } else if (requestStatus === 'declined') {
      primaryLabel = 'Send another intro';
    }

    return (
      <Card key={item.therapist.id} style={[styles.matchCard, { width: cardWidth }, featured && styles.featuredCard]}>
        <View style={styles.heroImageWrap}>
          {item.therapist.avatar_url ? (
            <Image source={{ uri: item.therapist.avatar_url }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroFallback}>
              <CoveMascot variant="default" size={72} />
            </View>
          )}
          <View style={styles.heroMetaOverlay}>
            <Text style={styles.heroName}>{item.therapist.display_name}</Text>
            <Text style={styles.heroHeadline} numberOfLines={1}>{item.therapist.headline}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="star-outline" size={14} color={Colors.text.secondary} />
            <Text style={styles.statText}>{confidence}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={14} color={Colors.text.secondary} />
            <Text style={styles.statText}>{formatAvailability(item.nextAvailableAt)}</Text>
          </View>
        </View>

        <View style={styles.quoteBlock}>
          <Text style={styles.quoteLabel}>Therapist note</Text>
          <Text style={styles.quoteText}>{quote}</Text>
        </View>

        <View style={styles.promptBlock}>
          <Text style={styles.promptLabel}>Try asking</Text>
          <Text style={styles.promptText}>{prompt}</Text>
        </View>

        <View style={styles.reasonRow}>
          {item.reasonChips.map((chip) => (
            <View key={`${item.therapist.id}-${chip.id}`} style={styles.reasonChip}>
              <Text style={styles.reasonChipText}>{chip.label}</Text>
            </View>
          ))}
        </View>

        {isLocked ? (
          <View style={styles.lockedBadge}>
            <Ionicons name="checkmark-circle-outline" size={14} color={Colors.accent.primary} />
            <Text style={styles.lockedBadgeText}>Primary therapist</Text>
          </View>
        ) : null}

        <View style={styles.cardActions}>
          <Button
            title="Profile"
            variant="secondary"
            size="sm"
            fullWidth={false}
            style={{ flex: 1 }}
            onPress={() => openTherapistProfile(item)}
          />
          <Button
            title={primaryLabel}
            variant="primary"
            size="sm"
            fullWidth={false}
            style={{ flex: 1 }}
            onPress={primaryAction}
            disabled={primaryDisabled}
          />
        </View>
      </Card>
    );
  };

  const renderMoreCard = () => (
    <Card key="more-card" style={[styles.matchCard, styles.moreCard, { width: cardWidth }]}>
      <CoveMascot variant="default" size={88} />
      <Text style={styles.moreTitle}>Want more matches?</Text>
      <Text style={styles.moreSubtitle}>
        We can load more therapists that fit your preferences.
      </Text>
      <View style={styles.moreActions}>
        {!showMoreMatches ? (
          <Button
            title="Show more matches"
            onPress={() => setShowMoreMatches(true)}
          />
        ) : (
          <Button
            title={visibleMoreCount < additionalMatches.length ? 'Load 6 more' : 'All matches loaded'}
            onPress={() => setVisibleMoreCount((prev) => Math.min(prev + 6, additionalMatches.length))}
            disabled={visibleMoreCount >= additionalMatches.length}
          />
        )}
      </View>
    </Card>
  );

  if (loadingPrefs) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <LoadingState message="Preparing your match flow..." style={styles.screenState} />
      </SafeAreaView>
    );
  }

  if (!roleMode.canAccessMatchFlow || (canUseTherapistMode && isTherapistMode)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <EmptyState
          icon="shield-checkmark-outline"
          title="Matching unavailable in this mode"
          message="Switch to client mode to use matches."
          style={styles.screenState}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {!showResults ? (
        <View style={styles.formRoot}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formScroll}
          >
            <View style={styles.header}>
              <Text style={styles.kicker}>Matches</Text>
              <Text style={styles.title}>{STEP_TITLES[formStep]}</Text>
              <Text style={styles.subtitle}>Answer a few questions to rank your best therapist matches.</Text>
              <View style={styles.matchCoachRow}>
                <CoveMascot variant="default" size={56} />
                <View style={styles.matchCoachBubble}>
                  <Text style={styles.matchCoachText}>{stepDescription(formStep)}</Text>
                </View>
              </View>
            </View>

            <Card style={styles.stepCard}>
              <View style={styles.progressMetaRow}>
                <Text style={styles.progressLabel}>Step {formStep + 1} of 4</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${((formStep + 1) / 4) * 100}%` }]} />
              </View>
              {renderStep()}
            </Card>
          </ScrollView>

          <View style={styles.formFooter}>
            <Button
              title="Back"
              variant="ghost"
              onPress={() => setFormStep((prev) => Math.max(0, prev - 1))}
              disabled={formStep === 0 || saving}
              fullWidth={false}
              style={styles.backButton}
            />
            <View style={styles.flexFill}>
              {formStep < 3 ? (
                <Button
                  title="Continue"
                  onPress={() => setFormStep((prev) => Math.min(3, prev + 1))}
                  disabled={!canGoForward || saving}
                />
              ) : (
                <Button
                  title="See matches"
                  onPress={persistAndMatch}
                  loading={saving}
                  disabled={!canGoForward || saving}
                />
              )}
            </View>
          </View>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.resultsScroll, { paddingBottom: tabSafeBottomPadding }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchMatches();
              }}
              tintColor={Colors.accent.primary}
            />
          }
        >
          <View style={styles.header}>
            <Text style={styles.kicker}>Matches</Text>
            <Text style={styles.title}>Your best therapist matches</Text>
            <Text style={styles.subtitle}>
              Start with a short intro message. Once a therapist accepts, you can book a 15-minute intro session.
            </Text>
            <TouchableOpacity style={styles.editAnswersBtn} onPress={() => setShowResults(false)}>
              <Ionicons name="create-outline" size={16} color={Colors.accent.primary} />
              <Text style={styles.editAnswersText}>Edit preferences</Text>
            </TouchableOpacity>
          </View>

          {resultsLoading ? (
            <LoadingState message="Loading matches..." style={styles.screenState} />
          ) : resultsError ? (
            <ErrorState message={resultsError} onRetry={fetchMatches} style={styles.screenState} />
          ) : curatedMatches.length === 0 ? (
            <EmptyState
              icon="leaf-outline"
              title="No matches available right now"
              message="Try broadening your preferences and check again in a few minutes."
              actionLabel="Retry"
              onAction={fetchMatches}
              style={styles.screenState}
            />
          ) : (
            <>
              {activeLock ? (
                <Card style={styles.lockedInfoCard}>
                  <Avatar uri={activeLock.therapist_avatar} name={activeLock.therapist_name} size={34} />
                  <View style={styles.lockedInfoTextWrap}>
                    <Text style={styles.lockedInfoTitle}>Current primary therapist</Text>
                    <Text style={styles.lockedInfoBody}>{activeLock.therapist_name}</Text>
                  </View>
                  <TouchableOpacity style={styles.manageBtn} onPress={() => navigation.navigate('ProfileTab')}>
                    <Text style={styles.manageBtnText}>Manage</Text>
                  </TouchableOpacity>
                </Card>
              ) : null}

              <ScrollView
                horizontal
                pagingEnabled
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.deckRow}
              >
                {topMatches.map((item) => renderMatchCard(item, true))}
                {renderMoreCard()}
                {visibleAdditionalMatches.map((item) => renderMatchCard(item, false))}
              </ScrollView>
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={Boolean(introTarget)} transparent animationType="slide" onRequestClose={() => setIntroTarget(null)}>
        <View style={styles.introOverlay}>
          <TouchableWithoutFeedback onPress={() => setIntroTarget(null)}>
            <View style={styles.introBackdrop} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.introSheet}>
                <View style={styles.introHeader}>
                  <Text style={styles.introTitle}>
                    Message {introTarget?.therapist.display_name || 'therapist'}
                  </Text>
                  <TouchableOpacity onPress={() => setIntroTarget(null)}>
                    <Ionicons name="close" size={22} color={Colors.text.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.introBody}>
                  Send one short question to start. If they accept, you can book a 15-minute intro.
                </Text>
                <TextInput
                  style={styles.introInput}
                  multiline
                  value={introQuestion}
                  onChangeText={setIntroQuestion}
                  placeholder="What would you like help with first?"
                  placeholderTextColor={Colors.text.tertiary}
                />
                <View style={styles.introActions}>
                  <Button
                    title="Not now"
                    variant="ghost"
                    onPress={() => setIntroTarget(null)}
                    fullWidth={false}
                    style={styles.backButton}
                  />
                  <View style={styles.flexFill}>
                    <Button
                      title={requestSubmitting ? 'Sending...' : 'Send intro'}
                      onPress={submitIntroQuestion}
                      loading={requestSubmitting}
                      disabled={requestSubmitting}
                    />
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>

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
  screenState: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  formRoot: {
    flex: 1,
  },
  formScroll: {
    paddingBottom: 130,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },
  kicker: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  title: {
    ...Typography.title2,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  matchCoachRow: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  matchCoachBubble: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.lg,
    backgroundColor: Colors.ui.glass,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  matchCoachText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  stepCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.tertiary,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: Colors.accent.primary,
  },
  formSection: {
    gap: Spacing.sm,
  },
  intentCard: {
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.lg,
    backgroundColor: Colors.ui.glass,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  intentCardSelected: {
    borderColor: Colors.accent.primary + '55',
    backgroundColor: Colors.accent.soft,
  },
  intentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  intentTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    flex: 1,
  },
  intentSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  preferenceCard: {
    gap: Spacing.sm,
  },
  preferenceTitle: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  contextInput: {
    minHeight: 96,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  formFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.stroke.subtle,
  },
  backButton: {
    minWidth: 92,
  },
  flexFill: {
    flex: 1,
  },
  resultsScroll: {
    paddingBottom: Spacing.xxxxl,
    gap: Spacing.sm,
  },
  editAnswersBtn: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.ui.glass,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  editAnswersText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  lockedInfoCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockedInfoTextWrap: {
    flex: 1,
  },
  lockedInfoTitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  lockedInfoBody: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  manageBtn: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  manageBtnText: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  deckRow: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  matchCard: {
    borderRadius: Radius.xl,
    gap: Spacing.sm,
    borderColor: Colors.stroke.subtle,
  },
  featuredCard: {
    borderColor: Colors.accent.primary + '45',
    ...Shadow.subtle,
  },
  heroImageWrap: {
    height: 208,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.bg.tertiary,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMetaOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  heroName: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  heroHeadline: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.pill,
    backgroundColor: Colors.ui.glass,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 4,
  },
  statText: {
    ...Typography.micro,
    color: Colors.text.secondary,
  },
  quoteBlock: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    padding: Spacing.sm,
    gap: 4,
  },
  quoteLabel: {
    ...Typography.micro,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  quoteText: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
    lineHeight: 24,
  },
  promptBlock: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.tertiary,
    padding: Spacing.sm,
    gap: 4,
  },
  promptLabel: {
    ...Typography.micro,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  promptText: {
    ...Typography.body,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  reasonChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.ui.glass,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 4,
  },
  reasonChipText: {
    ...Typography.micro,
    color: Colors.text.secondary,
  },
  lockedBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '55',
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 4,
  },
  lockedBadgeText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.dark,
  },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  secondaryCardBtn: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.ui.glass,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryCardBtnText: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  primaryCardBtn: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.accent.dark,
  },
  primaryCardBtnDisabled: {
    opacity: 0.55,
  },
  primaryCardBtnText: {
    ...Typography.captionEmphasis,
    color: Colors.text.inverse,
  },
  moreCard: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 520,
  },
  moreTitle: {
    ...Typography.title3,
    color: Colors.text.primary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  moreSubtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 4,
  },
  moreActions: {
    marginTop: Spacing.md,
    width: '100%',
  },
  introOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.ui.overlay,
  },
  introBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  introSheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  introHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  introTitle: {
    ...Typography.title3,
    color: Colors.text.primary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  introBody: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  introInput: {
    minHeight: 112,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.soft,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
    ...Typography.body,
    color: Colors.text.primary,
  },
  introActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
});
