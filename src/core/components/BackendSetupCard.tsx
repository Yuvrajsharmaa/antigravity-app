import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Button } from './Button';
import { Card } from './Card';

interface BackendSetupCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

const DEFAULT_MESSAGE =
  'Required backend tables are missing. Run SQL migration in Supabase SQL Editor: supabase/migrations/20260310_care_score_and_client_metrics.sql';

export const BackendSetupCard: React.FC<BackendSetupCardProps> = ({
  title = 'Setup Required',
  message = DEFAULT_MESSAGE,
  onRetry,
}) => (
  <Card style={styles.card}>
    <View style={styles.header}>
      <Ionicons name="server-outline" size={18} color={Colors.status.warning} />
      <Text style={styles.title}>{title}</Text>
    </View>
    <Text style={styles.message}>{message}</Text>
    <Text style={styles.stepLabel}>Steps</Text>
    <Text style={styles.step}>1. Open Supabase Project SQL Editor.</Text>
    <Text style={styles.step}>2. Run migration file: `supabase/migrations/20260310_care_score_and_client_metrics.sql`.</Text>
    <Text style={styles.step}>3. Return here and tap Retry.</Text>
    {onRetry && (
      <Button
        title="Retry"
        variant="secondary"
        onPress={onRetry}
        fullWidth={false}
        style={styles.retryBtn}
      />
    )}
  </Card>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.status.warningSoft,
    borderColor: Colors.status.warning + '30',
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  message: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  stepLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
    marginTop: Spacing.xs,
  },
  step: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  retryBtn: {
    marginTop: Spacing.sm,
    borderRadius: Radius.md,
  },
});
