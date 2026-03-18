import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CoveMascot, CoveModal } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { Colors, Radius, Spacing, Typography } from '../../core/theme';
import { supabase } from '../../services/supabase';
import { MascotSizes } from '../../core/constants/mascot';
import { CoveModalAction, CoveModalVariant } from '../../core/models/types';

export const TherapistApplicationStatusScreen: React.FC<{
  onContinue: () => void;
}> = ({ onContinue }) => {
  const { therapistApplication, profile, refreshProfile, signOut } = useAuth();
  const isRejected = therapistApplication?.status === 'rejected';
  const [modalState, setModalState] = React.useState<{
    visible: boolean;
    variant: CoveModalVariant;
    title: string;
    message: string;
    primaryAction?: CoveModalAction | null;
  }>({
    visible: false,
    variant: 'info',
    title: '',
    message: '',
    primaryAction: null,
  });

  const showModal = (variant: CoveModalVariant, title: string, message: string) => {
    setModalState({
      visible: true,
      variant,
      title,
      message,
      primaryAction: {
        label: 'Okay',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    });
  };

  const reopenTherapistOnboarding = async () => {
    if (!profile?.id) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          onboarding_completed: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
    } catch (error: any) {
      showModal('error', 'Unable to reopen onboarding', error.message || 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <CoveMascot variant={isRejected ? 'thinking' : 'default'} size={MascotSizes.hero} animate />

        <Card style={styles.card}>
          <View style={styles.titleRow}>
            <Ionicons
              name={isRejected ? 'alert-circle-outline' : 'time-outline'}
              size={18}
              color={isRejected ? Colors.status.warning : Colors.accent.primary}
            />
            <Text style={styles.title}>
              {isRejected ? 'Application needs updates' : 'Application under review'}
            </Text>
          </View>

          <Text style={styles.body}>
            {isRejected
              ? 'Your therapist application needs a quick update before approval.'
              : 'Your therapist application was received. We will notify you after review.'}
          </Text>

          {isRejected && therapistApplication?.rejection_reason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Reviewer note</Text>
              <Text style={styles.reasonText}>{therapistApplication.rejection_reason}</Text>
            </View>
          ) : null}

          {isRejected ? (
            <Button title="Update application" onPress={reopenTherapistOnboarding} />
          ) : (
            <Button title="Continue as client" onPress={onContinue} />
          )}
        </Card>

        <TouchableOpacity style={styles.signOutRow} onPress={signOut}>
          <Ionicons name="log-out-outline" size={16} color={Colors.text.tertiary} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <CoveModal
        visible={modalState.visible}
        variant={modalState.variant}
        title={modalState.title}
        message={modalState.message}
        primaryAction={modalState.primaryAction || undefined}
        onDismiss={() => setModalState((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  card: {
    width: '100%',
    gap: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    ...Typography.title3,
    color: Colors.text.primary,
  },
  body: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  reasonBox: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke.subtle,
    backgroundColor: Colors.bg.tertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  reasonLabel: {
    ...Typography.captionEmphasis,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  reasonText: {
    ...Typography.caption,
    color: Colors.text.primary,
    lineHeight: 20,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  signOutText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
});
