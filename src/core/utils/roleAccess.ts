import { AppRole, RoleModeContract } from '../models/types';

export const getRoleModeContract = (
  role: AppRole | null | undefined,
  isTherapistModeRequested: boolean,
): RoleModeContract => {
  const resolvedRole: AppRole = role || 'user';
  const canUseTherapistMode = resolvedRole === 'therapist' || resolvedRole === 'admin';
  const effectiveTherapistMode = canUseTherapistMode && isTherapistModeRequested;

  return {
    role: resolvedRole,
    canUseTherapistMode,
    canAccessMatchFlow: !effectiveTherapistMode,
  };
};

