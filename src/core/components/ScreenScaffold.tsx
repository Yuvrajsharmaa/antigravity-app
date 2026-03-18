import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabSafeBottomPadding } from '../hooks/useTabSafeBottomPadding';
import { Colors, Spacing } from '../theme';

interface ScreenScaffoldProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  keyboardAware?: boolean;
  padBottom?: boolean;
  horizontalPadding?: number;
}

export const ScreenScaffold: React.FC<ScreenScaffoldProps> = ({
  children,
  style,
  contentStyle,
  scroll = true,
  keyboardAware = false,
  padBottom = true,
  horizontalPadding = Spacing.xl,
}) => {
  const tabSafeBottom = useTabSafeBottomPadding(Spacing.xxl);
  const effectiveBottom = padBottom ? tabSafeBottom : Spacing.xl;

  const contentContainerStyle = [{
    paddingHorizontal: horizontalPadding,
    paddingBottom: effectiveBottom,
    flexGrow: 1,
  }, contentStyle];

  const content = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  if (keyboardAware) {
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor: Colors.bg.primary }, style]} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: Colors.bg.primary }, style]} edges={['top']}>
      {content}
    </SafeAreaView>
  );
};
