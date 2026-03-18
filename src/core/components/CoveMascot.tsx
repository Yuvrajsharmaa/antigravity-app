import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  ImageStyle,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { coveAssetMap } from '../assets/coveAssets';
import { CoveVariant } from '../models/types';

interface CoveMascotProps {
  variant?: CoveVariant;
  size?: number;
  animate?: boolean;
  // Kept for backwards compatibility; panel styling is intentionally ignored.
  panel?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export const CoveMascot: React.FC<CoveMascotProps> = ({
  variant = 'default',
  size = 132,
  animate = false,
  panel = false,
  style,
  imageStyle,
}) => {
  void panel;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1300,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1300,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, animate]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.015],
  });

  const content = (
    <Animated.View
      style={[
        animate && {
          transform: [{ translateY }, { scale }],
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }),
        },
      ]}
    >
      <Image
        source={coveAssetMap[variant]}
        style={[
          {
            width: size,
            height: size,
          },
          imageStyle,
        ]}
        resizeMode="contain"
      />
    </Animated.View>
  );

  return (
    <View style={style} accessible={false} importantForAccessibility="no-hide-descendants">
      {content}
    </View>
  );
};
