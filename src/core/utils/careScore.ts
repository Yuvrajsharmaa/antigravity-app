import { Colors } from '../theme';
import {
  CarePatternExplanation,
  CarePatternState,
  CareScoreBreakdown,
  CareScoreFactor,
  CareScoreRangeMeaning,
} from '../models/types';

const FACTOR_WEIGHTS = {
  mood: 0.28,
  stress: 0.22,
  sleep: 0.2,
  energy: 0.12,
  connectedness: 0.1,
  coping: 0.08,
} as const;

const MOOD_SCORES: Record<string, number> = {
  happy: 1,
  calm: 0.95,
  hopeful: 0.88,
  neutral: 0.7,
  low: 0.45,
  anxious: 0.35,
  sad: 0.25,
  overwhelmed: 0.15,
  angry: 0.12,
  numb: 0.22,
  unsure: 0.4,
  relieved: 0.9,
  focused: 0.82,
};

const normalizeMood = (mood: string) => mood.trim().toLowerCase();

const scoreMood = (mood: string) => MOOD_SCORES[normalizeMood(mood)] ?? 0.55;

const scoreStress = (stressLevel: number) => {
  const clamped = Math.max(1, Math.min(5, stressLevel));
  // 1 = least strain, 5 = highest strain.
  return (5 - clamped) / 4;
};

const scoreSleep = (sleepHours: number) => {
  const hours = Math.max(0, Math.min(24, sleepHours));
  if (hours >= 7 && hours <= 9) return 1;
  if (hours >= 6 && hours < 7) return 0.75;
  if (hours > 9 && hours <= 10) return 0.78;
  if (hours >= 5 && hours < 6) return 0.52;
  if (hours > 10 && hours <= 12) return 0.45;
  return 0.22;
};

const scoreScaleFive = (value: number) => {
  const clamped = Math.max(1, Math.min(5, value));
  return (clamped - 1) / 4;
};

const factorContribution = (
  id: CareScoreFactor['id'],
  label: string,
  weight: number,
  value: number,
  summary: string,
): CareScoreFactor => ({
  id,
  label,
  weight,
  value: Number((value * 100).toFixed(1)),
  summary,
});

export const calculateCareScoreBreakdown = ({
  mood,
  stressLevel,
  sleepHours,
  energyLevel = 3,
  connectednessLevel = 3,
  copingHelpfulness = 3,
}: {
  mood: string;
  stressLevel: number;
  sleepHours: number;
  energyLevel?: number;
  connectednessLevel?: number;
  copingHelpfulness?: number;
}): CareScoreBreakdown => {
  const moodValue = scoreMood(mood);
  const stressValue = scoreStress(stressLevel);
  const sleepValue = scoreSleep(sleepHours);
  const energyValue = scoreScaleFive(energyLevel);
  const connectednessValue = scoreScaleFive(connectednessLevel);
  const copingValue = scoreScaleFive(copingHelpfulness);

  const factors: CareScoreFactor[] = [
    factorContribution(
      'mood',
      'Mood',
      FACTOR_WEIGHTS.mood,
      moodValue,
      'How you emotionally feel right now.',
    ),
    factorContribution(
      'stress',
      'Stress',
      FACTOR_WEIGHTS.stress,
      stressValue,
      'Lower perceived stress raises your score.',
    ),
    factorContribution(
      'sleep',
      'Sleep',
      FACTOR_WEIGHTS.sleep,
      sleepValue,
      'Steady sleep supports recovery and resilience.',
    ),
    factorContribution(
      'energy',
      'Energy',
      FACTOR_WEIGHTS.energy,
      energyValue,
      'Energy gives context to how demanding your day feels.',
    ),
    factorContribution(
      'connectedness',
      'Connection',
      FACTOR_WEIGHTS.connectedness,
      connectednessValue,
      'Feeling connected can buffer stress and isolation.',
    ),
    factorContribution(
      'coping',
      'Coping',
      FACTOR_WEIGHTS.coping,
      copingValue,
      'Helpful coping actions improve daily stability.',
    ),
  ];

  const total = Math.round(
    (moodValue * FACTOR_WEIGHTS.mood
      + stressValue * FACTOR_WEIGHTS.stress
      + sleepValue * FACTOR_WEIGHTS.sleep
      + energyValue * FACTOR_WEIGHTS.energy
      + connectednessValue * FACTOR_WEIGHTS.connectedness
      + copingValue * FACTOR_WEIGHTS.coping) * 100,
  );
  return {
    score: Math.max(0, Math.min(100, total)),
    factors,
  };
};

export const calculateCareScore = ({
  mood,
  stressLevel,
  sleepHours,
  energyLevel = 3,
  connectednessLevel = 3,
  copingHelpfulness = 3,
}: {
  mood: string;
  stressLevel: number;
  sleepHours: number;
  energyLevel?: number;
  connectednessLevel?: number;
  copingHelpfulness?: number;
}) => calculateCareScoreBreakdown({
  mood,
  stressLevel,
  sleepHours,
  energyLevel,
  connectednessLevel,
  copingHelpfulness,
}).score;

export const getCareScoreRangeMeaning = (score: number): CareScoreRangeMeaning => {
  if (score <= 45) {
    return {
      label: 'High support needed',
      description: 'You may need extra care today. Consider checking in with your therapist.',
      color: Colors.status.danger,
    };
  }
  if (score <= 60) {
    return {
      label: 'Watchful range',
      description: 'Some strain is showing. Small support actions can help stabilize your day.',
      color: Colors.status.warning,
    };
  }
  return {
    label: 'Stable range',
    description: 'Your current pattern looks steady. Keep up your regular care routine.',
    color: Colors.status.success,
  };
};

export const CARE_SCORE_WEIGHT_LABELS = [
  { label: 'Mood', weight: '28%' },
  { label: 'Stress', weight: '22%' },
  { label: 'Sleep', weight: '20%' },
  { label: 'Energy', weight: '12%' },
  { label: 'Connection', weight: '10%' },
  { label: 'Coping', weight: '8%' },
] as const;

export const getCarePatternState = (
  score: number,
  previousScore: number | null,
): CarePatternState => {
  const trendDelta = previousScore === null ? 0 : score - previousScore;
  const trend: CarePatternState['trend'] = trendDelta >= 4
    ? 'improving'
    : trendDelta <= -4
      ? 'needs-support'
      : 'stable';

  if (score <= 45) {
    return {
      label: 'support-needed',
      trend,
      guidance: 'Take today gently. A short check-in with your therapist can help.',
    };
  }

  if (score <= 60) {
    return {
      label: 'watchful',
      trend,
      guidance: 'Some strain is showing. Focus on one supportive next step.',
    };
  }

  return {
    label: 'steady',
    trend,
    guidance: 'Your pattern looks steady. Maintain your current care rhythm.',
  };
};

export const carePatternExplanation: CarePatternExplanation = {
  title: 'How CareScore is calculated',
  description:
    'CareScore is based on your check-ins (mood, stress, sleep) and overall patterns.',
  factors: [
    { id: 'mood', title: 'Mood', summary: 'How emotionally heavy or calm today feels.' },
    { id: 'stress', title: 'Stress', summary: 'How intense your strain feels right now.' },
    { id: 'sleep', title: 'Sleep', summary: 'Rest quality from last night.' },
    { id: 'energy', title: 'Energy', summary: 'How much physical and mental energy you have.' },
    { id: 'connectedness', title: 'Connection', summary: 'How connected or isolated you feel today.' },
    { id: 'coping', title: 'Coping', summary: 'How helpful your coping actions felt today.' },
  ],
};
