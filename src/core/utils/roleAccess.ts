import { AppRole, RoleModeContract } from '../models/types';

export const getRoleModeContract = (
  role: AppRole | null | undefined,
  isTherapistModeRequested: boolean,
): RoleModeContract => {
  const resolvedRole: AppRole = role || 'user';
  const canUseTherapistMode = resolvedRole === 'therapist' || resolvedRole === 'admin';
  const effectiveTherapistMode = canUseTherapistMode && isTherapistModeRequested;
  const isAdminClientPreview = resolvedRole === 'admin' && !effectiveTherapistMode;

  return {
    role: resolvedRole,
    canUseTherapistMode,
    // Match is client flow. Admins can preview it when not in therapist mode.
    canAccessMatchFlow: (resolvedRole === 'user' || isAdminClientPreview) && !effectiveTherapistMode,
    isAdminClientPreview,
  };
};
