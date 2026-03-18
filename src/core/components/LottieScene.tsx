import React, { useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';
import { LottieSceneVariant, MotionPreset, ReducedMotionMode } from '../models/types';
import { useReducedMotion } from '../hooks/useReducedMotion';

const sceneSourceMap: Record<LottieSceneVariant, any> = {
  mascot_idle: require('../../../assets/lottie/core/leaf_idle_v1.json'),
  step_pop: require('../../../assets/lottie/onboarding/step_pop_v1.json'),
  loading: require('../../../assets/lottie/core/loading_v1.json'),
  success_pulse: require('../../../assets/lottie/onboarding/step_pop_v1.json'),
  confetti_lite: require('../../../assets/lottie/core/leaf_idle_v1.json'),
};

interface LottieSceneProps {
  variant: LottieSceneVariant;
  preset?: MotionPreset;
  autoPlay?: boolean;
  loop?: boolean;
  speed?: number;
  style?: StyleProp<ViewStyle>;
  fallback?: React.ReactNode;
  reducedMotionMode?: ReducedMotionMode;
}

export const LottieScene: React.FC<LottieSceneProps> = ({
  variant,
  preset = 'loop',
  autoPlay,
  loop,
  speed = 1,
  style,
  fallback = null,
  reducedMotionMode = 'system',
}) => {
  const reducedMotion = useReducedMotion(reducedMotionMode);

  const resolved = useMemo(() => {
    const defaultLoop = preset === 'loop' || preset === 'loading';
    const defaultAutoPlay = true;
    const resolvedSpeed = preset === 'loading' ? 0.85 : preset === 'successPulse' ? 1.1 : speed;
    return {
      loop: loop ?? defaultLoop,
      autoPlay: autoPlay ?? defaultAutoPlay,
      speed: resolvedSpeed,
    };
  }, [autoPlay, loop, preset, speed]);

  if (reducedMotion) {
    return <View style={style}>{fallback}</View>;
  }

  return (
    <LottieView
      source={sceneSourceMap[variant]}
      autoPlay={resolved.autoPlay}
      loop={resolved.loop}
      speed={resolved.speed}
      style={style}
    />
  );
};
