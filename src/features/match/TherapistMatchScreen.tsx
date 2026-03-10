import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingState, PillChip } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { MatchedTherapist } from '../../core/models/types';
import { matchTherapistsForClient } from '../../core/services/matchingService';
import { Colors, Radius, Shadow, Spacing, Typography } from '../../core/theme';
import { supabase } from '../../services/supabase';

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
    subtitle: 'Panic loops, overwhelm, or racing thoughts',
  },
  {
    id: 'low-heavy',
    label: 'Low or emotionally heavy',
    tags: ['self-esteem', 'mindfulness'],
    subtitle: 'Energy dips, numbness, and difficult days',
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
    subtitle: 'Burnout, pressure, and productivity stress',
  },
  {
    id: 'grief-loss',
    label: 'Grief or transition',
    tags: ['grief'],
    subtitle: 'Loss, life change, or uncertainty',
  },
  {
    id: 'exploration',
    label: 'General support',
    tags: ['mindfulness', 'self-esteem'],
    subtitle: 'Reflect, grow, and build emotional balance',
  },
];

const CARE_STYLE_OPTIONS = ['Gentle', 'Direct', 'Structured', 'Reflective'];
const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Both'];
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
  'Pick your care style',
  'Session preferences',
];

const stepDescription = (step: number) => {
  if (step === 0) return 'Choose up to 2 focus areas so we can rank your best-fit therapists.';
  if (step === 1) return 'We will use this to match you with therapists who communicate in your preferred tone.';
  return 'Set language, mode, and timing. You can change all of this later from Profile.';
};

const formatSlotTime = (iso: string | null) => {
  if (!iso) return 'No near-term slots';
  const date = new Date(iso);
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const intentIdsFromTags = (tags: string[]) => {
  return INTENT_OPTIONS
    .filter((item) => item.tags.some((tag) => tags.includes(tag)))
    .map((item) => item.id)
    .slice(0, 2);
};

const flattenedIntentTags = (intentIds: string[]) => {
  const tags = intentIds.flatMap((id) => INTENT_OPTIONS.find((item) => item.id === id)?.tags || []);
  return Array.from(new Set(tags)).slice(0, 4);
};

export const TherapistMatchScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, profile, isTherapistMode, canUseTherapistMode } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [formStep, setFormStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [intentSelections, setIntentSelections] = useState<string[]>([]);
  const [careStyle, setCareStyle] = useState('Gentle');
  const [language, setLanguage] = useState('English');
  const [sessionPreference, setSessionPreference] = useState<SessionPreference>('both');
  const [timePreference, setTimePreference] = useState<TimePreference>('evening');
  const [genderPreference, setGenderPreference] = useState<GenderPreference>('no_preference');

  const [topMatches, setTopMatches] = useState<MatchedTherapist[]>([]);
  const [curatedMatches, setCuratedMatches] = useState<MatchedTherapist[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const canGoForward = useMemo(() => {
    if (formStep === 0) return intentSelections.length > 0;
    if (formStep === 1) return !!careStyle;
    return !!sessionPreference && !!timePreference;
  }, [careStyle, formStep, intentSelections.length, sessionPreference, timePreference]);

  const openTherapistProfile = useCallback((item: MatchedTherapist) => {
    navigation.navigate('TherapistProfile', {
      therapist: item.therapist,
      matchReasonChips: item.reasonChips,
      matchScore: item.score,
      nextAvailableAt: item.nextAvailableAt,
    });
  }, [navigation]);

  const fetchMatches = useCallback(async () => {
    if (!user) return;
    setResultsError(null);
    setResultsLoading(true);

    try {
      const result = await matchTherapistsForClient(user.id, { rosterLimit: 16 });
      setTopMatches(result.topMatches);
      setCuratedMatches(result.curatedTherapists);
    } catch (err: any) {
      setTopMatches([]);
      setCuratedMatches([]);
      setResultsError(err.message || 'Unable to load therapist matches right now.');
    } finally {
      setResultsLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const hydratePreferences = useCallback(async () => {
    if (!user) {
      setLoadingPrefs(false);
      return;
    }

    setLoadingPrefs(true);
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('intent_tags, care_style_preference, session_preference, time_preference, therapist_gender_preference')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.intent_tags?.length) {
        setIntentSelections(intentIdsFromTags(data.intent_tags));
      }
      if (data?.care_style_preference) {
        setCareStyle(data.care_style_preference);
      }
      if (data?.session_preference) {
        setSessionPreference(data.session_preference);
      }
      if (data?.time_preference) {
        setTimePreference(data.time_preference);
      }
      if (data?.therapist_gender_preference) {
        setGenderPreference(data.therapist_gender_preference);
      }

      if (profile?.language) {
        setLanguage(profile.language);
      }
    } catch {
      // Prefill is best effort.
    } finally {
      setLoadingPrefs(false);
    }
  }, [profile?.language, user]);

  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  const toggleIntent = (value: string) => {
    if (intentSelections.includes(value)) {
      setIntentSelections((prev) => prev.filter((id) => id !== value));
      return;
    }
    if (intentSelections.length >= 2) return;
    setIntentSelections((prev) => [...prev, value]);
  };

  const persistAndMatch = async () => {
    if (!user) return;
    setSaving(true);
    setResultsError(null);

    const intentTags = flattenedIntentTags(intentSelections);

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

      await fetchMatches();
      setShowResults(true);
    } catch (err: any) {
      setResultsError(err.message || 'Could not save your matching preferences right now.');
    } finally {
      setSaving(false);
    }
  };

  const onRetryRefresh = async () => {
    setRefreshing(true);
    await fetchMatches();
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
                onPress={() => toggleIntent(option.id)}
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
        </View>
      );
    }

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
  };

  const renderTherapistCard = (item: MatchedTherapist, featured = false) => (
    <TouchableOpacity
      key={item.therapist.id}
      onPress={() => openTherapistProfile(item)}
      activeOpacity={0.84}
      style={featured ? styles.featuredCardTouch : undefined}
    >
      <Card
        style={featured ? { ...styles.therapistCard, ...styles.therapistCardFeatured } : styles.therapistCard}
        padded={false}
      >
        <View style={styles.mediaWrap}>
          {item.therapist.avatar_url ? (
            <Image source={{ uri: item.therapist.avatar_url }} style={styles.mediaImage} />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <Avatar name={item.therapist.display_name} size={72} />
            </View>
          )}
          <View style={styles.favoriteBadge}>
            <Ionicons name="heart-outline" size={16} color={Colors.text.inverse} />
          </View>
        </View>

        <View style={styles.matchBody}>
          <View style={styles.cardHeadRow}>
            <View style={styles.cardHeadText}>
              <Text style={styles.therapistName} numberOfLines={1}>{item.therapist.display_name}</Text>
              <Text style={styles.therapistHeadline} numberOfLines={1}>{item.therapist.headline}</Text>
            </View>
            <View style={styles.scoreBadge}>
              <Ionicons name="sparkles" size={12} color={Colors.accent.primary} />
              <Text style={styles.scoreBadgeText}>{item.score}</Text>
            </View>
          </View>

          <Text style={styles.bioText} numberOfLines={2}>{item.therapist.bio}</Text>

          <View style={styles.reasonWrap}>
            {item.reasonChips.map((chip) => (
              <View key={`${item.therapist.id}-${chip.id}`} style={styles.reasonChip}>
                <Text style={styles.reasonChipText}>{chip.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.footRow}>
            <View style={styles.availabilityCol}>
              <Text style={styles.availabilityText}>{formatSlotTime(item.nextAvailableAt)}</Text>
              <Text style={styles.availabilitySubtext}>{item.availableSlots72h} slots in next 72h</Text>
            </View>
            <View style={styles.feeCol}>
              <Text style={styles.feeValue}>₹{item.therapist.session_fee_inr}</Text>
              <Text style={styles.feeLabel}>per session</Text>
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  if (loadingPrefs) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <LoadingState message="Preparing your matching flow..." />
      </SafeAreaView>
    );
  }

  if (canUseTherapistMode && isTherapistMode) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <EmptyState
          icon="shield-checkmark-outline"
          title="Client mode required"
          message="Therapist matching intake is available only in client mode."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + Spacing.xxl }]}
        refreshControl={
          showResults
            ? <RefreshControl refreshing={refreshing} onRefresh={onRetryRefresh} tintColor={Colors.accent.primary} />
            : undefined
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Therapist Match</Text>
            <Text style={styles.title}>{showResults ? 'Your best-fit therapists' : STEP_TITLES[formStep]}</Text>
            <Text style={styles.subtitle}>
              {showResults
                ? 'Top 3 are ranked for your current needs. You can still browse the curated roster.'
                : stepDescription(formStep)}
            </Text>
          </View>
          {showResults ? (
            <TouchableOpacity style={styles.editAnswersBtn} onPress={() => setShowResults(false)}>
              <Ionicons name="create-outline" size={16} color={Colors.accent.primary} />
              <Text style={styles.editAnswersText}>Edit answers</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {!showResults ? (
          <Card style={styles.stepCard}>
            <View style={styles.progressRow}>
              {[0, 1, 2].map((idx) => (
                <View key={idx} style={[styles.progressDot, idx <= formStep && styles.progressDotActive]} />
              ))}
            </View>

            {renderStep()}

            <View style={styles.formFooter}>
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setFormStep((prev) => Math.max(0, prev - 1))}
                disabled={formStep === 0 || saving}
                fullWidth={false}
                style={styles.secondaryBtn}
              />
              {formStep < 2 ? (
                <View style={styles.formPrimaryBtnWrap}>
                  <Button
                    title="Continue"
                    onPress={() => setFormStep((prev) => Math.min(2, prev + 1))}
                    disabled={!canGoForward || saving}
                  />
                </View>
              ) : (
                <View style={styles.formPrimaryBtnWrap}>
                  <Button
                    title="See therapist matches"
                    onPress={persistAndMatch}
                    loading={saving}
                    disabled={!canGoForward || saving}
                  />
                </View>
              )}
            </View>
          </Card>
        ) : resultsLoading ? (
          <LoadingState message="Ranking therapists for your preferences..." />
        ) : resultsError ? (
          <ErrorState message={resultsError} onRetry={fetchMatches} />
        ) : curatedMatches.length === 0 ? (
          <EmptyState
            icon="leaf-outline"
            title="No therapists available right now"
            message="Try broadening your preferences and check again in a few minutes."
            actionLabel="Retry"
            onAction={fetchMatches}
          />
        ) : (
          <View style={styles.resultsWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Top 3 matches</Text>
              <Text style={styles.sectionMeta}>Curated roster</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredMatchesRow}
            >
              {topMatches.map((item) => renderTherapistCard(item, true))}
            </ScrollView>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Browse all matches</Text>
              <Text style={styles.sectionMeta}>{curatedMatches.length} therapists</Text>
            </View>
            <View style={styles.listWrap}>
              {curatedMatches.map((item) => renderTherapistCard(item))}
            </View>
          </View>
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
  scrollContent: {
    paddingBottom: 112,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  kicker: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    ...Typography.title2,
    color: Colors.text.primary,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  editAnswersBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent.soft,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '28',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  editAnswersText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.primary,
  },
  stepCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  progressDot: {
    flex: 1,
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.stroke.subtle,
  },
  progressDotActive: {
    backgroundColor: Colors.accent.primary,
  },
  formSection: {
    gap: Spacing.sm,
  },
  intentCard: {
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.secondary,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  intentCardSelected: {
    borderColor: Colors.accent.primary + '66',
    backgroundColor: Colors.accent.soft,
  },
  intentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
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
    letterSpacing: 0.4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  formFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  secondaryBtn: {
    minWidth: 88,
  },
  formPrimaryBtnWrap: {
    flex: 1,
  },
  resultsWrap: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  sectionTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  sectionMeta: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  featuredMatchesRow: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  featuredCardTouch: {
    width: 298,
  },
  listWrap: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  therapistCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderColor: Colors.stroke.subtle,
  },
  therapistCardFeatured: {
    borderColor: Colors.accent.primary + '40',
    ...Shadow.subtle,
  },
  mediaWrap: {
    height: 168,
    backgroundColor: Colors.bg.tertiary,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.soft,
  },
  favoriteBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchBody: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  cardHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardHeadText: {
    flex: 1,
  },
  therapistName: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  therapistHeadline: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '30',
    backgroundColor: Colors.accent.soft,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  scoreBadgeText: {
    ...Typography.captionEmphasis,
    color: Colors.accent.dark,
  },
  bioText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  reasonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 2,
  },
  reasonChip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  reasonChipText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  footRow: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  availabilityCol: {
    flex: 1,
  },
  availabilityText: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  availabilitySubtext: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: 1,
  },
  feeCol: {
    alignItems: 'flex-end',
  },
  feeValue: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  feeLabel: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
});
