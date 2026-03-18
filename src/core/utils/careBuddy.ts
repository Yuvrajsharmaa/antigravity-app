import {
  CareFeedbackVariant,
  CareJourneyState,
  CarePersonalityState,
  RiskLevel,
} from '../models/types';

export type CareBuddyVoice = CareFeedbackVariant;

const VOICE_LINES: Record<CareBuddyVoice, string[]> = {
  celebrate: [
    'You completed today’s care steps.',
    'Good consistency today.',
    'Today’s actions are done.',
  ],
  coach: [
    'A short check-in now helps your next session.',
    'Pick one next action and complete it.',
    'Progress stays clear when actions stay simple.',
  ],
  rebound: [
    'Fresh start. One check-in rebuilds your rhythm.',
    'You can restart with one minute today.',
    'A recovery day still counts as progress.',
  ],
  reassure: [
    'No pressure. One action is enough for today.',
    'Start from where you are.',
    'Keep it light and practical.',
  ],
  reflect: [
    'What felt different today?',
    'One sentence is enough for a journal entry.',
    'Capture one pattern and one next step.',
  ],
};

const pickLine = (voice: CareBuddyVoice) => {
  const options = VOICE_LINES[voice];
  const index = Math.floor(Date.now() / 3600000) % options.length;
  return options[index];
};

export const careBuddyLine = (voice: CareBuddyVoice) => pickLine(voice);

export const careBuddyGreeting = (firstName?: string | null) => {
  if (firstName) return `Hey ${firstName}, Cove is here with you.`;
  return 'Cove is here for today.';
};

export const journeyStatusCopy = (journey: CareJourneyState) => {
  if (journey.completedCount === journey.totalCount) {
    return {
      title: 'Daily Care Journey complete',
      subtitle: 'You completed today\'s core care actions.',
      voice: 'celebrate' as CareBuddyVoice,
    };
  }

  if (journey.completedCount === 0 && journey.rhythm.repairsAvailable > 0) {
    return {
      title: 'Bounce back with one small step',
      subtitle: 'One check-in restores your rhythm today.',
      voice: 'rebound' as CareBuddyVoice,
    };
  }

  if (journey.completedCount === 0) {
    return {
      title: 'Let us start with one small step',
      subtitle: 'A quick check-in is enough to begin.',
      voice: 'reassure' as CareBuddyVoice,
    };
  }

  return {
    title: `${journey.completedCount}/${journey.totalCount} complete today`,
    subtitle: 'Complete the next action to stay on track.',
    voice: 'coach' as CareBuddyVoice,
  };
};

export const getCarePersonalityState = ({
  completedCount,
  totalCount,
  repairsAvailable,
}: {
  completedCount: number;
  totalCount: number;
  repairsAvailable: number;
}): CarePersonalityState => {
  if (completedCount >= totalCount) {
    return {
      variant: 'celebrate',
      title: 'Today is complete',
      subtitle: pickLine('celebrate'),
      ctaLabel: 'View rhythm',
    };
  }

  if (completedCount === 0 && repairsAvailable > 0) {
    return {
      variant: 'rebound',
      title: 'Restart today',
      subtitle: pickLine('rebound'),
      ctaLabel: 'Start a check-in',
    };
  }

  if (completedCount === 0) {
    return {
      variant: 'reassure',
      title: 'Start today',
      subtitle: pickLine('reassure'),
      ctaLabel: 'Take first step',
    };
  }

  return {
    variant: 'coach',
    title: 'Next action ready',
    subtitle: pickLine('coach'),
    ctaLabel: 'Continue',
  };
};

export const therapistNudgePrefill = (riskLevel: RiskLevel, reason: string) => {
  const pick = (lines: string[]) => {
    const i = Math.floor(Date.now() / (1000 * 60 * 60)) % lines.length;
    return lines[i];
  };

  if (riskLevel === 'high') {
    return pick([
      `I noticed today may feel heavier (${reason}). Would a short check-in feel helpful right now?`,
      `Your recent check-ins suggest higher strain (${reason}). If helpful, we can do a brief grounding check-in.`,
      `I am seeing signs of high strain (${reason}). Would you like a gentle check-in together?`,
    ]);
  }
  if (riskLevel === 'medium') {
    return pick([
      `I noticed some strain in your recent check-ins (${reason}). How are you feeling today?`,
      `I am seeing some changes lately (${reason}). Want to share how today has been?`,
      `It looks like there is some pressure today (${reason}). A quick check-in might help.`,
    ]);
  }
  return pick([
    'Quick supportive check-in: how are you feeling today?',
    'Checking in gently. How is your day feeling right now?',
    'No pressure, just a quick check-in. How are you doing today?',
  ]);
};
