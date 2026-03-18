import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius } from '../../core/theme';
import { Avatar, Button, Card, CoveModal } from '../../core/components';
import { useAuth } from '../../core/context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { useTabSafeBottomPadding } from '../../core/hooks/useTabSafeBottomPadding';
import { ActiveTherapistLock, CoveModalAction, CoveModalVariant } from '../../core/models/types';
import { ensureConversation, fetchActiveTherapistLock, setTherapistLockAction } from '../../core/services/careFlowService';

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const tabSafeBottomPadding = useTabSafeBottomPadding(Spacing.xxxl);
  const {
    profile,
    user,
    signOut,
    isTherapistMode,
    canUseTherapistMode,
    toggleTherapistMode,
    refreshProfile,
  } = useAuth();
  const [modalState, setModalState] = React.useState<{
    visible: boolean;
    variant: CoveModalVariant;
    title: string;
    message: string;
    primaryAction?: CoveModalAction | null;
    secondaryAction?: CoveModalAction | null;
  }>({
    visible: false,
    variant: 'info',
    title: '',
    message: '',
    primaryAction: null,
    secondaryAction: null,
  });
  const [activeLock, setActiveLock] = React.useState<ActiveTherapistLock | null>(null);

  const loadActiveLock = React.useCallback(async () => {
    if (!user?.id || isTherapistMode) {
      setActiveLock(null);
      return;
    }
    try {
      const lock = await fetchActiveTherapistLock(user.id);
      setActiveLock(lock);
    } catch {
      setActiveLock(null);
    }
  }, [isTherapistMode, user?.id]);

  React.useEffect(() => {
    loadActiveLock();
  }, [loadActiveLock]);

  const showModal = React.useCallback(
    (
      variant: CoveModalVariant,
      title: string,
      message: string,
      primaryAction?: CoveModalAction | null,
      secondaryAction?: CoveModalAction | null,
    ) => {
      setModalState({
        visible: true,
        variant,
        title,
        message,
        primaryAction: primaryAction || {
          label: 'Okay',
          onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
        },
        secondaryAction: secondaryAction || null,
      });
    },
    [],
  );

  const handleSignOut = () => {
    showModal(
      'confirm',
      'Sign out?',
      'You can sign back in anytime.',
      {
        label: 'Sign out',
        onPress: async () => {
          setModalState((prev) => ({ ...prev, visible: false }));
          await signOut();
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  };

  const handleRestartOnboarding = () => {
    if (!profile?.id) return;

    showModal(
      'confirm',
      'View onboarding again?',
      'This reopens onboarding from the start.',
      {
        label: 'Restart',
        onPress: async () => {
          try {
            const onboardingStepKeys = ['client', 'therapist'].flatMap((flow) => [
              `care_space_onboarding_step_v4_${profile.id}_${flow}`,
              `care_space_onboarding_step_v3_${profile.id}_${flow}`,
              `care_space_onboarding_step_v2_${profile.id}_${flow}`,
              `care_space_onboarding_step_${profile.id}_${flow}`,
            ]);
            const { error } = await supabase
              .from('profiles')
              .update({
                onboarding_completed: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', profile.id);

            if (error) throw error;
            await AsyncStorage.multiRemove(onboardingStepKeys);
            setModalState((prev) => ({ ...prev, visible: false }));
            await refreshProfile();
          } catch (err: any) {
            showModal('error', 'Unable to reopen onboarding', err.message || 'Please try again.');
          }
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  };

  const openLockedChat = React.useCallback(async () => {
    if (!user?.id || !activeLock?.therapist_id) return;
    try {
      const conversationId = await ensureConversation({
        userId: user.id,
        therapistId: activeLock.therapist_id,
      });
      navigation.navigate('MessagesTab', {
        screen: 'Chat',
        params: {
          conversationId,
          therapistName: activeLock.therapist_name,
          therapistAvatar: activeLock.therapist_avatar,
          therapistId: activeLock.therapist_id,
        },
      });
    } catch (err: any) {
      showModal('error', 'Unable to open chat', err.message || 'Please try again.');
    }
  }, [activeLock?.therapist_avatar, activeLock?.therapist_id, activeLock?.therapist_name, navigation, showModal, user?.id]);

  const openLockedTherapistProfile = React.useCallback(async () => {
    if (!activeLock?.therapist_id) return;
    try {
      const { data, error } = await supabase
        .from('therapists')
        .select(`
          *,
          profiles!inner (display_name, avatar_url, first_name)
        `)
        .eq('id', activeLock.therapist_id)
        .maybeSingle();
      if (error || !data) throw error || new Error('Profile unavailable.');
      const p = Array.isArray((data as any).profiles) ? (data as any).profiles[0] : (data as any).profiles;
      const therapist = {
        ...data,
        display_name: p?.display_name || p?.first_name || activeLock.therapist_name,
        avatar_url: p?.avatar_url || activeLock.therapist_avatar,
      };
      navigation.navigate('MatchTab', {
        screen: 'TherapistProfile',
        params: { therapist },
      });
    } catch (err: any) {
      showModal('error', 'Unable to open profile', err.message || 'Please try again.');
    }
  }, [activeLock?.therapist_avatar, activeLock?.therapist_id, activeLock?.therapist_name, navigation, showModal]);

  const openMatchFlow = React.useCallback(() => {
    const parentNav = navigation.getParent?.();
    if (parentNav?.navigate) {
      parentNav.navigate('MatchTab', { screen: 'TherapistMatch' });
      return;
    }
    navigation.navigate('MatchTab', { screen: 'TherapistMatch' });
  }, [navigation]);

  const unlockTherapist = React.useCallback(() => {
    if (!user?.id || !activeLock?.therapist_id) return;
    showModal(
      'confirm',
      'Keep exploring therapists?',
      'Your current therapist will no longer be locked as primary.',
      {
        label: 'Continue',
        onPress: async () => {
          try {
            await setTherapistLockAction({
              userId: user.id,
              therapistId: activeLock.therapist_id,
              action: 'keep_exploring',
              switchReason: 'User reopened therapist exploration',
            });
            setModalState((prev) => ({ ...prev, visible: false }));
            await loadActiveLock();
          } catch (err: any) {
            showModal('error', 'Unable to update', err.message || 'Please try again.');
          }
        },
      },
      {
        label: 'Cancel',
        onPress: () => setModalState((prev) => ({ ...prev, visible: false })),
      },
    );
  }, [activeLock?.therapist_id, loadActiveLock, showModal, user?.id]);

  const accountItems = [
    { icon: 'person-outline', label: 'Edit profile', onPress: () => navigation.navigate('EditProfile') },
    { icon: 'notifications-outline', label: 'Notifications', onPress: () => navigation.navigate('Notifications') },
    { icon: 'refresh-outline', label: 'View onboarding again', onPress: handleRestartOnboarding },
    ...(profile?.role === 'admin'
      ? [{ icon: 'clipboard-outline', label: 'Therapist approvals', onPress: () => navigation.navigate('TherapistApprovals') }]
      : []),
  ];

  const supportItems = [
    { icon: 'shield-checkmark-outline', label: 'Privacy & safety', onPress: () => navigation.navigate('ProfileInfo', { topic: 'privacy_safety' }) },
    { icon: 'help-circle-outline', label: 'Help & support', onPress: () => navigation.navigate('ProfileInfo', { topic: 'help_support' }) },
  ];

  const legalItems = [
    { icon: 'document-text-outline', label: 'Terms of service', onPress: () => navigation.navigate('ProfileInfo', { topic: 'terms' }) },
    { icon: 'lock-closed-outline', label: 'Privacy policy', onPress: () => navigation.navigate('ProfileInfo', { topic: 'privacy_policy' }) },
    { icon: 'information-circle-outline', label: 'About Care Space', onPress: () => navigation.navigate('ProfileInfo', { topic: 'about' }) },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabSafeBottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenTitle}>Profile</Text>

        {/* User header */}
        <View style={styles.userHeader}>
          <Avatar
            uri={profile?.avatar_url}
            name={profile?.display_name || profile?.first_name || undefined}
            size={72}
          />
          <Text style={styles.userName}>{profile?.display_name || profile?.first_name || 'User'}</Text>
          <Text style={styles.userEmail}>{profile?.email || 'Email not set'}</Text>
        </View>

        {!isTherapistMode ? (
          <Card style={styles.lockCard}>
            <Text style={styles.lockTitle}>Your therapist</Text>
            {activeLock ? (
              <>
                <View style={styles.lockHeader}>
                  <Avatar uri={activeLock.therapist_avatar} name={activeLock.therapist_name} size={40} />
                  <View style={styles.lockHeaderText}>
                    <Text style={styles.lockName}>{activeLock.therapist_name}</Text>
                    <Text style={styles.lockMeta}>{activeLock.therapist_headline || 'Primary therapist'}</Text>
                  </View>
                </View>
                <View style={styles.lockActions}>
                  <Button
                    title="Message"
                    onPress={openLockedChat}
                    variant="primary"
                    size="sm"
                    fullWidth={false}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Book"
                    onPress={openLockedTherapistProfile}
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Change"
                    onPress={unlockTherapist}
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            ) : (
              <View style={styles.lockEmptyWrap}>
                <Text style={styles.lockMeta}>No therapist is locked yet. Explore matches to send an intro question.</Text>
                <Button title="Find therapist" onPress={openMatchFlow} variant="primary" />
              </View>
            )}
          </Card>
        ) : null}

        {/* Settings */}
        <Card style={styles.settingsCard}>
          {accountItems.map((item) => (
            <TouchableOpacity key={item.label} style={styles.settingRow} onPress={item.onPress}>
              <Ionicons name={item.icon as any} size={20} color={Colors.text.secondary} />
              <Text style={styles.settingLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
            </TouchableOpacity>
          ))}
          {canUseTherapistMode ? (
            <View>
              <View style={styles.settingRow}>
                <Ionicons name="medical-outline" size={20} color={Colors.accent.primary} />
                <Text style={styles.settingLabel}>
                  {profile?.role === 'admin' ? 'Therapist dashboard mode' : 'Therapist mode'}
                </Text>
                <Switch
                  value={isTherapistMode}
                  onValueChange={toggleTherapistMode}
                  trackColor={{ false: Colors.stroke.medium, true: Colors.accent.primary }}
                />
              </View>
              {profile?.role === 'admin' ? (
                <Text style={styles.modeHint}>
                  Turn this off to access the client match flow.
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>

        {/* Legal */}
        <Card style={styles.settingsCard}>
          {supportItems.map((item) => (
            <TouchableOpacity key={item.label} style={styles.settingRow} onPress={item.onPress}>
              <Ionicons name={item.icon as any} size={20} color={Colors.text.secondary} />
              <Text style={styles.settingLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
            </TouchableOpacity>
          ))}
        </Card>

        <Card style={styles.settingsCard}>
          {legalItems.map((item) => (
            <TouchableOpacity key={item.label} style={styles.settingRow} onPress={item.onPress}>
              <Ionicons name={item.icon as any} size={20} color={Colors.text.secondary} />
              <Text style={styles.settingLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
            </TouchableOpacity>
          ))}
        </Card>

        {/* Emergency notice */}
        <View style={styles.emergencyCard}>
          <Ionicons name="warning-outline" size={16} color={Colors.status.warning} />
          <Text style={styles.emergencyText}>
            This app is not for emergencies. If you are in crisis, please contact your local emergency services.
          </Text>
        </View>

        {/* Sign out */}
        <Button
          title="Sign out"
          onPress={handleSignOut}
          variant="danger"
          size="md"
          icon={<Ionicons name="log-out-outline" size={18} color={Colors.text.inverse} />}
          style={styles.signOutBtn}
        />

        <Text style={styles.version}>Care Space v1.1.0</Text>
      </ScrollView>

      <CoveModal
        visible={modalState.visible}
        variant={modalState.variant}
        title={modalState.title}
        message={modalState.message}
        primaryAction={modalState.primaryAction || undefined}
        secondaryAction={modalState.secondaryAction || undefined}
        onDismiss={() => setModalState((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.primary },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxxxl + Spacing.xl,
  },
  screenTitle: {
    ...Typography.title1,
    color: Colors.text.primary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  userHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 6,
  },
  userName: { ...Typography.title2, color: Colors.text.primary },
  userEmail: { ...Typography.caption, color: Colors.text.secondary },
  settingsCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    padding: 0,
    borderRadius: 22,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ui.divider,
  },
  settingLabel: { ...Typography.body, color: Colors.text.primary, flex: 1 },
  modeHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  emergencyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.status.warningSoft,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  lockCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    borderRadius: 22,
    paddingVertical: Spacing.sm,
  },
  lockTitle: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  lockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockHeaderText: {
    flex: 1,
  },
  lockName: {
    ...Typography.bodySemibold,
    color: Colors.text.primary,
  },
  lockMeta: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  lockActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  lockEmptyWrap: {
    gap: Spacing.sm,
  },
  lockActionBtn: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke.medium,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs + 1,
  },
  lockActionText: {
    ...Typography.captionEmphasis,
    color: Colors.text.primary,
  },
  lockFindBtn: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: Spacing.md,
    flex: 1,
  },
  lockFindText: {
    ...Typography.captionEmphasis,
    color: Colors.text.inverse,
  },
  emergencyText: { ...Typography.caption, color: Colors.text.secondary, flex: 1, lineHeight: 18 },
  signOutBtn: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  version: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
