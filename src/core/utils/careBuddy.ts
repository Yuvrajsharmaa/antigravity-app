import { CareJourneyState, RiskLevel } from '../models/types';

export type CareBuddyVoice = 'celebrate' | 'coach' | 'reassure' | 'reflect';

const VOICE_LINES: Record<CareBuddyVoice, string[]> = {
  celebrate: [
    'Beautiful consistency. Every small check-in counts.',
    'Nice momentum today. You showed up for yourself.',
    'Great progress. Keep this calm rhythm going.',
  ],
  coach: [
    'Small steps today, stronger sessions tomorrow.',
    'A quick log now can make your next session easier.',
    'Pick one tiny action. Done is better than perfect.',
  ],
  reassure: [
    'No pressure. You can always do one gentle step.',
    'You are not behind. Start from where you are.',
    'It is okay to keep this light today.',
  ],
  reflect: [
    'What felt lighter today, even by a little?',
    'One sentence is enough for reflection.',
    'Notice one pattern. Name one next step.',
  ],
};

const pickLine = (voice: CareBuddyVoice) => {
  const options = VOICE_LINES[voice];
  const index = Math.floor(Date.now() / 3600000) % options.length;
  return options[index];
};

export const careBuddyLine = (voice: CareBuddyVoice) => pickLine(voice);

export const careBuddyGreeting = (firstName?: string | null) => {
  if (firstName) return `Hey ${firstName}, your Care Buddy is here.`;
  return 'Your Care Buddy is here for today.';
};

export const journeyStatusCopy = (journey: CareJourneyState) => {
  if (journey.completedCount === journey.totalCount) {
    return {
      title: 'Daily Care Journey complete',
      subtitle: 'Lovely work. Keep the rhythm gentle and steady.',
      voice: 'celebrate' as CareBuddyVoice,
    };
  }

  if (journey.completedCount === 0) {
    return {
      title: 'Let us start with one small step',
      subtitle: 'A 30-second check-in is enough to begin.',
      voice: 'reassure' as CareBuddyVoice,
    };
  }

  return {
    title: `${journey.completedCount}/${journey.totalCount} complete today`,
    subtitle: 'You are building momentum without pressure.',
    voice: 'coach' as CareBuddyVoice,
  };
};

export const therapistNudgePrefill = (riskLevel: RiskLevel, reason: string) => {
  if (riskLevel === 'high') {
    return `I noticed a difficult trend (${reason}). I am here with you. Would a short check-in feel helpful right now?`;
  }
  if (riskLevel === 'medium') {
    return `I noticed some strain in your recent check-ins (${reason}). How are you feeling today?`;
  }
  return `Quick supportive check-in: how are you feeling today?`;
};

