import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

export interface ClientMetricsReadiness {
  ready: boolean;
  checking: boolean;
  requiresSetup: boolean;
  issue: string | null;
  refresh: () => Promise<void>;
}

const SETUP_GUIDANCE =
  'Run SQL migration in Supabase SQL Editor: supabase/migrations/20260310_care_score_and_client_metrics.sql';

const isMissingClientMetricsError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  if (code === '42P01' || code === 'PGRST205') return true;

  return (
    message.includes('client_metrics') &&
    (
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache')
    )
  );
};

export const useClientMetricsReadiness = (): ClientMetricsReadiness => {
  const [ready, setReady] = useState(true);
  const [checking, setChecking] = useState(true);
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    const { error } = await supabase
      .from('client_metrics')
      .select('id')
      .limit(1);

    if (!error) {
      setReady(true);
      setRequiresSetup(false);
      setIssue(null);
      setChecking(false);
      return;
    }

    if (isMissingClientMetricsError(error)) {
      setReady(false);
      setRequiresSetup(true);
      setIssue(SETUP_GUIDANCE);
      setChecking(false);
      return;
    }

    setReady(false);
    setRequiresSetup(false);
    setIssue(error.message || 'Could not verify backend readiness.');
    setChecking(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ready, checking, requiresSetup, issue, refresh };
};
