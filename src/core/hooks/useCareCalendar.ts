import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabase';
import { CareCalendarDay, CareCalendarDayDetail, CareCalendarMonth } from '../models/types';

interface UseCareCalendarResult {
  month: CareCalendarMonth | null;
  dayDetails: Record<string, CareCalendarDayDetail>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isoToDateKey = (value: string) => {
  const date = new Date(value);
  return toDateKey(date);
};

const formatSessionTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

const snippet = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 92) return normalized;
  return `${normalized.slice(0, 92)}…`;
};

export const useCareCalendar = (
  userId: string | null | undefined,
  monthDate: Date,
): UseCareCalendarResult => {
  const [month, setMonth] = useState<CareCalendarMonth | null>(null);
  const [dayDetails, setDayDetails] = useState<Record<string, CareCalendarDayDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthBounds = useMemo(() => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const endExclusive = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    const monthKey = `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, '0')}`;
    return {
      start,
      endExclusive,
      startKey: toDateKey(start),
      endKeyExclusive: toDateKey(endExclusive),
      monthKey,
      monthLabel: start.toLocaleDateString([], { month: 'long', year: 'numeric' }),
    };
  }, [monthDate]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setMonth(null);
      setDayDetails({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { start, endExclusive, startKey, endKeyExclusive, monthKey, monthLabel } = monthBounds;
      const dayCount = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();

      const days: CareCalendarDay[] = [];
      const detailsMap: Record<string, CareCalendarDayDetail> = {};

      for (let i = 0; i < dayCount; i += 1) {
        const date = new Date(start.getFullYear(), start.getMonth(), i + 1);
        const key = toDateKey(date);
        days.push({
          date: key,
          hasActivity: false,
          hasCheckIn: false,
          hasJournal: false,
          hasSession: false,
        });
        detailsMap[key] = {
          date: key,
          hasActivity: false,
          checkIn: null,
          journalSnippets: [],
          sessions: [],
        };
      }

      const [{ data: checkIns, error: checkInError }, { data: journals, error: journalError }, { data: bookings, error: bookingError }] = await Promise.all([
        supabase
          .from('client_metrics')
          .select('check_in_date,mood,stress_level,sleep_hours,created_at')
          .eq('user_id', userId)
          .gte('check_in_date', startKey)
          .lt('check_in_date', endKeyExclusive)
          .order('created_at', { ascending: false }),
        supabase
          .from('journal_entries')
          .select('created_at,body')
          .eq('user_id', userId)
          .gte('created_at', start.toISOString())
          .lt('created_at', endExclusive.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('bookings')
          .select(`
            scheduled_start_at,status,session_type,
            therapists:therapist_id (
              profiles (display_name, first_name)
            )
          `)
          .eq('user_id', userId)
          .in('status', ['pending_payment', 'confirmed', 'completed', 'cancelled'])
          .gte('scheduled_start_at', start.toISOString())
          .lt('scheduled_start_at', endExclusive.toISOString())
          .order('scheduled_start_at', { ascending: true }),
      ]);

      if (checkInError) throw checkInError;
      if (journalError) throw journalError;
      if (bookingError) throw bookingError;

      for (const row of checkIns || []) {
        const dateKey = row.check_in_date || isoToDateKey(row.created_at);
        if (!detailsMap[dateKey]) continue;

        const day = days.find((item) => item.date === dateKey);
        if (day) {
          day.hasCheckIn = true;
          day.hasActivity = true;
        }

        if (!detailsMap[dateKey].checkIn) {
          detailsMap[dateKey].checkIn = {
            mood: row.mood || null,
            stressLevel: row.stress_level ?? null,
            sleepHours: row.sleep_hours ?? null,
          };
        }
        detailsMap[dateKey].hasActivity = true;
      }

      for (const row of journals || []) {
        const dateKey = isoToDateKey(row.created_at);
        if (!detailsMap[dateKey]) continue;

        const day = days.find((item) => item.date === dateKey);
        if (day) {
          day.hasJournal = true;
          day.hasActivity = true;
        }

        if (row.body?.trim()) {
          const current = detailsMap[dateKey].journalSnippets;
          if (current.length < 3) {
            current.push(snippet(row.body));
          }
        }
        detailsMap[dateKey].hasActivity = true;
      }

      for (const row of bookings || []) {
        const dateKey = isoToDateKey(row.scheduled_start_at);
        if (!detailsMap[dateKey]) continue;

        const therapist = Array.isArray((row as any).therapists)
          ? (row as any).therapists[0]
          : (row as any).therapists;
        const therapistProfile = Array.isArray(therapist?.profiles)
          ? therapist?.profiles[0]
          : therapist?.profiles;

        const day = days.find((item) => item.date === dateKey);
        if (day) {
          day.hasSession = true;
          day.hasActivity = true;
        }

        detailsMap[dateKey].sessions.push({
          timeLabel: formatSessionTime(row.scheduled_start_at),
          status: row.status,
          sessionType: row.session_type || null,
          therapistName: therapistProfile?.display_name || therapistProfile?.first_name || null,
        });
        detailsMap[dateKey].hasActivity = true;
      }

      setMonth({
        monthKey,
        monthLabel,
        days,
      });
      setDayDetails(detailsMap);
    } catch (fetchError: any) {
      setError(fetchError?.message || 'Unable to load care calendar.');
    } finally {
      setLoading(false);
    }
  }, [monthBounds, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    month,
    dayDetails,
    loading,
    error,
    refresh,
  };
};
