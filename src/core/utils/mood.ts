export interface MoodOption {
  value: string;
  label: string;
  emoji: string;
}

export const MOOD_OPTIONS: MoodOption[] = [
  { value: 'happy', label: 'Happy', emoji: '🙂' },
  { value: 'calm', label: 'Calm', emoji: '😌' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'low', label: 'Low', emoji: '😔' },
  { value: 'anxious', label: 'Anxious', emoji: '😬' },
  { value: 'overwhelmed', label: 'Overwhelmed', emoji: '😣' },
];

export const normalizeMoodLabel = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  const option = MOOD_OPTIONS.find((item) => item.value === normalized || item.label.toLowerCase() === normalized);
  if (option) return option.label;

  return raw
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
};

export const getMoodOption = (raw: string | null | undefined): MoodOption | null => {
  const label = normalizeMoodLabel(raw);
  if (!label) return null;
  return MOOD_OPTIONS.find((item) => item.label === label) || null;
};

export const moodEmoji = (raw: string | null | undefined): string => getMoodOption(raw)?.emoji || '🙂';

