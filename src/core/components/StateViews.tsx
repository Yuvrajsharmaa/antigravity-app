import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { Radius, Spacing } from '../theme/spacing';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  boxed?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'leaf-outline',
  title,
  message,
  actionLabel,
  onAction,
  style,
  contentStyle,
  boxed = true,
}) => (
  <View style={[styles.stateRoot, boxed && styles.boxedContainer, style]}>
    <View style={[styles.stateContent, contentStyle]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={32} color={Colors.accent.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  boxed?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  style,
  contentStyle,
  boxed = true,
}) => (
  <View style={[styles.stateRoot, boxed && styles.boxedContainer, style]}>
    <View style={[styles.stateContent, contentStyle]}>
      <View style={[styles.iconCircle, styles.errorCircle]}>
        <Ionicons name="alert-circle-outline" size={32} color={Colors.status.danger} />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.actionBtn} onPress={onRetry}>
          <Text style={styles.actionText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

interface LoadingStateProps {
  message?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  boxed?: boolean;
  centered?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message,
  style,
  contentStyle,
  boxed = false,
  centered = true,
}) => (
  <View style={[styles.stateRoot, centered && styles.centeredState, boxed && styles.boxedContainer, style]}>
    <View style={[styles.loadingContent, contentStyle]}>
      <ActivityIndicator size="small" color={Colors.accent.primary} />
      {message ? <Text style={styles.loadingMessage}>{message}</Text> : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  stateRoot: {
    minHeight: 120,
    width: '100%',
  },
  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxedContainer: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  stateContent: {
    width: '100%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  errorCircle: {
    backgroundColor: Colors.status.dangerSoft,
  },
  title: {
    ...Typography.title2,
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  message: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  actionBtn: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
  },
  actionText: {
    ...Typography.bodyEmphasis,
    color: Colors.accent.primary,
  },
  loadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  loadingMessage: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
