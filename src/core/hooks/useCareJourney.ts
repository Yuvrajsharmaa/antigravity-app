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

      const { data: metrics, error: metricsError } = await supabase
        .from('client_metrics')
        .select('created_at, journal_entry')
        .eq('user_id', userId)
        .gte('created_at', weekStart.toISOString())
        .order('created_at', { ascending: false });

      if (metricsError) throw metricsError;

      const { data: messages, error: messageError } = await supabase
        .from('messages')
        .select('id')
        .eq('sender_id', userId)
        .gte('created_at', today.toISOString())
        .limit(1);

      if (messageError) throw messageError;

      const metricRows = metrics || [];
      const hasCheckInToday = metricRows.some((item) => new Date(item.created_at) >= today);
      const hasReflectionToday = metricRows.some((item) => (
        new Date(item.created_at) >= today &&
        Boolean(item.journal_entry && item.journal_entry.trim().length > 8)
      ));
      const hasConnectToday = Boolean(messages && messages.length > 0);

      const uniqueDays = new Set(
        metricRows.map((item) => toDateKey(new Date(item.created_at))),
      );
      const rhythmDays = uniqueDays.size;

      const goals: CareJourneyState['goals'] = [
        {
          key: 'check_in',
          label: 'Check-in',
          completed: hasCheckInToday,
          helper: 'Log mood and stress in under a minute.',
        },
        {
          key: 'reflect',
          label: 'Reflect',
          completed: hasReflectionToday,
          helper: 'Add one line in your journal.',
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
        rhythmDays,
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

