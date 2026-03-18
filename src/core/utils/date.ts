export const localDateKey = (input: Date | string | number = new Date()): string => {
  const date = input instanceof Date ? input : new Date(input);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const MS_PER_MINUTE = 60 * 1000;

export type JoinWindowState = {
  isOpen: boolean;
  opensAt: Date;
  closesAt: Date;
  minutesUntilOpen: number | null;
  minutesUntilClose: number | null;
};

export const getJoinWindowState = (
  scheduledStartAt: string | Date,
  scheduledEndAt: string | Date,
  opts?: { earlyJoinMinutes?: number; lateJoinMinutes?: number; now?: Date },
): JoinWindowState => {
  const now = opts?.now ?? new Date();
  const earlyJoinMinutes = opts?.earlyJoinMinutes ?? 10;
  const lateJoinMinutes = opts?.lateJoinMinutes ?? 10;

  const start = scheduledStartAt instanceof Date ? scheduledStartAt : new Date(scheduledStartAt);
  const end = scheduledEndAt instanceof Date ? scheduledEndAt : new Date(scheduledEndAt);

  const opensAt = new Date(start.getTime() - earlyJoinMinutes * MS_PER_MINUTE);
  const closesAt = new Date(end.getTime() + lateJoinMinutes * MS_PER_MINUTE);

  const isOpen = now.getTime() >= opensAt.getTime() && now.getTime() <= closesAt.getTime();

  const minutesUntilOpen = now.getTime() < opensAt.getTime()
    ? Math.max(1, Math.ceil((opensAt.getTime() - now.getTime()) / MS_PER_MINUTE))
    : null;

  const minutesUntilClose = now.getTime() <= closesAt.getTime()
    ? Math.max(0, Math.ceil((closesAt.getTime() - now.getTime()) / MS_PER_MINUTE))
    : null;

  return { isOpen, opensAt, closesAt, minutesUntilOpen, minutesUntilClose };
};

export const formatMinutesShort = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};
