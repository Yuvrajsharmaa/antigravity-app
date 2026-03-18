import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { ReducedMotionMode } from '../models/types';

export const useReducedMotion = (mode: ReducedMotionMode = 'system') => {
  const [reduced, setReduced] = useState(mode === 'always');

  useEffect(() => {
    if (mode === 'always') {
      setReduced(true);
      return;
    }
    if (mode === 'never') {
      setReduced(false);
      return;
    }

    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduced(value);
    });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [mode]);

  return reduced;
};
