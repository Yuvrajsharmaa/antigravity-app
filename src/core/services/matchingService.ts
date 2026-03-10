import { MatchedTherapist, MatchReasonChip, Therapist } from '../models/types';
import { supabase } from '../../services/supabase';

interface MatchPreferences {
  intent_tags?: string[] | null;
  language?: string | null;
  care_style_preference?: string | null;
  session_preference?: 'chat' | 'video' | 'both';
  time_preference?: 'morning' | 'afternoon' | 'evening' | 'flexible';
}

interface MatchOptions {
  filterTag?: string;
  rosterLimit?: number;
}

interface MatchResult {
  topMatches: MatchedTherapist[];
  curatedTherapists: MatchedTherapist[];
}

const normalizeTag = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeWords = (value: string) => normalizeTag(value)
  .split(/[\s-]+/)
  .filter((item) => item.length > 2);

const toTitle = (value: string) => value
  .replace(/-/g, ' ')
  .replace(/\b\w/g, (m) => m.toUpperCase());

const getStyleKeywords = (style: string) => {
  const key = style.toLowerCase();
  if (key.includes('gentle')) return ['gentle', 'warm', 'calm', 'compassionate', 'nonjudgmental'];
  if (key.includes('direct')) return ['direct', 'practical', 'focused', 'action', 'clear'];
  if (key.includes('structured')) return ['structured', 'goal', 'plan', 'cbt', 'framework'];
  return ['reflective', 'mindful', 'insight', 'explore', 'narrative'];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const computeIntentScore = (intentTags: string[], specialties: string[]) => {
  if (!intentTags.length || !specialties.length) return 0.5;

  const specialtyWords = new Set(specialties.flatMap((item) => normalizeWords(item)));
  let matched = 0;
  for (const intent of intentTags) {
    const intentWords = normalizeWords(intent);
    const overlap = intentWords.some((word) => specialtyWords.has(word));
    if (overlap) matched += 1;
  }

  return clamp(matched / intentTags.length, 0, 1);
};

const computeStyleScore = (clientStyle: string | null | undefined, therapist: Therapist) => {
  if (!clientStyle) return 0.65;
  const content = `${therapist.headline || ''} ${therapist.bio || ''}`.toLowerCase();
  const keywords = getStyleKeywords(clientStyle);
  const hasSignal = keywords.some((keyword) => content.includes(keyword));
  if (hasSignal) return 1;

  const genericSignals = ['gentle', 'direct', 'structured', 'reflective', 'warm', 'mindful'];
  const hasAnyStyleSignal = genericSignals.some((signal) => content.includes(signal));
  return hasAnyStyleSignal ? 0.35 : 0.6;
};

const computeLanguageScore = (languagePref: string | null | undefined, therapistLanguages: string[]) => {
  if (!languagePref || languagePref.toLowerCase() === 'both') return 1;
  const normalizedPref = languagePref.toLowerCase();
  const match = therapistLanguages.some((language) => language.toLowerCase() === normalizedPref);
  return match ? 1 : 0.2;
};

const computeQualityScore = (therapist: Therapist) => {
  const ratingScore = therapist.rating ? clamp(therapist.rating / 5, 0, 1) : 0.6;
  const rank = typeof therapist.featured_rank === 'number' ? therapist.featured_rank : 99;
  const featuredScore = 1 - clamp((rank - 1) / 99, 0, 1);
  return clamp((ratingScore * 0.75) + (featuredScore * 0.25), 0, 1);
};

const computeTimePreferenceScore = (
  timePreference: MatchPreferences['time_preference'],
  slotStarts: string[],
) => {
  if (!slotStarts.length || !timePreference || timePreference === 'flexible') return 1;
  let matches = 0;
  for (const startAt of slotStarts) {
    const hour = new Date(startAt).getHours();
    if (timePreference === 'morning' && hour < 12) matches += 1;
    if (timePreference === 'afternoon' && hour >= 12 && hour < 17) matches += 1;
    if (timePreference === 'evening' && hour >= 17) matches += 1;
  }
  return clamp(matches / slotStarts.length, 0, 1);
};

const formatAvailabilityChip = (nextAvailableAt: string | null) => {
  if (!nextAvailableAt) return null;
  const nextDate = new Date(nextAvailableAt);
  const now = new Date();
  const hoursAway = Math.round((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60));
  if (hoursAway <= 4) return 'Available soon';
  if (hoursAway <= 12) return 'Available today';
  return 'Available in 72h';
};

const toReasonChips = ({
  therapist,
  intentTags,
  styleScore,
  languageScore,
  nextAvailableAt,
  timePreference,
  timeFitScore,
}: {
  therapist: Therapist;
  intentTags: string[];
  styleScore: number;
  languageScore: number;
  nextAvailableAt: string | null;
  timePreference?: MatchPreferences['time_preference'];
  timeFitScore?: number;
}): MatchReasonChip[] => {
  const chips: MatchReasonChip[] = [];

  if (intentTags.length) {
    const matchedSpecialties = therapist.specialties
      .filter((specialty) => {
        const specialtyWords = new Set(normalizeWords(specialty));
        return intentTags.some((intent) => normalizeWords(intent).some((word) => specialtyWords.has(word)));
      })
      .slice(0, 2);

    if (matchedSpecialties.length) {
      chips.push({
        id: 'intent',
        label: `Works with ${matchedSpecialties.map((item) => toTitle(item)).join(' + ')}`,
      });
    }
  }

  if (styleScore >= 0.9) {
    chips.push({ id: 'style', label: 'Matches your care style' });
  }

  if (languageScore >= 1) {
    chips.push({ id: 'language', label: `Language fit: ${therapist.languages.join(', ')}` });
  }

  if (timePreference && timePreference !== 'flexible' && (timeFitScore || 0) >= 0.6) {
    chips.push({ id: 'time-fit', label: `Matches your ${timePreference} preference` });
  }

  const availabilityChip = formatAvailabilityChip(nextAvailableAt);
  if (availabilityChip) {
    chips.push({ id: 'availability', label: availabilityChip });
  }

  if (!chips.length) {
    chips.push({ id: 'quality', label: 'Consistent profile and active schedule' });
  }

  return chips.slice(0, 3);
};

const mapTherapist = (row: any): Therapist => ({
  ...row,
  display_name: row.profiles?.display_name || row.profiles?.first_name || 'Therapist',
  avatar_url: row.profiles?.avatar_url || null,
  first_name: row.profiles?.first_name || 'Therapist',
});

export const matchTherapistsForClient = async (
  userId: string,
  options?: MatchOptions,
): Promise<MatchResult> => {
  const rosterLimit = clamp(options?.rosterLimit || 16, 12, 20);
  const filterTag = options?.filterTag && options.filterTag !== 'All'
    ? normalizeTag(options.filterTag).replace(/\s+/g, '-')
    : null;

  const [{ data: prefData, error: prefError }, { data: therapistData, error: therapistError }] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('intent_tags, care_style_preference, session_preference, time_preference')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('language')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (prefError) throw prefError;
  if (therapistError) throw therapistError;

  const preferences: MatchPreferences = {
    intent_tags: prefData?.intent_tags || [],
    care_style_preference: prefData?.care_style_preference || null,
    session_preference: prefData?.session_preference || 'both',
    time_preference: prefData?.time_preference || 'evening',
    language: therapistData?.language || 'English',
  };

  const buildTherapistQuery = (verifiedOnly: boolean) => {
    let query = supabase
      .from('therapists')
      .select(`
        *,
        profiles!inner (display_name, avatar_url, first_name)
      `)
      .eq('is_active', true);

    if (verifiedOnly) {
      query = query.eq('is_verified', true);
    }

    if (filterTag) {
      query = query.contains('specialties', [filterTag]);
    }

    return query
      .order('featured_rank', { ascending: true })
      .limit(80);
  };

  const { data: verifiedRows, error } = await buildTherapistQuery(true);
  if (error) throw error;

  let therapistRows = verifiedRows || [];
  if (!therapistRows.length) {
    const { data: fallbackRows, error: fallbackError } = await buildTherapistQuery(false);
    if (fallbackError) throw fallbackError;
    therapistRows = fallbackRows || [];
  }

  const mappedTherapists: Therapist[] = therapistRows.map(mapTherapist);
  if (!mappedTherapists.length) {
    return { topMatches: [], curatedTherapists: [] };
  }

  const curatedPool = mappedTherapists
    .sort((a, b) => {
      if (a.featured_rank !== b.featured_rank) return a.featured_rank - b.featured_rank;
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      return a.session_fee_inr - b.session_fee_inr;
    })
    .slice(0, Math.min(rosterLimit, mappedTherapists.length));

  const therapistIds = curatedPool.map((item) => item.id);
  const now = new Date();
  const next72Hours = new Date(now.getTime() + (72 * 60 * 60 * 1000));

  let slotQuery = supabase
    .from('availability_slots')
    .select('therapist_id, start_at, slot_type')
    .in('therapist_id', therapistIds)
    .eq('is_available', true)
    .gte('start_at', now.toISOString())
    .lte('start_at', next72Hours.toISOString());

  if (preferences.session_preference && preferences.session_preference !== 'both') {
    slotQuery = slotQuery.eq('slot_type', preferences.session_preference);
  }

  const { data: slotRows, error: slotError } = await slotQuery.order('start_at', { ascending: true });

  if (slotError) throw slotError;

  const availabilityByTherapist = new Map<string, { count: number; nextAt: string | null; starts: string[] }>();
  for (const slot of slotRows || []) {
    const prev = availabilityByTherapist.get(slot.therapist_id) || { count: 0, nextAt: null, starts: [] };
    availabilityByTherapist.set(slot.therapist_id, {
      count: prev.count + 1,
      nextAt: prev.nextAt || slot.start_at,
      starts: [...prev.starts, slot.start_at],
    });
  }

  const intentTags = preferences.intent_tags || [];
  const matched = curatedPool.map((therapist): MatchedTherapist => {
    const styleScoreRaw = computeStyleScore(preferences.care_style_preference, therapist);
    const intentScoreRaw = computeIntentScore(intentTags, therapist.specialties || []);
    const languageScoreRaw = computeLanguageScore(preferences.language, therapist.languages || []);

    const availabilityStats = availabilityByTherapist.get(therapist.id) || { count: 0, nextAt: null, starts: [] };
    const slotCountScore = clamp(availabilityStats.count / 4, 0, 1);
    const timeFitScore = computeTimePreferenceScore(preferences.time_preference, availabilityStats.starts);
    const availabilityScoreRaw = preferences.time_preference && preferences.time_preference !== 'flexible'
      ? clamp((slotCountScore * 0.7) + (timeFitScore * 0.3), 0, 1)
      : slotCountScore;
    const qualityScoreRaw = computeQualityScore(therapist);

    const scoreBreakdown = {
      intent: Math.round(intentScoreRaw * 35),
      careStyle: Math.round(styleScoreRaw * 25),
      language: Math.round(languageScoreRaw * 15),
      availability: Math.round(availabilityScoreRaw * 15),
      quality: Math.round(qualityScoreRaw * 10),
      total: 0,
    };
    scoreBreakdown.total = scoreBreakdown.intent
      + scoreBreakdown.careStyle
      + scoreBreakdown.language
      + scoreBreakdown.availability
      + scoreBreakdown.quality;

    return {
      therapist,
      score: scoreBreakdown.total,
      scoreBreakdown,
      reasonChips: toReasonChips({
        therapist,
        intentTags,
        styleScore: styleScoreRaw,
        languageScore: languageScoreRaw,
        nextAvailableAt: availabilityStats.nextAt,
        timePreference: preferences.time_preference,
        timeFitScore,
      }),
      nextAvailableAt: availabilityStats.nextAt,
      availableSlots72h: availabilityStats.count,
    };
  });

  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.therapist.featured_rank !== b.therapist.featured_rank) {
      return a.therapist.featured_rank - b.therapist.featured_rank;
    }
    return (b.therapist.rating || 0) - (a.therapist.rating || 0);
  });

  return {
    topMatches: matched.slice(0, 3),
    curatedTherapists: matched,
  };
};
