import {
  MatchedTherapist,
  MatchConfidenceLabel,
  MatchReasonChip,
  Therapist,
} from '../models/types';
import { supabase } from '../../services/supabase';

interface MatchOptions {
  filterTag?: string;
  rosterLimit?: number;
}

interface MatchResult {
  topMatches: MatchedTherapist[];
  curatedTherapists: MatchedTherapist[];
}

type ClientMatchProfile = {
  concern_tags: string[];
  goal_tags: string[];
  style_preference: string | null;
  session_preference: 'chat' | 'video' | 'both';
  time_preference: 'morning' | 'afternoon' | 'evening' | 'flexible';
  language_preference: string | null;
  availability_windows: Array<{ day?: string; from?: string; to?: string }>;
  gender_preference: string | null;
  modality_preferences: {
    preferred?: string[];
    avoid?: string[];
  };
  urgency_level: number;
  first_session_sla_hours: number;
  budget_min_inr: number | null;
  budget_max_inr: number | null;
};

type TherapistMatchProfile = {
  therapist_id: string;
  treats_tags: string[];
  not_fit_tags: string[];
  modalities: string[];
  style_tags: string[];
  population_tags: string[];
  session_modes: string[];
  languages: string[];
  intake_windows: Array<{ day?: string; from?: string; to?: string }>;
  new_client_capacity: number;
  accepts_new_clients: boolean;
  standout_quote?: string | null;
  standout_prompt?: string | null;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeTag = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\s+/g, '-')
  .trim();

const normalizeWords = (value: string) => normalizeTag(value)
  .split(/[-\s]+/)
  .filter(Boolean);

const uniqueList = (values: string[]) => Array.from(new Set(values.map(normalizeTag).filter(Boolean)));

const scoreOverlap = (a: string[], b: string[]) => {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const matched = a.filter((item) => bSet.has(item)).length;
  return matched / a.length;
};

const scoreKeywordOverlap = (clientTags: string[], therapistTags: string[]) => {
  if (!clientTags.length || !therapistTags.length) return 0;
  const therapistWords = new Set(therapistTags.flatMap(normalizeWords));
  let matches = 0;
  for (const tag of clientTags) {
    const words = normalizeWords(tag);
    if (words.some((w) => therapistWords.has(w))) matches += 1;
  }
  return matches / clientTags.length;
};

const confidenceLabel = (score: number): MatchConfidenceLabel => {
  if (score >= 82) return 'excellent';
  if (score >= 68) return 'strong';
  return 'good';
};

const formatAvailabilityChip = (nextAvailableAt: string | null) => {
  if (!nextAvailableAt) return null;
  const nextDate = new Date(nextAvailableAt);
  const hoursAway = Math.round((nextDate.getTime() - Date.now()) / (1000 * 60 * 60));
  if (hoursAway <= 8) return 'Available soon';
  if (hoursAway <= 24) return 'Available today';
  return 'Available this week';
};

const mapTherapist = (row: any): Therapist => {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    ...row,
    display_name: profile?.display_name || profile?.first_name || 'Therapist',
    avatar_url: profile?.avatar_url || null,
    first_name: profile?.first_name || 'Therapist',
  };
};

const defaultClientProfile = (): ClientMatchProfile => ({
  concern_tags: [],
  goal_tags: [],
  style_preference: null,
  session_preference: 'both',
  time_preference: 'flexible',
  language_preference: 'English',
  availability_windows: [],
  gender_preference: 'no_preference',
  modality_preferences: {},
  urgency_level: 2,
  first_session_sla_hours: 72,
  budget_min_inr: null,
  budget_max_inr: null,
});

const reasonChipsFor = ({
  concernOverlap,
  styleFit,
  languageFit,
  nextAvailableAt,
  timeFit,
}: {
  concernOverlap: number;
  styleFit: number;
  languageFit: number;
  nextAvailableAt: string | null;
  timeFit: number;
}): MatchReasonChip[] => {
  const chips: MatchReasonChip[] = [];

  if (concernOverlap >= 0.34) {
    chips.push({ id: 'concern-fit', label: 'Works with your key concerns' });
  }
  if (styleFit >= 0.75) {
    chips.push({ id: 'style-fit', label: 'Matches your care style' });
  }
  if (languageFit >= 1) {
    chips.push({ id: 'language-fit', label: 'Language comfort match' });
  }
  if (timeFit >= 0.6) {
    chips.push({ id: 'timing-fit', label: 'Fits your preferred timing' });
  }

  const availabilityChip = formatAvailabilityChip(nextAvailableAt);
  if (availabilityChip) {
    chips.push({ id: 'availability', label: availabilityChip });
  }

  if (!chips.length) {
    chips.push({ id: 'reliable', label: 'Reliable profile and active schedule' });
  }

  return chips.slice(0, 3);
};

const availabilityWindowScore = (
  starts: string[],
  preference: 'morning' | 'afternoon' | 'evening' | 'flexible' | undefined,
) => {
  if (!starts.length) return 0;
  if (!preference || preference === 'flexible') return 1;
  let matches = 0;
  for (const startAt of starts) {
    const hour = new Date(startAt).getHours();
    if (preference === 'morning' && hour < 12) matches += 1;
    if (preference === 'afternoon' && hour >= 12 && hour < 17) matches += 1;
    if (preference === 'evening' && hour >= 17) matches += 1;
  }
  return clamp(matches / starts.length, 0, 1);
};

const loadClientMatchProfile = async (userId: string): Promise<ClientMatchProfile> => {
  const [matchProfileRes, preferencesRes, profileRes] = await Promise.all([
    supabase
      .from('client_match_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
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

  if (matchProfileRes.error) throw matchProfileRes.error;
  if (preferencesRes.error) throw preferencesRes.error;
  if (profileRes.error) throw profileRes.error;

  const fallback = defaultClientProfile();
  const fromMatch = matchProfileRes.data as any;

  return {
    ...fallback,
    concern_tags: uniqueList(fromMatch?.concern_tags || preferencesRes.data?.intent_tags || []),
    goal_tags: uniqueList(fromMatch?.goal_tags || []),
    style_preference: fromMatch?.style_preference || preferencesRes.data?.care_style_preference || null,
    session_preference: fromMatch?.session_preference || preferencesRes.data?.session_preference || 'both',
    time_preference: fromMatch?.time_preference || preferencesRes.data?.time_preference || 'flexible',
    language_preference: fromMatch?.language_preference || profileRes.data?.language || 'English',
    availability_windows: fromMatch?.availability_windows || [],
    gender_preference: fromMatch?.gender_preference || 'no_preference',
    modality_preferences: fromMatch?.modality_preferences || {},
    urgency_level: fromMatch?.urgency_level || 2,
    first_session_sla_hours: fromMatch?.first_session_sla_hours || 72,
    budget_min_inr: fromMatch?.budget_min_inr || null,
    budget_max_inr: fromMatch?.budget_max_inr || null,
  };
};

export const matchTherapistsForClient = async (
  userId: string,
  options?: MatchOptions,
): Promise<MatchResult> => {
  const rosterLimit = clamp(options?.rosterLimit || 16, 12, 20);
  const filterTag = options?.filterTag && options.filterTag !== 'All'
    ? normalizeTag(options.filterTag)
    : null;

  const clientProfile = await loadClientMatchProfile(userId);

  const buildTherapistsQuery = (verifiedOnly: boolean, activeOnly = true) => {
    let query = supabase
      .from('therapists')
      .select(`
        *,
        profiles (display_name, avatar_url, first_name)
      `);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    if (verifiedOnly) {
      query = query.eq('is_verified', true);
    }

    if (filterTag) {
      query = query.contains('specialties', [filterTag]);
    }

    return query.order('featured_rank', { ascending: true }).limit(120);
  };

  const { data: verifiedRows, error: verifiedError } = await buildTherapistsQuery(true, true);
  if (verifiedError) throw verifiedError;

  let therapistRows = verifiedRows || [];
  if (!therapistRows.length) {
    const { data: fallbackRows, error: fallbackError } = await buildTherapistsQuery(false, true);
    if (fallbackError) throw fallbackError;
    therapistRows = fallbackRows || [];
  }
  if (!therapistRows.length) {
    const { data: inactiveFallbackRows, error: inactiveFallbackError } = await buildTherapistsQuery(false, false);
    if (inactiveFallbackError) throw inactiveFallbackError;
    therapistRows = inactiveFallbackRows || [];
  }
  if (!therapistRows.length) {
    const { data: therapistProfiles, error: profileFallbackError } = await supabase
      .from('profiles')
      .select('id,display_name,first_name,avatar_url,language,role')
      .in('role', ['therapist', 'admin'])
      .neq('id', userId)
      .limit(30);
    if (profileFallbackError) throw profileFallbackError;
    therapistRows = (therapistProfiles || []).map((profile: any, index: number) => ({
      id: profile.id,
      headline: 'Available for therapy sessions',
      bio: 'Therapist profile is being completed.',
      years_experience: 3,
      languages: profile.language ? [profile.language] : ['English'],
      specialties: ['general-support'],
      session_fee_inr: 700,
      chat_fee_inr: 500,
      is_verified: profile.role === 'therapist' || profile.role === 'admin',
      is_active: true,
      featured_rank: index + 1,
      rating: 4.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      profiles: {
        display_name: profile.display_name,
        first_name: profile.first_name,
        avatar_url: profile.avatar_url,
      },
    }));
  }

  const mappedTherapists = therapistRows.map(mapTherapist);
  if (!mappedTherapists.length) {
    return { topMatches: [], curatedTherapists: [] };
  }

  const therapistIds = mappedTherapists.map((item) => item.id);

  const { data: profileRows, error: profileError } = await supabase
    .from('therapist_match_profile')
    .select('*')
    .in('therapist_id', therapistIds);
  if (profileError) throw profileError;

  const profileMap = new Map<string, TherapistMatchProfile>();
  for (const row of profileRows || []) {
    profileMap.set(row.therapist_id, {
      therapist_id: row.therapist_id,
      treats_tags: uniqueList(row.treats_tags || []),
      not_fit_tags: uniqueList(row.not_fit_tags || []),
      modalities: uniqueList(row.modalities || []),
      style_tags: uniqueList(row.style_tags || []),
      population_tags: uniqueList(row.population_tags || []),
      session_modes: uniqueList(row.session_modes || ['video']),
      languages: uniqueList(row.languages || ['english']),
      intake_windows: row.intake_windows || [],
      new_client_capacity: row.new_client_capacity || 5,
      accepts_new_clients: row.accepts_new_clients !== false,
      standout_quote: row.standout_quote || null,
      standout_prompt: row.standout_prompt || null,
    });
  }

  const now = new Date();
  const nextWindow = new Date(now.getTime() + Math.max(24 * 30, clientProfile.first_session_sla_hours) * 60 * 60 * 1000);

  let slotQuery = supabase
    .from('availability_slots')
    .select('therapist_id, start_at, slot_type')
    .in('therapist_id', therapistIds)
    .eq('is_available', true)
    .gte('start_at', now.toISOString())
    .lte('start_at', nextWindow.toISOString())
    .order('start_at', { ascending: true });

  if (clientProfile.session_preference !== 'both') {
    slotQuery = slotQuery.eq('slot_type', clientProfile.session_preference);
  }

  const { data: slots, error: slotsError } = await slotQuery;
  if (slotsError) throw slotsError;

  const availabilityMap = new Map<string, { count: number; nextAt: string | null; starts: string[] }>();
  for (const slot of slots || []) {
    const prev = availabilityMap.get(slot.therapist_id) || { count: 0, nextAt: null, starts: [] };
    availabilityMap.set(slot.therapist_id, {
      count: prev.count + 1,
      nextAt: prev.nextAt || slot.start_at,
      starts: [...prev.starts, slot.start_at],
    });
  }

  const clientConcernTags = uniqueList(clientProfile.concern_tags);
  const clientGoalTags = uniqueList(clientProfile.goal_tags);
  const preferredModalities = uniqueList(clientProfile.modality_preferences?.preferred || []);
  const avoidModalities = uniqueList(clientProfile.modality_preferences?.avoid || []);

  const stageAFilters = mappedTherapists.filter((therapist) => {
    const tProfile = profileMap.get(therapist.id);

    const notFitTags = uniqueList(tProfile?.not_fit_tags || []);
    if (clientConcernTags.some((tag) => notFitTags.includes(tag))) {
      return false;
    }

    if (tProfile && tProfile.accepts_new_clients === false) {
      return false;
    }

    if (clientProfile.budget_max_inr && therapist.session_fee_inr > clientProfile.budget_max_inr) {
      return false;
    }

    if (clientProfile.budget_min_inr && therapist.session_fee_inr < clientProfile.budget_min_inr) {
      return false;
    }

    if (avoidModalities.length) {
      const therapistModalities = uniqueList(tProfile?.modalities || []);
      if (therapistModalities.some((item) => avoidModalities.includes(item))) {
        return false;
      }
    }

    return true;
  });

  const stageAOrFallback = stageAFilters.length
    ? stageAFilters
    : mappedTherapists.filter((therapist) => {
        const tProfile = profileMap.get(therapist.id);
        if (tProfile?.accepts_new_clients === false) return false;
        const notFitTags = uniqueList(tProfile?.not_fit_tags || []);
        if (clientConcernTags.some((tag) => notFitTags.includes(tag))) return false;
        return true;
      });

  const rankingSource = stageAOrFallback.length ? stageAOrFallback : mappedTherapists;

  const ranked = rankingSource.map((therapist): MatchedTherapist => {
    const tProfile = profileMap.get(therapist.id);
    const availability = availabilityMap.get(therapist.id) || { count: 0, nextAt: null, starts: [] };

    const therapistTreats = uniqueList(tProfile?.treats_tags || therapist.specialties || []);
    const concernOverlap = Math.max(
      scoreOverlap(clientConcernTags, therapistTreats),
      scoreKeywordOverlap(clientConcernTags, therapistTreats),
    );

    const therapistGoalSignals = uniqueList([...(tProfile?.population_tags || []), ...(tProfile?.modalities || [])]);
    const goalFit = clientGoalTags.length ? scoreKeywordOverlap(clientGoalTags, therapistGoalSignals) : 0.65;

    const styleTags = uniqueList(tProfile?.style_tags || []);
    const styleFit = clientProfile.style_preference
      ? Math.max(
          scoreKeywordOverlap([clientProfile.style_preference], styleTags),
          scoreKeywordOverlap([clientProfile.style_preference], [therapist.headline || '', therapist.bio || '']),
        )
      : 0.65;

    const therapistLanguages = uniqueList(tProfile?.languages || therapist.languages || []);
    const languageFit = !clientProfile.language_preference || clientProfile.language_preference.toLowerCase() === 'both'
      ? 1
      : therapistLanguages.length === 0
        ? 0.75
        : therapistLanguages.includes(normalizeTag(clientProfile.language_preference))
        ? 1
        : 0.4;

    const therapistSessionModes = uniqueList(tProfile?.session_modes || ['video', 'chat']);
    const sessionModeFit = clientProfile.session_preference === 'both'
      ? 1
      : therapistSessionModes.includes(clientProfile.session_preference)
        ? 1
        : 0.45;

    const timeFit = availabilityWindowScore(
      availability.starts,
      clientProfile.time_preference,
    );

    const slotDensityFit = clamp(availability.count / 4, 0, 1);
    const logisticsFit = clamp((timeFit * 0.35) + (slotDensityFit * 0.45) + (sessionModeFit * 0.2), 0, 1);

    const qualityBase = clamp((therapist.rating || 3.9) / 5, 0, 1);
    const reliabilityFit = clamp((qualityBase * 0.8) + (1 - clamp((therapist.featured_rank - 1) / 99, 0, 1)) * 0.2, 0, 1);

    const preferredModalityFit = preferredModalities.length
      ? scoreKeywordOverlap(preferredModalities, uniqueList(tProfile?.modalities || []))
      : 0.65;

    const capacity = tProfile?.new_client_capacity ?? 5;
    const capacityFit = clamp(capacity / 8, 0.35, 1);

    const weighted = {
      concern: Math.round(concernOverlap * 30),
      goal: Math.round(goalFit * 15),
      style: Math.round(styleFit * 15),
      logistics: Math.round(logisticsFit * 20),
      quality: Math.round(reliabilityFit * 10),
      modality: Math.round(preferredModalityFit * 5),
      capacity: Math.round(capacityFit * 5),
    };

    const totalScore = weighted.concern
      + weighted.goal
      + weighted.style
      + weighted.logistics
      + weighted.quality
      + weighted.modality
      + weighted.capacity;

    const adjustedForMarketplace = totalScore - Math.round((1 - capacityFit) * 6);
    const finalScore = clamp(adjustedForMarketplace, 0, 100);

    return {
      therapist: {
        ...therapist,
        standout_quote: tProfile?.standout_quote || null,
        standout_prompt: tProfile?.standout_prompt || null,
      },
      score: finalScore,
      scoreBreakdown: {
        intent: weighted.concern + weighted.goal,
        careStyle: weighted.style + weighted.modality,
        language: Math.round(languageFit * 15),
        availability: weighted.logistics,
        quality: weighted.quality + weighted.capacity,
        total: finalScore,
      },
      reasonChips: reasonChipsFor({
        concernOverlap,
        styleFit,
        languageFit,
        nextAvailableAt: availability.nextAt,
        timeFit,
      }),
      confidenceLabel: confidenceLabel(finalScore),
      fitHighlights: [
        `${Math.round(concernOverlap * 100)}% concern fit`,
        `${Math.round(styleFit * 100)}% style fit`,
        availability.nextAt
          ? `Next slot ${new Date(availability.nextAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
          : 'Schedule opening soon',
      ],
      nextAvailableAt: availability.nextAt,
      availableSlots72h: availability.count,
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.therapist.featured_rank !== b.therapist.featured_rank) {
      return a.therapist.featured_rank - b.therapist.featured_rank;
    }
    return (b.therapist.rating || 0) - (a.therapist.rating || 0);
  });

  const curatedTherapists = ranked.slice(0, Math.min(ranked.length, rosterLimit));
  const topMatches = curatedTherapists.slice(0, 3);

  if (curatedTherapists.length) {
    void (async () => {
      try {
        await supabase
          .from('match_events')
          .insert(
            curatedTherapists.slice(0, 10).map((item, index) => ({
              user_id: userId,
              therapist_id: item.therapist.id,
              match_score: item.score,
              rank_position: index + 1,
              score_breakdown: item.scoreBreakdown,
              model_version: 'v3',
            })),
          );
      } catch {
        // Match event logging is best-effort and should not block UI ranking.
      }
    })();
  }

  return {
    topMatches,
    curatedTherapists,
  };
};
