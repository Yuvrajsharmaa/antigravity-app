import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CoveModalAction, CoveModalVariant, CoveVariant } from '../models/types';
import { Colors, Radius, Spacing, Typography } from '../theme';
import { CoveMascot } from './CoveMascot';
import { Button } from './Button';

interface CoveModalProps {
  visible: boolean;
  variant?: CoveModalVariant;
  title: string;
  message: string;
  primaryAction?: CoveModalAction | null;
  secondaryAction?: CoveModalAction | null;
  onDismiss?: () => void;
}

const variantToMascot: Record<CoveModalVariant, CoveVariant> = {
  confirm: 'default',
  success: 'celebration',
  error: 'default',
  info: 'default',
  blocking: 'default',
};

export const CoveModal: React.FC<CoveModalProps> = ({
  visible,
  variant = 'info',
  title,
  message,
  primaryAction,
  secondaryAction,
  onDismiss,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <CoveMascot variant={variantToMascot[variant]} size={156} animate={variant !== 'error'} style={styles.mascot} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actionsRow}>
            {secondaryAction ? (
              <Button
                title={secondaryAction.label}
                onPress={secondaryAction.onPress}
                variant="secondary"
                size="md"
                fullWidth={false}
                style={{ flex: 1 }}
              />
            ) : null}

            {primaryAction ? (
              <Button
                title={primaryAction.label}
                onPress={primaryAction.onPress}
                variant="primary"
                size="md"
                fullWidth={false}
                style={!secondaryAction ? styles.primaryBtnSingle : { flex: 1 }}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.ui.overlay,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  mascot: {
    marginBottom: Spacing.xs,
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
  actionsRow: {
    marginTop: Spacing.lg,
    width: '100%',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  primaryBtnSingle: {
    minWidth: 160,
    alignSelf: 'center',
  },
});
