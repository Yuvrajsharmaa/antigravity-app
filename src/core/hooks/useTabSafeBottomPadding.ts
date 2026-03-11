import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

export const useTabSafeBottomPadding = (extra = 0) => {
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  return tabBarHeight + extra;
};

