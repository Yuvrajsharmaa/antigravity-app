export type RiskLevel = 'high' | 'medium' | 'stable';

export interface RiskMetricInput {
  created_at: string;
  stress_level: number;
  care_score_snapshot: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
  latestCareScore: number | null;
  latestStressLevel: number | null;
  delta72h: number;
}

const HOURS_72_MS = 72 * 60 * 60 * 1000;

const toMillis = (iso: string) => {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
};

const getDelta72h = (metrics: RiskMetricInput[]) => {
  if (metrics.length < 2) return 0;

  const now = Date.now();
  const windowStart = now - HOURS_72_MS;
  const latest = metrics[0];

  const inWindow = metrics.filter((item) => {
    const ts = toMillis(item.created_at);
    return ts >= windowStart;
  });

  const baseline = inWindow[inWindow.length - 1];
  if (!baseline) return 0;

  return baseline.care_score_snapshot - latest.care_score_snapshot;
};

const hasRecentHighStress = (metrics: RiskMetricInput[]) => {
  if (metrics.length < 2) return false;
  return metrics[0].stress_level >= 4 && metrics[1].stress_level >= 4;
};

export const assessCareRisk = (metrics: RiskMetricInput[]): RiskAssessment => {
  if (metrics.length === 0) {
    return {
      level: 'stable',
      reason: 'No recent check-ins',
      latestCareScore: null,
      latestStressLevel: null,
      delta72h: 0,
    };
  }

  const latest = metrics[0];
  const delta72h = getDelta72h(metrics);
  const highStressTwice = hasRecentHighStress(metrics);

  if (
    latest.care_score_snapshot <= 45 ||
    delta72h >= 12 ||
    highStressTwice
  ) {
    let reason = 'CareScore or stress indicates high support need';
    if (latest.care_score_snapshot <= 45) {
      reason = 'CareScore is at a high-risk level';
    } else if (delta72h >= 12) {
      reason = 'CareScore dropped sharply over the last 72 hours';
    } else if (highStressTwice) {
      reason = 'High stress reported in consecutive check-ins';
    }

    return {
      level: 'high',
      reason,
      latestCareScore: latest.care_score_snapshot,
      latestStressLevel: latest.stress_level,
      delta72h,
    };
  }

  if (latest.care_score_snapshot <= 60 || delta72h >= 6 || latest.stress_level === 3) {
    return {
      level: 'medium',
      reason: 'Some signs of strain, monitor closely',
      latestCareScore: latest.care_score_snapshot,
      latestStressLevel: latest.stress_level,
      delta72h,
    };
  }

  return {
    level: 'stable',
    reason: 'Check-ins look steady',
    latestCareScore: latest.care_score_snapshot,
    latestStressLevel: latest.stress_level,
    delta72h,
  };
};

export const riskPriority = (level: RiskLevel) => {
  if (level === 'high') return 2;
  if (level === 'medium') return 1;
  return 0;
};
