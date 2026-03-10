import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../services/supabase';

let notificationsInitialized = false;

const DEFAULT_REMINDER_TIME = '19:00:00';
const DEFAULT_QUIET_START = '21:00:00';
const DEFAULT_QUIET_END = '08:00:00';

export interface ReminderPreferences {
  wellbeing_reminders_enabled: boolean;
  wellbeing_reminder_time: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

const toTimeParts = (value: string, fallback: string) => {
  const source = value || fallback;
  const [h = '0', m = '0'] = source.split(':');
  const hours = Number.parseInt(h, 10);
  const minutes = Number.parseInt(m, 10);
  return {
    hours: Number.isFinite(hours) ? Math.min(23, Math.max(0, hours)) : 0,
    minutes: Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0,
  };
};

const dayKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const minutesInDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

const isWithinQuietHours = (date: Date, quietStart: string, quietEnd: string) => {
  const start = toTimeParts(quietStart, DEFAULT_QUIET_START);
  const end = toTimeParts(quietEnd, DEFAULT_QUIET_END);

  const nowMinutes = minutesInDay(date);
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
};

const moveOutOfQuietHours = (date: Date, quietEnd: string) => {
  const end = toTimeParts(quietEnd, DEFAULT_QUIET_END);
  const adjusted = new Date(date);

  adjusted.setHours(end.hours, end.minutes, 0, 0);
  if (adjusted <= date) {
    adjusted.setDate(adjusted.getDate() + 1);
  }
  return adjusted;
};

const normalizeReminderDate = (date: Date, quietStart: string, quietEnd: string) => {
  let adjusted = new Date(date);
  if (isWithinQuietHours(adjusted, quietStart, quietEnd)) {
    adjusted = moveOutOfQuietHours(adjusted, quietEnd);
  }
  return adjusted;
};

const getStorageKey = (userId: string) => `care_space_wellbeing_notif_ids_${userId}`;

export const initializeNotifications = async () => {
  if (notificationsInitialized) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  await Notifications.setNotificationChannelAsync('wellbeing', {
    name: 'Wellbeing reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150, 100, 150],
    lightColor: '#6B8E73',
  });

  notificationsInitialized = true;
};

export const ensureNotificationPermission = async () => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

const loadReminderPreferences = async (userId: string): Promise<ReminderPreferences> => {
  const { data } = await supabase
    .from('user_preferences')
    .select('wellbeing_reminders_enabled, wellbeing_reminder_time, quiet_hours_start, quiet_hours_end')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    wellbeing_reminders_enabled: data?.wellbeing_reminders_enabled ?? true,
    wellbeing_reminder_time: data?.wellbeing_reminder_time ?? DEFAULT_REMINDER_TIME,
    quiet_hours_start: data?.quiet_hours_start ?? DEFAULT_QUIET_START,
    quiet_hours_end: data?.quiet_hours_end ?? DEFAULT_QUIET_END,
  };
};

const loadMetricDates = async (userId: string) => {
  const { data } = await supabase
    .from('client_metrics')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data || []).map((row) => new Date(row.created_at));
};

const calculateStreak = (entries: Date[]) => {
  if (entries.length === 0) return 0;

  const uniqueDays = new Set(entries.map((item) => dayKey(item)));
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(addDays(now, -1));
  let cursor = uniqueDays.has(today) ? new Date(now) : uniqueDays.has(yesterday) ? addDays(now, -1) : null;

  if (!cursor) return 0;

  let streak = 0;
  while (cursor) {
    const key = dayKey(cursor);
    if (!uniqueDays.has(key)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
};

export const cancelWellbeingReminders = async (userId: string) => {
  const storageKey = getStorageKey(userId);
  const rawIds = await AsyncStorage.getItem(storageKey);
  const ids = rawIds ? (JSON.parse(rawIds) as string[]) : [];

  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Ignore stale notification IDs.
    }
  }

  await AsyncStorage.removeItem(storageKey);
};

const scheduleReminder = async (title: string, body: string, when: Date) => {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: 'wellbeing',
    },
  });
};

export const scheduleAdaptiveWellbeingReminders = async (userId: string) => {
  await initializeNotifications();
  const hasPermission = await ensureNotificationPermission();
  await cancelWellbeingReminders(userId);

  if (!hasPermission) return;

  const prefs = await loadReminderPreferences(userId);
  if (!prefs.wellbeing_reminders_enabled) return;

  const metrics = await loadMetricDates(userId);
  const now = new Date();

  const hasLoggedToday = metrics.some((date) => dayKey(date) === dayKey(now));
  const streak = calculateStreak(metrics);
  const intervalHours = streak >= 5 ? 48 : 24;

  const reminderTime = toTimeParts(prefs.wellbeing_reminder_time, DEFAULT_REMINDER_TIME);
  const baseReminder = new Date(now);
  baseReminder.setHours(reminderTime.hours, reminderTime.minutes, 0, 0);

  if (baseReminder <= now || hasLoggedToday) {
    baseReminder.setHours(baseReminder.getHours() + intervalHours);
  }

  const scheduleDates: Date[] = [
    normalizeReminderDate(baseReminder, prefs.quiet_hours_start, prefs.quiet_hours_end),
  ];

  const lastMetricAt = metrics[0]?.getTime() ?? 0;
  const inactiveForMs = lastMetricAt > 0 ? now.getTime() - lastMetricAt : Number.MAX_SAFE_INTEGER;

  if (inactiveForMs >= 48 * 60 * 60 * 1000) {
    const extra = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const adjustedExtra = normalizeReminderDate(extra, prefs.quiet_hours_start, prefs.quiet_hours_end);
    if (dayKey(adjustedExtra) !== dayKey(scheduleDates[0])) {
      scheduleDates.push(adjustedExtra);
    }
  }

  const uniqueDates = scheduleDates
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, 2);

  const ids: string[] = [];
  for (const date of uniqueDates) {
    if (date <= now) continue;
    const id = await scheduleReminder(
      'Care Space check-in',
      'A gentle reminder to log your mood and keep your CareScore in sync.',
      date,
    );
    ids.push(id);
  }

  if (ids.length > 0) {
    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(ids));
  }
};

export const triggerSupportiveNudgeNotification = async () => {
  await initializeNotifications();
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) return;

  await scheduleReminder(
    'Care Space wellbeing nudge',
    "You're not alone. A quick mood check-in can help you and your therapist stay aligned.",
    new Date(Date.now() + 2000),
  );
};
