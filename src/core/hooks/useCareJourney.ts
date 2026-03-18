import { useCallback, useEffect, useState } from 'react';
import { CareJourneyState } from '../models/types';
import { supabase } from '../../services/supabase';

interface CareJourneyResult {
  journey: CareJourneyState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDateKey = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map((item) => Number.parseInt(item, 10));
  return new Date(y, (m || 1) - 1, d || 1);
};

const minusDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
};

const computeCurrentStreak = (daySet: Set<string>, today: Date) => {
  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(minusDays(today, 1));
  const streakAnchor = daySet.has(todayKey) ? today : daySet.has(yesterdayKey) ? minusDays(today, 1) : null;
  if (!streakAnchor) return 0;

  let streak = 0;
  let cursor = new Date(streakAnchor);
  while (daySet.has(toDateKey(cursor))) {
    streak += 1;
    cursor = minusDays(cursor, 1);
  }
  return streak;
};

const computeHighestStreak = (dateKeys: string[]) => {
  if (!dateKeys.length) return 0;

  const sorted = [...new Set(dateKeys)].sort();
  let best = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prevDate = parseDateKey(sorted[i - 1]);
    const currDate = parseDateKey(sorted[i]);
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
};

export const useCareJourney = (userId: string | null | undefined): CareJourneyResult => {
  const [journey, setJourney] = useState<CareJourneyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setJourney(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 6);
      const historyStart = new Date(today);
      historyStart.setDate(historyStart.getDate() - 120);

      const { data: metrics, error: metricsError } = await supabase
        .from('client_metrics')
        .select('created_at,check_in_date')
        .eq('user_id', userId)
        .gte('created_at', historyStart.toISOString())
        .order('created_at', { ascending: false });

      if (metricsError) throw metricsError;

      const { data: journalEntries, error: journalError } = await supabase
        .from('journal_entries')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', weekStart.toISOString())
        .order('created_at', { ascending: false });

      if (journalError) throw journalError;

      const { data: messages, error: messageError } = await supabase
        .from('messages')
        .select('id')
        .eq('sender_id', userId)
        .gte('created_at', today.toISOString())
        .limit(1);

      if (messageError) throw messageError;

      const metricRows = metrics || [];
      const todayKey = toDateKey(today);
      const hasCheckInToday = metricRows.some((item) => {
        const checkInKey = item.check_in_date ? String(item.check_in_date).slice(0, 10) : null;
        return checkInKey === todayKey;
      });
      const journalDateKeys = (journalEntries || []).map((row: any) => toDateKey(new Date(row.created_at)));
      const journalDaySet = new Set(journalDateKeys);
      const hasJournalToday = journalDaySet.has(todayKey);
      const hasConnectToday = Boolean(messages && messages.length > 0);

      const dateKeys = metricRows
        .map((item) => (item.check_in_date ? String(item.check_in_date).slice(0, 10) : toDateKey(new Date(item.created_at))));
      const uniqueDays = new Set(dateKeys);
      const currentStreak = computeCurrentStreak(uniqueDays, today);
      const highestStreak = computeHighestStreak(dateKeys);
      const repairsAvailable = hasCheckInToday ? 0 : uniqueDays.has(toDateKey(minusDays(today, 1))) ? 1 : 0;

      const weekMarkers = Array.from({ length: 7 }).map((_, index) => {
        const markerDate = minusDays(today, 6 - index);
        const markerKey = toDateKey(markerDate);
        return {
          dateKey: markerKey,
          dayLabel: markerDate.toLocaleDateString([], { weekday: 'short' }).slice(0, 2),
          completed: uniqueDays.has(markerKey),
          isToday: markerKey === toDateKey(today),
        };
      });

      const journalWeekMarkers = weekMarkers.map((marker) => ({
        ...marker,
        completed: journalDaySet.has(marker.dateKey),
      }));

      const goals: CareJourneyState['goals'] = [
        {
          key: 'check_in',
          label: 'Check-in',
          completed: hasCheckInToday,
          helper: 'Log mood and stress in under a minute.',
        },
        {
          key: 'journal',
          label: 'Journal',
          completed: hasJournalToday,
          helper: 'Capture one brief note in your journal.',
        },
        {
          key: 'connect',
          label: 'Connect',
          completed: hasConnectToday,
          helper: 'Send one message to stay aligned with care.',
        },
      ];

      const nextAction = goals.find((goal) => !goal.completed)?.label || 'Celebrate today';

      setJourney({
        dateKey: toDateKey(today),
        completedCount: goals.filter((goal) => goal.completed).length,
        totalCount: goals.length,
        rhythmDays: currentStreak,
        rhythm: {
          currentStreak,
          highestStreak,
          repairsAvailable,
          weekMarkers,
          journalWeekMarkers,
        },
        goals,
        nextActionLabel: nextAction,
      });
    } catch (fetchError: any) {
      setError(fetchError.message || 'Unable to load care journey.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { journey, loading, error, refresh };
};
