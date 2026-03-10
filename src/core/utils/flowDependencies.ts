import { FlowDependencyState } from '../models/types';

const missing = (
  key: string,
  label: string,
  actionHint: string,
  detail?: string,
): FlowDependencyState => ({
  key,
  label,
  status: 'missing',
  actionHint,
  detail,
});

const ready = (key: string, label: string): FlowDependencyState => ({
  key,
  label,
  status: 'ready',
});

export const asDependencyState = (
  key: string,
  label: string,
  available: boolean,
  actionHint: string,
  detail?: string,
): FlowDependencyState => (
  available
    ? ready(key, label)
    : missing(key, label, actionHint, detail)
);

export const getFirstBlockingDependency = (deps: FlowDependencyState[]) => (
  deps.find((dep) => dep.status === 'missing')
);

export const describeBlockingDependency = (deps: FlowDependencyState[]) => {
  const blocker = getFirstBlockingDependency(deps);
  if (!blocker) return null;
  return blocker.detail || `${blocker.label} is missing. ${blocker.actionHint || ''}`.trim();
};

export const dependenciesReady = (deps: FlowDependencyState[]) => (
  deps.every((dep) => dep.status !== 'missing')
);

